"""The presentation board of the agents office.

What the owner can look at from the phone: the web servers that run on this PC (also those that only listen on
127.0.0.1: the hub passes their pages on), and pictures or notes left in a board folder:

    <hub>/out/board/            the general manager's own
    <project>/plan/board/       an orchestra's (not read for kind: seal, whose folders stay private)

Only base names leave this module, never a full path.
"""
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

try:
    import psutil
except ImportError:
    psutil = None

SERVERISH = ('python', 'node', 'ollama', 'jupyter', 'java', 'wrangler', 'npm', 'uv', 'deno', 'bun', 'ruby', 'php', 'dotnet',
             'streamlit', 'gradio', 'uvicorn', 'blender', 'comfy', 'hugo', 'caddy', 'nginx')
IMG = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif'}
NOTE = ('.md', '.txt')
NOWIN = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
_S = [0.0, []]
_TITLE = {}                                      # (pid, port) -> page title or None


def _norm(path):
    return str(path).replace('\\', '/').lower().rstrip('/') + '/'


def _title(port):
    """The <title> of the page at /, or None when the port does not speak HTTP."""
    try:
        with urllib.request.urlopen('http://127.0.0.1:%d/' % port, timeout=1.5) as r:
            head = r.read(8192).decode('utf-8', 'replace')
    except urllib.error.HTTPError:
        return ''                                # it answers HTTP, just not at /
    except Exception:
        return None
    low = head.lower()
    a, b = low.find('<title>'), low.find('</title>')
    return ' '.join(head[a + 7:b].split())[:80] if 0 <= a < b else ''


def servers(projects, skip_ports=()):
    """Programs that listen on a TCP port and look like a development server, or run inside a project folder.
    [{port, name, script, project, title, mins}], refreshed at most every 20 seconds. None without psutil."""
    if psutil is None:
        return None
    if time.time() - _S[0] < 20:
        return _S[1]
    roots = sorted(((_norm(root), pid) for pid, root in projects), key=lambda r: -len(r[0]))
    try:
        conns = psutil.net_connections(kind='tcp')
    except Exception:
        return None
    rows, asked = {}, 0
    for c in conns:
        if c.status != psutil.CONN_LISTEN or not c.pid or not c.laddr:
            continue
        port = c.laddr.port
        if port in skip_ports or port in rows:
            continue
        try:
            pr = psutil.Process(c.pid)
            name = (pr.name() or '').lower().replace('.exe', '')
            try:
                cwd = _norm(pr.cwd())
            except Exception:
                cwd = ''
            try:
                args = pr.cmdline()[1:]
            except Exception:
                args = []
            mins = int((time.time() - pr.create_time()) / 60)
        except Exception:
            continue
        owner = next((pid for root, pid in roots if cwd.startswith(root)), None) if cwd else None
        if not owner and not any(name.startswith(s) for s in SERVERISH):
            continue
        script = next((Path(a.replace('\\', '/')).name for a in args if a.lower().endswith(('.py', '.js', '.mjs', '.ts', '.cmd', '.sh'))), None)
        if script is None and '-m' in args and args.index('-m') + 1 < len(args):
            script = args[args.index('-m') + 1]
        key = (c.pid, port)
        if key not in _TITLE and asked < 6:      # a few new ports per pass, so one pass never takes long
            asked += 1
            _TITLE[key] = _title(port)
        title = _TITLE.get(key)
        if title is None and key in _TITLE:
            continue                             # listens, but is not a web server
        rows[port] = {'port': port, 'name': name, 'script': script, 'project': owner, 'title': title or '', 'mins': mins}
    out = sorted(rows.values(), key=lambda r: (r['project'] is None, r['project'] or '', r['port']))
    _S[:] = [time.time(), out]
    return out


def ports():
    return {r['port'] for r in (_S[1] or [])}


def _folders(hub, projects):
    out = [('hub', Path(hub) / 'out' / 'board')]
    for pid, root, kind, *more in projects:
        if kind != 'seal':
            out.append((pid, Path(root) / 'plan' / 'board'))
            extra = str(more[0] or '') if more else ''          # `board: some/folder` in registry.yaml: that folder's pictures too
            if extra and '..' not in extra.replace('\\', '/').split('/') and not Path(extra).is_absolute():
                out.append((pid, Path(root) / extra))
    return out


