# Download PixelLab sprites (no-auth download URLs) into work/season/sp/<name>.png
import json, os, sys, time, urllib.request, urllib.error
D = 'D:/dieuphoi/office/themes/ai/work/season/'
jobs = json.load(open(D + 'sprites.json', encoding='utf-8'))
os.makedirs(D + 'sp', exist_ok=True)
for name, jid in jobs.items():
    out = D + 'sp/' + name + '.png'
    if os.path.exists(out) and name not in sys.argv[1:]:
        continue
    url = 'https://api.pixellab.ai/mcp/images/%s/download' % jid
    for k in range(10):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                open(out, 'wb').write(r.read())
            print('ok', name)
            break
        except urllib.error.HTTPError as e:
            if e.code == 423:
                time.sleep(5)
                continue
            print('FAIL', name, e.code)
            break
