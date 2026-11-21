from PIL import Image
import os
root = 'pl/ceo_f/Idle/animations/'
rows = []
for a in sorted(os.listdir(root)):
    for d in sorted(os.listdir(root + a)):
        fs = sorted(os.listdir(root + a + '/' + d))
        rows.append((a, d, [Image.open(root + a + '/' + d + '/' + f).convert('RGBA') for f in fs]))
C = 104
W = max(len(r[2]) for r in rows) * C
out = Image.new('RGBA', (W, C * len(rows)), (120, 170, 120, 255))
for j, (a, d, ims) in enumerate(rows):
    print(a, d, len(ims), ims[0].size)
    for i, im in enumerate(ims):
        out.alpha_composite(im, (i * C, j * C))
out.resize((out.width * 2, out.height * 2), Image.NEAREST).save('prev_ceo_f_anim.png')
