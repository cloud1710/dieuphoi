#!/usr/bin/env python3
"""hw: what this PC is doing right now, and which project is using it.

python tools/hw.py            one table
python tools/hw.py --json     the same as JSON
python tools/hw.py --watch 5  repeat every 5 seconds

A project is "running" when a watched program (claude, python, node, ...) has its working folder or one of its
arguments inside the project folder; "recent" when its plan, handoff notes or git index changed in the last 24
hours; otherwise "idle". Needs psutil; the GPU lines need nvidia-smi on the PATH. Nothing is sampled unless
this script (or the hub's /api/hw) is asked.
"""
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

try:
    import psutil
except ImportError:
    psutil = None

WATCH = ('claude', 'python', 'node', 'conda', 'uv', 'ollama', 'blender', 'java', 'wrangler', 'npm', 'pytest',
         'jupyter', 'git', 'bash', 'pwsh', 'powershell', 'cmd', 'code', 'ffmpeg')
MARKS = ('plan/STATUS.yaml', 'plan/CHANGELOG.md', 'STATUS.yaml', '.git/index', '.git/HEAD', 'NEXT_SESSION.md',
         '.claude/HANDOFF.md')
NOWIN = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
_seen = {}                                       # (pid, create_time) -> Process, so cpu_percent has a baseline


def _smi(query):
    exe = shutil.which('nvidia-smi')
    if not exe:
        return None
    try:
        out = subprocess.run([exe, query, '--format=csv,noheader,nounits'], capture_output=True, text=True,
                             timeout=8, creationflags=NOWIN).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    return [[c.strip() for c in line.split(',')] for line in out.splitlines() if line.strip()]


def _num(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def gpus():
    rows = _smi('--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu')
    if rows is None:
        return None, {}
    cards = [{'name': r[0], 'util': _num(r[1]), 'mem_used': _num(r[2]), 'mem_total': _num(r[3]), 'temp': _num(r[4])}
             for r in rows if len(r) >= 5]
    per_pid = {}
    for r in _smi('--query-compute-apps=pid,used_memory') or []:
        if len(r) >= 2 and _num(r[0]) is not None:
            per_pid[int(_num(r[0]))] = _num(r[1])      # None on Windows when the driver does not report it
    return cards, per_pid


_cpu_prev, _gpu_cache = [None], [0.0, None]


def cpu_ram():
    """(cpu %, ram %, ram used GB, ram total GB) without psutil when it is missing: Windows API or /proc."""
    if psutil:
        vm = psutil.virtual_memory()
        return psutil.cpu_percent(None), vm.percent, vm.used / 2 ** 30, vm.total / 2 ** 30
    try:
        if os.name == 'nt':
            import ctypes

            class FT(ctypes.Structure):
                _fields_ = [('lo', ctypes.c_uint32), ('hi', ctypes.c_uint32)]

            class MS(ctypes.Structure):
                _fields_ = [('length', ctypes.c_uint32), ('load', ctypes.c_uint32)] + [
                    (n, ctypes.c_uint64) for n in ('total', 'avail', 'tpage', 'apage', 'tvirt', 'avirt', 'aext')]
            idle, kern, user = FT(), FT(), FT()
            ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kern), ctypes.byref(user))
            val = lambda f: (f.hi << 32) | f.lo
            cur = (val(idle), val(kern) + val(user))          # kernel time already contains idle time
            ms = MS()
            ms.length = ctypes.sizeof(MS)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(ms))
            ram = (float(ms.load), (ms.total - ms.avail) / 2 ** 30, ms.total / 2 ** 30)
        else:
            with open('/proc/stat') as f:
                n = [int(x) for x in f.readline().split()[1:]]
            cur = (n[3] + n[4], sum(n))
            with open('/proc/meminfo') as f:
                mem = {ln.split(':')[0]: int(ln.split()[1]) for ln in f if ':' in ln}
            total, avail = mem['MemTotal'] * 1024, mem.get('MemAvailable', mem['MemFree']) * 1024
            ram = (100 * (1 - avail / total), (total - avail) / 2 ** 30, total / 2 ** 30)
        prev, _cpu_prev[0] = _cpu_prev[0], cur
        cpu = None if not prev or cur[1] == prev[1] else max(0.0, 100 * (1 - (cur[0] - prev[0]) / (cur[1] - prev[1])))
        return (cpu,) + ram
    except Exception:
        return None, None, None, None


