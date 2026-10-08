"""Pruebas en el navegador: prueba paginas. Se corren con tests/e2e/run.py."""
import io, zipfile, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright
from pypdf import PdfReader
from comun import API, BASE, FX, salida
OUT = salida('paginas')

results = []

def check(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('OK  ' if cond else 'FAIL'), name, detail)

def texts(src):
    r = PdfReader(src)
    return [(p.extract_text() or '').replace('\n', ' ') for p in r.pages]

def run_dl(page, name, timeout=60000):
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
    page.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
    page.goto(BASE + path)
    page.wait_for_load_state('networkidle')
    return page, errs

def status(page):
    return page.inner_text('[data-status]')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1100, 'height': 1000}, accept_downloads=True)

    try:  # unir con giro
        page, errs = new_page(ctx, 'unir/')
        page.set_input_files('[data-input]', [str(FX/'a.pdf'), str(FX/'b.pdf')])
        page.wait_for_selector('[data-files] li >> nth=1')
        page.wait_for_selector('[data-files] canvas.file-thumb >> nth=1')
        page.click('[data-files] li:nth-child(1) [data-act="rotate"]')
        f, fn = run_dl(page, 'unir-giro')
        r = PdfReader(f)
        check('unir: archivo 1 girado 90, archivo 2 sin girar', [pg.rotation for pg in r.pages] == [90, 90, 90, 0, 0], str([pg.rotation for pg in r.pages]))
        check('unir: sin errores', not errs, str(errs))
        page.close()
    except Exception:
        traceback.print_exc(); check('unir giro: excepción', False)

    try:  # dividir: páginas en archivos separados
        page, errs = new_page(ctx, 'dividir/')
        page.set_input_files('[data-input]', str(FX/'long.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])')
        page.fill('#ranges', '2, 4')
        page.check('#separate')
        check('dividir: ayuda dice 2 archivos', '2 archivos' in page.inner_text('[data-ranges-help]'), page.inner_text('[data-ranges-help]'))
        f, fn = run_dl(page, 'dividir-sep')
        z = zipfile.ZipFile(f)
        names = sorted(z.namelist())
        check('dividir: ZIP con páginas 2 y 4 aparte', names == ['long-pagina-02.pdf', 'long-pagina-04.pdf'], f'{fn} {names}')
        page.close()
    except Exception:
        traceback.print_exc(); check('dividir sep: excepción', False)

    try:  # extraer páginas
        page, errs = new_page(ctx, 'extraer-paginas/')
        page.set_input_files('[data-input]', str(FX/'long.pdf'))
        page.wait_for_selector('.page-card[data-n="12"]')
        page.click('.page-card[data-n="3"] .page-pick')
        page.click('.page-card[data-n="9"] .page-pick')
        f, fn = run_dl(page, 'extraer')
        t = texts(f)
        check('extraer: páginas 3 y 9', [x.split()[0] for x in t] == ['P3', 'P9'], f'{fn} {[x[:4] for x in t]}')
        check('extraer: sin errores', not errs, str(errs))
        page.close()
    except Exception:
        traceback.print_exc(); check('extraer: excepción', False)

    try:  # eliminar páginas
        page, errs = new_page(ctx, 'eliminar-paginas/')
        page.set_input_files('[data-input]', str(FX/'long.pdf'))
        page.wait_for_selector('.page-card[data-n="12"]')
        page.click('.page-card[data-n="2"] .page-pick')
        page.fill('#remove', '2, 5-7')
        check('eliminar: ayuda', 'Quedarán 8 páginas' in page.inner_text('[data-remove-help]'), page.inner_text('[data-remove-help]'))
        check('eliminar: marca 4 páginas', page.locator('.page-card.is-removed').count() == 4)
        f, fn = run_dl(page, 'eliminar')
        t = [x.split()[0] for x in texts(f)]
        check('eliminar: quedan las correctas', t == ['P1', 'P3', 'P4', 'P8', 'P9', 'P10', 'P11', 'P12'], f'{fn} {t}')
        page.click('[data-adjust]')
        page.fill('#remove', '1-12')
        page.click('[data-run]')
        page.wait_for_timeout(300)
        check('eliminar: no deja quitar todas', 'al menos una' in status(page), status(page))
        check('eliminar: sin errores', not errs, str(errs))
        page.close()
    except Exception:
        traceback.print_exc(); check('eliminar: excepción', False)

    try:  # rotar
        page, errs = new_page(ctx, 'rotar/')
        page.set_input_files('[data-input]', [str(FX/'a.pdf'), str(FX/'rot.pdf')])
        page.wait_for_selector('[data-files] li >> nth=1')
        page.click('[data-run]')
        page.wait_for_timeout(300)
        check('rotar: pide girar algo', 'Gira al menos' in status(page), status(page))
        page.click('[data-files] li:nth-child(1) [data-act="right"]')
        page.click('[data-files] li:nth-child(2) [data-act="left"]')
        f, fn = run_dl(page, 'rotar')
        z = zipfile.ZipFile(f)
        ra = [pg.rotation for pg in PdfReader(io.BytesIO(z.read('a-girado.pdf'))).pages]
        rr = [pg.rotation for pg in PdfReader(io.BytesIO(z.read('rot-girado.pdf'))).pages]
        check('rotar: a.pdf a la derecha', ra == [90, 90, 90], str(ra))
        check('rotar: rot.pdf a la izquierda (respeta giro previo)', rr == [270, 0, 90, 180], str(rr))
        check('rotar: sin errores', not errs, str(errs))
        page.close()
    except Exception:
        traceback.print_exc(); check('rotar: excepción', False)

    try:  # jpg a pdf separado
        page, errs = new_page(ctx, 'jpg-a-pdf/')
        page.set_input_files('[data-input]', [str(FX/'landscape.jpg'), str(FX/'logo.png')])
        page.wait_for_selector('[data-files] li >> nth=1')
        page.check('#separate')
        f, fn = run_dl(page, 'jpg-sep')
        z = zipfile.ZipFile(f)
        check('jpg-a-pdf: un PDF por imagen', sorted(z.namelist()) == ['landscape.pdf', 'logo.pdf'], f'{fn} {z.namelist()}')
        page.close()
    except Exception:
        traceback.print_exc(); check('jpg sep: excepción', False)

    try:  # números
        page, errs = new_page(ctx, 'numeros-de-pagina/')
        page.set_input_files('[data-input]', str(FX/'rot.pdf'))
        page.wait_for_selector('[data-preview] canvas', timeout=10000)
        page.check('input[name="pos"][value="br"]', force=True)
        page.check('input[name="mode"][value="doble"]', force=True)
        page.select_option('#format', 'custom')
        page.fill('#custom', 'Hoja {n} de {p}')
        page.select_option('#font', 'times')
        page.check('#bold')
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT/'numeros-ui.png'), full_page=True)
        f, fn = run_dl(page, 'numeros')
        t = texts(f)
        check('números: texto personalizado', all(f'Hoja {i+1} de 4' in t[i] for i in range(4)), str([x[-14:] for x in t]))
        page.click('[data-adjust]')
        page.fill('#custom', 'sin numero')
        page.click('[data-run]')
        page.wait_for_timeout(300)
        check('números: exige {n}', '{n}' in status(page), status(page))
        page.select_option('#format', 'n')
        page.check('input[name="pos"][value="mc"]', force=True)
        f, fn = run_dl(page, 'numeros-centro')
        check('números: sin errores', not [e for e in errs if 'Vista previa' not in e], str(errs))
        page.close()
    except Exception:
        traceback.print_exc(); check('números: excepción', False)

    try:  # marca de agua: posición, rango, capa debajo
        page, errs = new_page(ctx, 'marca-de-agua/')
        page.set_input_files('[data-input]', str(FX/'long.pdf'))
        page.wait_for_selector('[data-preview] canvas', timeout=10000)
        page.check('input[name="pos"][value="tl"]', force=True)
        page.check('input[name="layer"][value="below"]', force=True)
        page.fill('#wm-from', '2')
        page.fill('#wm-to', '3')
        page.select_option('#wm-font', 'courier')
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT/'marca-ui.png'), full_page=True)
        f, fn = run_dl(page, 'marca')
        r = PdfReader(f)
        def streams(pg):
            c = pg.get_object()['/Contents']
            c = c.get_object() if hasattr(c, 'get_object') else c
            return c if isinstance(c, list) else [c]
        n = [len(streams(pg)) for pg in r.pages]
        check('marca: solo páginas 2 y 3', n[0] == 1 and n[1] > 1 and n[2] > 1 and n[3] == 1, str(n[:5]))
        first = streams(r.pages[1])[0].get_object().get_data()
        check('marca: capa debajo (lo primero que se dibuja es la marca)', b' gs' in first or b'/GS' in first, first[:80])
        check('marca: sin errores', not errs, str(errs))
        page.close()
    except Exception:
        traceback.print_exc(); check('marca: excepción', False)

    try:  # firmar: dibujar
        page, errs = new_page(ctx, 'firmar/')
        page.set_input_files('[data-input]', str(FX/'a.pdf'))
        page.wait_for_selector('[data-stage] canvas', timeout=10000)
        box = page.locator('[data-pad]').bounding_box()
        page.mouse.move(box['x'] + 30, box['y'] + 100)
        page.mouse.down()
        for i in range(1, 30):
            page.mouse.move(box['x'] + 30 + i * 12, box['y'] + 100 + (25 if i % 2 else -25))
        page.mouse.up()
        page.wait_for_selector('[data-overlay]:not([hidden])')
        ob = page.locator('[data-overlay]').bounding_box()
        page.mouse.move(ob['x'] + ob['width'] / 2, ob['y'] + ob['height'] / 2)
        page.mouse.down(); page.mouse.move(ob['x'] - 60, ob['y'] - 120, steps=5); page.mouse.up()
        page.screenshot(path=str(OUT/'firmar-ui.png'), full_page=True)
        f, fn = run_dl(page, 'firmar')
        r = PdfReader(f)
        imgs = [len(pg.images) for pg in r.pages]
        check('firmar: firma solo en la última página', imgs == [0, 0, 1], f'{fn} {imgs}')
        page.click('[data-adjust]')
        page.check('input[name="sigkind"][value="type"]', force=True)
        page.fill('#sig-name', 'Jordan Palacios')
        page.check('input[name="scope"][value="all"]', force=True)
        page.wait_for_timeout(800)
        f, fn = run_dl(page, 'firmar-escrita')
        imgs = [len(pg.images) for pg in PdfReader(f).pages]
        check('firmar: firma escrita en todas las páginas', imgs == [1, 1, 1], str(imgs))
        check('firmar: sin errores', not errs, str(errs))
        page.close()
    except Exception:
        traceback.print_exc(); check('firmar: excepción', False)

    try:  # censurar
        page, errs = new_page(ctx, 'censurar/')
        page.set_input_files('[data-input]', str(FX/'a.pdf'))
        page.wait_for_selector('[data-stage] canvas', timeout=10000)
        page.click('[data-run]')
        page.wait_for_timeout(300)
        check('censurar: pide recuadros', 'recuadro' in status(page), status(page))
        page.evaluate("window.scrollTo(0, 0)")
        page.set_viewport_size({'width': 1100, 'height': 1400})
        sb = page.locator('[data-stage]').bounding_box()
        # tapa la franja central (donde está "A1")
        page.mouse.move(sb['x'] + sb['width'] * 0.2, sb['y'] + sb['height'] * 0.38)
        page.mouse.down(); page.mouse.move(sb['x'] + sb['width'] * 0.8, sb['y'] + sb['height'] * 0.55, steps=6); page.mouse.up()
        check('censurar: un recuadro dibujado', page.locator('.redact-box').count() == 1)
        page.screenshot(path=str(OUT/'censurar-ui.png'), full_page=True)
        f, fn = run_dl(page, 'censurar')
        t = texts(f)
        r = PdfReader(f)
        check('censurar: página 1 sin texto (es imagen)', t[0].strip() == '' and len(r.pages[0].images) == 1, repr(t[0][:40]))
        check('censurar: página 2 intacta', 'A2' in t[1] and len(r.pages[1].images) == 0, t[1][:20])
        check('censurar: sin metadatos del original', not (r.metadata or {}).get('/Author'), str(r.metadata))
        check('censurar: sin errores', not errs, str(errs))
        page.close()
    except Exception:
        traceback.print_exc(); check('censurar: excepción', False)
    b.close()

fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} pruebas bien')
raise SystemExit(1 if fails else 0)
