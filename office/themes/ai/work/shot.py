import sys, subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['C:/Users/ADMIN/anaconda3/envs/titan_gpu310/python.exe','-m','http.server','8765','--directory','D:/dieuphoi/office'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1.5)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, channel='msedge'); pg = b.new_page(viewport={'width':1280,'height':720})
        errs=[]; pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None); pg.on('requestfailed', lambda r: errs.append('FAIL '+r.url))
        pg.goto('http://127.0.0.1:8765/themes/ai/work/test_theme.html'); pg.wait_for_timeout(1500)
        print('ready', pg.evaluate('window.READY'))
        pg.wait_for_timeout(14000)
        pg.screenshot(path='D:/dieuphoi/office/themes/ai/work/shot_headless.png'); print('errs', errs); b.close()
finally: srv.terminate()
