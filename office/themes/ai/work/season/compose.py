# Build the four season layers for the Pixel AI theme.
# Sprites (PixelLab pixflux, work/season/sp/) are placed on a 640x360 art grid -- the same grid as
# bg_day.png, which is bg_day_640.png upscaled 3x nearest -- then the layer is upscaled 3x to 1920x1080.
# Cobwebs and couplet scrolls are drawn in code. Keep-clear boxes (seats, route, wall gap) are checked.
import sys
import numpy as np
from PIL import Image, ImageDraw

W = 'D:/dieuphoi/office/themes/ai/'
SP = W + 'work/season/sp/'
G = (640, 360)

# keep-clear boxes in art pixels (x0, y0, x1, y1): seats with the sitter's body, the floor route, the wall gap
CLEAR = {
    'armchair_l': (112, 240, 162, 288), 'armchair_r': (182, 240, 232, 288),
    'ceo_chair': (155, 118, 190, 165), 'chairman': (302, 44, 332, 72),
    'lounger_1': (392, 60, 446, 146), 'lounger_2': (530, 160, 590, 234), 'bench': (602, 208, 626, 284),
    'route': (0, 300, 420, 314), 'gap': (353, 205, 400, 222),
}

# string-light bulbs read off bg_day_640 (three wires on the terrace)
WIRES = [
    [(396, 156), (420, 164), (453, 171), (485, 175), (517, 177), (547, 174), (577, 172), (604, 180)],
    [(395, 245), (417, 238), (455, 233), (481, 228), (507, 219), (536, 211), (557, 203), (592, 192)],
    [(425, 257), (452, 265), (483, 273), (518, 283), (552, 292)],
]


def mids(wire, skip):
    out = []
    for (x0, y0), (x1, y1) in zip(wire, wire[1:]):
        x, y = (x0 + x1) // 2, (y0 + y1) // 2 - 2  # wire sags between bulbs; hang just under it
        if not any(b[0] - 6 <= x <= b[2] + 6 and b[1] - 30 <= y <= b[3] for b in skip):
            out.append((x, y))
    return out


def sp(name, half=False, mid=None, red=False, flip=False):
    im = Image.open(SP + name + '.png').convert('RGBA')
    im = im.crop(im.getbbox())
    if mid:  # cut the middle out of a long banner/garland so it fits `mid` px
        l = mid // 2
        out = Image.new('RGBA', (mid, im.height))
        out.paste(im.crop((0, 0, l, im.height)), (0, 0))
        out.paste(im.crop((im.width - (mid - l), 0, im.width, im.height)), (l, 0))
        im = out
    if red:  # yellow star lantern -> red one
        a = np.asarray(im).astype(np.float64)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        warm = (r > 120) & (g > 90) & (r >= g)
        a[..., 1] = np.where(warm, g * 0.28, g)
        a[..., 2] = np.where(warm, b * 0.5, b)
        im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')
    if half:  # 2x smaller: box filter, then hard alpha so edges stay pixel-crisp
        im = im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.BOX)
        a = np.asarray(im).copy()
        a[..., 3] = np.where(a[..., 3] >= 110, 255, 0)
        im = Image.fromarray(a, 'RGBA')
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return im


