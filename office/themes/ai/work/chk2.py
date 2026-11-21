import subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['C:/Users/ADMIN/anaconda3/envs/titan_gpu310/python.exe','-m','http.server','8766','--directory','D:/dieuphoi/office'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1.5)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, channel='msedge'); pg = b.new_page(viewport={'width':390,'height':780})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route('**/state.json', lambda r: r.fulfill(path='D:/dieuphoi/out/state.json', content_type='application/json'))
        pg.goto('http://127.0.0.1:8766/m.html'); pg.wait_for_timeout(3000)
        
        print('office scroll', pg.evaluate("[document.documentElement.scrollHeight, innerHeight]"))
        pg.click('nav button[data-t=work]'); pg.wait_for_timeout(800)
        open('D:/dieuphoi/office/themes/ai/work/chk.out','w',encoding='utf-8').write(str(pg.evaluate("[...document.querySelectorAll('#t-work *')].filter(e=>/Đang làm gì|Sẵn sàng và đang nghỉ|Cây tiến độ/.test(e.textContent)&&e.children.length<4).map(e=>e.textContent.slice(0,50))")))
        print('errs', errs); b.close()
finally: srv.terminate()
