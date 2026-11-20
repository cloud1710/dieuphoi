#!/usr/bin/env python3
"""dieuphoi: one hub that reads the plans (orchestras) of many projects.

dp check          registry and every plan can be read
dp scan           write out/state.json and out/INBOX.md
dp serve          serve the agents office page (office/) and /api/state
dp build          write the office as a static site into out/site (page + state.json snapshot)
dp who @name      resolve an @name to one project and print where its orchestra lives
dp msg @name text leave a message in that project's mailbox (plan/INBOX.md)
dp init <id>      write a starter plan into a registered project that has none
"""
import argparse
import collections
import datetime
import hashlib
import json
import os
import re
import shutil
import sys
import time
import unicodedata
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import yaml

HUB = Path(__file__).resolve().parent.parent
FILES = {'plan': ('plan/STATUS.yaml', 'plan/QUESTIONS.md'), 'seal': ('STATUS.yaml', 'QUESTIONS.md')}
CLOSED = ('done', 'dropped')
WORKING = ('doing', 'running')
HEAD = re.compile(r'^## (Q-\d+):\s*(.*)$')
FIELD = re.compile(r'^- (unblocks|goal|asked|status):\s*(.*)$')


def real(path):
    """Registry paths are Windows paths. DP_MAP='D:/=/mnt/d/' maps them when the hub runs elsewhere."""
    p = str(path).replace('\\', '/')
    for pair in filter(None, os.environ.get('DP_MAP', '').split(';')):
        src, dst = pair.split('=', 1)
        if p.lower().startswith(src.lower()):
            return Path(dst + p[len(src):])
    return Path(p)


def registry():
    reg = yaml.safe_load((HUB / 'registry.yaml').read_text(encoding='utf-8-sig'))
    ids = [p['id'] for p in reg['projects']]
    dup = [i for i, n in collections.Counter(ids).items() if n > 1]
    if dup:
        raise ValueError('duplicate project id: %s' % ', '.join(dup))
    groups = {g['id'] for g in reg['groups']}
    for p in reg['projects']:
        if p['group'] not in groups:
            raise ValueError('%s: unknown group %s' % (p['id'], p['group']))
        if p.get('parent') and p['parent'] not in ids:
            raise ValueError('%s: unknown parent %s' % (p['id'], p['parent']))
        if not isinstance(p.get('aliases') or [], list):
            raise ValueError('%s: aliases must be a list' % p['id'])
        if p.get('kind') not in ('plan', 'seal', 'tool', 'archive'):
            raise ValueError('%s: unknown kind %s' % (p['id'], p.get('kind')))
    return reg


def questions(path):
    out, cur = [], None
    if not path.is_file():
        return out
    for raw in path.read_text(encoding='utf-8-sig').splitlines():
        line = raw.strip()
        m = HEAD.match(line)
        if m:
            cur = {'id': m.group(1), 'text': m.group(2), 'status': 'open'}
            out.append(cur)
        elif line.startswith('## '):
            cur = None
        elif cur:
            f = FIELD.match(line)
            if f:
                cur[f.group(1)] = f.group(2).strip()
    return out


def short(text, n=220):
    text = ' '.join(str(text or '').split())
    return text if len(text) <= n else text[:n - 1].rstrip() + '…'


def mail_new(path):
    return len(re.findall(r'^- status: new', path.read_text(encoding='utf-8-sig'), flags=re.M)) if path.is_file() else 0


