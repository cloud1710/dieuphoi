"""Xoá chỉ khi anh Vinh đồng ý.

Agent (tổng quản, orchestra, nhân viên) không được xoá; nó đề xuất:
    python D:/dieuphoi/tools/dp.py xoa <đường dẫn | repo#nhánh> ... --why "lý do"
Đề xuất hiện trong app (tab Việc, mục Chờ anh quyết) với nút Xoá / Không xoá. Khi anh bấm Xoá, hub làm:
  - tệp, thư mục: chuyển vào thùng rác riêng của ổ đó (<ổ>/.dieuphoi-thung-rac/<mã>/), khôi phục được bằng nút
    Khôi phục; muốn giải phóng chỗ thì bấm "Xoá hẳn" (lại một lần xác nhận nữa);
  - nhánh git: ghi commit cuối của nhánh vào nhật ký rồi xoá nhánh; Khôi phục tạo lại nhánh ở đúng commit đó.
Không có hộp thoại nào trên PC, nên server chạy ẩn không bao giờ bị treo vì một câu hỏi của Windows.
"""
import datetime
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

FILE = 'delete-requests.json'
TRASH = '.dieuphoi-thung-rac'
NOWIN = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
CORE = ('tools', 'office', 'registry.yaml', 'quyen-tong-quan.json', 'CLAUDE.md', '.git', 'skills', 'templates')


def _norm(p):
    return str(p).replace('\\', '/').rstrip('/').lower()


def _under(path, root):
    a, b = _norm(path), _norm(root)
    return a == b or a.startswith(b + '/')


def _load(hub):
    try:
        rows = json.loads((Path(hub) / 'out' / FILE).read_text(encoding='utf-8'))
        return rows if isinstance(rows, list) else []
    except (OSError, ValueError):
        return []


def _save(hub, rows):
    f = Path(hub) / 'out' / FILE
    f.parent.mkdir(exist_ok=True)
    tmp = f.with_suffix('.tmp')
    tmp.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf-8')
    os.replace(tmp, f)


