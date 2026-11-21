"""Feeds for the PC dashboard (office/pc.html), fetched by the hub itself: no model, no token.

- news: Google News RSS, one search per topic the owner follows (out/dash-cfg.json `topics`, else DEFAULT_TOPICS)
- music: YouTube playlist RSS (no API key): the newest entries of the `trending` playlist, mixed into the player

What needs judgment (hot films, games, music picks, each project's daily summary) is written by the CEO's daily job
`bangtin` into out/dash-hot.json and out/dash-projects.json; this module only serves them.
"""
import datetime
import email.utils
import html
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) dieuphoi-dashboard'
DEFAULT_TOPICS = [
    {'name': 'Giải phẫu bệnh số và AI', 'q': '"digital pathology" OR "computational pathology" OR "pathology AI"', 'lang': 'en'},
    {'name': 'AI và Claude', 'q': 'Anthropic Claude OR "AI agents" OR "large language model"', 'lang': 'en'},
    {'name': 'Chứng khoán Việt Nam', 'q': 'chứng khoán VNIndex OR "thị trường chứng khoán"', 'lang': 'vi'},
    {'name': 'Y khoa Việt Nam', 'q': 'bệnh viện ung thư chẩn đoán Bộ Y tế', 'lang': 'vi'},
    {'name': 'Bóng đá', 'q': 'bóng đá Ngoại hạng Anh OR "đội tuyển Việt Nam"', 'lang': 'vi'},
]
CFG_KEYS = ('playlist', 'trending', 'topics', 'mix')


def cfg_load(hub):
    try:
        got = json.loads((Path(hub) / 'out' / 'dash-cfg.json').read_text(encoding='utf-8'))
        return got if isinstance(got, dict) else {}
    except (OSError, ValueError):
        return {}


def playlist_id(text):
    """A playlist id from an id or any YouTube link that carries one; '' when there is none."""
    text = str(text or '').strip()
    m = re.search(r'[?&]list=([\w-]{10,})', text)
    if m:
        return m.group(1)
    return text if re.fullmatch(r'[\w-]{10,}', text) else ''


def cfg_save(hub, data):
    """Only the dashboard's own settings, cleaned: playlist ids, topics, how often a trending song is mixed in."""
    cfg = cfg_load(hub)
    for k in ('playlist', 'trending'):
        if k in data:
            cfg[k] = playlist_id(data[k])
    if 'mix' in data:
        cfg['mix'] = max(0, min(10, int(data['mix'] or 0)))
    if isinstance(data.get('mine'), list):       # the owner's own songs as YouTube video ids (used when no playlist is set)
        cfg['mine'] = [v for v in data['mine'] if re.fullmatch(r'[\w-]{11}', str(v))][:300]
    if isinstance(data.get('social'), list):
        import social
        cfg['social'] = social.clean_list(data['social'])
    if isinstance(data.get('topics'), list):
        topics = []
        for t in data['topics'][:10]:
            if isinstance(t, dict) and str(t.get('q') or '').strip():
                topics.append({'name': str(t.get('name') or t['q'])[:60], 'q': str(t['q'])[:200], 'lang': 'en' if t.get('lang') == 'en' else 'vi'})
        cfg['topics'] = topics
    (Path(hub) / 'out' / 'dash-cfg.json').write_text(json.dumps(cfg, ensure_ascii=False, indent=1), encoding='utf-8')
    return cfg


def _get(url, timeout=20):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=timeout) as r:
        return r.read(4 << 20)


def _when(text):
    try:
        return email.utils.parsedate_to_datetime(text).astimezone().strftime('%Y-%m-%d %H:%M')
    except (TypeError, ValueError):
        return ''


def parse_news(raw, n=6):
    out = []
    for it in ET.fromstring(raw).iter('item'):
        title = html.unescape(it.findtext('title') or '').strip()
        src = (it.findtext('source') or '').strip()
        if src and title.endswith(' - ' + src):
            title = title[:-len(src) - 3]
        link = (it.findtext('link') or '').strip()
        if title and link.startswith('http'):
            out.append({'title': title[:220], 'url': link, 'src': src[:60], 'at': _when(it.findtext('pubDate'))})
    out.sort(key=lambda x: x['at'], reverse=True)
    return out[:n]


