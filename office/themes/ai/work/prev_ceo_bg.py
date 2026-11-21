# Composite the new CEO (all strips) on bg_day.png next to staff, for a visual check.
#   prev_ceo_bg.py <out.png> [prefix]   prefix default 'ceo' (use 'ceo_old/ceo' for the old set)
import json
import sys

from PIL import Image

W = 'D:/dieuphoi/office/themes/ai/'
m = json.load(open(W + 'manifest.json', encoding='utf-8'))
bg = Image.open(W + 'bg_day.png').convert('RGBA')
SC = m.get('char_scale', 1)
out = sys.argv[1]
pre = sys.argv[2] if len(sys.argv) > 2 else 'ceo'


def put(path, f, p):
    a = Image.open(W + path).convert('RGBA')
    fr = a.crop((f * 80, 0, f * 80 + 80, 80))
    w = int(80 * SC)
    fr = fr.resize((w, w), Image.NEAREST)
    bg.alpha_composite(fr, (int(p[0] - w / 2), int(p[1] - w)))


S = m['spots']
put(pre + '_sit.png', 0, S['ceo'])
put('staff_1_sit.png', 0, S['desks'][0])
put('staff_2_sit.png', 0, S['desks'][1])
put(pre + '_idle.png', 0, (520, 640))
put('staff_3_idle.png', 0, (620, 640))
put('staff_4_idle.png', 0, (420, 640))
x = 160
for k in ('walk_s', 'walk_e', 'walk_n', 'walk_w'):
    put(pre + '_%s.png' % k, 1, (x, 990))
    x += 110
bg.convert('RGB').save(out)
bg.crop((80, 300, 900, 1060)).convert('RGB').save(out.replace('.png', '_crop.png'))
print('ok', out)
