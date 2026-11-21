# Preview strips on a checker background (shows transparency), scaled up.
import sys
from PIL import Image

W = 'D:/dieuphoi/office/themes/ai/'
names = sys.argv[2:]
out = sys.argv[1]
rows = []
for n in names:
    for suf in ('walk_s', 'walk_e', 'walk_n', 'walk_w', 'idle', 'sit'):
        rows.append(Image.open(W + '%s_%s.png' % (n, suf)).convert('RGBA'))
wmax = max(r.width for r in rows)
H = sum(r.height for r in rows)
bg = Image.new('RGBA', (wmax, H), (0, 0, 0, 255))
for y in range(0, H, 8):
    for x in range(0, wmax, 8):
        c = (200, 120, 200, 255) if (x // 8 + y // 8) % 2 else (120, 200, 120, 255)
        bg.paste(c, (x, y, x + 8, y + 8))
y = 0
for r in rows:
    bg.alpha_composite(r, (0, y))
    y += r.height
S = 2
bg.resize((bg.width * S, bg.height * S), Image.NEAREST).convert('RGB').save(out)
print('ok', bg.size)
