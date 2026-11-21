import subprocess, time, sys
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['C:/Users/ADMIN/anaconda3/envs/titan_gpu310/python.exe','-m','http.server','8766','--directory','D:/dieuphoi/office'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1.5)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, channel='msedge')
        for page_url in ['themes/ai/work/test_theme.html','m.html','index.html']:
            pg = b.new_page(viewport={'width':1280,'height':720}); bad=[]
            pg.on('response', lambda r: bad.append((r.status, r.url)) if r.status>=400 else None)
            pg.on('requestfailed', lambda r: bad.append(('FAIL', r.url)))
            pg.goto('http://127.0.0.1:8766/'+page_url); pg.wait_for_timeout(2500)
            print(page_url, bad)
            if 'test_theme' in page_url:
                pg.wait_for_timeout(12000); pg.screenshot(path='D:/dieuphoi/office/themes/ai/work/shot_office.png')
            pg.close()
        b.close()
finally: srv.terminate()
