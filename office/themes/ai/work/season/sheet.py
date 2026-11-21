import os
from PIL import Image, ImageDraw
D='D:/dieuphoi/office/themes/ai/work/season/sp/'
fs=sorted(os.listdir(D))
S=4; cw=140*4//4*S//S
tiles=[]
for f in fs:
    im=Image.open(D+f).convert('RGBA')
    tiles.append((f,im))
cols=7; cell=(140*2,90*2+20)
W=cols*cell[0]; H=((len(tiles)+cols-1)//cols)*cell[1]
out=Image.new('RGBA',(W,H),(120,120,120,255)); d=ImageDraw.Draw(out)
for i,(f,im) in enumerate(tiles):
    x=(i%cols)*cell[0]; y=(i//cols)*cell[1]
    k=2 if im.width>64 else 3
    big=im.resize((im.width*k,im.height*k),Image.NEAREST)
    out.alpha_composite(big,(x+4,y+18))
    d.text((x+4,y+2),f[:-4]+' %dx%d'%im.size,fill=(255,255,0,255))
out.save('sheet.png'); print(len(tiles),out.size)
