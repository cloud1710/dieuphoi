import subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['C:/Users/ADMIN/anaconda3/envs/titan_gpu310/python.exe','-m','http.server','8765','--directory','D:/dieuphoi/office'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1.5)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, channel='msedge'); pg = b.new_page(viewport={'width':1280,'height':720})
        pg.goto('http://127.0.0.1:8765/themes/ai/work/test_theme.html'); pg.wait_for_timeout(1500)
        seen = set()
        for i in range(60):
            pg.wait_for_timeout(2000)
            r = pg.evaluate("staff.map(w=>[w.id,w.ph,Math.round(w.x),Math.round(w.y)])")
            for id,ph,x,y in r:
                if ph=='stay': seen.add((id,x,y))
        print(sorted(seen)); b.close()
finally: srv.terminate()
