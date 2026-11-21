import json
from PIL import Image
W = 'D:/dieuphoi/office/themes/ai/'
names = ['ceo', 'chairman'] + ['staff_%d' % i for i in range(1, 9)]
chars = {}
for n in names:
    c = {'w': 80, 'h': 80, 'frames': 6, 'foot': [40, 77]}
    fr = {}
    for p in ['idle', 'sit', 'walk_s', 'walk_e', 'walk_n', 'walk_w']:
        f = '%s_%s.png' % (n, p)
        im = Image.open(W + f)
        assert im.height == 80 and im.width % 80 == 0, f
        c[p] = f
        fr[p] = im.width // 80
    c['frames_by'] = fr
    chars[n] = c
m = {
    'size': [1920, 1080],
    'char_scale': 1,
    'spots': {
        'ceo': [520, 462], 'guest': [410, 790], 'lift': [105, 830], 'chairman': [950, 208],
        'desks': [[410, 790], [625, 790], [300, 640], [760, 640], [900, 930], [250, 930]],
    },
    'paths': {
        'lift_to_ceo_room': [[105, 830], [150, 900], [520, 900]],
        'lift_to_terrace': [[105, 830], [150, 960], [1000, 960], [1250, 700]],
        'to_chairman': [[520, 900], [900, 560], [950, 330], [950, 208]],
    },
    'anchor': 'sprite feet (bottom centre of the frame, foot line y=77 of 80) sits on the spot',
    'bg': {'day': 'bg_day.png', 'night': 'bg_night.png', 'rain': 'bg_rain.png'},
    'chars': chars,
}
json.dump(m, open(W + 'manifest.json', 'w', encoding='utf-8'), indent=1)
print('ok')
