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
                    other.append({'name': name, 'cpu': round(cpu, 1), 'ram_mb': round(ram), 'gpu_mb': gpu_pid.get(pr.pid)})
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
    now = time.time()
    for pid, root in projects:
        row = rows[pid]
        changed = _last_change(Path(root))
        row['cpu'], row['ram_mb'] = round(row['cpu'], 1), round(row['ram_mb'])
        row['changed'] = time.strftime('%Y-%m-%d %H:%M', time.localtime(changed)) if changed else None
        row['state'] = 'running' if row['procs'] else 'recent' if now - changed < 86400 else 'idle'
    order = {'running': 0, 'recent': 1, 'idle': 2}
    out['projects'] = sorted(rows.values(), key=lambda r: (order[r['state']], -r['cpu'], -r['ram_mb'], r['id']))
    out['other'] = sorted(other, key=lambda r: -(r['ram_mb'] or 0))[:6]
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
