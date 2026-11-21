# Headless check: force each season through localStorage dp-season, load the theme test page,
# confirm the season PNG is fetched (HTTP 200), no console errors, and save a screenshot per season.
import subprocess, time
from playwright.sync_api import sync_playwright
PY = 'C:/Users/ADMIN/anaconda3/envs/titan_gpu310/python.exe'
O = 'D:/dieuphoi/office/themes/ai/work/season/'
srv = subprocess.Popen([PY, '-m', 'http.server', '8766', '--directory', 'D:/dieuphoi/office'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
ok_all = True
try:
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, channel='msedge')
        for s in ['tet', 'christmas', 'moon', 'halloween', '']:
            ctx = b.new_context(viewport={'width': 1280, 'height': 720})
            ctx.add_init_script("localStorage.setItem('dp-season', %r)" % s if s else "localStorage.removeItem('dp-season')")
            pg = ctx.new_page()
            errs, got = [], []
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            pg.on('pageerror', lambda e: errs.append('pageerror ' + str(e)))
            pg.on('requestfailed', lambda r: errs.append('FAIL ' + r.url))
            pg.on('response', lambda r: got.append((r.status, r.url)) if 'season_' in r.url else None)
            pg.goto('http://127.0.0.1:8766/themes/ai/work/test_theme.html')
            pg.wait_for_function('window.READY !== undefined', timeout=20000)
            pg.wait_for_timeout(3000)
            pg.screenshot(path=O + 'shot_%s.png' % (s or 'none'))
            want = ('season_%s.png' % s) if s else None
            fetched = [g for g in got if want and want in g[1]]
            good = (not errs) and (bool(fetched) and all(g[0] == 200 for g in fetched) if want else not got)
            ok_all &= good
            print('season=%-10s ready=%s fetched=%s errors=%s -> %s' % (s or '(none)', pg.evaluate('window.READY'),
                  [(g[0], g[1].rsplit('/', 1)[-1]) for g in got], errs, 'OK' if good else 'BAD'))
            ctx.close()
        b.close()
finally:
    srv.terminate()
print('ALL OK' if ok_all else 'SOME BAD')