class Layer:
    def __init__(self):
        self.im = Image.new('RGBA', G, (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def put(self, im, x, y, anchor='bc', shadow=False):
        if anchor == 'bc':
            x0, y0 = x - im.width // 2, y - im.height
        elif anchor == 'tc':
            x0, y0 = x - im.width // 2, y
        elif anchor == 'c':
            x0, y0 = x - im.width // 2, y - im.height // 2
        else:
            x0, y0 = x, y
        if shadow:  # soft contact shadow so floor items sit on the floor
            w = int(im.width * 0.8)
            sh = Image.new('RGBA', G, (0, 0, 0, 0))
            ImageDraw.Draw(sh).ellipse((x0 + (im.width - w) // 2, y0 + im.height - 4, x0 + (im.width + w) // 2, y0 + im.height + 2),
                                       fill=(40, 22, 12, 90))
            self.im.alpha_composite(sh)
        self.im.alpha_composite(im, (x0, y0))

    def web(self, ox, oy, r, sx=1):
        # quarter-circle cobweb from a top corner; sx=1 grows right, sx=-1 grows left
        col = (236, 236, 240, 215)
        ang = np.linspace(0.06, np.pi / 2 - 0.06, 5)
        spokes = [(ox + sx * r * np.cos(t), oy + r * np.sin(t)) for t in ang]
        for (x, y) in spokes:
            self.d.line((ox, oy, round(x), round(y)), fill=col)
        for k in (0.35, 0.6, 0.85):
            pts = [(round(ox + sx * r * k * np.cos(t)), round(oy + r * k * np.sin(t) + 1.5 * k)) for t in ang]
            for p, q in zip(pts, pts[1:]):
                self.d.line((p, q), fill=col)

    def spider(self, x, y0, y1):
        self.d.line((x, y0, x, y1), fill=(230, 230, 235, 200))
        self.d.rectangle((x - 1, y1, x + 1, y1 + 2), fill=(24, 18, 28, 255))
        for dx in (-2, 2):
            self.d.point((x + dx, y1), fill=(24, 18, 28, 255))
            self.d.point((x + dx, y1 + 2), fill=(24, 18, 28, 255))

    def scroll(self, x, y, h=28, w=7):
        # couplet-style red scroll with gold border and gold pattern, no writing
        d = self.d
        d.rectangle((x - 1, y - 2, x + w, y - 1), fill=(92, 52, 28, 255))      # top rod
        d.rectangle((x, y, x + w - 1, y + h - 1), fill=(58, 14, 16, 255))      # outline
        d.rectangle((x + 1, y + 1, x + w - 2, y + h - 2), fill=(214, 168, 58, 255))  # gold border
        d.rectangle((x + 2, y + 2, x + w - 3, y + h - 3), fill=(184, 30, 36, 255))   # red field
        for yy in range(y + 5, y + h - 4, 5):  # gold diamonds where the letters would be
            cx = x + w // 2
            d.point((cx, yy - 1), fill=(240, 196, 80, 255))
            d.line((cx - 1, yy, cx + (1 if w > 6 else 0), yy), fill=(240, 196, 80, 255))
            d.point((cx, yy + 1), fill=(240, 196, 80, 255))
        d.rectangle((x - 1, y + h, x + w, y + h + 1), fill=(92, 52, 28, 255))  # bottom rod

    def save(self, name):
        a = np.asarray(self.im)
        bad = {k: int((a[b[1]:b[3], b[0]:b[2], 3] > 0).sum()) for k, b in CLEAR.items()}
        big = self.im.resize((1920, 1080), Image.NEAREST)
        big.save(W + name, optimize=True)
        print(name, big.size, big.mode, 'opaque px %d' % int((np.asarray(big)[..., 3] > 0).sum()),
              'clear-box hits', {k: v for k, v in bad.items() if v})


SKIP = [CLEAR['lounger_2'], CLEAR['bench'], CLEAR['lounger_1']]


def tet():
    L = Layer()
    L.put(sp('tet_banner', mid=70), 125, 29, 'tl')
    L.scroll(285, 8)
    L.scroll(342, 8)
    L.put(sp('tet_quat'), 292, 288, shadow=True)
    L.put(sp('tet_dao'), 100, 172, shadow=True)
    L.put(sp('tet_mai'), 510, 338, shadow=True)
    for x in (480, 534, 588):
        L.put(sp('tet_lantern'), x, 22, 'tc')
    small = sp('tet_lantern', half=True)
    for i, w in enumerate(WIRES[:2]):
        for (x, y) in mids(w, SKIP):
            L.put(small, x, y, 'tc')
    for (x, y) in mids(WIRES[2], SKIP)[:2]:
        L.put(small, x, y, 'tc')
    L.save('season_tet.png')


def christmas():
    L = Layer()
    L.put(sp('xm_garland', mid=70), 125, 29, 'tl')
    L.put(sp('xm_stock'), 140, 70, 'tc')
    L.put(sp('xm_stock', flip=True), 177, 70, 'tc')
    L.put(sp('xm_garland'), 478, 22, 'tl')
    L.put(sp('xm_wreath'), 338, 136, 'c')
    L.put(sp('xm_tree'), 292, 290, shadow=True)
    L.put(sp('xm_gifts'), 255, 296, shadow=True)
    L.put(sp('xm_gifts', half=True, flip=True), 508, 336, shadow=True)
    star = sp('xm_star', half=True)
    for w in WIRES:
        for (x, y) in mids(w, SKIP)[::2]:
            L.put(star, x, y, 'tc')
    L.save('season_christmas.png')


def moon():
    L = Layer()
    L.put(sp('mo_star_yel', red=True), 142, 20, 'tc')
    L.put(sp('mo_star_yel'), 178, 20, 'tc')
    L.put(sp('mo_star_yel'), 492, 22, 'tc')
    L.put(sp('mo_star_yel', red=True), 552, 22, 'tc')
    L.put(sp('mo_carp'), 608, 26, 'tc')
    lan = [sp('mo_lan_red', half=True), sp('mo_lan_yel', half=True)]
    k = 0
    for w in WIRES:
        for (x, y) in mids(w, SKIP):
            L.put(lan[k % 2], x, y, 'tc')
            k += 1
    lotus = sp('mo_lotus', half=True)
    for (x, y) in ((492, 96), (545, 124), (590, 88), (520, 76), (575, 140)):
        L.put(lotus, x, y, 'c')
    L.put(sp('mo_tray'), 507, 352)
    L.put(sp('mo_rabbit'), 292, 288, shadow=True)
    L.save('season_moon.png')


def halloween():
    L = Layer()
    L.web(64, 0, 24, 1)
    L.web(249, 0, 22, -1)
    L.web(256, 0, 16, 1)
    L.web(377, 0, 20, -1)
    L.spider(238, 4, 34)
    L.spider(370, 6, 26)
    bat = sp('hw_bat')
    sbat = sp('hw_bat', half=True)
    L.put(bat, 452, 2, 'tc')
    L.put(sp('hw_bat', flip=True), 566, 0, 'tc')
    L.put(sbat, 520, 12, 'tc')
    L.put(sbat, 612, 10, 'tc')
    L.put(sp('hw_bat', half=True, flip=True), 196, 6, 'tc')
    L.put(sp('hw_jack'), 222, 27)
    L.put(sp('hw_group'), 292, 290, shadow=True)
    L.put(sp('hw_pump', half=True), 262, 294, shadow=True)
    L.put(sp('hw_jack', half=True), 478, 160)
    L.put(sp('hw_pump', half=True), 492, 159)
    L.put(sp('hw_group'), 520, 338, shadow=True)
    L.put(sp('hw_candle', half=True), 486, 336, shadow=True)
    L.save('season_halloween.png')


if __name__ == '__main__':
    which = sys.argv[1:] or ['tet', 'christmas', 'moon', 'halloween']
    for w in which:
        globals()[w]()
