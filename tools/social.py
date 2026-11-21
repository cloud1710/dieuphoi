"""Public social pages for the PC dashboard, read by script once a day: no model, no login.

The owner's list (out/dash-cfg.json `social`: Facebook group or page links) is opened one by one in a headless Edge or
Chrome with its own empty profile (never the owner's signed-in browser); the rendered page is parsed for its newest posts.
A source that asks for a login is reported as such, not worked around. Result: out/dash-social.json.
"""
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
from html.parser import HTMLParser
from pathlib import Path

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
OK_URL = re.compile(r'https://(www\.|m\.)?(facebook\.com|x\.com)/[\w./?=&%-]+$')
POST_URL = re.compile(r'https://www\.facebook\.com/groups/[^/]+/(?:posts|permalink)/\d+')


def clean_list(urls):
    out = []
    for u in urls or []:
        u = str(u).strip()
        if OK_URL.match(u) and u not in out:
            out.append(u)
    return out[:20]


def browser():
    if os.name == 'nt':
        roots = [os.environ.get(k, '') for k in ('ProgramFiles(x86)', 'ProgramFiles', 'LOCALAPPDATA')]
        for rel in ('Microsoft/Edge/Application/msedge.exe', 'Google/Chrome/Application/chrome.exe'):
            for r in roots:
                if r and (Path(r) / rel).is_file():
                    return str(Path(r) / rel)
        return None
    return next((x for x in map(shutil.which, ('microsoft-edge', 'google-chrome', 'chromium', 'chromium-browser')) if x), None)


class Posts(HTMLParser):
    """Top-level role=article blocks of a rendered Facebook page: who, the message text, the post's link."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.posts, self.cur, self.title, self.in_title = [], [], None, '', False
        self.art = self.msg = self.head = self.skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'title' and not self.title:
            self.in_title = True
        if tag in VOID:
            return
        kind = ''
        if tag in ('script', 'style'):
            kind = 'skip'
            self.skip += 1
        elif a.get('role') == 'article':
            kind = 'art'
            self.art += 1
            if self.art == 1:
                self.cur = {'by': '', 'msg': '', 'all': '', 'url': ''}
        elif self.art == 1 and ('data-ad-preview' in a or 'data-ad-comet-preview' in a or a.get('data-ad-rendering-role') == 'story_message'):
            kind = 'msg'
            self.msg += 1
        elif self.art == 1 and tag in ('h2', 'h3', 'h4'):
            kind = 'head'
            self.head += 1
        if self.art >= 1 and self.cur is not None and tag == 'a' and not self.cur['url']:
            m = POST_URL.match(str(a.get('href') or ''))
            if m:
                self.cur['url'] = m.group(0)
        self.stack.append((tag, kind))

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        if tag in VOID:
            return
        while self.stack:                         # unclosed tags inside are closed with their parent
            t, kind = self.stack.pop()
            if kind == 'skip':
                self.skip -= 1
            elif kind == 'msg':
                self.msg -= 1
            elif kind == 'head':
                self.head -= 1
            elif kind == 'art':
                self.art -= 1
                if self.art == 0 and self.cur is not None:
                    self.posts.append(self.cur)
                    self.cur = None
            if t == tag:
                break

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.skip or self.art != 1 or self.cur is None:
            return
        if self.msg:
            self.cur['msg'] += data
        elif self.head and len(self.cur['by']) < 80:
            self.cur['by'] += data
        self.cur['all'] += data + ' '


def parse(page, url):
    """(page title, posts) from a rendered page. A post without a message block falls back to its visible text."""
    p = Posts()
    p.feed(page)
    title = re.sub(r'\s*\|\s*Facebook\s*$', '', p.title).strip() or url
    out, seen = [], set()
    for x in p.posts:
        text = re.sub(r'\s+', ' ', x['msg'] or x['all']).strip()
        text = re.sub(r'^(Featured|Đáng chú ý)\s+', '', text)
        if len(text) < 15 or text[:80] in seen:
            continue
        seen.add(text[:80])
        out.append({'title': text[:260], 'url': x['url'] or url, 'by': re.sub(r'\s+', ' ', x['by']).strip()[:60]})
    return title, out[:6]


def fetch(exe, url, hub, timeout=80):
    prof = Path(hub) / 'out' / 'edge-social'
    prof.mkdir(parents=True, exist_ok=True)
    pr = subprocess.run([exe, '--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio', '--user-data-dir=' + str(prof), '--user-agent=' + UA,
                         '--lang=vi-VN', '--window-size=1280,4000', '--virtual-time-budget=15000', '--dump-dom', url],
                        capture_output=True, timeout=timeout, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    return pr.stdout.decode('utf-8', 'replace')


def sig(urls):
    return hashlib.sha1('\n'.join(urls).encode('utf-8')).hexdigest()[:12]


def due(hub, urls, hours=4):
    """True when the list changed or the last read is older than `hours`. Without a login Facebook shows only the top
    post of a group, so the hub reads a few times a day and keeps what it has seen."""
    try:
        old = json.loads((Path(hub) / 'out' / 'dash-social.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        old = {}
    now = datetime.datetime.now()
    if old.get('sig') != sig(urls):
        return True
    try:
        return hours is not None and (now - datetime.datetime.strptime(old.get('time'), '%Y-%m-%d %H:%M')).total_seconds() > hours * 3600
    except (TypeError, ValueError):
        return True


def refresh(hub, urls):
    hub = Path(hub)
    now = datetime.datetime.now()
    got = {'date': now.strftime('%Y-%m-%d'), 'time': now.strftime('%Y-%m-%d %H:%M'), 'sig': sig(urls), 'topics': [], 'errors': []}
    exe = browser()
    items = []
    try:
        old = json.loads((hub / 'out' / 'dash-social.json').read_text(encoding='utf-8'))
        kept = [x for t in old.get('topics') or [] for x in t.get('items') or [] if x.get('url') and x.get('at')]
    except (OSError, ValueError):
        kept = []
    if urls and not exe:
        got['errors'].append('PC không có Edge hay Chrome để đọc trang')
    raw_dir = hub / 'out' / 'social-raw'
    raw_dir.mkdir(parents=True, exist_ok=True)
    for i, url in enumerate(urls if exe else []):
        try:
            page = fetch(exe, url, hub)
            (raw_dir / ('%02d.html' % i)).write_text(page, encoding='utf-8')          # kept for fixing the parser when Facebook changes
            title, posts = parse(page, url)
            if not posts:
                got['errors'].append('%s: %s' % (title if title != url else url, 'cần đăng nhập' if '/login' in page[:200000] and 'role="article"' not in page else 'không đọc được bài nào'))
            for p in posts:
                items.append({'title': p['title'], 'url': p['url'], 'src': title[:50] + ((' · ' + p['by']) if p['by'] else ''), 'at': got['time']})
        except Exception as e:
            got['errors'].append('%s: %s' % (url, type(e).__name__))
    seen = {x['url'] for x in items}
    items += [x for x in kept if x['url'] not in seen and any(x['url'].startswith(u.rstrip('/')) for u in urls)]      # earlier reads, newest first
    items = items[:40]
    items += [{'title': '⚠ ' + e, 'url': '', 'src': 'chưa đọc được', 'at': ''} for e in got['errors']]
    if items:
        got['topics'].append({'name': 'Mạng xã hội', 'items': items})
    (hub / 'out' / 'dash-social.json').write_text(json.dumps(got, ensure_ascii=False, indent=1), encoding='utf-8')
    return got
