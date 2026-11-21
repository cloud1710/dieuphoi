# Build bg_day.png and bg_night.png (1920x1080) from the 640x360 PixelLab scene.
# Night is a colour grade of the same picture, so every spot keeps its coordinates:
# blue moonlight tint, warm light bulbs / lamps kept bright with banded glow, the pool lit.
import numpy as np
from PIL import Image, ImageFilter

W = 'D:/dieuphoi/office/themes/ai/'
src = Image.open(W + 'work/bg_day_640.png').convert('RGB')
a = np.asarray(src).astype(np.float64)
r, g, b = a[..., 0], a[..., 1], a[..., 2]

# warm light sources: bright yellow/orange pixels (bulbs, desk lamps)
lights = (r > 215) & (g > 170) & (b < 175) & (r - b > 70)
# pool water: cyan
pool = (b > 170) & (g > 170) & (r < 140)
yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
sky = pool & (yy < 60) & (xx > 385)
pool = pool & (yy >= 60) & (xx > 440) & (yy < 160)

night = a * np.array([0.30, 0.34, 0.55]) + np.array([6, 8, 22])
# keep the pool glowing under water lights
night[pool] = a[pool] * np.array([0.35, 0.75, 0.85])
night[sky] = a[sky] * np.array([0.12, 0.14, 0.30])

# banded warm glow around the lights
m = Image.fromarray((lights * 255).astype(np.uint8))
glow = np.zeros(lights.shape)
for rad, w in ((3, 1.0), (9, 0.8), (20, 0.5)):
    glow += np.asarray(m.filter(ImageFilter.GaussianBlur(rad))).astype(np.float64) / 255.0 * w
glow = np.clip(glow * 3.5, 0, 1)
glow = np.floor(glow * 4) / 4  # pixel-art bands
night += glow[..., None] * np.array([150, 105, 40])
night[lights] = np.minimum(a[lights] * 1.05 + 10, 255)

night = np.clip(night, 0, 255).astype(np.uint8)
day_big = src.resize((1920, 1080), Image.NEAREST)
night_big = Image.fromarray(night).resize((1920, 1080), Image.NEAREST)
day_big.save(W + 'bg_day.png')
night_big.save(W + 'bg_night.png')
print('lights px', int(lights.sum()), 'pool px', int(pool.sum()))
