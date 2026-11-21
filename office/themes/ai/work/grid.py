# Draw a coordinate grid over the 640x360 scene (scaled 2x) to read spot positions.
import sys
from PIL import Image, ImageDraw

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
S = 2
im = im.resize((im.width * S, im.height * S), Image.NEAREST)
d = ImageDraw.Draw(im)
for x in range(0, 640, 20):
    c = (255, 0, 0) if x % 100 == 0 else (255, 255, 0)
    d.line([(x * S, 0), (x * S, im.height)], fill=c, width=1)
    if x % 40 == 0:
        d.text((x * S + 2, 2), str(x), fill=(255, 0, 0))
for y in range(0, 360, 20):
    c = (255, 0, 0) if y % 100 == 0 else (255, 255, 0)
    d.line([(0, y * S), (im.width, y * S)], fill=c, width=1)
    if y % 40 == 0:
        d.text((2, y * S + 2), str(y), fill=(255, 0, 0))
im.save(dst)
