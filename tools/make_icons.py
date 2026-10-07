"""Genera los íconos PNG y la imagen para redes sociales con Chromium (Playwright).

Uso: python3 tools/make_icons.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
OUT = PUBLIC / "assets" / "icons"
FONTS = (PUBLIC / "assets" / "fonts").as_uri()

LOGO = """<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M8 3h11l7 7v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#fff" stroke="#1a2233" stroke-width="2" stroke-linejoin="round"/><path d="M19 3v5a2 2 0 0 0 2 2h5z" fill="#eacd8c" stroke="#1a2233" stroke-width="2" stroke-linejoin="round"/><path d="M10.5 17h11M10.5 22h7" stroke="#2d43c2" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>"""


def icon_html(size, logo_ratio, radius_ratio, bg="#f4f6fa"):
    logo = round(size * logo_ratio)
    radius = round(size * radius_ratio)
    return f"""<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:{size}px;height:{size}px;background:{bg};border-radius:{radius}px;display:grid;place-items:center">
<div style="width:{logo}px;height:{logo}px">{LOGO}</div></div></body></html>"""


OG = f"""<!doctype html><html><head><style>
@font-face{{font-family:A;font-weight:800;src:url({FONTS}/atkinson-hyperlegible-next-latin-800-normal.woff2)}}
@font-face{{font-family:A;font-weight:800;src:url({FONTS}/atkinson-hyperlegible-next-latin-ext-800-normal.woff2);unicode-range:U+0100-02BA}}
@font-face{{font-family:A;font-weight:400;src:url({FONTS}/atkinson-hyperlegible-next-latin-400-normal.woff2)}}
body{{margin:0}}
.og{{width:1200px;height:630px;box-sizing:border-box;padding:72px 80px;background:#f4f6fa;color:#1a2233;font-family:A;display:flex;flex-direction:column;justify-content:space-between}}
.mark{{display:flex;align-items:center;gap:16px;font-weight:800;font-size:38px}}
.mark svg{{width:58px;height:58px}}
h1{{margin:0;font-size:76px;line-height:1.05;letter-spacing:-0.025em;max-width:15ch;font-weight:800}}
.tabs{{display:flex;gap:14px}}
.tab{{background:#eacd8c;border:2px solid #c49b4a;border-bottom:0;border-radius:12px 16px 0 0;padding:10px 24px 8px;font-weight:800;font-size:28px;color:#382c10}}
.shelf{{border-top:2px solid #c49b4a;background:#f4e4bb;height:18px;margin:0 -80px -72px;padding:0}}
</style></head><body><div class="og">
<div class="mark">{LOGO}<span>PDF jmpvlab</span></div>
<h1>Arregla tus PDF sin subirlos a ningún lado.</h1>
<div><div class="tabs"><span class="tab">Unir PDF</span><span class="tab">Dividir PDF</span><span class="tab">JPG a PDF</span><span class="tab">Marca de agua</span></div><div class="shelf"></div></div>
</div></body></html>"""

JOBS = [
    ("icon-192.png", 192, icon_html(192, 0.62, 0.22)),
    ("icon-512.png", 512, icon_html(512, 0.62, 0.22)),
    ("maskable-512.png", 512, icon_html(512, 0.5, 0)),
    ("apple-touch-icon.png", 180, icon_html(180, 0.64, 0)),
    ("favicon-32.png", 32, icon_html(32, 1.0, 0, bg="transparent")),
]

with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, size, html in JOBS:
        page = browser.new_page(viewport={"width": size, "height": size}, device_scale_factor=1)
        page.set_content(html)
        page.screenshot(path=str(OUT / name), omit_background=True, clip={"x": 0, "y": 0, "width": size, "height": size})
        page.close()
    page = browser.new_page(viewport={"width": 1200, "height": 630})
    page.goto("about:blank")
    tmp = OUT / "_og.html"
    tmp.write_text(OG, encoding="utf-8")
    page.goto(tmp.as_uri())
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / "og-image.png"), clip={"x": 0, "y": 0, "width": 1200, "height": 630})
    tmp.unlink()
    browser.close()
print("Íconos listos en", OUT)
