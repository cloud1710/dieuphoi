from PIL import Image, ImageEnhance, ImageDraw, ImageFilter
import os, shutil, random
W = 'D:/dieuphoi/office/themes/ai/'
bk = W + 'work/orig_sit/staff_8_walk_s.bak.png'
if not os.path.exists(bk):
    shutil.copy(W + 'staff_8_walk_s.png', bk)
im = Image.open(bk).convert('RGBA')
fr = [im.crop((i * 80, 0, i * 80 + 80, 80)) for i in range(im.width // 80)]
if len(fr) == 5:
    # 6th frame: mid-stride copy of frame 3 lifted 1px, placed before the last frame so the loop stays smooth
    extra = Image.new('RGBA', (80, 80), (0, 0, 0, 0))
    extra.alpha_composite(fr[3], (0, -1))
    fr = [fr[0], fr[1], fr[2], fr[3], extra, fr[4]]
out = Image.new('RGBA', (80 * len(fr), 80), (0, 0, 0, 0))
for i, f in enumerate(fr):
    out.alpha_composite(f, (i * 80, 0))
out.save(W + 'staff_8_walk_s.png')
print('s8', out.size)

# rain background from night
bg = Image.open(W + 'bg_night.png').convert('RGB')
r = ImageEnhance.Brightness(bg).enhance(0.72)
r = ImageEnhance.Color(r).enhance(0.8)
blue = Image.new('RGB', r.size, (40, 70, 120))
r = Image.blend(r, blue, 0.22).convert('RGBA')
random.seed(7)
lay = Image.new('RGBA', r.size, (0, 0, 0, 0))
d = ImageDraw.Draw(lay)
for _ in range(900):
    x = random.randint(-40, 1960); y = random.randint(-40, 1080); l = random.randint(14, 30)
    d.line([(x, y), (x - l // 3, y + l)], fill=(190, 215, 245, random.randint(70, 140)), width=1)
r.alpha_composite(lay)
# ripples on the lower terrace
lay2 = Image.new('RGBA', r.size, (0, 0, 0, 0))
d = ImageDraw.Draw(lay2)
for _ in range(140):
    x = random.randint(0, 1920); y = random.randint(600, 1070)
    d.ellipse([x - 6, y - 2, x + 6, y + 2], outline=(200, 225, 250, 90))
r.alpha_composite(lay2)
r.convert('RGB').save(W + 'bg_rain.png')
print('rain', r.size)
