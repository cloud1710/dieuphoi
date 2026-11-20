"""Đường hầm ra Internet: điện thoại vào văn phòng mà không cần VPN.

PC chạy cloudflared (tệp bin/cloudflared.exe, tự tải từ GitHub của Cloudflare lần đầu) mở một quick tunnel tới
server của hub ở 127.0.0.1. Địa chỉ quick tunnel đổi mỗi lần cloudflared khởi động, nên một Worker tên `dieuphoi`
trên workers.dev của tài khoản Cloudflare (đăng nhập wrangler sẵn trên PC) giữ địa chỉ cố định và chuyển tiếp
mọi yêu cầu tới địa chỉ hiện tại; mỗi lần địa chỉ đổi, hub triển khai lại Worker với địa chỉ mới.
Không mở cổng nào trên router, không cần tên miền. Mọi /api vẫn cần khoá hoặc mật khẩu kết nối như cũ.
Quick tunnel không chuyển Server-Sent Events, nên app ở địa chỉ này hỏi trạng thái định kỳ thay cho /api/events.
"""
import datetime
import json
import os
import re
import subprocess
import threading
import time
import urllib.request
from pathlib import Path

NOWIN = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
EXE_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
QUICK = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com')
STATE = {'quick': None, 'worker': None, 'since': None, 'note': 'chưa chạy', 'proc': None}

WORKER_JS = r'''// Địa chỉ cố định của văn phòng agents: chuyển tiếp tới server trên PC qua quick tunnel hiện tại (env.ORIGIN).
const OFF = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Điều phối</title><body style="font:16px system-ui;padding:40px 22px;color:#23211d;background:#f4f1ea">
<h2>PC chưa nối</h2><p>PC đang tắt, mất mạng, hoặc vừa khởi động lại đường hầm. Thử lại sau một phút.</p>
<button onclick="location.reload()" style="font:inherit;padding:8px 16px;border-radius:10px">Thử lại</button>`;
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === '/') return Response.redirect(u.origin + '/m.html', 302);
    const h = new Headers(req.headers);
    h.set('X-DP-Client', req.headers.get('CF-Connecting-IP') || '');
    h.delete('Host');
    let r;
    try {
      r = await fetch(env.ORIGIN + u.pathname + u.search, {method: req.method, headers: h, redirect: 'manual',
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body});
    } catch (e) { r = null; }
    if (!r || r.status === 502 || (r.status >= 520 && r.status <= 530)) {
      return u.pathname.startsWith('/api/')
        ? new Response(JSON.stringify({error: 'pc-offline'}), {status: 503, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}})
        : new Response(OFF, {status: 503, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}});
    }
    const out = new Response(r.body, r);
    const loc = out.headers.get('Location');
    if (loc && loc.startsWith(env.ORIGIN)) out.headers.set('Location', u.origin + loc.slice(env.ORIGIN.length));
    return out;
  }
};
'''


