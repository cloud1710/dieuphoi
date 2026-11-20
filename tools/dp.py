#!/usr/bin/env python3
"""dieuphoi: one hub that reads the plans (orchestras) of many projects.

dp check          registry and every plan can be read
dp scan           write out/state.json and out/INBOX.md
dp serve          serve the agents office page (office/) and /api/state
dp init <id>      write a starter plan into a registered project that has none
"""
import argparse
import collections
import datetime
import json
import os
import re
import sys
import time
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


def scan():
    reg = registry()
    projects = [scan_project(p) for p in reg['projects']]
    live = sessions(reg['projects'])
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

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(HUB / 'office'), **kw)

    def do_GET(self):
        if self.path.split('?')[0] != '/api/state':
            return super().do_GET()
        if time.time() - Handler.cache[0] > 5:
            try:
                body = json.dumps(scan(), ensure_ascii=False).encode('utf-8')
            except Exception as e:
                body = json.dumps({'error': '%s: %s' % (type(e).__name__, e)}).encode('utf-8')
            Handler.cache = (time.time(), body)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(Handler.cache[1])

    def log_message(self, *a):
        pass


def cmd_serve(args):
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print('agents office: http://%s:%d  (Ctrl+C to stop)' % (args.host, args.port))
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
    s.add_argument('--host', default='127.0.0.1')
    s.add_argument('--port', type=int, default=8765)
    s.set_defaults(fn=cmd_serve)
    i = sub.add_parser('init')
    i.add_argument('id')
    i.set_defaults(fn=cmd_init)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == '__main__':
    sys.exit(main())
