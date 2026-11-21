import json, glob, os
from PIL import Image
W='D:/dieuphoi/office/themes/ai/'
for f in glob.glob(W+'**/*.json', recursive=True):
    try: json.load(open(f,encoding='utf-8'))
    except Exception as e: print('BADJSON', f, e)
m=json.load(open(W+'manifest.json'))
n=0
for b in m['bg'].values():
    assert os.path.exists(W+b), b; assert Image.open(W+b).size==(1920,1080); n+=1
for k,c in m['chars'].items():
    for part,fr in c['frames_by'].items():
        im=Image.open(W+c[part]); n+=1
        assert im.mode=='RGBA' and im.size==(80*fr,80),(k,part,im.size,im.mode)
        assert im.getchannel('A').getextrema()[0]==0
        for i in range(fr):
            bb=im.crop((i*80,0,i*80+80,80)).getbbox()
            assert bb and bb[0]>0 and bb[2]<80 and bb[3]<=80,(k,part,i,bb)
print('OK files',n)