def news(topic, n=6):
    lang = 'en' if topic.get('lang') == 'en' else 'vi'
    loc = 'hl=en-US&gl=US&ceid=US:en' if lang == 'en' else 'hl=vi&gl=VN&ceid=VN:vi'
    return parse_news(_get('https://news.google.com/rss/search?q=%s&%s' % (urllib.parse.quote(topic['q'] + ' when:3d'), loc)), n)


def parse_playlist(raw):
    ns = {'a': 'http://www.w3.org/2005/Atom', 'yt': 'http://www.youtube.com/xml/schemas/2015'}
    out = []
    for e in ET.fromstring(raw).findall('a:entry', ns):
        vid = e.findtext('yt:videoId', '', ns)
        if re.fullmatch(r'[\w-]{11}', vid or ''):
            out.append({'id': vid, 'title': (e.findtext('a:title', '', ns) or '')[:160], 'by': (e.findtext('a:author/a:name', '', ns) or '')[:80]})
    return out


def playlist(pid):
    return parse_playlist(_get('https://www.youtube.com/feeds/videos.xml?playlist_id=' + urllib.parse.quote(pid)))


CHARTS = [('vn', 15), ('us', 8)]          # Apple Music most-played by country: free, no key; mixed into the player


def chart(country, n):
    raw = _get('https://rss.applemarketingtools.com/api/v2/%s/music/most-played/%d/songs.json' % (country, n))
    return [{'title': str(r.get('name') or '')[:160], 'by': str(r.get('artistName') or '')[:80]} for r in json.loads(raw)['feed']['results'] if r.get('name')]


def yt_find(query):
    """The first video YouTube's own search page returns for a song: no API key, no model."""
    raw = _get('https://www.youtube.com/results?search_query=' + urllib.parse.quote(query)).decode('utf-8', 'replace')
    m = re.search(r'"videoRenderer":\{"videoId":"([\w-]{11})"', raw) or re.search(r'"videoId":"([\w-]{11})"', raw)
    return m.group(1) if m else ''


