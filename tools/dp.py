#!/usr/bin/env python3
"""dieuphoi: one hub that reads the plans (orchestras) of many projects.

dp check          registry and every plan can be read
dp scan           write out/state.json and out/INBOX.md
dp serve          serve the agents office page (office/) and /api/state
dp build          write the office as a static site into out/site (page + state.json snapshot)
dp who @name      resolve an @name to one project and print where its orchestra lives
dp msg @name text leave a message in that project's mailbox (plan/INBOX.md)
dp passwd         read a passphrase from standard input; phones may pair with it instead of the key
dp hw             what the PC is doing and which project is using it (tools/hw.py)
dp todo build     write the owner's to-do page (encrypted) into out/todo-site
dp todo publish   build it and deploy it to Cloudflare Pages with wrangler
dp init <id>      write a starter plan into a registered project that has none
"""
import argparse
import base64
import collections
import datetime
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
import unicodedata
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

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
    out = {k: p.get(k) for k in ('id', 'name', 'group', 'parent', 'kind', 'path', 'mailbox')}
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
        'mail': mail_new(root / p['mailbox']) if p.get('mailbox') else mail_new(root / 'plan' / 'INBOX.md') if p['kind'] == 'plan' else mail_new(HUB / 'out' / 'mail' / (p['id'] + '.md')),
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
    if p.get('mailbox'):
        watch.append(root / p['mailbox'])
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
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.html': 'text/html; charset=utf-8',
                      '.webmanifest': 'application/manifest+json'}
    key = ''
    seen = set()

    def given(self):
        return self.headers.get('X-DP-Key') or parse_qs(urlsplit(self.path).query).get('k', [''])[0]

    def local(self):
        """From this PC itself. A request relayed by a tunnel or proxy also arrives from 127.0.0.1, so any
        forwarding header makes it remote."""
        relayed = any(self.headers.get(h) for h in ('CF-Connecting-IP', 'X-Forwarded-For', 'Forwarded', 'X-Real-IP'))
        return self.client_address[0] in ('127.0.0.1', '::1') and not relayed

    def reply(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        """Remote control. Always needs the key, also from this PC, so no web page can post here on its own."""
        path = self.path.split('?')[0]
        if not pass_ok(self.headers.get('X-DP-Key'), self.client_address[0]):
            return self.reply(401, {'error': 'key'})
        try:
            n = int(self.headers.get('Content-Length') or 0)
            if not 0 < n <= 16384:
                raise ValueError('body size')
            data = json.loads(self.rfile.read(n).decode('utf-8'))
            if path == '/api/chat':
                return self.reply(200, chat_send(data.get('text')))
            if path == '/api/board/shot':
                b = _board()
                port = int(data.get('port'))
                b.servers(_pairs(), {self.server.server_address[1]})
                if port not in b.ports():
                    raise ValueError('no such local server')
                return self.reply(200, {'ok': True, 'name': b.shot(HUB, port)})
            if path == '/api/game':
                return self.reply(200, {'ok': True, 'result': game_set(bool(data.get('on')), 'manual: app')})
            if path == '/api/power':
                return self.reply(200, {'ok': True, 'result': power(str(data.get('action')))})
            reg = registry()
            p, cands = resolve(str(data.get('to') or ''), reg)
            if p is None:
                raise ValueError('which project? ' + ', '.join('@' + c['id'] for c in cands) if cands else 'unknown project')
            sender = 'Vinh qua điện thoại'
            if path == '/api/msg':
                text = one_line(data.get('text'), 600)       # short mail: long messages between agents are what burns tokens
                if not text:
                    raise ValueError('empty message')
                out = {'ok': True, 'result': 'M-%03d -> %s' % send_msg(p, text, sender)}
            elif path == '/api/answer':
                text = one_line(data.get('text'))
                if not text or not re.fullmatch(r'Q-\d+', str(data.get('q'))):
                    raise ValueError('need q and text')
                out = {'ok': True, 'result': answer(p, data['q'], text, sender)}
            elif path == '/api/done':
                if not re.fullmatch(r'[A-Z][0-9]-[0-9]{2,3}[a-z]?', str(data.get('item'))):
                    raise ValueError('need item')
                out = {'ok': True, 'result': mark_done(p, data['item'], sender)}
            elif path == '/api/open':
                if GAME['on']:
                    raise ValueError('đang ở chế độ chơi game: không mở phiên mới')
                out = open_item(p, data.get('item') or None, reg)
            else:
                return self.reply(404, {'error': 'no such action'})
            Handler.cache = (0.0, b'')
            _PLANS.pop(p['id'], None)
            self.reply(200, out)
        except Exception as e:
            self.reply(400, {'error': '%s: %s' % (type(e).__name__, short(e, 300))})

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
                    if not self.local() and 'hw' in sys.modules:
                        sys.modules['hw'].net_hub(len(body) + 8)
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
        if not self.local():
            Handler.seen.add(self.client_address[0])
        if path.startswith('/p/'):
            return self.proxy(path)
        if path.startswith('/api/') and not self.local() and not self.cookie_ok() and not pass_ok(self.given(), self.client_address[0]):
            return self.reply(401, {'error': 'key'})
        if path == '/api/board':
            b = _board()
            body = json.dumps({'servers': b.servers(_pairs(), {self.server.server_address[1]}), 'items': b.items(HUB, _pairs(True)),
                               'can_shot': bool(b.browser())}, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Set-Cookie', 'dpk=%s; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000' % Handler.key)   # lets pictures and passed-on pages load without the key in their address
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            return self.wfile.write(body)
        if path == '/api/board/file':
            q = parse_qs(urlsplit(self.path).query)
            got = _board().image(HUB, _pairs(True), q.get('src', [''])[0], q.get('name', [''])[0])
            if not got:
                return self.reply(404, {'error': 'no such picture'})
            self.send_response(200)
            self.send_header('Content-Type', got[1])
            self.send_header('Cache-Control', 'private, max-age=86400')
            self.send_header('Content-Length', str(len(got[0])))
            self.end_headers()
            return self.wfile.write(got[0])
        if path == '/api/activity':
            try:
                return self.reply(200, activity())
            except Exception as e:
                return self.reply(500, {'error': '%s: %s' % (type(e).__name__, e)})
        if path == '/api/chat':
            return self.reply(200, chat_state())
        if path == '/api/hwlite':
            sys.path.insert(0, str(Path(__file__).resolve().parent))
            import hw
            lite = hw.lite()
            tk = list(hw._TOK['out'].values())
            lite['tok'] = {'out': sum(r['out'] for r in tk), 'all': sum(r['in'] + r['out'] + r['cache'] for r in tk)} if tk else None
            return self.reply(200, lite)
        if path == '/api/net':
            return self.reply(200, net_diag())
        if path == '/api/hw':
            try:
                return self.reply(200, hw_state())
            except Exception as e:
                return self.reply(500, {'error': '%s: %s' % (type(e).__name__, e)})
        if path == '/api/events':
            return self.events()
        if path != '/api/state':
            m = re.search(r'/p/(\d+)/', self.headers.get('Referer') or '')       # a passed-on page asked for /something: it means its own server
            if m and not path.startswith('/api/') and not os.path.exists(self.translate_path(self.path)):
                self.send_response(307)
                self.send_header('Location', '/p/%s%s' % (m.group(1), self.path))
                self.send_header('Content-Length', '0')
                return self.end_headers()
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

    def send_header(self, keyword, value):
        if keyword.lower() == 'content-length':          # what goes out to phones, for the traffic count
            try:
                if not self.local():
                    sys.modules['hw'].net_hub(int(value))
            except (KeyError, ValueError, AttributeError):
                pass
        super().send_header(keyword, value)

    def cookie_ok(self):
        m = re.search(r'(?:^|;\s*)dpk=([^;\s]+)', self.headers.get('Cookie') or '')
        return bool(m and Handler.key) and hmac.compare_digest(m.group(1).encode('utf-8'), Handler.key.encode('utf-8'))

    def proxy(self, path):
        """/p/<port>/... passes on a page of a web server of this PC, also one that only listens on 127.0.0.1.
        Reading only (GET), and only ports the board lists."""
        b = _board()
        m = re.match(r'/p/(\d+)(/.*)?$', path)
        if not (self.local() or self.cookie_ok() or (self.given() and pass_ok(self.given(), self.client_address[0]))):
            return self.reply(401, {'error': 'key'})
        if not m or (b.servers(_pairs(), {self.server.server_address[1]}) is None) or int(m.group(1)) not in b.ports():
            return self.reply(404, {'error': 'no such local server'})
        if not m.group(2):
            self.send_response(307)
            self.send_header('Location', path + '/')
            self.send_header('Content-Length', '0')
            return self.end_headers()
        query = '&'.join(part for part in urlsplit(self.path).query.split('&') if part and not part.startswith('k='))
        code, ctype, body = b.fetch(int(m.group(1)), m.group(2) + ('?' + query if query else ''))
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Cache-Control', 'no-store')
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
        print('plan: %s, mailbox: %s' % (FILES[p['kind']][0], p.get('mailbox') or ('plan/INBOX.md' if p['kind'] == 'plan' else 'hub out/mail/%s.md' % p['id'])))
        print('state: %s' % (st.get('error') or 'working %d, ready %d, open questions %d, waiting %d' % (
            len(st.get('working', [])), len(st.get('ready', [])), len(st.get('questions', [])), st.get('waiting', 0))))
    return 0


def one_line(text, limit=2000):
    return ' '.join(str(text or '').split())[:limit]


def send_msg(p, text, sender):
    """Append one message to the project's mailbox; returns (number, where)."""
    if p.get('mailbox'):                         # a project that named its own mailbox file (the seal orchestra does)
        box, where = real(p['path']) / p['mailbox'], '%s of @%s' % (p['mailbox'], p['id'])
    elif p['kind'] == 'plan':
        box, where = real(p['path']) / 'plan' / 'INBOX.md', 'plan/INBOX.md of @%s' % p['id']
    else:                                        # never write into a seal orchestra, an archive or a tool
        box, where = HUB / 'out' / 'mail' / (p['id'] + '.md'), 'out/mail/%s.md in the hub (the project is %s)' % (p['id'], p['kind'])
    box.parent.mkdir(parents=True, exist_ok=True)
    old = box.read_text(encoding='utf-8') if box.is_file() else '# Thư từ điều phối\n\nThư mới nhất ở cuối. Phiên của project đọc thư `status: new`, làm xong thì đổi thành `status: done` kèm một dòng kết quả.\n'
    n = len(re.findall(r'^## M-\d+', old, flags=re.M)) + 1
    box.write_text('%s\n## M-%03d · %s · từ %s\n%s\n- status: new\n' % (
        old.rstrip('\n') + '\n', n, datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), sender, text),
        encoding='utf-8', newline='\n')
    return n, where


def cmd_msg(args):
    p, _ = _pick(args.name)
    if p is None:
        return 1
    text = one_line(' '.join(args.text), 600)
    if not text:
        print('dp msg: empty message')
        return 1
    print('M-%03d -> %s' % send_msg(p, text, args.sender))
    return 0


def answer(p, qid, text, sender):
    """Close an open question of a plan with the owner's answer. Other kinds get it as a message in the hub."""
    if p['kind'] != 'plan':
        n, where = send_msg(p, 'Trả lời %s: %s' % (qid, text), sender)
        return 'M-%03d -> %s' % (n, where)
    qfile = real(p['path']) / 'plan' / 'QUESTIONS.md'
    lines, inside, done = qfile.read_text(encoding='utf-8-sig').split('\n'), False, False
    for i, line in enumerate(lines):
        m = HEAD.match(line.strip())
        if m or line.startswith('## '):
            inside = bool(m) and m.group(1) == qid
        elif inside and line.strip() == '- status: open':
            lines[i] = '- status: answered\n- answer: %s (%s, %s)' % (text, sender, datetime.date.today().isoformat())
            done = True
            break
    if not done:
        raise ValueError('%s is not an open question of @%s' % (qid, p['id']))
    qfile.write_text('\n'.join(lines), encoding='utf-8', newline='\n')
    log = real(p['path']) / 'plan' / 'CHANGELOG.md'
    if log.is_file():
        old = log.read_text(encoding='utf-8')
        head, _, rest = old.partition('\n')
        log.write_text('%s\n\n- %s: %s trả lời (%s).%s' % (head, datetime.date.today().isoformat(), qid, sender,
                       '\n' + rest.lstrip('\n') if rest.strip() else '\n'), encoding='utf-8', newline='\n')
    return '%s of @%s answered' % (qid, p['id'])


def open_item(p, item, reg):
    """Run projectplaner's own `open <ID>` (or `next`) inside the project; its safety checks decide."""
    if p['kind'] != 'plan':
        raise ValueError('@%s is %s: the hub opens no session there' % (p['id'], p['kind']))
    if item and not re.fullmatch(r'[A-Z][0-9]-[0-9]{2,3}[a-z]?', item):
        raise ValueError('bad item id')
    pp = next((x for x in reg['projects'] if x['id'] == 'projectplaner'), None)
    env = dict(os.environ)
    if pp:
        env['PYTHONPATH'] = str(real(pp['path']) / 'src') + os.pathsep + env.get('PYTHONPATH', '')
    cmd = [os.environ.get('PP_PYTHON') or sys.executable, '-m', 'projectplaner'] + (['open', item] if item else ['next'])
    r = subprocess.run(cmd, cwd=str(real(p['path'])), env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=90,
                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    return {'ok': r.returncode == 0, 'output': one_line((r.stdout or '') + ' ' + (r.stderr or ''), 600)}


def mark_done(p, item, sender):
    """The owner reports one of his own items done. Only items owned by a person can be closed this way."""
    if p['kind'] != 'plan':
        n, where = send_msg(p, 'Anh Vinh báo đã xong %s' % item, sender)
        return 'M-%03d -> %s' % (n, where)
    f = real(p['path']) / 'plan' / 'STATUS.yaml'
    text = f.read_text(encoding='utf-8-sig')
    it = next((i for i in (yaml.safe_load(text).get('items') or []) if i.get('id') == item), None)
    if it is None or it.get('owner', 'agent') == 'agent' or it.get('status') in CLOSED:
        raise ValueError('%s is not an open item of a person in @%s' % (item, p['id']))
    lines, start = text.split('\n'), None
    for i, line in enumerate(lines):
        m = re.match(r'^(\s*)- id:\s*%s\s*(#.*)?$' % re.escape(item), line)
        if m:
            start, pad = i, m.group(1) + '  '
            break
    if start is None:
        raise ValueError('%s is written in a form this command cannot edit; change plan/STATUS.yaml by hand' % item)
    for j in range(start + 1, len(lines)):
        if lines[j].strip() and not lines[j].startswith(pad):
            break
        if re.match(r'^%sstatus:' % pad, lines[j]):
            lines[j] = '%sstatus: done\n%sevidence: [anh Vinh báo xong, %s]\n%sdone_on: %s' % (
                pad, pad, sender, pad, datetime.date.today().isoformat())
            break
    else:
        raise ValueError('%s has no status line' % item)
    new = '\n'.join(lines)
    done = next(i for i in yaml.safe_load(new)['items'] if i.get('id') == item)
    if done.get('status') != 'done':
        raise ValueError('edit did not take; nothing written')
    f.write_text(new, encoding='utf-8', newline='\n')
    log = real(p['path']) / 'plan' / 'CHANGELOG.md'
    if log.is_file():
        head, _, rest = log.read_text(encoding='utf-8').partition('\n')
        log.write_text('%s\n\n- %s: %s xong (%s).%s' % (head, datetime.date.today().isoformat(), item, sender,
                       '\n' + rest.lstrip('\n') if rest.strip() else '\n'), encoding='utf-8', newline='\n')
    return '%s of @%s done' % (item, p['id'])


def seal(secret, data):
    """Encrypt for the public to-do page: HMAC-SHA256 in counter mode, then a MAC over nonce and ciphertext.
    Only the standard library is needed here, and the page undoes it with WebCrypto."""
    key = secret.encode('utf-8')
    k_enc, k_mac = (hmac.new(key, tag, 'sha256').digest() for tag in (b'enc', b'mac'))
    nonce = secrets.token_bytes(16)
    stream = b''.join(hmac.new(k_enc, nonce + i.to_bytes(4, 'big'), 'sha256').digest() for i in range((len(data) + 31) // 32))
    ct = bytes(a ^ b for a, b in zip(data, stream))
    return base64.b64encode(nonce + hmac.new(k_mac, nonce + ct, 'sha256').digest() + ct)


def todo_payload():
    tasks = []
    for p in scan()['projects']:
        for q in p.get('questions', []):
            tasks.append({'project': p['id'], 'name': p['name'], 'kind': 'answer', 'id': q['id'], 'text': q['text'], 'since': q.get('asked')})
        for i in p.get('person', []):
            tasks.append({'project': p['id'], 'name': p['name'], 'kind': 'do', 'id': i['id'], 'text': i['title'], 'owner': i['owner']})
    digest = hashlib.sha1(json.dumps(tasks, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()
    return {'generated': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), 'tasks': tasks}, digest


def todo_build():
    site = HUB / 'out' / 'todo-site'
    shutil.copytree(HUB / 'todo', site, dirs_exist_ok=True)
    for icon in ('icon-192.png', 'icon-512.png'):
        if (HUB / 'office' / icon).is_file():
            shutil.copy(HUB / 'office' / icon, site / icon)
    payload, digest = todo_payload()
    payload['app'] = (HUB / 'out' / 'phone-link.txt').read_text(encoding='ascii').splitlines()[0].split('#')[0].strip() if (HUB / 'out' / 'phone-link.txt').is_file() else None
    blob = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    (site / 'data.enc').write_bytes(seal(token(), blob))
    ph = HUB / 'out' / 'pass.hash'
    for old in ('data-p.enc', 'pass.json'):
        if (site / old).is_file():
            (site / old).write_text('', encoding='ascii')
    if ph.is_file() and ph.stat().st_size:           # the owner chose to let his passphrase open the public page too
        salt, rounds, digest = ph.read_text(encoding='ascii').strip().split('$')
        secret = hmac.new(bytes.fromhex(digest), b'todo', 'sha256').hexdigest()
        (site / 'data-p.enc').write_bytes(seal(secret, blob))
        (site / 'pass.json').write_text(json.dumps({'salt': salt, 'rounds': int(rounds)}), encoding='ascii')
    return site, digest, len(payload['tasks'])


def todo_publish():
    """Deploy the to-do page with the wrangler login of this PC. Returns (ok, message)."""
    name = (registry().get('publish') or {}).get('pages_project')
    if not name:
        return False, 'registry.yaml has no publish.pages_project'
    site, digest, n = todo_build()
    npx = ['cmd', '/c', 'npx'] if os.name == 'nt' else ['npx']
    try:
        r = subprocess.run(npx + ['--yes', 'wrangler', 'pages', 'deploy', str(site), '--project-name', name, '--branch', 'main',
                                  '--commit-dirty=true'], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=420, stdin=subprocess.DEVNULL,
                           creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        ok, out = r.returncode == 0, (r.stdout or '') + (r.stderr or '')
    except (OSError, subprocess.SubprocessError) as e:
        ok, out = False, '%s: %s' % (type(e).__name__, e)
    stamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    with open(HUB / 'out' / 'publish.log', 'a', encoding='utf-8') as f:
        f.write('%s %s %d tasks %s\n' % (stamp, 'OK' if ok else 'FAILED', n, '' if ok else one_line(out, 400)))
    if ok:
        (HUB / 'out' / 'todo.hash').write_text(digest, encoding='ascii')
        (HUB / 'out' / 'todo-link.txt').write_text('https://%s.pages.dev/#k=%s\n' % (name, token()), encoding='ascii')
    return ok, ('%d tasks published to https://%s.pages.dev' % (n, name)) if ok else one_line(out, 400)


def nvidia_scan():
    """Find where the NVIDIA app keeps its list of games on this PC and leave a short report in out/nvidia-scan.json."""
    roots = [Path(os.environ.get(v, '')) / n for v in ('LOCALAPPDATA', 'PROGRAMDATA') for n in ('NVIDIA', 'NVIDIA Corporation') if os.environ.get(v)]
    words = ('journal', 'game', 'application', 'ontology', 'library', 'fingerprint', 'titles')
    files = []
    for root in roots:
        if not root.is_dir():
            continue
        base = len(root.parts)
        for folder, dirs, names in os.walk(root):
            if len(Path(folder).parts) - base >= 6:
                dirs[:] = []
            for n in names:
                low = n.lower()
                if low.endswith(('.xml', '.json', '.db', '.sqlite', '.dat')) and any(w in low or w in folder.lower() for w in words):
                    f = Path(folder) / n
                    try:
                        st = f.stat()
                    except OSError:
                        continue
                    if st.st_size < 40 * 2 ** 20:
                        files.append({'path': str(f), 'size': st.st_size, 'day': time.strftime('%Y-%m-%d', time.localtime(st.st_mtime))})
            if len(files) > 400:
                break
    out = {'time': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), 'roots': [str(r) for r in roots if r.is_dir()], 'files': files[:400], 'samples': {}}
    for f in sorted(files, key=lambda x: -x['size']):
        if f['path'].lower().endswith(('.xml', '.json')) and len(out['samples']) < 6:
            try:
                with open(f['path'], 'rb') as fh:
                    out['samples'][f['path']] = fh.read(2500).decode('utf-8', 'replace')
            except OSError:
                pass
    (HUB / 'out' / 'nvidia-scan.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')


def bootstrap():
    """Things a hidden server can settle by itself, tried at most once a day and logged in out/setup.log:
    install psutil when it is missing, and make the first Cloudflare Pages deploy of the to-do page."""
    try:
        nvidia_games()
    except Exception:
        pass
    time.sleep(40)
    log, mark = HUB / 'out' / 'setup.log', HUB / 'out' / 'setup.json'
    today = datetime.date.today().isoformat()
    try:
        done = json.loads(mark.read_text(encoding='ascii'))
    except (OSError, ValueError):
        done = {}

    def note(text):
        with open(log, 'a', encoding='utf-8') as f:
            f.write('%s %s\n' % (datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), text))

    flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    if _psutil() is None and done.get('psutil') != today:
        done['psutil'] = today
        mark.write_text(json.dumps(done), encoding='ascii')
        try:
            r = subprocess.run([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check', 'psutil'],
                               capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=600, creationflags=flags)
            note('pip install psutil: %s %s' % ('OK' if r.returncode == 0 else 'FAILED', one_line((r.stdout or '')[-200:] + ' ' + (r.stderr or '')[-300:], 400)))
            if r.returncode == 0:
                os._exit(3)                          # the start script runs the server again, now with psutil
        except (OSError, subprocess.SubprocessError) as e:
            note('pip install psutil: FAILED %s' % e)
    name = (registry().get('publish') or {}).get('pages_project')
    if name and not (HUB / 'out' / 'todo.hash').is_file() and done.get('publish') != today:
        done['publish'] = today
        mark.write_text(json.dumps(done), encoding='ascii')
        npx = ['cmd', '/c', 'npx'] if os.name == 'nt' else ['npx']
        try:
            r = subprocess.run(npx + ['--yes', 'wrangler', 'pages', 'project', 'create', name, '--production-branch', 'main'],
                               capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=300, creationflags=flags, stdin=subprocess.DEVNULL)
            note('wrangler project create: %s %s' % (r.returncode, one_line((r.stdout or '')[-200:] + ' ' + (r.stderr or '')[-300:], 400)))
        except (OSError, subprocess.SubprocessError) as e:
            note('wrangler project create: FAILED %s' % e)
        ok, msg = todo_publish()
        note('first publish: %s %s' % ('OK' if ok else 'FAILED', msg))


def token_loop():
    """Counts today's tokens in the background, every 5 minutes, so no request waits for it."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import hw
    time.sleep(20)
    while True:
        try:
            hw.net_sample()                           # keeps today's traffic total moving when no phone is looking
            hw._net_save(True)
            got = hw.token_usage([(p['id'], real(p['path'])) for p in registry()['projects']] + [('tong-quan', str(HUB))])
            (HUB / 'out' / 'tokens.json').write_text(json.dumps({'day': hw._TOK['day'], 'projects': got}, ensure_ascii=False, indent=1), encoding='utf-8')
        except Exception as e:
            (HUB / 'out' / 'tokens.json').write_text(json.dumps({'error': '%s: %s' % (type(e).__name__, e)}), encoding='utf-8')
        time.sleep(300)


def reload_on_change():
    """A hidden server cannot be restarted by hand: leave when its own code changes, the start script runs it again."""
    files = [Path(__file__).resolve(), Path(__file__).resolve().parent / 'hw.py', Path(__file__).resolve().parent / 'board.py']
    seen = [f.stat().st_mtime_ns if f.is_file() else 0 for f in files]
    while True:
        time.sleep(20)
        if [f.stat().st_mtime_ns if f.is_file() else 0 for f in files] != seen:
            os._exit(3)


def auto_publish():
    """Runs inside `dp serve` once a first publish has worked: redeploy when the owner's to-do list changes."""
    wait = 300
    while True:
        time.sleep(wait)
        try:
            mark = HUB / 'out' / 'todo.hash'
            if GAME['on'] or not (registry().get('publish') or {}).get('auto') or not mark.is_file():
                continue
            if todo_payload()[1] != mark.read_text(encoding='ascii').strip():
                wait = 300 if todo_publish()[0] else 3600          # a failing deploy is retried hourly, not every 5 minutes
        except Exception:
            wait = 3600


def cmd_todo(args):
    if args.what == 'build':
        site, _, n = todo_build()
        print('%d tasks -> %s' % (n, site))
        return 0
    ok, msg = todo_publish()
    print(msg)
    return 0 if ok else 1


POWER = {'shutdown': ['shutdown', '/s', '/t', '60', '/c', 'dieuphoi: tat may sau 60 giay'],
         'restart': ['shutdown', '/r', '/t', '60', '/c', 'dieuphoi: khoi dong lai sau 60 giay'],
         'cancel': ['shutdown', '/a'],
         'sleep': ['rundll32.exe', 'powrprof.dll,SetSuspendState', '0,1,0']}


def power(action):
    """Shut down or restart after 60 seconds (cancel stops it), or sleep now. Windows only."""
    if action not in POWER:
        raise ValueError('unknown power action')
    if os.name != 'nt':
        raise ValueError('power control is only wired for Windows')
    if action == 'sleep':                          # answer first: the PC is asleep before a reply could leave
        threading.Timer(3, lambda: subprocess.run(POWER['sleep'], creationflags=subprocess.CREATE_NO_WINDOW)).start()
        return 'sleep in 3 seconds'
    r = subprocess.run(POWER[action], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=20, creationflags=subprocess.CREATE_NO_WINDOW)
    if r.returncode:
        raise ValueError(one_line((r.stdout or '') + (r.stderr or ''), 200) or 'command failed')
    return {'shutdown': 'shutdown in 60 seconds', 'restart': 'restart in 60 seconds', 'cancel': 'cancelled'}[action]


def _board():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import board
    return board


def _pairs(kinds=False):
    ps = registry()['projects']
    return [(p['id'], real(p['path']), p.get('kind')) for p in ps] if kinds else [(p['id'], real(p['path'])) for p in ps]


def activity():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import hw
    reg = registry()
    name = (reg.get('publish') or {}).get('pages_project')
    pairs = [(p['id'], real(p['path'])) for p in reg['projects']]
    return {'claude': hw.claude_activity(pairs), 'programs': hw.project_programs(pairs), 'game': game_state(), 'tokens': hw._TOK['out'],
            'boss': {k: v for k, v in chat_state().items() if k != 'messages'}, 'boss_usage': boss_usage(), 'net': hw.net_today(),
            'todo_url': 'https://%s.pages.dev/' % name if name else None,
            'passphrase': (HUB / 'out' / 'pass.hash').is_file() and (HUB / 'out' / 'pass.hash').stat().st_size > 0}


def net_diag():
    """How the VPN reaches the phone: ZeroTier peers (DIRECT or RELAY) and Tailscale status. Read only."""
    flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    tries = [('zerotier', ['zerotier-cli', 'peers']),
             ('zerotier', [r'C:\Program Files (x86)\ZeroTier\One\zerotier-cli.bat', 'peers']),
             ('zerotier', [r'C:\ProgramData\ZeroTier\One\zerotier-one_x64.exe', '-q', 'peers']),
             ('tailscale', ['tailscale', 'status']),
             ('tailscale', [r'C:\Program Files\Tailscale\tailscale.exe', 'status'])]
    out, done = {'time': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}, set()
    for name, cmd in tries:
        if name in done:
            continue
        try:
            r = subprocess.run(cmd, capture_output=True, timeout=20, creationflags=flags)
        except (OSError, subprocess.SubprocessError):
            continue
        text = (r.stdout + r.stderr).decode('utf-8', 'replace').strip()
        done.add(name)
        out[name] = {'ok': r.returncode == 0, 'text': text[:4000]}
        if name == 'zerotier' and r.returncode == 0:
            leaf = [ln for ln in text.splitlines() if ' LEAF' in ln.upper()]
            out[name].update(direct=sum('DIRECT' in ln.upper() for ln in leaf), relay=sum('RELAY' in ln.upper() for ln in leaf))
    pings = {}
    for ip in sorted(Handler.seen)[:4]:               # round trip to the phones that used the app lately
        try:
            r = subprocess.run(['ping', '-n' if os.name == 'nt' else '-c', '4', ip], capture_output=True, timeout=30, creationflags=flags)
            text = r.stdout.decode('utf-8', 'replace')
            times = [float(x) for x in re.findall(r'[=<]\s*(\d+(?:\.\d+)?)\s*ms', text)]
            pings[ip] = {'replies': len(times), 'ms': times[:4]} if r.returncode == 0 and times else {'replies': 0, 'ms': []}
        except (OSError, subprocess.SubprocessError):
            pings[ip] = {'replies': 0, 'ms': []}
    out['ping'] = pings
    for name in ('zerotier', 'tailscale'):
        out.setdefault(name, {'ok': False, 'text': 'not installed or not on the PATH'})
    try:
        (HUB / 'out' / 'net.txt').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    except OSError:
        pass
    return out


# ---- chat with the general manager: a Claude Code session of this folder answers the owner's messages
CHAT = {'busy': False, 'step': '', 'since': None, 'session': None, 'note': None, 'model': None}
STEP_VI = {'Bash': 'đang chạy lệnh', 'Read': 'đang đọc tệp', 'Edit': 'đang sửa tệp', 'Write': 'đang viết tệp', 'Grep': 'đang tìm',
           'Glob': 'đang tìm tệp', 'TodoWrite': 'đang lập danh sách việc', 'Task': 'đang giao việc cho nhân viên'}


def chat_log(who, text, meta=None):
    row = {'t': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), 'who': who, 'text': text}
    if meta:
        row['meta'] = meta
    with open(HUB / 'out' / 'chat.jsonl', 'a', encoding='utf-8') as f:
        f.write(json.dumps(row, ensure_ascii=False) + '\n')


def chat_state():
    msgs = []
    try:
        for line in (HUB / 'out' / 'chat.jsonl').read_text(encoding='utf-8').splitlines()[-40:]:
            msgs.append(json.loads(line))
    except (OSError, ValueError):
        pass
    try:                                             # what the manager did from elsewhere, for the projector screen
        note = json.loads((HUB / 'out' / 'boss.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        note = None
    return {'busy': CHAT['busy'], 'step': CHAT['step'], 'since': CHAT['since'], 'model': CHAT['model'], 'messages': msgs, 'note': note}


def claude_cmd():
    exe = shutil.which('claude') or shutil.which('claude.cmd') or shutil.which('claude.exe')
    if not exe:
        for cand in (Path.home() / '.local' / 'bin' / 'claude.exe', Path(os.environ.get('APPDATA', '')) / 'npm' / 'claude.cmd'):
            if cand.is_file():
                exe = str(cand)
                break
    if not exe:
        return None
    return ['cmd', '/c', exe] if exe.lower().endswith(('.cmd', '.bat')) else [exe]


def pick_model(text):
    """Which model answers this message. `chat.model` in registry.yaml: a fixed name, or `auto` = a quick look at
    the message: status questions go to the light model, design and analysis to the deep one, the rest to the
    normal one. The owner can force it by starting the message with /haiku, /sonnet or /opus."""
    cfg = registry().get('chat') or {}
    m = re.match(r'\s*/(haiku|sonnet|opus)\b\s*', text, re.I)
    if m:
        return m.group(1).lower(), text[m.end():] or text, 'anh chọn'
    fixed = str(cfg.get('model') or 'auto')
    if fixed != 'auto':
        return fixed, text, 'cố định'
    f = fold(text)
    deep = ('thietke', 'kehoach', 'phantich', 'chienluoc', 'nguyennhan', 'taisao', 'visao', 'sosanh', 'dexuat', 'nghiky', 'nghisau',
            'kientruc', 'rasoat', 'ralai', 'toiuu', 'danhgia', 'quyetdinh', 'hoidong', 'uutien', 'lotrinh')
    light = ('tinhhinh', 'aidang', 'danglamgi', 'phancung', 'gpu', 'ram', 'cpu', 'baonhieu', 'trangthai', 'viecnaocho', 'choanh',
             'chao', 'hello', 'token', 'luuluong', 'conchay', 'xongchua', 'camon')
    if len(text) > 400 or any(k in f for k in deep):
        return str(cfg.get('deep') or 'opus'), text, 'việc cần nghĩ sâu'
    if len(text) < 90 and '@' not in text and any(k in f for k in light):
        return str(cfg.get('light') or 'haiku'), text, 'câu hỏi nhanh'
    return str(cfg.get('normal') or 'sonnet'), text, 'việc thường'


def boss_usage(add=None):
    """Today's cost of the manager's chat: turns, tokens, seconds, per model. Kept in out/boss-usage.json."""
    f = HUB / 'out' / 'boss-usage.json'
    today = datetime.date.today().isoformat()
    try:
        u = json.loads(f.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        u = {}
    if u.get('day') != today:
        u = {'day': today, 'turns': 0, 'in': 0, 'out': 0, 'cache_read': 0, 'cache_write': 0, 'cost_usd': 0.0, 'secs': 0, 'models': {}, 'last': None}
    if add:
        u['turns'] += 1
        for k in ('in', 'out', 'cache_read', 'cache_write', 'secs'):
            u[k] += add.get(k) or 0
        u['cost_usd'] = round(u['cost_usd'] + (add.get('cost_usd') or 0), 4)
        row = u['models'].setdefault(add['model'], {'turns': 0, 'tokens': 0})
        row['turns'] += 1
        row['tokens'] += (add.get('in') or 0) + (add.get('out') or 0) + (add.get('cache_read') or 0) + (add.get('cache_write') or 0)
        u['last'] = add
        f.write_text(json.dumps(u, ensure_ascii=False, indent=1), encoding='utf-8')
    return u


def chat_sessions(save=None):
    """One Claude Code session per model: changing the model inside a session makes it read the whole talk again
    at full price. The light model has none: every quick question starts clean."""
    f = HUB / 'out' / 'chat-sessions.json'
    if save is not None:
        f.write_text(json.dumps(save), encoding='ascii')
        return save
    try:
        got = json.loads(f.read_text(encoding='ascii'))
        return got if isinstance(got, dict) else {}
    except (OSError, ValueError):
        return {}


def chat_recent(n=6):
    """The last lines of the talk, for a model that was not there when they were said."""
    rows = chat_state()['messages'][-(n + 1):-1]            # the newest line is the message being answered
    if not rows:
        return ''
    return 'Các tin gần đây trong ô chat (để nắm mạch chuyện, không cần trả lời lại):\n' + '\n'.join(
        '- %s: %s' % ('anh Vinh' if r.get('who') == 'vinh' else 'tổng quản', short(r.get('text', ''), 400)) for r in rows) + '\n\nTin mới của anh Vinh:\n'


def chat_turn(text, model, session=None):
    """Runs `claude -p` once. Returns (reply, result event)."""
    cmd = claude_cmd()
    if not cmd:
        raise RuntimeError('PC không tìm thấy lệnh claude (Claude Code) trên PATH của server')
    cmd += ['-p', '--output-format', 'stream-json', '--verbose', '--max-turns', '25', '--model', model, '--permission-mode', 'acceptEdits',
            '--allowedTools', 'Read,Grep,Glob,Edit,Write,TodoWrite,Bash(python tools/dp.py:*)']
    CHAT['session'] = None
    if session:
        cmd += ['--resume', session]
    pr = subprocess.Popen(cmd, cwd=str(HUB), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    killer = threading.Timer(420, pr.kill)
    killer.start()
    reply, result = None, {}
    try:
        pr.stdin.write(text.encode('utf-8'))
        pr.stdin.close()
        for raw in pr.stdout:
            try:
                e = json.loads(raw.decode('utf-8', 'replace'))
            except ValueError:
                continue
            if not isinstance(e, dict):
                continue
            if e.get('session_id'):
                CHAT['session'] = e['session_id']
            if e.get('type') == 'assistant':
                for part in (e.get('message') or {}).get('content') or []:
                    if part.get('type') == 'tool_use':
                        CHAT['step'] = STEP_VI.get(str(part.get('name')), 'đang dùng công cụ')
                    elif part.get('type') == 'text' and part.get('text', '').strip():
                        CHAT['step'] = 'đang soạn câu trả lời'
                        reply = part['text'].strip()
            elif e.get('type') == 'result':
                result = e
                reply = str(e.get('result') or reply or '').strip() or reply
        pr.wait(timeout=30)
    finally:
        killer.cancel()
    if not reply or result.get('is_error'):
        err = pr.stderr.read().decode('utf-8', 'replace')
        raise RuntimeError(one_line(err or reply or '', 300) or 'không có câu trả lời (mã %s)' % pr.returncode)
    return reply, result


def chat_run(text):
    """One turn: the message goes to `claude -p` on standard input (never on the command line), the steps are
    followed from the JSON stream, the final text is the reply. The session is resumed on the next turn."""
    CHAT.update(busy=True, step='đang đọc tin nhắn', since=datetime.datetime.now().strftime('%H:%M:%S'))
    reply, meta, began = None, {}, time.time()
    try:
        model, text, why = pick_model(text)
        CHAT['model'] = model
        cfg = registry().get('chat') or {}
        normal = str(cfg.get('normal') or 'sonnet')
        light = model == str(cfg.get('light') or 'haiku') and model != normal
        book = chat_sessions()
        session = None if light else book.get(model)
        before = [r for r in chat_state()['messages'][:-1] if r.get('who') != 'vinh'][-1:]
        same = bool(session) and bool(before) and (before[0].get('meta') or {}).get('model') == model
        ask = text if same else chat_recent() + text       # this model missed the last lines: hand them over
        try:
            reply, result = chat_turn(ask, model, session)
        except RuntimeError as e:
            if 'PATH' in str(e):
                raise
            if session:                                     # the kept session is gone or broken: start a clean one
                CHAT['step'] = 'mở phiên mới'
                why += ', phiên cũ lỗi nên mở mới'
            elif model != normal:                           # the chosen model was refused: the normal one answers
                CHAT['step'] = 'đổi sang model %s' % normal
                why += ', %s lỗi nên đổi' % model
                model, light = normal, False
                CHAT['model'] = model
            else:
                raise
            reply, result = chat_turn(chat_recent() + text, model, None)
        use = result.get('usage') if isinstance(result.get('usage'), dict) else {}
        meta = {'model': model, 'why': why, 'secs': round(time.time() - began),
                'in': int(use.get('input_tokens') or 0), 'out': int(use.get('output_tokens') or 0),
                'cache_read': int(use.get('cache_read_input_tokens') or 0), 'cache_write': int(use.get('cache_creation_input_tokens') or 0),
                'cost_usd': round(float(result.get('total_cost_usd') or 0), 4), 'steps': result.get('num_turns')}
        size = (meta['in'] + meta['cache_read'] + meta['cache_write']) // max(1, int(meta['steps'] or 1))
        meta['context'] = size
        if not light:
            book = chat_sessions()
            if size > int(cfg.get('max_context') or 120000):      # a long talk costs its whole length on every step
                book.pop(model, None)
                meta['why'] += ', phiên dài nên lượt sau mở phiên mới'
            elif CHAT['session']:
                book[model] = CHAT['session']
            chat_sessions(book)
        boss_usage(meta)
    except Exception as e:
        reply = 'Lỗi khi gọi tổng quản trên PC: %s' % one_line(e, 300)
    chat_log('boss', reply[:6000], meta)
    CHAT.update(busy=False, step='', since=None, model=None)
    Handler.cache = (0.0, b'')
    _PLANS.clear()


def chat_send(text, who='vinh'):
    text = str(text or '').strip()[:4000]
    if not text:
        raise ValueError('empty message')
    if CHAT['busy']:
        raise ValueError('tổng quản đang trả lời tin trước, chờ một chút')
    chat_log(who, text)
    CHAT['busy'] = True
    threading.Thread(target=chat_run, args=(text,), daemon=True).start()
    return chat_state()


# ---- game mode: the owner plays, the agents wait
GAME = {'on': False, 'by': None, 'since': None, 'suspended': []}


def game_state():
    return {'on': GAME['on'], 'by': GAME['by'], 'since': GAME['since'], 'suspended': len(GAME['suspended']),
            'can_suspend': _psutil() is not None}


def _psutil():
    try:
        import psutil
        return psutil
    except ImportError:
        return None


def game_set(on, by):
    """Turn game mode on or off. On: no new session is opened from the hub and, when psutil is installed, every
    program running inside a registered project is suspended (not killed). Off: they are resumed."""
    ps = _psutil()
    if on and not GAME['on']:
        held = []
        if ps:
            sys.path.insert(0, str(Path(__file__).resolve().parent))
            import hw
            for pr, owner in hw.project_processes([(p['id'], real(p['path'])) for p in registry()['projects']]):
                try:
                    pr.suspend()
                    held.append([pr.pid, pr.create_time(), owner])
                except ps.Error:
                    pass
        GAME.update(on=True, by=by, since=datetime.datetime.now().strftime('%H:%M'), suspended=held)
    elif not on and GAME['on']:
        for pid, born, _ in GAME['suspended']:
            try:
                pr = ps.Process(pid)
                if abs(pr.create_time() - born) < 1:
                    pr.resume()
            except Exception:
                pass
        GAME.update(on=False, by=by, since=None, suspended=[])
    try:
        (HUB / 'out' / 'game-mode.json').write_text(json.dumps({'on': GAME['on'], 'by': GAME['by'], 'suspended': GAME['suspended']}), encoding='ascii')
    except OSError:
        pass
    return game_state()


_NV = [0.0, []]


def nvidia_games():
    """Games the NVIDIA app has found on this PC: [{name, exes}], from its ApplicationStorage.json.
    Creative apps (Discord, editors, ...) are left out. Re-read at most every 5 minutes."""
    if time.time() - _NV[0] < 300:
        return _NV[1]
    f = Path(os.environ.get('LOCALAPPDATA', '')) / 'NVIDIA Corporation' / 'NVIDIA app' / 'NvBackend' / 'ApplicationStorage.json'
    games = []
    try:
        for row in json.loads(f.read_text(encoding='utf-8-sig')).get('Applications', []):
            app = row.get('Application') or {}
            if app.get('IsCreativeApplication'):
                continue
            exes = sorted({Path(str(x).replace('\\', '/')).name for x in (app.get('ImageFiles') or []) + (app.get('DetectedFiles') or [])
                           if str(x).lower().endswith('.exe') and not re.search(r'helper|launcher|crash|unins|setup|update', str(x).lower().rsplit('\\', 1)[-1])})
            if exes:
                games.append({'name': app.get('DisplayName') or app.get('ShortName'), 'exes': exes, 'last': str(app.get('LastLaunchTimeISO') or '')[:10]})
    except (OSError, ValueError):
        pass
    _NV[:] = [time.time(), games]
    try:
        (HUB / 'out' / 'nvidia-games.json').write_text(json.dumps(games, ensure_ascii=False, indent=1), encoding='utf-8')
    except OSError:
        pass
    return games


def running_games(names):
    """Which of the listed game programs are running now (process names, case ignored)."""
    want = {n.lower() for n in names}
    try:
        if os.name == 'nt':
            out = subprocess.run(['tasklist', '/fo', 'csv', '/nh'], capture_output=True, timeout=20,
                                 creationflags=subprocess.CREATE_NO_WINDOW).stdout.decode('utf-8', 'replace')
            seen = {ln.split('","')[0].strip('"').lower() for ln in out.splitlines() if ln}
        else:
            out = subprocess.run(['ps', '-eo', 'comm'], capture_output=True, timeout=20).stdout.decode('utf-8', 'replace')
            seen = {ln.strip().lower() for ln in out.splitlines()}
    except (OSError, subprocess.SubprocessError):
        return []
    return sorted(want & seen)


def game_watch():
    """Every 30 seconds: follow out/game-mode.json when someone edits it, and the list of games in registry.yaml."""
    f = HUB / 'out' / 'game-mode.json'
    try:                                             # a server that died in game mode must not leave programs frozen
        old = json.loads(f.read_text(encoding='ascii'))
        if old.get('on'):
            GAME.update(on=True, by=old.get('by'), suspended=old.get('suspended') or [])
            if not str(old.get('by', '')).startswith('manual'):
                game_set(False, 'restart')
    except (OSError, ValueError):
        pass
    quiet = 0
    try:
        c = claude_cmd()
        v = subprocess.run(c + ['--version'], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)).stdout.strip() if c else 'not found'
        (HUB / 'out' / 'claude-check.txt').write_text('%s | %s' % (' '.join(c or []), v), encoding='utf-8')
    except Exception as e:
        (HUB / 'out' / 'claude-check.txt').write_text('error: %s' % e, encoding='utf-8')
    while True:
        time.sleep(30)
        try:
            want_shot = HUB / 'out' / 'board-shot.txt'            # a port number left here: take a picture of that server
            if want_shot.is_file() and want_shot.stat().st_size:
                port = want_shot.read_text(encoding='ascii', errors='replace').strip()
                want_shot.write_text('', encoding='ascii')
                b = _board()
                b.servers(_pairs(), set())
                try:
                    note = b.shot(HUB, int(port)) if port.isdigit() and int(port) in b.ports() else 'no such local server: %s (have %s)' % (port, sorted(b.ports()))
                except Exception as e:
                    note = '%s: %s' % (type(e).__name__, e)
                (HUB / 'out' / 'board-shot.log').write_text(str(note), encoding='utf-8')
            ask = HUB / 'out' / 'chat-in.txt'
            if ask.is_file() and ask.stat().st_size and not CHAT['busy']:
                msg = ask.read_text(encoding='utf-8').strip()
                ask.write_text('', encoding='utf-8')
                if msg:
                    chat_send(msg, 'vinh')
            want = json.loads(f.read_text(encoding='ascii')) if f.is_file() else {}
            if 'on' in want and bool(want['on']) != GAME['on']:
                game_set(bool(want['on']), want.get('by') or 'manual: file')
                continue
            cfg = registry().get('games') or {}
            if not cfg.get('auto'):
                continue
            names = list(cfg.get('processes') or [])
            if cfg.get('nvidia') is True:               # opt in only: that list also holds background software
                names += [x for g in nvidia_games() for x in g['exes']]
            playing = running_games(names)
            if playing and not GAME['on']:
                game_set(True, 'auto: ' + playing[0])
            elif GAME['on'] and str(GAME['by']).startswith('auto'):
                quiet = 0 if playing else quiet + 1
                if quiet >= 2:                       # the game has been closed for a minute
                    quiet = 0
                    game_set(False, 'auto: game closed')
        except Exception:
            pass


def hw_state():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import hw
    return hw.snapshot([(p['id'], real(p['path'])) for p in registry()['projects']])


def cmd_hw(args):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import hw
    return hw.main(args.rest)


_GOOD, _FAILS = set(), {}


def pass_ok(given, ip='local'):
    """True for the random key, or for the owner's passphrase (kept only as a salted PBKDF2 hash in out/pass.hash).
    Five wrong tries from one address lock that address out for a minute."""
    raw = str(given or '').encode('utf-8')
    if not raw:
        return False
    fails = _FAILS.get(ip, [0, 0.0])
    if fails[0] >= 5 and time.time() < fails[1]:
        return False
    ok = hmac.compare_digest(raw, token().encode('ascii')) or hashlib.sha256(raw).digest() in _GOOD
    f = HUB / 'out' / 'pass.hash'
    if not ok and f.is_file():
        try:
            salt, rounds, digest = f.read_text(encoding='ascii').strip().split('$')
            ok = hmac.compare_digest(hashlib.pbkdf2_hmac('sha256', raw, bytes.fromhex(salt), int(rounds)).hex(), digest)
        except ValueError:
            ok = False
        if ok:
            _GOOD.add(hashlib.sha256(raw).digest())
    if ok:
        _FAILS.pop(ip, None)
    else:
        _FAILS[ip] = [fails[0] + 1, time.time() + 60]
    return ok


def cmd_passwd(_):
    """Read a passphrase from standard input and keep its salted hash; an empty line removes it."""
    raw = sys.stdin.buffer.readline().rstrip(b'\r\n')
    f = HUB / 'out' / 'pass.hash'
    f.parent.mkdir(exist_ok=True)
    if not raw:
        if f.is_file():
            f.write_text('', encoding='ascii')
        print('passphrase removed; only the key in out/token.txt pairs a phone now')
        return 0
    salt, rounds = secrets.token_bytes(16), 300000
    f.write_text('%s$%d$%s' % (salt.hex(), rounds, hashlib.pbkdf2_hmac('sha256', raw, salt, rounds).hex()), encoding='ascii')
    print('passphrase set (%d characters); only its hash is stored' % len(raw.decode('utf-8', 'replace')))
    return 0


def token():
    f = HUB / 'out' / 'token.txt'
    if not f.is_file():
        f.parent.mkdir(exist_ok=True)
        f.write_text(secrets.token_urlsafe(18), encoding='ascii')
    return f.read_text(encoding='ascii').strip()


def _ipconfig_address(name):
    """Windows without psutil: read the adapter's IPv4 address from ipconfig."""
    try:
        out = subprocess.run(['ipconfig'], capture_output=True, timeout=15,
                             creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)).stdout.decode('utf-8', 'replace')
    except (OSError, subprocess.SubprocessError):
        return None
    inside = False
    for line in out.splitlines():
        if line and not line[0].isspace():
            inside = name in line.lower().replace(' ', '')
        elif inside:
            m = re.search(r'IPv4[^:]*:\s*(\d+\.\d+\.\d+\.\d+)', line)
            if m:
                return m.group(1)
    return None


def vpn_address(name):
    """The IPv4 address of the ZeroTier or Tailscale adapter of this PC, found by the adapter's name."""
    try:
        import psutil
    except ImportError:
        psutil = None
    if psutil:
        for nic, addrs in psutil.net_if_addrs().items():
            if name in nic.lower().replace(' ', ''):
                for a in addrs:
                    if getattr(a.family, 'name', '') == 'AF_INET':
                        return a.address
    else:
        found = _ipconfig_address(name)
        if found:
            return found
    raise SystemExit('dp serve: no network adapter named like %r with an IPv4 address; is it installed and joined?' % name)


def vpn_addresses():
    """Every VPN address this PC has right now (ZeroTier and Tailscale), without failing when one is missing."""
    found = []
    for name in ('tailscale', 'zerotier'):
        try:
            found.append(vpn_address(name))
        except SystemExit:
            pass
    return found


def cmd_serve(args):
    hosts = [args.host]
    if args.host in ('zerotier', 'tailscale', 'vpn'):
        for attempt in range(18):                # at logon the VPN adapter can come up after this script
            hosts = vpn_addresses() if args.host == 'vpn' else []
            if args.host != 'vpn':
                try:
                    hosts = [vpn_address(args.host)]
                except SystemExit:
                    pass
            if hosts:
                break
            time.sleep(10)
        else:
            raise SystemExit('dp serve: no %s adapter with an IPv4 address; is it installed and joined?' % args.host)
    ThreadingHTTPServer.daemon_threads = True
    Handler.key = token()
    servers = [ThreadingHTTPServer((h, args.port), Handler) for h in hosts]
    threading.Thread(target=auto_publish, daemon=True).start()
    if args.reload:
        threading.Thread(target=reload_on_change, daemon=True).start()
    threading.Thread(target=game_watch, daemon=True).start()
    threading.Thread(target=token_loop, daemon=True).start()
    if args.reload:                                  # only the hidden, self-updating server settles things on its own
        threading.Thread(target=bootstrap, daemon=True).start()
    def _dump_hw():
        try:
            hw_state()
            time.sleep(3)                         # second pass has real CPU numbers
            (HUB / 'out' / 'hw.json').write_text(json.dumps(hw_state(), ensure_ascii=False, indent=1), encoding='utf-8')
            (HUB / 'out' / 'act.json').write_text(json.dumps(activity(), ensure_ascii=False, indent=1), encoding='utf-8')
        except Exception as e:
            (HUB / 'out' / 'hw.json').write_text(json.dumps({'error': '%s: %s' % (type(e).__name__, e)}), encoding='utf-8')
    threading.Timer(15, _dump_hw).start()
    threading.Timer(25, lambda: net_diag()).start()
    threading.Timer(240, lambda: net_diag()).start()         # again once a phone has had time to connect          # leaves out/net.txt for whoever looks after this PC
    links = ['http://%s:%d/m.html#k=%s' % (h, args.port, Handler.key) for h in hosts]
    (HUB / 'out' / 'phone-link.txt').write_text('\n'.join(links) + '\n', encoding='ascii')     # a hidden server has no console
    for h, link in zip(hosts, links):
        print('agents office: http://%s:%d   phone app, open once to pair: %s' % (h, args.port, link))
    if any(h not in ('127.0.0.1', 'localhost') for h in hosts):
        print('other devices need the passphrase or the key in that link (out/token.txt; delete the file to make a new one).')
        print('allow port %d in the firewall for that network only.' % args.port)
    for srv in servers[1:]:
        threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        servers[0].serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog='dp', description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('check').set_defaults(fn=cmd_check)
    sub.add_parser('scan').set_defaults(fn=cmd_scan)
    s = sub.add_parser('serve')
    s.add_argument('--host', default='127.0.0.1', help="an address; 'zerotier' or 'tailscale' for that adapter's address; 'vpn' for every one of them found")
    s.add_argument('--port', type=int, default=8765)
    s.add_argument('--reload', action='store_true', help='exit when tools/dp.py or tools/hw.py changes (the start script restarts it)')
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
    sub.add_parser('passwd').set_defaults(fn=cmd_passwd)
    t = sub.add_parser('todo')
    t.add_argument('what', choices=['build', 'publish'])
    t.set_defaults(fn=cmd_todo)
    h = sub.add_parser('hw')
    h.add_argument('rest', nargs=argparse.REMAINDER)
    h.set_defaults(fn=cmd_hw)
    i = sub.add_parser('init')
    i.add_argument('id')
    i.set_defaults(fn=cmd_init)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == '__main__':
    sys.exit(main())
