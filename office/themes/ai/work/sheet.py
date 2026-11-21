from PIL import Image
import sys
W='D:/dieuphoi/office/themes/ai/'
names=['ceo','chairman']+['staff_%d'%i for i in range(1,9)]
parts=['idle','sit','walk_s','walk_e','walk_n','walk_w']
H=80*len(names)
sheet=Image.new('RGBA',(80*(2+2+6*4)//1,H),(150,150,150,255))
for r,n in enumerate(names):
    x=0
    for p in parts:
        im=Image.open(W+'%s_%s.png'%(n,p)).convert('RGBA')
        sheet.alpha_composite(im,(x,r*80)); x+=im.width
sheet=sheet.crop((0,0,x,H)).resize((x*1,H*1),Image.NEAREST)
sheet.save(W+'work/sheet_all.png'); print(sheet.size)
