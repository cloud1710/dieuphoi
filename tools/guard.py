"""Gác cổng của tổng quản: chạy trước mỗi công cụ của phiên chat (hook PreToolUse của Claude Code).

Đọc `quyen-tong-quan.json` ở gốc hub. Chặn (mã thoát 2, lý do in ra stderr để tổng quản đọc và báo lại anh):
  - mọi lệnh xoá hoặc phá dữ liệu không lấy lại được;
  - sửa, ghi, chạy lệnh trong các thư mục `chi_doc` (chỉ được đọc), và mọi thao tác trong các thư mục `cam_vao`.
Còn lại cho qua. Không có tệp quyền hoặc tệp hỏng thì chặn hết lệnh Bash lạ: mất tệp quyền không được thành toàn quyền.
"""
import json
import re
import sys
from pathlib import Path

HUB = Path(__file__).resolve().parent.parent

# verbs that delete or destroy; matched anywhere in a shell command, also inside python -c "..." and the like
DELETE = [
    r'(?<![\w-])rm(?![\w-])', r'(?<![\w-])rmdir(?![\w-])', r'(?<![\w-])unlink(?![\w-])', r'(?<![\w-])shred(?![\w-])',
    r'(?<![\w-])del(?![\w-])', r'(?<![\w-])erase(?![\w-])', r'(?<![\w-])rd\s+/', r'remove-item', r'clear-content', r'clear-recyclebin',
    r'(?<![\w-])ri\s+-', r'rimraf', r'shutil\s*\.\s*rmtree', r'os\s*\.\s*(remove|unlink|rmdir|removedirs)', r'\.unlink\s*\(', r'\.rmdir\s*\(',
    r'rmtree', r'fs\s*\.\s*(rm|rmdir|unlink)', r'send2trash', r'find\b.*\s-delete', r'-exec\s+rm', r'xargs\s+rm',
    r'git\s+clean', r'git\s+rm\b', r'git\s+branch\s+.*-d\b', r'git\s+push\s+.*--delete', r'git\s+push\s+\S+\s+:\S', r'git\s+reset\s+--hard',
    r'git\s+stash\s+(drop|clear)', r'git\s+checkout\s+(--\s|\.)', r'git\s+restore\b', r'git\s+worktree\s+remove', r'git\s+tag\s+-d', r'gh\s+repo\s+delete',
    r'(?<![\w-])truncate(?![\w-])', r'(?<![\w-])mkfs', r'(?<![\w-])format\s+[a-z]:', r'(?<![\w-])dd\s+.*of=', r'diskpart', r'cipher\s+/w',
    r'drop\s+(table|database|schema)', r'delete\s+from', r'(?<![\w-])wipe', r'>\s*/dev/sd', r'robocopy\b.*(/mir|/purge)', r'rsync\b.*--delete',
    r'(pip|pip3|npm|conda|uv|winget|choco|scoop)\s+(uninstall|remove|rm)\b', r'docker\s+.*\b(rm|rmi|prune)\b', r'wsl\s+--unregister',
]


def _norm(text):
    return str(text or '').replace('\\', '/').lower()


def _under(path, roots):
    p = _norm(path).rstrip('/') + '/'
    return next((r for r in roots if p.startswith(_norm(r).rstrip('/') + '/')), None)


def _mentions(text, roots):
    t = _norm(text)
    for r in roots:
        r = _norm(r).rstrip('/')
        if r in t or r.replace('d:/', '/d/') in t or r.replace('d:/', '/mnt/d/') in t:
            return r
    return None


def verdict(event, rules):
    """None = allowed; otherwise the reason the tool call is refused."""
    tool = str(event.get('tool_name') or '')
    args = event.get('tool_input') if isinstance(event.get('tool_input'), dict) else {}
    readonly = [str(x) for x in rules.get('chi_doc') or []]
    closed = [str(x) for x in rules.get('cam_vao') or []]
    path = args.get('file_path') or args.get('notebook_path') or args.get('path') or ''
    own_files = ('quyen-tong-quan.json', 'tools/guard.py', 'chat-settings.json')          # the gate does not open itself
    if tool != 'Bash' and tool not in ('Read', 'Grep', 'Glob') and any(_norm(path).endswith(f) for f in own_files):
        return 'Tệp quyền và gác cổng chỉ anh Vinh được sửa.'
    if tool == 'Bash' and any(f.split('/')[-1] in _norm(args.get('command')) for f in own_files) and not re.match(r'\s*(cat|type|head)\s+[\w./\\:-]+\s*$', str(args.get('command') or '')):
        return 'Tệp quyền và gác cổng chỉ anh Vinh được sửa.'
    if tool in ('Edit', 'Write', 'MultiEdit', 'NotebookEdit'):
        hit = _under(path, readonly + closed)
        if hit:
            return 'Không được sửa hay ghi trong %s. Việc ở đó thì gửi thư cho orchestra của nó.' % hit
        if rules.get('toan_quyen') is not True and not _under(path, [str(HUB)]):
            return 'Chưa được cấp toàn quyền: chỉ sửa tệp trong thư mục hub.'
        return None
    if tool in ('Read', 'Grep', 'Glob'):
        hit = _under(path, closed) or _mentions(args.get('pattern') if tool == 'Glob' else '', closed)
        return 'Thư mục %s là riêng tư, không được đọc.' % hit if hit else None
    if tool != 'Bash':
        return None
    cmd = str(args.get('command') or '')
    low = _norm(cmd)
    own = re.match(r'\s*(python|python3|py)(\.exe)?\s+tools/dp\.py\s', low) and not re.search(r'[;&|`$<>]', low)
    if own:
        return None                               # the hub's own tool: it does its own checks
    if rules.get('toan_quyen') is not True:
        return 'Chưa được cấp toàn quyền (quyen-tong-quan.json): chỉ chạy được python tools/dp.py.'
    for pat in DELETE + [str(x) for x in rules.get('cam_them') or []]:
        try:
            if re.search(pat, low):
                return 'Lệnh này xoá hoặc phá dữ liệu (khớp "%s"). Xoá là quyền anh Vinh giữ: nói rõ cần xoá gì và hỏi anh trước.' % pat
        except re.error:
            continue
    hit = _mentions(cmd, closed)
    if hit:
        return 'Thư mục %s là riêng tư, không được đụng tới.' % hit
    hit = _mentions(cmd, readonly)
    if hit and not re.match(r'\s*(cat|type|head|tail|ls|dir|grep|rg|findstr|wc|git\s+(-c\s+\S+\s+)*(status|log|diff|show))\b[^;&|`$>]*$', low):
        return 'Trong %s chỉ được đọc (cat, ls, grep, git status/log/diff). Việc khác thì gửi thư cho orchestra của nó.' % hit
    return None


def main():
    try:
        event = json.loads(sys.stdin.buffer.read().decode('utf-8', 'replace') or '{}')
    except ValueError:
        event = {}
    try:
        rules = json.loads((HUB / 'quyen-tong-quan.json').read_text(encoding='utf-8'))
        if not isinstance(rules, dict):
            rules = {}
    except (OSError, ValueError):
        rules = {}
    why = verdict(event, rules)
    if why:
        sys.stderr.buffer.write(('[gác cổng] ' + why).encode('utf-8'))
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