def lite():
    """The few numbers for the app's status bar: cheap enough to ask every few seconds."""
    cpu, ram, used, total = cpu_ram()
    if time.time() - _gpu_cache[0] > 8:                 # one nvidia-smi run at most every 8 seconds
        _gpu_cache[:] = [time.time(), gpus()[0]]
    return {'time': time.strftime('%H:%M:%S'), 'cpu': None if cpu is None else round(cpu), 'ram': None if ram is None else round(ram),
            'ram_used_gb': None if used is None else round(used, 1), 'ram_total_gb': None if total is None else round(total, 1),
            'gpu': _gpu_cache[1]}


def _norm(path):
    return str(path).replace('\\', '/').lower().rstrip('/') + '/'


def _last_change(root):
    best = 0.0
    for m in MARKS:
        try:
            best = max(best, (root / m).stat().st_mtime)
        except OSError:
            pass
    return best


def project_processes(projects):
    """(process, project id) for every watched program running inside a registered project. Needs psutil.
    This script, the hub server and their parents are never returned."""
    if not psutil:
        return []
    roots = sorted(((_norm(root), pid) for pid, root in projects), key=lambda r: -len(r[0]))
    mine = {os.getpid()}
    try:
        mine |= {p.pid for p in psutil.Process().parents()}
    except psutil.Error:
        pass
    found = []
    for pr in psutil.process_iter(['name']):
        name = (pr.info['name'] or '').lower()
        if pr.pid in mine or not name.startswith(WATCH):
            continue
        try:
            args = pr.cmdline()
            if any('dp.py' in a or 'serve-hidden' in a for a in args):
                continue
            places = [_norm(pr.cwd())] + [_norm(a) for a in args[1:] if ':' in a or a.startswith('/')]
        except (psutil.Error, OSError):
            continue
        owner = next((pid for place in places for root, pid in roots if place.startswith(root)), None)
        if owner:
            found.append((pr, owner))
    return found


_PP = [0.0, {}]


def project_programs(projects):
    """Per project: the programs running in it now, by name, with the script each one runs when it has one.
    Only base names are reported, never a full path. Refreshed at most every 30 seconds."""
    if time.time() - _PP[0] < 30:
        return _PP[1]
    out = {}
    for pr, owner in project_processes(projects):
        try:
            name = (pr.name() or '').lower().replace('.exe', '')
            args = pr.cmdline()[1:]
            script = next((Path(a.replace('\\', '/')).name for a in args if a.lower().endswith(('.py', '.js', '.mjs', '.ts', '.blend', '.cmd', '.sh'))), None)
            if script is None and '-m' in args and args.index('-m') + 1 < len(args):
                script = args[args.index('-m') + 1]
            mins = int((time.time() - pr.create_time()) / 60)
        except Exception:
            continue
        row = out.setdefault(owner, {'n': 0, 'items': []})
        row['n'] += 1
        if name not in ('cmd', 'bash', 'powershell', 'pwsh', 'conhost') and len(row['items']) < 8:
            row['items'].append({'name': name, 'script': script, 'mins': mins})
    _PP[:] = [time.time(), out]
    return out


TOOL_VI = {'Bash': 'đang chạy lệnh', 'Read': 'đang đọc tệp', 'Edit': 'đang sửa tệp', 'MultiEdit': 'đang sửa tệp',
           'Write': 'đang viết tệp', 'Grep': 'đang tìm trong mã', 'Glob': 'đang tìm tệp', 'WebSearch': 'đang tra web',
           'WebFetch': 'đang đọc trang web', 'Task': 'đang giao việc cho nhân viên', 'Agent': 'đang giao việc cho nhân viên',
           'TodoWrite': 'đang cập nhật danh sách việc', 'NotebookEdit': 'đang sửa notebook', 'Skill': 'đang mở một skill'}