def scan_project(p):
    root = real(p['path'])
    out = {k: p.get(k) for k in ('id', 'name', 'group', 'parent', 'kind', 'path')}
    out['exists'] = root.is_dir()
    if p['kind'] not in FILES or not out['exists']:
        return out
    sfile, qfile = (root / f for f in FILES[p['kind']])
    if not sfile.is_file():
        out['error'] = 'no plan'
        return out
    try:
        st = yaml.safe_load(sfile.read_text(encoding='utf-8-sig')) or {}
        qs = questions(qfile)
    except Exception as e:                       # a broken plan must not hide the other projects
        out['error'] = '%s: %s' % (type(e).__name__, short(e, 120))
        return out
    items = [i for i in (st.get('items') or []) if isinstance(i, dict)]
    status = {i.get('id'): i.get('status') for i in items}
    open_q = {q['id'] for q in qs if q.get('status') == 'open'}
    known_q = {q['id'] for q in qs}
    pending = {e.get('id') for e in (st.get('externals') or []) if e.get('status') != 'approved'}
    deferred = {ph.get('id') for ph in (st.get('phases') or []) if ph.get('state') == 'deferred'}

    def waits(it):
        for b in it.get('blocked_by') or []:
            if b in status and status[b] not in CLOSED:
                return True
            if b in open_q or b in pending or (str(b).startswith('Q-') and b not in known_q):
                return True
        return False

    def brief(it):
        return {'id': it.get('id'), 'title': short(it.get('title'), 140), 'owner': it.get('owner', 'agent')}

    order = [i for lane in (st.get('lanes') or {}).values() for i in (lane or [])]
    rank = {iid: n for n, iid in enumerate(order)}
    live = sorted((i for i in items if i.get('status') not in CLOSED), key=lambda i: rank.get(i.get('id'), 10 ** 6))
    ready = [i for i in live if i.get('status') == 'todo' and not waits(i) and i.get('phase') not in deferred]
    out.update({
        'counts': dict(collections.Counter(str(i.get('status')) for i in items)),
        'total': len(items),
        'working': [brief(i) for i in live if i.get('status') in WORKING],
        'ready': [brief(i) for i in ready if i.get('owner', 'agent') == 'agent'][:3],
        'person': [brief(i) for i in live if i.get('owner', 'agent') != 'agent'
                   and (i.get('status') in WORKING or i in ready)][:8],
        'waiting': sum(1 for i in live if i.get('status') == 'blocked' or waits(i)),
        'questions': [{'id': q['id'], 'text': short(q['text']), 'asked': q.get('asked'),
                       'unblocks': q.get('unblocks')} for q in qs if q.get('status') == 'open'],
        'updated': datetime.datetime.fromtimestamp(sfile.stat().st_mtime).strftime('%Y-%m-%d %H:%M'),
        'mail': mail_new(root / 'plan' / 'INBOX.md') if p['kind'] == 'plan' else mail_new(HUB / 'out' / 'mail' / (p['id'] + '.md')),
    })
    return out


def sessions(projects):
    """Claude Code processes per project, by working directory. None when psutil is missing."""
    try:
        import psutil
    except ImportError:
        return None
    roots = sorted(((str(real(p['path'])).replace('\\', '/').lower().rstrip('/') + '/', p['id']) for p in projects),
                   key=lambda r: -len(r[0]))
    found = collections.Counter()
    for pr in psutil.process_iter(['name']):
        try:
            if 'claude' not in (pr.info['name'] or '').lower():
                continue
            cwd = pr.cwd().replace('\\', '/').lower().rstrip('/') + '/'
        except Exception:
            continue
        for root, pid in roots:
            if cwd.startswith(root):
                found[pid] += 1
                break
    return dict(found)


_PLANS, _LIVE = {}, [0.0, None]


def scan_cached(p):
    """Re-read a plan only when its files changed."""
    root = real(p['path'])
    watch = [root / f for f in FILES.get(p['kind'], ())] + [root / 'plan' / 'INBOX.md', HUB / 'out' / 'mail' / (p['id'] + '.md')]
    key = (root.is_dir(),) + tuple(f.stat().st_mtime_ns if f.is_file() else 0 for f in watch)
    hit = _PLANS.get(p['id'])
    if not hit or hit[0] != (key, p):
        hit = _PLANS[p['id']] = ((key, dict(p)), scan_project(p))
    return dict(hit[1])


def sessions_cached(projects):
    if time.time() - _LIVE[0] > 30:              # walking the process list is the costly part
        _LIVE[:] = [time.time(), sessions(projects)]
    return _LIVE[1]


