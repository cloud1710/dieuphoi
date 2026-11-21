p = 'mk_manifest.py'
s = open(p, encoding='utf-8').read()
a = "        'desks': [[410, 790], [625, 790], [300, 640], [760, 640], [900, 930], [250, 930]],\n"
b = a + """        'seats': [
            {'p': [410, 800]},
            {'p': [620, 800]},
            {'p': [1256, 266], 'via': GATE},
            {'p': [1256, 384], 'via': GATE},
            {'p': [1676, 562], 'via': GATE},
            {'p': [1676, 662], 'via': GATE},
            {'p': [1840, 750], 'via': GATE},
        ],
"""
assert s.count(a) == 1
s = s.replace(a, b)
s = s.replace("m = {\n", "GATE = [[250, 920], [800, 930], [1060, 640], [1200, 640]]\nm = {\n", 1)
open(p, 'w', encoding='utf-8').write(s)