def claude_activity(projects, window=6 * 3600):
    """What each Claude Code session did last, per project, read from the tail of its transcript in
    ~/.claude/projects. Only the kind of step is reported (run a command, read a file, ...): never a file
    name, a command or any text, because names inside private folders can be identifiers."""
    base = Path.home() / '.claude' / 'projects'
    out = {}
    if not base.is_dir():
        return out
    now = time.time()
    roots = sorted(((_norm(root), pid) for pid, root in projects), key=lambda r: -len(r[0]))
    recent = []
    try:
        for folder in base.iterdir():
            if folder.is_dir() and now - folder.stat().st_mtime < 86400:
                for f in folder.glob('*.jsonl'):
                    age = now - f.stat().st_mtime
                    if age < window:
                        recent.append((age, f))
    except OSError:
        return out
    for age, f in sorted(recent)[:40]:
        try:
            with open(f, 'rb') as fh:
                fh.seek(max(0, f.stat().st_size - 65536))
                lines = fh.read().decode('utf-8', 'replace').splitlines()
        except OSError:
            continue
        cwd = what = None
        sub = False
        for line in reversed(lines[-150:]):
            try:
                e = json.loads(line)
            except ValueError:
                continue
            if not isinstance(e, dict):
                continue
            cwd = cwd or e.get('cwd')
            sub = sub or bool(e.get('isSidechain'))
            if what is None:
                msg = e.get('message') if isinstance(e.get('message'), dict) else {}
                parts = msg.get('content') if isinstance(msg.get('content'), list) else []
                tools = [c.get('name') for c in parts if isinstance(c, dict) and c.get('type') == 'tool_use']
                if e.get('type') == 'assistant' and tools:
                    name = str(tools[-1])
                    what = TOOL_VI.get(name) or ('đang dùng công cụ nối ngoài' if name.startswith('mcp__') else 'đang dùng một công cụ')
                elif e.get('type') == 'assistant' and parts:
                    what = 'vừa trả lời xong, chờ lệnh tiếp'
                elif e.get('type') == 'user':
                    what = 'đang suy nghĩ'
            if cwd and what:
                break
        if not cwd:
            continue
        place = _norm(cwd)
        owner = next((pid for root, pid in roots if place.startswith(root)), None)
        if owner and len(out.setdefault(owner, [])) < 5:
            out[owner].append({'what': (what or 'đang chạy') if age < 900 else 'phiên mở nhưng im lặng', 'age': int(age), 'sub': sub})
    return out


def snapshot(projects):
    """projects: [(id, folder)]. Returns the machine totals and one row per project."""
    out = {'time': time.strftime('%Y-%m-%d %H:%M:%S'), 'psutil': psutil is not None}
    roots = sorted(((_norm(root), pid) for pid, root in projects), key=lambda r: -len(r[0]))
    rows = {pid: {'id': pid, 'procs': 0, 'cpu': 0.0, 'ram_mb': 0.0, 'gpu_mb': None, 'names': []} for pid, _ in projects}
    cards, gpu_pid = gpus()
    out['gpu'] = cards
    other = []
    if psutil:
        ncpu = psutil.cpu_count() or 1
        out['cpu'] = psutil.cpu_percent(None)
        vm = psutil.virtual_memory()
        out['ram'] = {'used_gb': round(vm.used / 2 ** 30, 1), 'total_gb': round(vm.total / 2 ** 30, 1), 'percent': vm.percent}
        disks = []
        for mount in sorted({Path(str(root)).anchor or '/' for _, root in projects} | {Path.home().anchor or '/'}):
            try:
                du = psutil.disk_usage(mount)
                disks.append({'mount': mount, 'free_gb': round(du.free / 2 ** 30), 'total_gb': round(du.total / 2 ** 30)})
            except OSError:
                pass
        out['disks'] = disks
        alive = set()
        for pr in psutil.process_iter(['name', 'create_time']):
            name = (pr.info['name'] or '').lower()
            on_gpu = pr.pid in gpu_pid
            if not on_gpu and not name.startswith(WATCH):
                continue
            key = (pr.pid, pr.info['create_time'])
            alive.add(key)
            pr = _seen.setdefault(key, pr)
            try:
                cpu = pr.cpu_percent(None) / ncpu
                ram = pr.memory_info().rss / 2 ** 20
                places = [_norm(pr.cwd())] + [_norm(a) for a in pr.cmdline()[1:] if ':' in a or a.startswith('/')]
            except (psutil.Error, OSError):
                continue
            owner = next((pid for place in places for root, pid in roots if place.startswith(root)), None)
            if owner is None:
                if on_gpu or cpu > 5 or ram > 1500:
                    parts = [x for x in places[0].split('/') if x] if places else []
                    where = '/'.join(parts[:3] if len(parts) > 1 and parts[1] in ('tools', 'games', 'ai') else parts[:2])
                    other.append({'name': name, 'cpu': round(cpu, 1), 'ram_mb': round(ram), 'gpu_mb': gpu_pid.get(pr.pid), 'on_gpu': on_gpu, 'where': where})
                continue
            row = rows[owner]
            row['procs'] += 1
            row['cpu'] += cpu
            row['ram_mb'] += ram
            if on_gpu:
                row['gpu_mb'] = (row['gpu_mb'] or 0) + (gpu_pid[pr.pid] or 0)
                row['on_gpu'] = True
            short = name.replace('.exe', '')
            if short not in row['names']:
                row['names'].append(short)
        for key in set(_seen) - alive:
            del _seen[key]
    if not psutil:
        cpu, ram, used, total = cpu_ram()
        if ram is not None:
            out['cpu'] = cpu or 0.0
            out['ram'] = {'used_gb': round(used, 1), 'total_gb': round(total, 1), 'percent': ram}
    acts = claude_activity(projects)
    out['claude'] = acts
    now = time.time()
    for pid, root in projects:
        row = rows[pid]
        row['agents'] = acts.get(pid, [])
        changed = _last_change(Path(root))
        row['cpu'], row['ram_mb'] = round(row['cpu'], 1), round(row['ram_mb'])
        row['changed'] = time.strftime('%Y-%m-%d %H:%M', time.localtime(changed)) if changed else None
        row['state'] = 'running' if row['procs'] or any(a['age'] < 180 for a in row['agents']) else 'recent' if now - changed < 86400 else 'idle'
    order = {'running': 0, 'recent': 1, 'idle': 2}
    out['projects'] = sorted(rows.values(), key=lambda r: (order[r['state']], -r['cpu'], -r['ram_mb'], r['id']))
    out['other'] = sorted(other, key=lambda r: (not r.get('on_gpu'), -(r['ram_mb'] or 0)))[:12]
    return out


