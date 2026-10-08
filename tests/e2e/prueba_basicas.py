"""Pruebas en el navegador: prueba basicas. Se corren con tests/e2e/run.py."""
import io, sys, zipfile, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright
from pypdf import PdfReader
from comun import API, BASE, FX, salida
OUT = salida('basicas')

results = []

def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('OK  ' if cond else 'FAIL'), name, detail)

def texts(path):
    r = PdfReader(path)
    return [ (p.extract_text() or '').replace('\n', ' ') for p in r.pages ]

def run_and_download(page, name, timeout=60000):
    page.click('[data-run]')
    page.wait_for_selector('[data-step="done"]:not([hidden])', timeout=timeout)
    with page.expect_download() as d:
        page.click('[data-download]')
    dl = d.value
    target = OUT / (name + '-' + dl.suggested_filename)
    dl.save_as(target)
    return target, dl.suggested_filename

def new_page(ctx, path):
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    page.goto(BASE + path)
    page.wait_for_load_state('networkidle')
    return page, errs

def status(page):
    return page.inner_text('[data-status]')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1100, 'height': 900}, accept_downloads=True)

    # ---------- unir ----------
    try:
        page, errs = new_page(ctx, 'unir/')
        page.set_input_files('[data-input]', [str(FX/'not-a-pdf.pdf')])
        page.wait_for_timeout(500)
        check('unir: archivo dañado da error claro', 'No se pudo leer' in status(page), status(page))
        page.set_input_files('[data-input]', [str(FX/'a.pdf'), str(FX/'b.pdf')])
        page.wait_for_selector('[data-files] li >> nth=1')
        check('unir: lista con 2 archivos', page.locator('[data-files] li').count() == 2)
        f, fn = run_and_download(page, 'unir')
        t = texts(f)
        page.wait_for_selector('[data-result] canvas >> nth=4', timeout=10000)
        page.screenshot(path=str(OUT/'done-ui.png'), full_page=True)
        check('unir: vista del resultado con 5 páginas', page.locator('[data-result] canvas').count() == 5)
        check('unir: 5 páginas en orden A,B', len(t) == 5 and 'A1' in t[0] and 'B2' in t[4], f'{fn} {[x[:12] for x in t]}')
        page.click('[data-adjust]')
        page.click('[data-files] li:nth-child(2) [data-act="up"]')
        f, fn = run_and_download(page, 'unir2')
        t = texts(f)
        check('unir: mover B arriba', 'B1' in t[0] and 'A3' in t[4], str([x[:12] for x in t]))
        check('unir: sin errores de consola', not errs, str(errs))
        page.close()
    except Exception:
        traceback.print_exc(); check('unir: excepción', False)

    # ---------- dividir ----------
    try:
        page, errs = new_page(ctx, 'dividir/')
        page.set_input_files('[data-input]', str(FX/'long.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])')
        page.click('.page-card[data-n="2"] .page-pick')
        page.click('.page-card[data-n="3"] .page-pick')
        page.click('.page-card[data-n="7"] .page-pick')
        check('dividir: tocar páginas llena el campo', page.input_value('#ranges') == '2-3, 7', page.input_value('#ranges'))
        page.fill('#ranges', '2-4, 7')
        page.wait_for_timeout(100)
        check('dividir: campo marca páginas', page.locator('.page-card.is-selected').count() == 4)
        check('dividir: ayuda cuenta páginas', '4 páginas' in page.inner_text('[data-ranges-help]'), page.inner_text('[data-ranges-help]'))
        f, fn = run_and_download(page, 'dividir')
        t = texts(f)
        check('dividir: extraer 2-4,7', [x.split()[0] for x in t] == ['P2', 'P3', 'P4', 'P7'], f'{fn} {[x[:6] for x in t]}')
        page.click('[data-adjust]')
        page.check('input[name="mode"][value="rangos"]', force=True)
        page.fill('#ranges', '1-3, 4-6, 7-')
        f, fn = run_and_download(page, 'dividir-rangos')
        z = zipfile.ZipFile(f)
        names = sorted(z.namelist())
        counts = [len(PdfReader(io.BytesIO(z.read(n))).pages) for n in names]
        check('dividir: rangos → ZIP con 3 archivos', counts == [3, 3, 6], f'{fn} {names} {counts}')
        page.click('[data-adjust]')
        page.check('input[name="mode"][value="cada"]', force=True)
        page.fill('#every', '5')
        check('dividir: ayuda cada 5', '3 archivos' in page.inner_text('[data-every-help]'))
        f, fn = run_and_download(page, 'dividir-cada')
        z = zipfile.ZipFile(f)
        counts = [len(PdfReader(io.BytesIO(z.read(n))).pages) for n in sorted(z.namelist())]
        check('dividir: cada 5 → 5,5,2', counts == [5, 5, 2], str(counts))
        page.click('[data-adjust]')
        page.check('input[name="mode"][value="extraer"]', force=True)
        page.fill('#ranges', '3-20')
        page.click('[data-run]')
        page.wait_for_timeout(300)
        check('dividir: rango fuera de límite da error', '12 páginas' in status(page), status(page))
        page.fill('#ranges', '1')
        run_and_download(page, 'dividir-1')
        page.click('[data-restart]')
        page.set_input_files('[data-input]', str(FX/'a.pdf'))
        page.wait_for_selector('.page-card[data-n="3"]')
        check('dividir: empezar con otro archivo', page.locator('.page-card').count() == 3 and 'a.pdf' in page.inner_text('[data-summary]'))
        check('dividir: sin errores de consola', not errs, str(errs))
        page.close()
    except Exception:
        traceback.print_exc(); check('dividir: excepción', False)

    # ---------- organizar ----------
    try:
        page, errs = new_page(ctx, 'organizar/')
        page.set_input_files('[data-input]', str(FX/'a.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])')
        page.click('.page-card[data-index="0"] [data-act="rotr"]')
        page.click('.page-card[data-index="1"] [data-act="remove"]')
        page.click('.page-card[data-index="2"] [data-act="prev"]')
        page.click('.page-card[data-index="2"] [data-act="prev"]')
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT/'organizar-ui.png'))
        f, fn = run_and_download(page, 'organizar')
        r = PdfReader(f)
        t = texts(f)
        check('organizar: orden A3, A1 y A2 quitada', len(t) == 2 and 'A3' in t[0] and 'A1' in t[1], str([x[:15] for x in t]))
        check('organizar: A1 girada 90', r.pages[1].rotation == 90 and r.pages[0].rotation == 0, f'{r.pages[0].rotation} {r.pages[1].rotation}')
        check('organizar: sin errores de consola', not errs, str(errs))
        page.close()
    except Exception:
        traceback.print_exc(); check('organizar: excepción', False)

    # ---------- jpg-a-pdf ----------
    try:
        page, errs = new_page(ctx, 'jpg-a-pdf/')
        page.set_input_files('[data-input]', [str(FX/'exif6.jpg'), str(FX/'landscape.jpg'), str(FX/'logo.png'), str(FX/'tall.webp')])
        page.wait_for_selector('[data-files] li >> nth=3')
        page.check('input[name="size"][value="a4"]', force=True)
        f, fn = run_and_download(page, 'jpg')
        r = PdfReader(f)
        sizes = [(round(float(pg.mediabox.width)), round(float(pg.mediabox.height))) for pg in r.pages]
        check('jpg-a-pdf: 4 páginas, A4 vertical/horizontal según imagen', sizes == [(595, 842), (842, 595), (595, 842), (595, 842)], f'{fn} {sizes}')
        check('jpg-a-pdf: sin errores de consola', not errs, str(errs))
        page.click('[data-adjust]')
        page.check('input[name="size"][value="imagen"]', force=True)
        page.check('input[name="margin"][value="20"]', force=True)
        f, fn = run_and_download(page, 'jpg-imagen')
        r = PdfReader(f)
        sizes = [(round(float(pg.mediabox.width)), round(float(pg.mediabox.height))) for pg in r.pages]
        check('jpg-a-pdf: tamaño igual a la imagen (+margen)', sizes[0] == (265, 340) and sizes[1] == (640, 340), str(sizes))
        page.close()
    except Exception:
        traceback.print_exc(); check('jpg: excepción', False)

    # ---------- pdf-a-jpg ----------
    try:
        page, errs = new_page(ctx, 'pdf-a-jpg/')
        page.set_input_files('[data-input]', str(FX/'a.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])')
        f, fn = run_and_download(page, 'pdf2jpg')
        z = zipfile.ZipFile(f)
        names = sorted(z.namelist())
        check('pdf-a-jpg: ZIP con 3 JPG', names == ['a-pagina-1.jpg', 'a-pagina-2.jpg', 'a-pagina-3.jpg'], f'{fn} {names}')
        from PIL import Image
        im = Image.open(io.BytesIO(z.read(names[0])))
        check('pdf-a-jpg: 150 ppp → 1240 px de ancho', abs(im.width - 1240) <= 2, f'{im.size}')
        page.click('[data-adjust]')
        page.check('input[name="which"][value="some"]', force=True)
        page.fill('#ranges', '2')
        page.check('input[name="format"][value="png"]', force=True)
        f, fn = run_and_download(page, 'pdf2png')
        check('pdf-a-jpg: una página PNG', fn == 'a-pagina-2.png' and Image.open(f).format == 'PNG', fn)
        page.click('[data-restart]')
        page.set_input_files('[data-input]', str(FX/'b.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])')
        f, fn = run_and_download(page, 'pdf2png-b')
        check('pdf-a-jpg: segundo archivo tras reiniciar', fn == 'b-pagina-2.png', fn)
        check('pdf-a-jpg: sin errores de consola', not errs, str(errs))
        page.close()
    except Exception:
        traceback.print_exc(); check('pdf2jpg: excepción', False)

    # ---------- números ----------
    try:
        page, errs = new_page(ctx, 'numeros-de-pagina/')
        page.set_input_files('[data-input]', str(FX/'rot.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])')
        page.select_option('#format', 'pagina-de')
        page.wait_for_selector('[data-preview] canvas', timeout=10000)
        page.screenshot(path=str(OUT/'numeros-ui.png'), full_page=True)
        f, fn = run_and_download(page, 'numeros')
        t = texts(f)
        check('números: texto Página n de 4', all(f'Página {i+1} de 4' in t[i] for i in range(4)), str([x[-20:] for x in t]))
        check('números: sin errores de consola', not errs, str(errs))
        page.click('[data-adjust]')
        page.check('input[name="pos"][value="tr"]', force=True)
        page.fill('#from', '2')
        page.fill('#start', '1')
        f, fn = run_and_download(page, 'numeros-tr')
        t = texts(f)
        check('números: desde la página 2', 'Página' not in t[0] and 'Página 1 de 3' in t[1], str([x[-20:] for x in t]))
        page.close()
    except Exception:
        traceback.print_exc(); check('números: excepción', False)

    # ---------- marca de agua ----------
    try:
        page, errs = new_page(ctx, 'marca-de-agua/')
        page.set_input_files('[data-input]', str(FX/'rot.pdf'))
        page.wait_for_selector('[data-preview] canvas', timeout=10000)
        page.screenshot(path=str(OUT/'marca-ui.png'), full_page=True)
        f, fn = run_and_download(page, 'marca')
        check('marca: PDF con 4 páginas', len(PdfReader(f).pages) == 4, fn)
        page.click('[data-adjust]')
        page.fill('#wm-text', 'Hola 😀')
        page.wait_for_timeout(800)
        check('marca: emoji da error claro', 'caracteres' in status(page), status(page))
        page.fill('#wm-text', 'Copia')
        page.check('input[name="layout"][value="tile"]', force=True)
        page.wait_for_timeout(800)
        f, fn = run_and_download(page, 'marca-mosaico')
        page.click('[data-adjust]')
        page.check('input[name="kind"][value="image"]', force=True)
        page.set_input_files('[data-wm-input]', str(FX/'logo.png'))
        page.check('input[name="layout"][value="single"]', force=True)
        page.wait_for_timeout(800)
        f, fn = run_and_download(page, 'marca-imagen')
        check('marca: con imagen', len(PdfReader(f).pages) == 4, fn)
        check('marca: sin errores de consola', not [e for e in errs if 'caracteres' not in e], str(errs))
        page.close()
    except Exception:
        traceback.print_exc(); check('marca: excepción', False)

    # ---------- recortar ----------
    try:
        page, errs = new_page(ctx, 'recortar/')
        page.set_input_files('[data-input]', str(FX/'margins.pdf'))
        page.wait_for_selector('[data-crop-preview] canvas', timeout=10000)
        page.click('[data-auto]')
        page.wait_for_timeout(500)
        vals = {s: page.input_value(f'#crop-{s}') for s in ['top', 'bottom', 'left', 'right']}
        # contenido: x 150..445 pt, y 250..592 pt en A4 (595x842) → márgenes ~ 52.9 mm lados, 88.2 mm arriba/abajo, menos 2 mm
        check('recortar: bordes blancos detectados', vals['left'] in ('50', '51') and vals['top'] in ('86', '85'), str(vals))
        page.screenshot(path=str(OUT/'recortar-ui.png'), full_page=True)
        f, fn = run_and_download(page, 'recortar')
        cb = PdfReader(f).pages[0].cropbox
        check('recortar: CropBox aplicado', 140 < float(cb.left) < 150 and 440 < float(cb.right) < 455, f'{cb}')
        page.close()
        page, errs = new_page(ctx, 'recortar/')
        page.set_input_files('[data-input]', str(FX/'rot.pdf'))
        page.wait_for_selector('[data-crop-preview] canvas', timeout=10000)
        page.fill('#crop-top', '25')
        f, fn = run_and_download(page, 'recortar-rot')
        check('recortar: sin errores de consola', not errs, str(errs))
        page.close()
    except Exception:
        traceback.print_exc(); check('recortar: excepción', False)

    b.close()

fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} pruebas bien')
raise SystemExit(1 if fails else 0)