def _log(hub, text):
    with open(Path(hub) / 'out' / 'delete.log', 'a', encoding='utf-8') as f:
        f.write('%s %s\n' % (datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'), text))


def _size(path, cap=200000):
    """(bytes, files) of a file or a folder; stops counting after cap entries (then the numbers are a floor)."""
    p = Path(path)
    if p.is_file() or p.is_symlink():
        try:
            return p.lstat().st_size, 1
        except OSError:
            return 0, 1
    total = n = 0
    for base, dirs, files in os.walk(p):
        for name in files:
            n += 1
            try:
                total += os.lstat(os.path.join(base, name)).st_size
            except OSError:
                pass
            if n >= cap:
                return total, n
    return total, n


def _git(repo, *args):
    r = subprocess.run(['git', '-C', str(repo)] + list(args), capture_output=True, text=True, encoding='utf-8',
                       errors='replace', timeout=60, creationflags=NOWIN)
    return r.returncode, (r.stdout or '').strip(), (r.stderr or '').strip()


def propose(hub, real, roots, blocked, specs, why, by):
    """specs: paths, or 'repo#branch' for a git branch. roots: [(id, Path)] of the registered projects.
    Returns the new request; raises ValueError with the reason when an item is refused."""
    hub = Path(hub)
    why = ' '.join(str(why or '').split())[:400]
    if not why:
        raise ValueError('cần lý do (--why)')
    items = []
    for spec in specs:
        spec = str(spec).strip()
        repo, _, branch = spec.partition('#') if '#' in spec else (spec, '', '')
        p = real(repo) if re.match(r'^[A-Za-z]:[\\/]', repo) or repo.startswith('/') else hub / repo
        p = Path(os.path.abspath(str(p)))
        owner = next((pid for pid, root in sorted(roots, key=lambda r: -len(str(r[1]))) if _under(p, root)), None)
        if _under(p, hub):
            owner = owner or 'dieuphoi'
        if not owner:
            raise ValueError('%s không thuộc project nào trong registry.yaml' % spec)
        hit = next((b for b in blocked if _under(p, real(b))), None)
        if hit:
            raise ValueError('%s nằm trong %s: thư mục này không cho xoá qua hub' % (spec, hit))
        if branch:
            if not (p / '.git').exists():
                raise ValueError('%s không phải repo git' % repo)
            code, sha, err = _git(p, 'rev-parse', '--verify', '--quiet', 'refs/heads/' + branch)
            if code:
                raise ValueError('repo %s không có nhánh %s' % (repo, branch))
            _, current, _ = _git(p, 'symbolic-ref', '--quiet', '--short', 'HEAD')
            if current == branch:
                raise ValueError('nhánh %s đang được dùng trong %s' % (branch, repo))
            items.append({'kind': 'branch', 'repo': str(p), 'branch': branch, 'sha': sha, 'project': owner,
                          'show': 'nhánh %s · %s' % (branch, p.name)})
            continue
        if not p.exists():
            raise ValueError('%s không tồn tại' % spec)
        if p.parent == p or _norm(p) in [_norm(r) for _, r in roots] or _norm(p) == _norm(hub):
            raise ValueError('%s là gốc ổ đĩa hoặc gốc một project: không xoá cả project qua hub' % spec)
        if any(part == '.git' for part in p.parts) or TRASH in p.parts:
            raise ValueError('%s nằm trong .git hoặc thùng rác' % spec)
        if _under(p, hub) and any(_under(p, hub / c) for c in CORE):
            raise ValueError('%s là phần lõi của hub' % spec)
        size, files = _size(p)
        items.append({'kind': 'path', 'path': str(p), 'dir': p.is_dir(), 'bytes': size, 'files': files, 'project': owner,
                      'show': str(p).replace('\\', '/')})
    if not items:
        raise ValueError('không có gì để xoá')
    rows = _load(hub)
    n = max([int(r['id'][2:]) for r in rows if re.fullmatch(r'X-\d+', str(r.get('id')))] + [0]) + 1
    row = {'id': 'X-%03d' % n, 'by': str(by or 'agent')[:60], 'why': why, 'items': items, 'status': 'pending',
           'when': datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}
    rows.append(row)
    _save(hub, rows)
    _log(hub, '%s proposed by %s: %s | %s' % (row['id'], row['by'], ', '.join(i['show'] for i in items), why))
    return row


def listing(hub):
    """What the app shows: requests waiting for the owner, and what lies in the trash."""
    rows = _load(hub)
    keep = [r for r in rows if r.get('status') == 'pending' or r.get('status') == 'trashed']
    return [{k: r[k] for k in ('id', 'by', 'why', 'when', 'status', 'done') if k in r} |
            {'items': [{k: i.get(k) for k in ('kind', 'show', 'bytes', 'files', 'dir', 'project')} for i in r['items']]}
            for r in keep]


def _trash_slot(hub, rid, k, path):
    drive = Path(Path(path).anchor or '/')
    base = drive / TRASH if drive.exists() and os.access(drive, os.W_OK) else Path(hub) / 'out' / 'trash'
    return base / rid / ('%d-%s' % (k, Path(path).name))


def decide(hub, rid, yes, sender):
    """The owner's answer. yes: every path goes to the trash and every branch is deleted, after checking again
    that each still is what was proposed. Returns a line for the owner."""
    rows = _load(hub)
    row = next((r for r in rows if r.get('id') == rid), None)
    if not row or row.get('status') != 'pending':
        raise ValueError('không có đề xuất xoá %s đang chờ' % rid)
    stamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    if not yes:
        row.update(status='declined', done=stamp, decided_by=sender)
        _save(hub, rows)
        _log(hub, '%s declined by %s' % (rid, sender))
        return 'Đã giữ lại, không xoá gì (%s).' % rid
    done, failed = [], []
    for k, it in enumerate(row['items']):
        try:
            if it['kind'] == 'branch':
                code, sha, _ = _git(it['repo'], 'rev-parse', '--verify', '--quiet', 'refs/heads/' + it['branch'])
                if code:
                    raise ValueError('nhánh không còn')
                if sha != it['sha']:
                    raise ValueError('nhánh đã có commit mới sau khi đề xuất')
                _log(hub, '%s branch %s of %s was at %s' % (rid, it['branch'], it['repo'], sha))
                code, _, err = _git(it['repo'], 'branch', '-D', it['branch'])
                if code:
                    raise ValueError(err[:200])
            else:
                src = Path(it['path'])
                if not src.exists():
                    raise ValueError('không còn tồn tại')
                dst = _trash_slot(hub, rid, k, src)
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(src), str(dst))
                it['trash'] = str(dst)
            it['done'] = True
            done.append(it['show'])
        except Exception as e:
            it['error'] = str(e)[:200]
            failed.append('%s (%s)' % (it['show'], it['error']))
    row.update(status='trashed' if done else 'failed', done=stamp, decided_by=sender)
    _save(hub, rows)
    _log(hub, '%s confirmed by %s: done %s; failed %s' % (rid, sender, done, failed))
    out = 'Đã xoá %d mục (%s)' % (len(done), rid) if done else 'Chưa xoá được mục nào (%s)' % rid
    if any(i['kind'] == 'path' and i.get('done') for i in row['items']):
        out += ', tệp nằm trong thùng rác, khôi phục được'
    return out + ('. Lỗi: ' + '; '.join(failed) if failed else '.')


def trash_action(hub, rid, action, sender):
    """restore: put everything back (folders to their place, branches at their old commit).
    purge: delete the trashed files for good, to free the space (the owner confirmed it in the app)."""
    rows = _load(hub)
    row = next((r for r in rows if r.get('id') == rid), None)
    if not row or row.get('status') != 'trashed':
        raise ValueError('%s không có trong thùng rác' % rid)
    notes = []
    for it in row['items']:
        if not it.get('done'):
            continue
        if action == 'restore':
            if it['kind'] == 'branch':
                code, _, err = _git(it['repo'], 'branch', it['branch'], it['sha'])
                notes.append(it['show'] if not code else '%s: %s' % (it['show'], err[:120]))
            else:
                if Path(it['path']).exists():
                    notes.append('%s: chỗ cũ đã có tệp khác, để nguyên trong thùng rác' % it['show'])
                    continue
                Path(it['path']).parent.mkdir(parents=True, exist_ok=True)
                shutil.move(it['trash'], it['path'])
                notes.append(it['show'])
        elif action == 'purge' and it['kind'] == 'path':
            t = Path(it['trash'])
            if t.is_dir() and not t.is_symlink():
                shutil.rmtree(t)
            elif t.exists() or t.is_symlink():
                t.unlink()
            notes.append(it['show'])
    stamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    row.update(status='restored' if action == 'restore' else 'purged', closed=stamp)
    _save(hub, rows)
    _log(hub, '%s %s by %s: %s' % (rid, action, sender, notes))
    return ('Đã khôi phục: ' if action == 'restore' else 'Đã xoá hẳn: ') + '; '.join(notes or ['không có gì'])
