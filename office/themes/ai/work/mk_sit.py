from PIL import Image
import os, shutil
W = 'D:/dieuphoi/office/themes/ai/'
B = W + 'work/orig_sit/'
os.makedirs(B, exist_ok=True)
names = ['ceo', 'chairman'] + ['staff_%d' % i for i in range(1, 9)]
SPLIT = 0.60   # fraction of body height where hips are
KEEP = 0.50    # legs squeezed to this fraction (knees bent, forward)
for n in names:
    src = B + n + '_sit.bak.png'
    if not os.path.exists(src):
        shutil.copy(W + n + '_sit.png', src)
    im = Image.open(src).convert('RGBA')
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    for f in range(im.width // 80):
        fr = im.crop((f * 80, 0, f * 80 + 80, 80))
        bb = fr.getbbox()
        if not bb:
            continue
        top, bot = bb[1], bb[3]
        h = bot - top
        hip = top + int(h * SPLIT)
        upper = fr.crop((0, 0, 80, hip))
        lower = fr.crop((0, hip, 80, bot))
        lh = max(4, int(lower.height * KEEP))
        # squeeze with nearest rows, then spread the lower part a little (knees apart)
        lower = lower.resize((80, lh), Image.NEAREST)
        cell = Image.new('RGBA', (80, 80), (0, 0, 0, 0))
        ly = 77 - lh + 1
        cell.alpha_composite(lower, (0, ly))
        cell.alpha_composite(upper.crop((0, top, 80, hip)), (0, ly - (hip - top)))
        out.alpha_composite(cell, (f * 80, 0))
    out.save(W + n + '_sit.png')
    print(n, out.size)