def trending(hub, limit=8):
    """This week's most played songs (Vietnam, then US) as YouTube videos. Each song is looked up once and kept in
    out/dash-yt-cache.json; at most `limit` new lookups per run, so a full chart fills in over a few runs."""
    f = Path(hub) / 'out' / 'dash-yt-cache.json'
    try:
        cache = json.loads(f.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        cache = {}
    out, errors, looked = [], [], 0
    for country, n in CHARTS:
        try:
            songs = chart(country, n)
        except Exception as e:
            errors.append('bảng xếp hạng %s: %s' % (country, type(e).__name__))
            continue
        for sg in songs:
            key = (sg['title'] + ' | ' + sg['by']).lower()
            if key not in cache and looked < limit:
                looked += 1
                try:
                    cache[key] = yt_find('%s %s' % (sg['title'], sg['by']))
                except Exception as e:
                    errors.append('tìm YouTube: %s' % type(e).__name__)
                    break
            if cache.get(key):
                out.append({'id': cache[key], 'title': sg['title'], 'by': sg['by']})
    f.write_text(json.dumps(cache, ensure_ascii=False), encoding='utf-8')
    return out, errors


FORUMS = [('Hacker News', 'hn', 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=12'),
          ('r/MachineLearning', 'atom', 'https://www.reddit.com/r/MachineLearning/top/.rss?t=day&limit=6'),
          ('r/LocalLLaMA', 'atom', 'https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day&limit=6'),
          ('r/ClaudeAI', 'atom', 'https://www.reddit.com/r/ClaudeAI/top/.rss?t=day&limit=6')]


def parse_atom(raw, src, n=6):
    ns = {'a': 'http://www.w3.org/2005/Atom'}
    out = []
    for e in ET.fromstring(raw).findall('a:entry', ns)[:n]:
        link = e.find('a:link', ns)
        url = link.get('href') if link is not None else ''
        title = html.unescape(e.findtext('a:title', '', ns)).strip()
        if title and str(url).startswith('http'):
            out.append({'title': title[:220], 'url': url, 'src': src, 'at': (e.findtext('a:updated', '', ns) or '')[:16].replace('T', ' ')})
    return out


def forums():
    """Tech and AI forums that are free to read without an account. Returns (items, errors)."""
    items, errors = [], []
    for name, kind, url in FORUMS:
        try:
            raw = _get(url)
            if kind == 'hn':
                for h in json.loads(raw).get('hits', []):
                    if h.get('title'):
                        items.append({'title': h['title'][:220], 'url': h.get('url') or 'https://news.ycombinator.com/item?id=%s' % h.get('objectID'),
                                      'src': '%s · %s điểm' % (name, h.get('points') or 0), 'at': str(h.get('created_at') or '')[:16].replace('T', ' ')})
            else:
                items += parse_atom(raw, name)
        except Exception as e:
            errors.append('%s: %s' % (name, type(e).__name__))
    return items, errors


def refresh(hub):
    """Fetches everything once and writes out/dash-news.json. A source that fails keeps what it had."""
    hub = Path(hub)
    f = hub / 'out' / 'dash-news.json'
    try:
        old = json.loads(f.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        old = {}
    cfg = cfg_load(hub)
    got = {'time': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), 'topics': [], 'trend': old.get('trend') or [], 'errors': []}
    kept = {t.get('name'): t for t in old.get('topics') or []}
    for t in cfg.get('topics') or DEFAULT_TOPICS:
        try:
            got['topics'].append({'name': t['name'], 'items': news(t)})
        except Exception as e:
            got['errors'].append('%s: %s' % (t['name'], type(e).__name__))
            if t['name'] in kept:
                got['topics'].append(kept[t['name']])
    items, errs = forums()
    got['errors'] += errs
    if items:
        got['topics'].append({'name': 'Diễn đàn công nghệ, AI', 'items': items})
    elif 'Diễn đàn công nghệ, AI' in kept:
        got['topics'].append(kept['Diễn đàn công nghệ, AI'])
    if cfg.get('trending'):
        try:
            got['trend'] = playlist(cfg['trending'])
        except Exception as e:
            got['errors'].append('playlist thịnh hành: %s' % type(e).__name__)
    else:                                        # no playlist of the owner's choosing: the charts, by script
        tr, errs = trending(hub)
        got['errors'] += errs
        if tr:
            got['trend'] = tr
    f.write_text(json.dumps(got, ensure_ascii=False, indent=1), encoding='utf-8')
    return got


def view(hub):
    """What the dashboard shows: the fetched feeds, the CEO's daily picks and summaries, and the settings."""
    hub = Path(hub)

    def read(name, default):
        try:
            got = json.loads((hub / 'out' / name).read_text(encoding='utf-8'))
            return got if isinstance(got, type(default)) else default
        except (OSError, ValueError):
            return default
    cfg = cfg_load(hub)
    social, digest = read('dash-social.json', {}), read('dash-digest.json', {})       # digest: the morning read of the owner's groups
    social['topics'] = (digest.get('topics') or []) + (social.get('topics') or [])
    return {'social': social, 'news': read('dash-news.json', {}), 'hot': read('dash-hot.json', {}), 'projects': read('dash-projects.json', {}),
            'cfg': {'playlist': cfg.get('playlist') or '', 'trending': cfg.get('trending') or '', 'mix': cfg.get('mix', 3), 'social': cfg.get('social') or [], 'mine': [v for v in cfg.get('mine') or [] if re.fullmatch(r'[\w-]{11}', str(v))],
                    'topics': cfg.get('topics') or DEFAULT_TOPICS}}