def scan():
    reg = registry()
    projects = [scan_cached(p) for p in reg['projects']]
    live = sessions_cached(reg['projects'])
    for p in projects:
        p['sessions'] = None if live is None else live.get(p['id'], 0)
    return {
        'generated': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'hub': reg['hub'], 'groups': reg['groups'], 'projects': projects,
        'inbox': {'questions': sum(len(p.get('questions', [])) for p in projects),
                  'person': sum(len(p.get('person', [])) for p in projects)},
    }


def inbox_md(state):
    lines = ['# Việc chờ anh Vinh', '', 'Lập lúc %s bằng `dp scan`. Sửa ở kế hoạch của từng project, không sửa tệp này.' %
             state['generated'], '']
    for p in state['projects']:
        if not (p.get('questions') or p.get('person') or p.get('error')):
            continue
        lines.append('## %s (%s)' % (p['name'], p['id']))
        if p.get('error'):
            lines.append('- LỖI đọc kế hoạch: %s' % p['error'])
        for q in p.get('questions', []):
            lines.append('- Câu hỏi %s: %s' % (q['id'], q['text']))
        for it in p.get('person', []):
            lines.append('- Việc của %s, %s: %s' % (it['owner'], it['id'], it['title']))
        lines.append('')
    if len(lines) == 3:
        lines.append('Không có việc nào chờ.')
    return '\n'.join(lines) + '\n'


def cmd_scan(_):
    state = scan()
    out = HUB / 'out'
    out.mkdir(exist_ok=True)
    (out / 'state.json').write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding='utf-8')
    (out / 'INBOX.md').write_text(inbox_md(state), encoding='utf-8')
    for p in state['projects']:
        c = p.get('counts', {})
        print('%-18s %-7s %s' % (p['id'], p['kind'], p.get('error') or (
            'items %d, working %d, questions %d' % (p.get('total', 0), len(p.get('working', [])),
                                                     len(p.get('questions', []))) if c or p['kind'] in FILES
            else ('ok' if p['exists'] else 'MISSING'))))
    print('inbox: %(questions)d questions, %(person)d person items -> out/INBOX.md' % state['inbox'])
    return 0


def cmd_check(_):
    bad = 0
    for p in scan()['projects']:
        if not p['exists']:
            print('error: %s: folder not found' % p['id'])
            bad += 1
        elif p.get('error'):
            print('error: %s: %s' % (p['id'], p['error']))
            bad += 1
    print('ok' if not bad else '%d error(s)' % bad)
    return 1 if bad else 0


def cmd_init(args):
    reg = registry()
    p = next((x for x in reg['projects'] if x['id'] == args.id), None)
    if p is None or p['kind'] != 'plan':
        print('dp init: %s is not a registered project of kind plan' % args.id)
        return 1
    root = real(p['path'])
    if (root / 'plan' / 'STATUS.yaml').exists():
        print('dp init: plan/STATUS.yaml exists, nothing written')
        return 1
    parent = next((x['name'] for x in reg['projects'] if x['id'] == p.get('parent')), None)
    group = next(g['name'] for g in reg['groups'] if g['id'] == p['group'])
    fill = {'NAME': p['name'], 'ID': p['id'], 'GROUP': group, 'PARENT': parent or 'nhóm ' + group,
            'TODAY': datetime.date.today().isoformat()}
    for rel in ('plan/STATUS.yaml', 'plan/QUESTIONS.md', 'plan/CHANGELOG.md', 'plan/ORCHESTRA.md',
                '.projectplaner/config.yaml'):
        dst = root / rel
        if dst.exists():
            continue
        text = (HUB / 'templates' / Path(rel).name).read_text(encoding='utf-8')
        for k, v in fill.items():
            text = text.replace('{{%s}}' % k, v)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(text, encoding='utf-8', newline='\n')
        print('wrote %s' % rel)
    ignore = root / '.gitignore'
    old = ignore.read_text(encoding='utf-8') if ignore.is_file() else ''
    if '.projectplaner/' not in (ln.strip() for ln in old.splitlines()):
        ignore.write_text(old + ('' if not old or old.endswith('\n') else '\n') + '.projectplaner/\n', encoding='utf-8')
        print('wrote .gitignore')
    return 0


