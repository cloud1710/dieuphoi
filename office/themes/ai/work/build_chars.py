# Build PNG strips for the Pixel AI office characters from PixelLab character ZIPs.
#   build_chars.py fetch name=<character_id> ...   download + unzip into work/pl/<name>/
#   build_chars.py build name ...                    write <name>_walk_{s,e,n,w}.png, _idle.png, _sit.png
# Cells are CELL x CELL; every animation is shifted as a whole (never per frame) so its
# median foot line sits at FOOT_Y and its mean centre at CELL/2.
# Frame selection per animation can be overridden in work/frames.json: {"ceo": {"idle": [0,1,3]}}
import io
import json
import os
import sys
import urllib.request
import zipfile

import numpy as np
from PIL import Image

W = 'D:/dieuphoi/office/themes/ai/'
PL = W + 'work/pl/'
CELL = 80
FOOT_Y = 77
DIRS = {'s': 'south', 'e': 'east', 'n': 'north', 'w': 'west'}


def fetch(name, cid):
    url = 'https://api.pixellab.ai/mcp/characters/%s/download' % cid
    with urllib.request.urlopen(url, timeout=120) as r:
        data = r.read()
    z = zipfile.ZipFile(io.BytesIO(data))
    out = os.path.join(PL, name)
    os.makedirs(out, exist_ok=True)
    z.extractall(out)
    print('fetched', name, len(z.namelist()), 'files')


def anim_dir(name, anim):
    root = os.path.join(PL, name)
    for state in os.listdir(root):
        p = os.path.join(root, state, 'animations', anim)
        if os.path.isdir(p):
            return p
    raise FileNotFoundError(name + ':' + anim)


def frames(name, anim, d):
    p = os.path.join(anim_dir(name, anim), d)
    fs = sorted(f for f in os.listdir(p) if f.endswith('.png'))
    return [clean(Image.open(os.path.join(p, f)).convert('RGBA')) for f in fs]


def rot_breathe(name):
    # idle from the south rotation (same size as the walk): frame 1 lowers the upper body 1 px
    root = os.path.join(PL, name)
    state = [d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d, 'rotations'))][0]
    im = clean(Image.open(os.path.join(root, state, 'rotations', 'south.png')).convert('RGBA'))
    x0, y0, x1, y1 = bbox(im)
    cut = y0 + int((y1 - y0) * 0.55)
    b = im.copy()
    top = im.crop((0, 0, im.width, cut))
    b.paste(Image.new('RGBA', (im.width, cut + 1), (0, 0, 0, 0)), (0, 0))
    b.paste(im.crop((0, cut, im.width, cut + 1)), (0, cut))
    b.paste(top, (0, 1), top)
    return [im, b]


def clean(im):
    # drop stray debris: keep the largest opaque blob and whatever touches it (within 2 px)
    from scipy import ndimage
    a = np.asarray(im).copy()
    op = a[..., 3] > 0
    lab, n = ndimage.label(op, structure=np.ones((3, 3)))
    if n <= 1:
        return im
    sizes = ndimage.sum(op, lab, range(1, n + 1))
    main = lab == (int(np.argmax(sizes)) + 1)
    near = ndimage.binary_dilation(main, iterations=2)
    keep = np.isin(lab, np.unique(lab[near & op]))
    a[~keep] = 0
    return Image.fromarray(a)


def bbox(im):
    a = np.asarray(im)[..., 3] > 0
    ys, xs = np.nonzero(a)
    return xs.min(), ys.min(), xs.max(), ys.max()


def strip(ims):
    boxes = [bbox(im) for im in ims]
    foot = int(np.median([b[3] for b in boxes]))
    cx = np.mean([(b[0] + b[2]) / 2.0 for b in boxes])
    dx = int(round(CELL / 2.0 - cx))
    dy = FOOT_Y - foot
    out = Image.new('RGBA', (CELL * len(ims), CELL), (0, 0, 0, 0))
    for i, im in enumerate(ims):
        cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
        cell.paste(im, (dx, dy), im)
        out.paste(cell, (i * CELL, 0))
    tall = max(b[3] - b[1] + 1 for b in boxes)
    clipped = any(b[1] + dy < 0 or b[0] + dx < 0 or b[2] + dx >= CELL for b in boxes)
    return out, int(tall), bool(clipped)


def build(name, sel):
    info = {}
    s = dict(sel.get('_default', {}))
    s.update(sel.get(name, {}))
    walk = s.get('walk_anim', 'walk')
    for k, d in DIRS.items():
        ims = frames(name, s.get('walk_anim_' + k, walk), d)
        if 'walk_' + k in s:
            ims = [ims[i] for i in s['walk_' + k]]
        im, tall, clip = strip(ims)
        im.save(W + '%s_walk_%s.png' % (name, k))
        info['walk_' + k] = (len(ims), tall, clip)
    for anim in ('idle', 'sit'):
        src = s.get(anim + '_anim', anim)
        if src == 'rot':
            ims = rot_breathe(name)
        else:
            ims = frames(name, src, 'south')
        if anim in s:
            ims = [ims[i] for i in s[anim]]
        im, tall, clip = strip(ims)
        im.save(W + '%s_%s.png' % (name, anim))
        info[anim] = (len(ims), tall, clip)
    print(name, json.dumps(info))
    os.makedirs(W + 'work/info', exist_ok=True)
    json.dump(info, open(W + 'work/info/%s.json' % name, 'w', encoding='utf-8'))


def main():
    cmd = sys.argv[1]
    if cmd == 'fetch':
        for arg in sys.argv[2:]:
            n, cid = arg.split('=')
            fetch(n, cid)
    else:
        selp = W + 'work/frames.json'
        sel = json.load(open(selp, encoding='utf-8')) if os.path.exists(selp) else {}
        for n in sys.argv[2:]:
            build(n, sel)


if __name__ == '__main__':
    main()
