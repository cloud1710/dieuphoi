# Composite the current manifest (bg + characters at their spots, char_scale) to judge sizes.
import json, sys
from PIL import Image

A = 'D:/dieuphoi/office/themes/ai/'
M = json.load(open(A + 'manifest.json', encoding='utf-8'))
scale = float(sys.argv[2]) if len(sys.argv) > 2 else M.get('char_scale', 1)
bg = Image.open(A + M['bg']['day']).convert('RGBA')


def frame(key, mode):
    c = M['chars'][key]
    im = Image.open(A + c[mode]).convert('RGBA')
    return im.crop((0, 0, c['w'], c['h']))


def put(key, mode, x, y, seat=None):
    back = mode == 'sit' and seat and seat.get('face') == 'n'
    f = frame(key, 'walk_n' if back else mode)
    f = f.resize((round(f.width * scale), round(f.height * scale)), Image.NEAREST)
    top = round(y - f.height)
    if back:
        f = f.crop((0, 0, f.width, max(0, seat['clip'] - top)))
    bg.alpha_composite(f, (round(x - f.width / 2), top))


S = M['spots']
items = [('ceo', 'sit', S['ceo'], None), ('chairman', 'sit', S['chairman'], None)]
for i, d in enumerate(S['desks']):
    pass
for i, s in enumerate(S['seats']):
    items.append(('staff_%d' % ((i % 8) + 1), 'sit', s['p'], s))
items.append(('staff_8', 'idle', S['lift'], None))
for k, m, p, st in sorted(items, key=lambda t: t[2][1]):
    put(k, m, p[0], p[1], st)
bg.convert('RGB').save(sys.argv[1])
print('ok', scale)
