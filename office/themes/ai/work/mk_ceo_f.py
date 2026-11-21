# Install the female CEO strips: scale ceo_f_*.png about the foot point so she stands
# taller than the staff (walk_s figure ~76 px), then write them as ceo_*.png.
import numpy as np
from PIL import Image

W = 'D:/dieuphoi/office/themes/ai/'
CELL, FX, FY = 80, 40, 77
S = 77.0 / 73.0  # tallest strip (idle, 73 px) fills the cell up to the foot line
for suf in ('idle', 'sit', 'walk_s', 'walk_e', 'walk_n', 'walk_w'):
    im = Image.open(W + 'ceo_f_%s.png' % suf).convert('RGBA')
    n = im.width // CELL
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    tall = 0
    for f in range(n):
        fr = im.crop((f * CELL, 0, f * CELL + CELL, CELL))
        big = fr.resize((round(CELL * S), round(CELL * S)), Image.NEAREST)
        ox = int(round(FX - FX * S))
        oy = int(round(FY - FY * S))
        cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
        cell.alpha_composite(big.crop((-ox, -oy, -ox + CELL, -oy + CELL)))
        a = np.asarray(cell)[..., 3] > 0
        ys = np.nonzero(a.any(1))[0]
        tall = max(tall, ys.max() - ys.min() + 1)
        assert not a[0].any(), (suf, f, 'clipped at top')
        if suf == 'sit' and f == 1:
            # sit uses one seated pose twice (frames.json); frame 1 breathes: head+torso 1 px lower
            ys0 = np.nonzero(a.any(1))[0]
            cut = int(ys0.min() + (ys0.max() - ys0.min()) * 0.45)
            top = cell.crop((0, 0, CELL, cut))
            cell.paste(Image.new('RGBA', (CELL, cut), (0, 0, 0, 0)), (0, 0))
            cell.paste(top, (0, 1), top)
        out.paste(cell, (f * CELL, 0))
    out.save(W + 'ceo_%s.png' % suf)
    print(suf, out.size, 'tall', int(tall))