def _log(hub, text):
    with open(Path(hub) / 'out' / 'tunnel.log', 'a', encoding='utf-8') as f:
        f.write('%s %s\n' % (datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'), text))


def _save(hub):
    (Path(hub) / 'out' / 'tunnel.json').write_text(json.dumps({k: STATE[k] for k in ('quick', 'worker', 'since', 'note')}, ensure_ascii=False), encoding='utf-8')


def status(hub):
    try:
        return json.loads((Path(hub) / 'out' / 'tunnel.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def ensure_exe(hub):
    exe = Path(hub) / 'bin' / 'cloudflared.exe'
    if exe.is_file() and exe.stat().st_size > 1_000_000:
        return exe
    exe.parent.mkdir(exist_ok=True)
    tmp = exe.with_suffix('.download')
    _log(hub, 'downloading cloudflared from ' + EXE_URL)
    with urllib.request.urlopen(EXE_URL, timeout=300) as r, open(tmp, 'wb') as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    os.replace(tmp, exe)
    _log(hub, 'cloudflared saved: %d bytes' % exe.stat().st_size)
    return exe


def deploy_worker(hub, name, origin):
    """Deploys the Worker with ORIGIN = the current quick tunnel. Returns its workers.dev address."""
    d = Path(hub) / 'out' / 'worker'
    d.mkdir(parents=True, exist_ok=True)
    (d / 'index.js').write_text(WORKER_JS, encoding='utf-8')
    (d / 'wrangler.toml').write_text('name = "%s"\nmain = "index.js"\ncompatibility_date = "2026-11-01"\nworkers_dev = true\n\n[vars]\nORIGIN = "%s"\n'
                                     % (name, origin), encoding='utf-8')
    npx = ['cmd', '/c', 'npx'] if os.name == 'nt' else ['npx']
    r = subprocess.run(npx + ['--yes', 'wrangler', 'deploy'], cwd=str(d), capture_output=True, text=True, encoding='utf-8',
                       errors='replace', timeout=300, stdin=subprocess.DEVNULL, creationflags=NOWIN)
    out = (r.stdout or '') + (r.stderr or '')
    m = re.search(r'https://[A-Za-z0-9.-]+\.workers\.dev', out)
    if r.returncode or not m:
        raise RuntimeError('wrangler deploy: ' + ' '.join(out.split())[-300:])
    return m.group(0)


def _alive(pid):
    try:
        import psutil
        p = psutil.Process(int(pid))
        return 'cloudflared' in (p.name() or '').lower()
    except Exception:
        return False


def run(hub, port, name='dieuphoi'):
    """Keeps the tunnel up. cloudflared writes to out/cloudflared.log and outlives a restart of the hub server
    (the server restarts when its code changes): a new server adopts the running tunnel instead of opening
    another, so the address only changes when cloudflared itself stops. Every 5 seconds: read the address from
    the log, point the Worker at it when it changed, start cloudflared again if it stopped."""
    hub = Path(hub)
    pidf, logf = hub / 'out' / 'cloudflared.pid', hub / 'out' / 'cloudflared.log'
    old = status(hub) or {}
    STATE.update(quick=old.get('quick'), worker=old.get('worker'), since=old.get('since'), note=old.get('note') or 'chưa chạy')
    wait, started = 10, 0.0
    while True:
        try:
            pid = pidf.read_text(encoding='ascii').strip() if pidf.is_file() else ''
            if not (pid and _alive(pid)):
                if started and time.time() - started < 600:
                    wait = min(wait * 2, 600)
                    STATE.update(note='mất đường hầm, nối lại sau %d giây' % wait)
                    _save(hub)
                    time.sleep(wait)
                else:
                    wait = 10
                exe = ensure_exe(hub)
                with open(logf, 'wb') as out:
                    pr = subprocess.Popen([str(exe), 'tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:%d' % port],
                                          stdout=out, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, creationflags=NOWIN)
                pidf.write_text(str(pr.pid), encoding='ascii')
                started = time.time()
                STATE.update(note='đang mở đường hầm')
                _save(hub)
                _log(hub, 'cloudflared started, pid %d' % pr.pid)
            try:
                text = logf.read_bytes()[-200000:].decode('utf-8', 'replace')
            except OSError:
                text = ''
            found = QUICK.findall(text)
            if found and (found[-1] != STATE['quick'] or not STATE['worker'] or STATE['note'] != 'đang chạy'):
                url = found[-1]
                if url != STATE['quick']:
                    STATE.update(quick=url, since=datetime.datetime.now().strftime('%Y-%m-%d %H:%M'))
                    _log(hub, 'quick tunnel ' + url)
                try:
                    STATE.update(worker=deploy_worker(hub, name, url), note='đang chạy')
                    _log(hub, 'worker %s -> %s' % (STATE['worker'], url))
                except Exception as e:
                    STATE.update(note='Worker lỗi: %s' % str(e)[:200])
                    _log(hub, 'worker failed: %s' % e)
                    time.sleep(60)
                _save(hub)
        except Exception as e:
            _log(hub, 'tunnel error: %s: %s' % (type(e).__name__, e))
            time.sleep(30)
        time.sleep(5)


def start(hub, port, name='dieuphoi'):
    threading.Thread(target=run, args=(hub, port, name), daemon=True).start()
