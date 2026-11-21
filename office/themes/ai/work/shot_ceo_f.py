# Headless check of the Pixel AI theme with the new CEO sprites: load test_theme.html,
# list failed requests / console errors, confirm every ceo_*.png loaded, save a screenshot.
import subprocess
import time

from playwright.sync_api import sync_playwright

OUT = 'D:/dieuphoi/office/themes/ai/work/'
srv = subprocess.Popen(['C:/Users/ADMIN/anaconda3/envs/titan_gpu310/python.exe', '-m', 'http.server', '8766',
                        '--directory', 'D:/dieuphoi/office'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, channel='msedge')
        pg = b.new_page(viewport={'width': 1280, 'height': 720})
        errs, ceo = [], {}
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('requestfailed', lambda r: errs.append('FAIL ' + r.url))
        pg.on('response', lambda r: ceo.__setitem__(r.url.split('/')[-1].split('?')[0], r.status)
              if '/ceo_' in r.url else None)
        pg.goto('http://127.0.0.1:8766/themes/ai/work/test_theme.html')
        pg.wait_for_timeout(1500)
        print('ready', pg.evaluate('window.READY'))
        pg.wait_for_timeout(6000)
        pg.screenshot(path=OUT + 'shot_ceo_f.png')
        pg.screenshot(path=OUT + 'shot_ceo_f_zoom.png', clip={'x': 180, 'y': 180, 'width': 360, 'height': 260})
        print('ceo files', sorted(ceo.items()))
        print('errs', errs)
        b.close()
finally:
    srv.terminate()