def table(s):
    lines = ['%s' % s['time']]
    if not s['psutil']:
        lines.append('psutil is missing (pip install psutil): no CPU, RAM or process lines')
    else:
        lines.append('CPU %.0f%%   RAM %.1f/%.1f GB (%.0f%%)   %s' % (
            s['cpu'], s['ram']['used_gb'], s['ram']['total_gb'], s['ram']['percent'],
            '   '.join('%s %d GB free' % (d['mount'], d['free_gb']) for d in s['disks'])))
    for g in s['gpu'] or []:
        lines.append('GPU %s: %s%%, %s/%s MB, %s C' % (g['name'], g['util'], g['mem_used'], g['mem_total'], g['temp']))
    if s['gpu'] is None:
        lines.append('GPU: nvidia-smi not found')
    lines.append('%-20s %-8s %5s %6s %8s %7s  %s' % ('project', 'state', 'procs', 'cpu%', 'ram MB', 'gpu MB', 'programs / last change'))
    for r in s['projects']:
        lines.append('%-20s %-8s %5d %6.1f %8d %7s  %s' % (r['id'], r['state'], r['procs'], r['cpu'], r['ram_mb'],
                     '-' if r['gpu_mb'] is None else int(r['gpu_mb']), ', '.join(r['names']) or (r['changed'] or '')))
    for r in s['other']:
        lines.append('%-20s %-8s %5s %6.1f %8d %7s  not inside a registered project' % (
            r['name'][:20], 'other', '', r['cpu'], r['ram_mb'], '-' if r['gpu_mb'] is None else int(r['gpu_mb'])))
    return '\n'.join(lines)


def main(argv=None):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import dp
    args = list(sys.argv[1:] if argv is None else argv)
    projects = [(p['id'], dp.real(p['path'])) for p in dp.registry()['projects']]
    every = float(args[args.index('--watch') + 1]) if '--watch' in args else 0
    snapshot(projects)                           # first pass only sets the CPU baseline
    time.sleep(1)
    while True:
        s = snapshot(projects)
        print(json.dumps(s, ensure_ascii=False) if '--json' in args else table(s), flush=True)
        if not every:
            return 0
        time.sleep(every)


if __name__ == '__main__':
    sys.exit(main())
