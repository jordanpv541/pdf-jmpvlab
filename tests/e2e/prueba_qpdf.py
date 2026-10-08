"""Pruebas en el navegador: prueba qpdf. Se corren con tests/e2e/run.py."""
import io, zipfile, traceback, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
from pypdf import PdfReader
from comun import API, BASE, FX, salida
OUT = salida('qpdf')

results = []

def check(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('OK  ' if cond else 'FAIL'), name, detail)

def texts(src):
    return [(p.extract_text() or '').replace('\n', ' ') for p in PdfReader(src).pages]

def run_dl(page, name, timeout=90000):
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

def status(page): return page.inner_text('[data-status]')
def note(page): return page.inner_text('[data-done-note]')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1100, 'height': 1000}, accept_downloads=True)

    try:
        page, errs = new_page(ctx, 'unir/')
        page.set_input_files('[data-input]', [str(FX/'a.pdf'), str(FX/'b.pdf')])
        page.wait_for_selector('[data-files] li >> nth=1')
        page.check('#interleave'); page.check('#reverse')
        f, fn = run_dl(page, 'intercalar')
        t = [x.split()[0] for x in texts(f)]
        check('unir: intercalado con el segundo al revés', t == ['A1', 'B2', 'A2', 'B1', 'A3'], str(t))
        check('unir: sin errores', not errs, str(errs))
        page.close()
    except Exception: traceback.print_exc(); check('intercalar: excepción', False)

    try:
        page, errs = new_page(ctx, 'pdf-a-jpg/')
        page.set_input_files('[data-input]', str(FX/'heavy.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])')
        page.check('input[name="what"][value="images"]', force=True)
        check('pdf-a-jpg: botón cambia', 'Sacar imágenes' in page.inner_text('[data-run]'), page.inner_text('[data-run]'))
        f, fn = run_dl(page, 'imagenes')
        z = zipfile.ZipFile(f)
        from PIL import Image
        sizes = [Image.open(io.BytesIO(z.read(n))).size for n in sorted(z.namelist())]
        check('pdf-a-jpg: saca 2 imágenes a tamaño original', sizes == [(2400, 1800), (2400, 1800)], f'{fn} {sizes}')
        page.click('[data-adjust]')
        page.close()
        page, errs2 = new_page(ctx, 'pdf-a-jpg/')
        page.set_input_files('[data-input]', str(FX/'a.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])')
        page.check('input[name="what"][value="images"]', force=True)
        page.click('[data-run]'); page.wait_for_timeout(1500)
        check('pdf-a-jpg: aviso si no hay imágenes', 'No encontramos imágenes' in status(page), status(page))
        check('pdf-a-jpg: sin errores', not errs and not errs2, str(errs + errs2))
        page.close()
    except Exception: traceback.print_exc(); check('imagenes: excepción', False)

    try:
        page, errs = new_page(ctx, 'escanear/')
        page.set_input_files('[data-input]', str(FX/'hoja.jpg'))
        page.wait_for_selector('[data-files] li')
        page.set_input_files('[data-input-gallery]', [str(FX/'landscape.jpg')])
        page.wait_for_selector('[data-files] li >> nth=1')
        page.wait_for_selector('[data-preview] canvas', timeout=10000)
        page.screenshot(path=str(OUT/'escanear-ui.png'), full_page=True)
        page.click('[data-files] li:nth-child(2) [data-act="rotr"]')
        page.check('input[name="size"][value="a4"]', force=True)
        f, fn = run_dl(page, 'escanear')
        r = PdfReader(f)
        sizes = [(round(float(pg.mediabox.width)), round(float(pg.mediabox.height))) for pg in r.pages]
        check('escanear: 2 hojas A4 (la girada queda vertical)', sizes == [(595, 842), (595, 842)], f'{fn} {sizes}')
        check('escanear: sin errores', not errs, str(errs))
        page.close()
    except Exception: traceback.print_exc(); check('escanear: excepción', False)

    try:
        page, errs = new_page(ctx, 'comprimir/')
        page.set_input_files('[data-input]', str(FX/'heavy.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])', timeout=20000)
        f, fn = run_dl(page, 'comprimir')
        size = f.stat().st_size
        check('comprimir: pesa mucho menos', size < 2934476 * 0.4, f'{fn} {size} — {note(page)}')
        t = texts(f)
        check('comprimir: el texto sigue', 'Texto que debe seguir' in t[0], t[0][:40])
        r = subprocess.run(['qpdf', '--check', str(f)], capture_output=True, text=True)
        check('comprimir: PDF válido (qpdf --check)', r.returncode == 0, r.stdout[-120:] + r.stderr[-120:])
        page.close()
        page, errs2 = new_page(ctx, 'comprimir/')
        page.set_input_files('[data-input]', str(FX/'a.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])', timeout=20000)
        f, fn = run_dl(page, 'comprimir-texto')
        check('comprimir: PDF de solo texto también da un resultado válido', bool(note(page)), note(page))
        check('comprimir: sin errores', not errs and not errs2, str(errs + errs2))
        page.close()
    except Exception: traceback.print_exc(); check('comprimir: excepción', False)

    try:
        page, errs = new_page(ctx, 'proteger/')
        page.set_input_files('[data-input]', str(FX/'a.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])', timeout=20000)
        page.fill('#pw', 'clave-secreta'); page.fill('#pw2', 'otra')
        page.click('[data-run]'); page.wait_for_timeout(300)
        check('proteger: contraseñas distintas', 'no son iguales' in status(page), status(page))
        page.fill('#pw2', 'clave-secreta')
        page.uncheck('#allow-print')
        f, fn = run_dl(page, 'proteger')
        r = PdfReader(f)
        check('proteger: cifrado y abre con la clave', r.is_encrypted and r.decrypt('clave-secreta') > 0 and 'A1' in r.pages[0].extract_text(), fn)
        out = subprocess.run(['qpdf', '--show-encryption', '--password=clave-secreta', str(f)], capture_output=True, text=True).stdout
        check('proteger: AES 256 y sin imprimir', 'R = 6' in out and 'print high resolution: not allowed' in out, out[:200].replace('\n', ' | '))
        page.close()
        page, errs2 = new_page(ctx, 'proteger/')
        page.set_input_files('[data-input]', str(FX/'user.pdf'))
        page.wait_for_timeout(2500)
        check('proteger: avisa si ya tiene clave', 'ya está protegido' in status(page), status(page))
        check('proteger: sin errores', not errs and not errs2, str(errs + errs2))
        page.close()
    except Exception: traceback.print_exc(); check('proteger: excepción', False)

    try:
        page, errs = new_page(ctx, 'desbloquear/')
        page.set_input_files('[data-input]', str(FX/'user.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])', timeout=20000)
        check('desbloquear: pide clave', not page.locator('[data-needs-pw]').is_hidden(), page.inner_text('[data-lock-info]'))
        page.fill('#pw', 'mala')
        page.click('[data-run]'); page.wait_for_timeout(1500)
        check('desbloquear: clave incorrecta', 'no es correcta' in status(page), status(page))
        page.fill('#pw', 'abc123')
        f, fn = run_dl(page, 'desbloquear')
        r = PdfReader(f)
        check('desbloquear: sin cifrado', not r.is_encrypted and 'A1' in r.pages[0].extract_text(), fn)
        page.close()
        page, errs2 = new_page(ctx, 'desbloquear/')
        page.set_input_files('[data-input]', str(FX/'owner.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])', timeout=20000)
        check('desbloquear: restricciones sin clave', page.locator('[data-needs-pw]').is_hidden() and 'restricciones' in page.inner_text('[data-lock-info]'), page.inner_text('[data-lock-info]'))
        f, fn = run_dl(page, 'desbloquear-owner')
        check('desbloquear: quita restricciones', not PdfReader(f).is_encrypted, fn)
        page.close()
        page, errs3 = new_page(ctx, 'desbloquear/')
        page.set_input_files('[data-input]', str(FX/'a.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])', timeout=20000)
        check('desbloquear: avisa si no tiene nada', 'no tiene contraseña' in page.inner_text('[data-lock-info]') and page.locator('[data-run]').is_hidden())
        check('desbloquear: sin errores', not errs and not errs2 and not errs3, str(errs + errs2 + errs3))
        page.close()
    except Exception: traceback.print_exc(); check('desbloquear: excepción', False)

    try:
        page, errs = new_page(ctx, 'reparar/')
        page.set_input_files('[data-input]', str(FX/'broken.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])', timeout=20000)
        f, fn = run_dl(page, 'reparar')
        r = subprocess.run(['qpdf', '--check', str(f)], capture_output=True, text=True)
        check('reparar: queda sin errores', r.returncode == 0, (r.stdout + r.stderr)[-150:])
        check('reparar: conserva las 12 páginas y el texto', len(PdfReader(f).pages) == 12 and 'P12' in texts(f)[11], note(page))
        page.click('[data-restart]')
        page.set_input_files('[data-input]', str(FX/'broken3.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])', timeout=20000)
        f, fn = run_dl(page, 'reparar-cortado')
        check('reparar: archivo cortado (sin índice)', len(PdfReader(f).pages) == 12, note(page))
        check('reparar: sin errores', not errs, str(errs))
        page.close()
        page, errs = new_page(ctx, 'reparar/')
        page.set_input_files('[data-input]', str(FX/'not-a-pdf.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])', timeout=20000)
        page.click('[data-run]'); page.wait_for_timeout(2000)
        check('reparar: archivo que no es PDF', 'No se pudo reparar' in status(page), status(page))
        page.close()
    except Exception: traceback.print_exc(); check('reparar: excepción', False)
    b.close()

fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} pruebas bien')
raise SystemExit(1 if fails else 0)