class Handler(SimpleHTTPRequestHandler):
    cache = (0.0, b'')
    # Windows may map .js to text/plain in the registry; browsers then refuse module scripts
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.html': 'text/html; charset=utf-8'}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(HUB / 'office'), **kw)

    @staticmethod
    def current():
        """(body, tag) of the state, rebuilt at most every 5 seconds. The tag ignores the timestamp."""
        if time.time() - Handler.cache[0] > 5:
            try:
                body = json.dumps(scan(), ensure_ascii=False).encode('utf-8')
            except Exception as e:
                body = json.dumps({'error': '%s: %s' % (type(e).__name__, e)}).encode('utf-8')
            Handler.cache = (time.time(), body)
        body = Handler.cache[1]
        return body, '"%s"' % hashlib.sha1(body.split(b'"hub"', 1)[-1]).hexdigest()[:16]

    def events(self):
        """Server-sent events: one message when a client connects, then one whenever a plan changes."""
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Accel-Buffering', 'no')
        self.end_headers()
        sent, quiet = None, 0
        try:
            while True:
                body, tag = self.current()
                if tag != sent:
                    self.wfile.write(b'data: ' + body + b'\n\n')
                    sent, quiet = tag, 0
                elif quiet >= 20:
                    self.wfile.write(b': ping\n\n')         # keeps phones and proxies from closing the stream
                    quiet = 0
                self.wfile.flush()
                time.sleep(4)
                quiet += 4
        except (BrokenPipeError, ConnectionError, OSError):
            pass

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/api/events':
            return self.events()
        if path != '/api/state':
            return super().do_GET()
        body, tag = self.current()
        if self.headers.get('If-None-Match') == tag:
            self.send_response(304)
            self.send_header('ETag', tag)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('ETag', tag)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


def cmd_build(_):
    site = HUB / 'out' / 'site'
    shutil.copytree(HUB / 'office', site, dirs_exist_ok=True)
    (site / 'state.json').write_text(json.dumps(scan(), ensure_ascii=False), encoding='utf-8')
    print('static site: %s (project names, paths and open questions are inside: publish it behind a login)' % site)
    return 0


def fold(text):
    """'@Thư Viện' -> 'thuvien': no case, no accents, no punctuation."""
    text = unicodedata.normalize('NFD', str(text).replace('đ', 'd').replace('Đ', 'D'))
    return re.sub(r'[^a-z0-9]', '', ''.join(c for c in text if unicodedata.category(c) != 'Mn').lower())


def resolve(name, reg):
    """One project for an @name, or the list of candidates when the name fits several or none."""
    want = fold(name)
    keys = {p['id']: {fold(k) for k in [p['id'], p['name'], Path(str(p['path']).replace('\\', '/')).name]
                      + list(p.get('aliases') or [])} for p in reg['projects']}
    exact = [p for p in reg['projects'] if want in keys[p['id']]]
    if len(exact) == 1:
        return exact[0], []
    near = [p for p in reg['projects'] if want and any(want in k or k.startswith(want) for k in keys[p['id']])]
    if len(near) == 1 and not exact:
        return near[0], []
    return None, exact or near


def _pick(name):
    reg = registry()
    p, cands = resolve(name, reg)
    if p is None:
        print('dp: @%s fits %s' % (name.lstrip('@'), ', '.join('@' + c['id'] for c in cands) if cands
                                    else 'no project; known: ' + ', '.join('@' + x['id'] for x in reg['projects'])))
    return p, reg


