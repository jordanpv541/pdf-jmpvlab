"""Genera los íconos PNG y la imagen para redes sociales con Chromium (Playwright).

Uso: python3 tools/make_icons.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
OUT = PUBLIC / "assets" / "icons"
FONTS = (PUBLIC / "assets" / "fonts").as_uri()

LOGO = """<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M8 3h11l7 7v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#fff" stroke="#1f2328" stroke-width="2" stroke-linejoin="round"/><path d="M19 3v5a2 2 0 0 0 2 2h5z" fill="#1d8fc7" stroke="#1f2328" stroke-width="2" stroke-linejoin="round"/><path d="M10.5 17h11M10.5 22h7" stroke="#1d8fc7" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>"""


def icon_html(size, logo_ratio, radius_ratio, bg="#f4f5f7"):
    logo = round(size * logo_ratio)
    radius = round(size * radius_ratio)
    return f"""<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:{size}px;height:{size}px;background:{bg};border-radius:{radius}px;display:grid;place-items:center">
<div style="width:{logo}px;height:{logo}px">{LOGO}</div></div></body></html>"""


SHEETS = ["Unir PDF", "Comprimir PDF", "PDF a Word", "Firmar PDF"]

OG = f"""<!doctype html><html><head><style>
@font-face{{font-family:B;font-weight:200 800;src:url({FONTS}/bricolage-grotesque-latin.woff2)}}
@font-face{{font-family:F;font-weight:300 900;src:url({FONTS}/figtree-latin.woff2)}}
body{{margin:0}}
.og{{width:1200px;height:630px;box-sizing:border-box;padding:68px 80px;background:#f4f5f7;color:#1f2328;font-family:F;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}}
.mark{{display:flex;align-items:center;gap:16px;font-family:B;font-weight:700;font-size:38px;letter-spacing:-0.015em}}
.mark svg{{width:56px;height:56px}}
h1{{margin:0;font-family:B;font-size:84px;line-height:1.0;letter-spacing:-0.035em;max-width:13ch;font-weight:720}}
.sheets{{display:flex;gap:18px;margin:0 -40px -110px 0}}
.sheet{{--f:30px;position:relative;width:250px;height:150px;padding:26px 24px;box-sizing:border-box;background:#fff;border-radius:18px 0 18px 18px;clip-path:polygon(0 0,calc(100% - var(--f)) 0,100% var(--f),100% 100%,0 100%);font-family:B;font-weight:650;font-size:30px;filter:drop-shadow(0 6px 14px rgba(31,35,40,.08))}}
.sheet::after{{content:"";position:absolute;top:0;right:0;width:var(--f);height:var(--f);background:#e6e9ed;border-bottom-left-radius:6px}}
.sheet i{{display:block;width:44px;height:6px;border-radius:3px;background:#1d8fc7;margin-bottom:22px}}
</style></head><body><div class="og">
<div class="mark">{LOGO}<span>PDF jmpvlab</span></div>
<h1>Tus PDF, sin anuncios y sin cuentas.</h1>
<div class="sheets">{''.join(f'<div class="sheet"><i></i>{name}</div>' for name in SHEETS)}</div>
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