def items(hub, projects, limit=40):
    """projects: [(id, folder, kind, extra board folder)]. Newest first: {src, name, kind: image|note, when, t, text?}."""
    got = []
    for src, folder in _folders(hub, projects):
        try:
            if not folder.is_dir():
                continue
            for f in folder.iterdir():
                ext = f.suffix.lower()
                if not f.is_file() or (ext not in IMG and ext not in NOTE):
                    continue
                st = f.stat()
                row = {'src': src, 'name': f.name, 'kind': 'image' if ext in IMG else 'note', 't': int(st.st_mtime),
                       'when': time.strftime('%d/%m %H:%M', time.localtime(st.st_mtime))}
                if row['kind'] == 'note':
                    row['text'] = f.read_text(encoding='utf-8', errors='replace')[:3000]
                got.append(row)
        except OSError:
            continue
    got.sort(key=lambda r: -r['t'])
    out, seen = [], set()
    for r in got:                                # an orchestra shows one picture and one note: what it works on now
        key = (r['src'], r['kind'])
        if r['src'] != 'hub':
            if key in seen:
                continue
            seen.add(key)
            if r['kind'] == 'image':             # several views saved together: the overview sheet stands for them
                r = next((x for x in got if x['src'] == r['src'] and x['kind'] == 'image' and r['t'] - x['t'] < 600
                          and 'sheet' in x['name'].lower()), r)
        out.append(r)
    return out[:limit]


def image(hub, projects, src, name):
    """(bytes, content type) of one picture of the board, or None. The name must be a plain file name."""
    name = str(name or '')
    if not name or name != Path(name).name or '/' in name or '\\' in name or name.startswith('.'):
        return None
    ext = Path(name).suffix.lower()
    if ext not in IMG:
        return None
    for s, folder in _folders(hub, projects):
        if s == src:
            f = folder / name
            try:
                if f.is_file() and f.stat().st_size <= 15 * 2 ** 20:
                    return f.read_bytes(), IMG[ext]
            except OSError:
                pass
    return None                                  # looked in every board folder of that source


def fetch(port, path):
    """GET one page of a local server. Returns (status, content type, body)."""
    req = urllib.request.Request('http://127.0.0.1:%d%s' % (port, path or '/'), headers={'User-Agent': 'dieuphoi-board', 'Accept': '*/*'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.headers.get('Content-Type') or 'application/octet-stream', r.read(40 * 2 ** 20)
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get('Content-Type') or 'text/plain; charset=utf-8', e.read(2 ** 20)
    except Exception as e:
        return 502, 'text/plain; charset=utf-8', ('Server ở cổng %d không trả lời: %s' % (port, e)).encode('utf-8')


def browser():
    for name in ('msedge', 'chrome', 'chromium', 'chromium-browser', 'google-chrome'):
        exe = shutil.which(name)
        if exe:
            return exe
    for base in (os.environ.get('ProgramFiles(x86)'), os.environ.get('ProgramFiles'), os.environ.get('LOCALAPPDATA')):
        for tail in (r'Microsoft\Edge\Application\msedge.exe', r'Google\Chrome\Application\chrome.exe'):
            if base and (Path(base) / tail).is_file():
                return str(Path(base) / tail)
    return None


def shot(hub, port, path='/'):
    """A picture of a local server's page, taken by a headless browser that runs for a few seconds and leaves.
    Written to out/board/server-<port>.png (the same file each time). Returns the file name."""
    exe = browser()
    if not exe:
        raise RuntimeError('PC không có Edge hay Chrome để chụp')
    folder = Path(hub) / 'out' / 'board'
    folder.mkdir(parents=True, exist_ok=True)
    out = folder / ('server-%d.png' % port)
    cmd = [exe, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
           '--user-data-dir=' + str(Path(hub) / 'out' / 'shot-profile'), '--window-size=1280,800', '--virtual-time-budget=6000',
           '--screenshot=' + str(out), 'http://127.0.0.1:%d%s' % (port, path or '/')]
    before = out.stat().st_mtime if out.is_file() else 0
    subprocess.run(cmd, capture_output=True, timeout=60, creationflags=NOWIN)
    if not out.is_file() or out.stat().st_mtime <= before:
        raise RuntimeError('trình duyệt không ghi được ảnh')
    return out.name