def cmd_who(args):
    p, reg = _pick(args.name)
    if p is None:
        return 1
    root = real(p['path'])
    st = scan_cached(p)
    parent = next((x['id'] for x in reg['projects'] if x['id'] == p.get('parent')), None)
    print('@%s  %s' % (p['id'], p['name']))
    print('path: %s' % p['path'])
    print('kind: %s%s' % (p['kind'], {'seal': ' (read only for the hub)', 'archive': ' (do not edit)'}.get(p['kind'], '')))
    print('parent: %s' % (parent or 'group ' + p['group']))
    print('rules: %s' % (', '.join(f for f in ('CLAUDE.md', 'plan/ORCHESTRA.md') if (root / f).is_file()) or 'none'))
    if p['kind'] in FILES:
        print('plan: %s, mailbox: %s' % (FILES[p['kind']][0], 'plan/INBOX.md' if p['kind'] == 'plan' else 'hub out/mail/%s.md' % p['id']))
        print('state: %s' % (st.get('error') or 'working %d, ready %d, open questions %d, waiting %d' % (
            len(st.get('working', [])), len(st.get('ready', [])), len(st.get('questions', [])), st.get('waiting', 0))))
    return 0


def cmd_msg(args):
    p, _ = _pick(args.name)
    if p is None:
        return 1
    text = ' '.join(args.text).strip()
    if not text:
        print('dp msg: empty message')
        return 1
    if p['kind'] == 'plan':
        box, where = real(p['path']) / 'plan' / 'INBOX.md', 'plan/INBOX.md of @%s' % p['id']
    else:                                        # never write into a seal orchestra, an archive or a tool
        box, where = HUB / 'out' / 'mail' / (p['id'] + '.md'), 'out/mail/%s.md in the hub (the project is %s)' % (p['id'], p['kind'])
    box.parent.mkdir(parents=True, exist_ok=True)
    old = box.read_text(encoding='utf-8') if box.is_file() else '# Thư từ điều phối\n\nThư mới nhất ở cuối. Phiên của project đọc thư `status: new`, làm xong thì đổi thành `status: done` kèm một dòng kết quả.\n'
    n = len(re.findall(r'^## M-\d+', old, flags=re.M)) + 1
    box.write_text('%s\n## M-%03d · %s · từ %s\n%s\n- status: new\n' % (
        old.rstrip('\n') + '\n', n, datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), args.sender, text),
        encoding='utf-8', newline='\n')
    print('M-%03d -> %s' % (n, where))
    return 0


def vpn_address(name):
    """The IPv4 address of the ZeroTier or Tailscale adapter of this PC, found by the adapter's name."""
    try:
        import psutil
    except ImportError:
        raise SystemExit('dp serve: --host %s needs psutil (pip install psutil), or pass the address itself' % name)
    for nic, addrs in psutil.net_if_addrs().items():
        if name in nic.lower().replace(' ', ''):
            for a in addrs:
                if getattr(a.family, 'name', '') == 'AF_INET':
                    return a.address
    raise SystemExit('dp serve: no network adapter named like %r with an IPv4 address; is it installed and joined?' % name)


def cmd_serve(args):
    host = vpn_address(args.host) if args.host in ('zerotier', 'tailscale') else args.host
    ThreadingHTTPServer.daemon_threads = True
    srv = ThreadingHTTPServer((host, args.port), Handler)
    print('agents office: http://%s:%d   phone page: http://%s:%d/m.html   (Ctrl+C to stop)' % (host, args.port, host, args.port))
    if host not in ('127.0.0.1', 'localhost'):
        print('reachable from other devices on that network: no login, read only. Allow the port in the firewall for that network only.')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog='dp', description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('check').set_defaults(fn=cmd_check)
    sub.add_parser('scan').set_defaults(fn=cmd_scan)
    s = sub.add_parser('serve')
    s.add_argument('--host', default='127.0.0.1', help="an address, or 'zerotier' / 'tailscale' to use that adapter's address")
    s.add_argument('--port', type=int, default=8765)
    s.set_defaults(fn=cmd_serve)
    sub.add_parser('build').set_defaults(fn=cmd_build)
    w = sub.add_parser('who')
    w.add_argument('name')
    w.set_defaults(fn=cmd_who)
    m = sub.add_parser('msg')
    m.add_argument('name')
    m.add_argument('text', nargs='+')
    m.add_argument('--from', dest='sender', default='Vinh qua dieuphoi')
    m.set_defaults(fn=cmd_msg)
    i = sub.add_parser('init')
    i.add_argument('id')
    i.set_defaults(fn=cmd_init)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == '__main__':
    sys.exit(main())
