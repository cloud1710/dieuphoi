# Composite each season layer over bg_day (and night) and save previews at 1280x720 + a 2x2 overview.
import sys
from PIL import Image
W = 'D:/dieuphoi/office/themes/ai/'
O = W + 'work/season/'
names = sys.argv[1:] or ['tet', 'christmas', 'moon', 'halloween']
day = Image.open(W + 'bg_day.png').convert('RGBA')
night = Image.open(W + 'bg_night.png').convert('RGBA')
tiles = []
for n in names:
    lay = Image.open(W + 'season_%s.png' % n).convert('RGBA')
    assert lay.size == (1920, 1080), lay.size
    c = day.copy(); c.alpha_composite(lay)
    c.convert('RGB').resize((1280, 720), Image.LANCZOS).save(O + 'pv_%s.png' % n)
    cn = night.copy(); cn.alpha_composite(lay)
    cn.convert('RGB').resize((960, 540), Image.LANCZOS).save(O + 'pvn_%s.png' % n)
    tiles.append(c.convert('RGB').resize((960, 540), Image.LANCZOS))
if len(tiles) == 4:
    ov = Image.new('RGB', (1920, 1080))
    for i, t in enumerate(tiles):
        ov.paste(t, ((i % 2) * 960, (i // 2) * 540))
    ov.save(O + 'pv_all.png')
print('ok')
