from PIL import Image
W = 'D:/dieuphoi/office/themes/ai/'
names = ['ceo', 'chairman'] + ['staff_%d' % i for i in range(1, 9)]
S = 3
sheet = Image.new('RGBA', (160 * S * 5, 80 * S * 2), (150, 150, 150, 255))
for i, n in enumerate(names):
    im = Image.open(W + n + '_sit.png').convert('RGBA').resize((160 * S, 80 * S), Image.NEAREST)
    sheet.alpha_composite(im, ((i % 5) * 160 * S, (i // 5) * 80 * S))
sheet.save(W + 'work/sit_sheet.png')
