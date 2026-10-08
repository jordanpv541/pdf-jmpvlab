import io
from reportlab.lib.pagesizes import A4, letter
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter
from PIL import Image, ImageDraw

out = str(__import__('pathlib').Path(__file__).resolve().parent / 'fixtures') + '/'

def doc(name, labels, size=A4):
    c = canvas.Canvas(out + name, pagesize=size)
    w, h = size
    for lab in labels:
        c.setFont('Helvetica-Bold', 120)
        c.drawCentredString(w / 2, h / 2, lab)
        c.setFont('Helvetica', 14)
        c.drawString(40, h - 50, 'TOP-LEFT ' + lab)
        c.drawString(40, 40, 'BOTTOM-LEFT ' + lab)
        c.showPage()
    c.save()

doc('a.pdf', ['A1', 'A2', 'A3'])
doc('b.pdf', ['B1', 'B2'], letter)
doc('long.pdf', [f'P{i}' for i in range(1, 13)])
doc('rot-src.pdf', ['R0', 'R90', 'R180', 'R270'])
r = PdfReader(out + 'rot-src.pdf')
w = PdfWriter()
for i, p in enumerate(r.pages):
    p.rotate(i * 90)
    w.add_page(p)
w.write(out + 'rot.pdf')

# Página con contenido al centro y márgenes blancos
c = canvas.Canvas(out + 'margins.pdf', pagesize=A4)
W, H = A4
c.setFillColorRGB(0.2, 0.3, 0.8)
c.rect(150, 250, W - 300, H - 500, fill=1, stroke=0)
c.showPage(); c.save()

# Imágenes: retrato con EXIF orientación 6, PNG con transparencia, paisaje JPG
img = Image.new('RGB', (400, 300), 'white')
d = ImageDraw.Draw(img)
d.rectangle([0, 0, 200, 300], fill=(220, 40, 40))
d.text((250, 140), 'TOP?', fill='black')
exif = Image.Exif(); exif[0x0112] = 6
img.save(out + 'exif6.jpg', exif=exif.tobytes(), quality=90)
land = Image.new('RGB', (800, 400), (30, 120, 60))
land.save(out + 'landscape.jpg', quality=90)
png = Image.new('RGBA', (300, 300), (0, 0, 0, 0))
ImageDraw.Draw(png).ellipse([20, 20, 280, 280], fill=(45, 67, 194, 200))
png.save(out + 'logo.png')
Image.new('RGB', (500, 700), (250, 200, 50)).save(out + 'tall.webp')
open(out + 'not-a-pdf.pdf', 'wb').write(b'hello world')
print('ok')
