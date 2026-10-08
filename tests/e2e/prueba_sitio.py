"""Pruebas en el navegador: lo que se arregló en la auditoría del 8 de octubre de 2026.

Herramientas «Muy pronto», CSP y datos estructurados, teclado en Censurar, contraseñas
con «@», Reparar con restricciones, aviso de firma digital, ZIP por partes, accesibilidad,
modo sin conexión y aviso de versión nueva. Se corren con tests/e2e/run.py.
"""
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.request
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright

from comun import BASE, FX, salida

OUT = salida('sitio')
RAIZ = Path(__file__).resolve().parent.parent.parent
res = []


def check(n, c, d=''):
    res.append(bool(c))
    print(('OK  ' if c else 'FAIL'), n, d)


def esperar(page, js, segundos=60):
    """Como wait_for_function, pero sin eval (la CSP del sitio lo bloquea, como debe ser)."""
    fin = time.time() + segundos
    while time.time() < fin:
        try:
            if page.evaluate(js):
                return
        except Exception:
            pass  # la página se está recargando
        time.sleep(0.3)
    raise TimeoutError(js)


def descargar(page, nombre, timeout=60000):
    page.click('[data-run]')
    page.wait_for_selector('[data-step="done"]:not([hidden])', timeout=timeout)
    with page.expect_download() as d:
        page.click('[data-download]')
    destino = OUT / nombre
    d.value.save_as(destino)
    return destino


def nueva(ctx, ruta, errores):
    page = ctx.new_page()
    page.on('pageerror', lambda e: errores.append(f'{ruta}: {e}'))
    page.on('console', lambda m: errores.append(f'{ruta}: {m.text}') if m.type == 'error' or 'Content Security Policy' in m.text else None)
    page.goto(BASE + ruta)
    page.wait_for_load_state('networkidle')
    return page


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(accept_downloads=True, service_workers='block', viewport={'width': 1280, 'height': 1600})
    errores = []

    # --- Herramientas del servidor: «Muy pronto» ---
    try:
        page = nueva(ctx, '', errores)
        pronto = page.eval_on_selector_all('.tile.is-soon .tile-name', 'els => els.map(e => e.textContent)')
        check('inicio: 8 fichas «Muy pronto»', len(pronto) == 8, pronto)
        check('inicio: 27 fichas en total', page.locator('.catalog .tile').count() == 27)
        page = nueva(ctx, 'word-a-pdf/', errores)
        check('Word a PDF: aviso «Muy pronto»', page.is_visible('.soon-panel'))
        check('Word a PDF: sin zona para subir archivos', page.locator('[data-drop], [data-input]').count() == 0)
        check('Word a PDF: fuera de Google (noindex)', page.locator('meta[name="robots"][content="noindex"]').count() == 1)
        check('Word a PDF: las relacionadas sí funcionan', page.locator('.related .tile.is-soon').count() == 0 and page.locator('.related .tile').count() == 4)
        sitemap = urllib.request.urlopen(BASE + 'sitemap.xml').read().decode()
        check('sitemap: sin las que aún no funcionan', 'word-a-pdf' not in sitemap and 'unir/' in sitemap)
        page.close()
    except Exception:
        traceback.print_exc(); check('muy pronto: sin excepciones', False)

    # --- CSP en <meta> y datos estructurados ---
    try:
        page = nueva(ctx, 'unir/', errores)
        csp = page.get_attribute('meta[http-equiv="Content-Security-Policy"]', 'content') or ''
        check('CSP también en <meta>', "script-src 'self'" in csp and 'frame-ancestors' not in csp, csp[:80])
        datos = json.loads(page.eval_on_selector('script[type="application/ld+json"]', 'e => e.textContent'))
        check('datos estructurados válidos', datos.get('@type') == 'WebApplication' and datos.get('name') == 'Unir PDF', datos.get('name'))
        check('barra de progreso con nombre', page.get_attribute('progress', 'aria-label') == 'Avance')
        page.close()
    except Exception:
        traceback.print_exc(); check('csp: sin excepciones', False)

    # --- Tecla «/» solo donde hay buscador ---
    try:
        page = nueva(ctx, 'privacidad/', errores)
        bloqueada = page.evaluate("""() => { const e = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
            document.body.dispatchEvent(e); return e.defaultPrevented; }""")
        check('«/» no se bloquea en Privacidad', not bloqueada)
        check('Privacidad: forma de contacto', page.locator('a[href*="/issues"]').count() == 1)
        page = nueva(ctx, '', errores)
        page.keyboard.press('/')
        check('«/» en el inicio va al buscador', page.evaluate('document.activeElement.id') == 'buscar')
        page.close()
    except Exception:
        traceback.print_exc(); check('tecla /: sin excepciones', False)

    # --- Censurar con teclado ---
    try:
        page = nueva(ctx, 'censurar/', errores)
        page.set_input_files('[data-input]', str(FX / 'fuga-links.pdf'))
        page.wait_for_selector('[data-stage] canvas')
        page.click('[data-add-box]')
        check('censurar: «Agregar recuadro» deja el foco en el recuadro', page.evaluate("document.activeElement.classList.contains('redact-box')"))
        antes = page.evaluate("document.activeElement.getBoundingClientRect().toJSON()")
        page.keyboard.press('ArrowRight'); page.keyboard.press('ArrowRight')
        despues = page.evaluate("document.activeElement.getBoundingClientRect().toJSON()")
        check('censurar: las flechas lo mueven', despues['x'] > antes['x'] and abs(despues['width'] - antes['width']) < 1)
        page.keyboard.press('Shift+ArrowDown')
        alto = page.evaluate("document.activeElement.getBoundingClientRect().height")
        check('censurar: Mayús + flecha cambia el tamaño', alto > antes['height'])
        page.keyboard.press('Delete')
        check('censurar: Suprimir lo quita', page.locator('.redact-box').count() == 0)
        page.click('[data-add-box]')
        f = descargar(page, 'censurado-teclado.pdf')
        txt = subprocess.run(['pdftotext', str(f), '-'], capture_output=True, text=True).stdout
        check('censurar: la página 1 censurada ya no tiene texto', 'Indice' not in txt and 'Pagina tres' in txt, txt[:60])
        page.close()
    except Exception:
        traceback.print_exc(); check('censurar teclado: sin excepciones', False)

    # --- Proteger con una contraseña que empieza con «@» ---
    try:
        page = nueva(ctx, 'proteger/', errores)
        page.set_input_files('[data-input]', str(FX / 'a.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])')
        page.fill('#pw', '@clave-2026'); page.fill('#pw2', '@clave-2026')
        f = descargar(page, 'protegido-arroba.pdf')
        sin = subprocess.run(['qpdf', '--requires-password', str(f)]).returncode
        con = subprocess.run(['qpdf', '--check', '--password=@clave-2026', str(f)], capture_output=True).returncode
        check('proteger: «@clave» funciona (pide contraseña y abre con ella)', sin == 0 and con == 0, (sin, con))
        page.close()
    except Exception:
        traceback.print_exc(); check('proteger @: sin excepciones', False)

    # --- Reparar un PDF con restricciones (se abre sin contraseña) ---
    try:
        page = nueva(ctx, 'reparar/', errores)
        page.set_input_files('[data-input]', str(FX / 'owner.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])')
        f = descargar(page, 'reparado-restringido.pdf')
        nota = page.inner_text('[data-done-note]')
        check('reparar: acepta PDF con restricciones', 'restricciones' in nota, nota)
        check('reparar: conserva las restricciones', subprocess.run(['qpdf', '--requires-password', str(f)]).returncode == 3)
        page.close()
        page = nueva(ctx, 'reparar/', errores)
        page.set_input_files('[data-input]', str(FX / 'user.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])')
        page.click('[data-run]')
        page.wait_for_selector('[data-status].is-error')
        check('reparar: con contraseña de apertura pide Desbloquear', 'Desbloquear' in page.inner_text('[data-status]'))
        check('error anunciado al momento (aria-live assertive)', page.get_attribute('[data-status]', 'aria-live') == 'assertive')
        page.close()
    except Exception:
        traceback.print_exc(); check('reparar: sin excepciones', False)

    # --- Aviso de firma digital ---
    try:
        page = nueva(ctx, 'numeros-de-pagina/', errores)
        page.set_input_files('[data-input]', str(FX / 'firmado.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])')
        check('firma digital: avisa que deja de valer', page.is_visible('[data-signed-note]'))
        page.close()
        page = nueva(ctx, 'numeros-de-pagina/', errores)
        page.set_input_files('[data-input]', str(FX / 'a.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])')
        check('firma digital: sin aviso en un PDF sin firma', not page.is_visible('[data-signed-note]'))
        page.close()
    except Exception:
        traceback.print_exc(); check('firma: sin excepciones', False)

    # --- PDF a JPG: ZIP armado por partes ---
    try:
        page = nueva(ctx, 'pdf-a-jpg/', errores)
        page.set_input_files('[data-input]', str(FX / 'long.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])')
        f = descargar(page, 'paginas.zip', timeout=120000)
        z = zipfile.ZipFile(f)
        nombres = z.namelist()
        check('PDF a JPG: ZIP válido con 12 imágenes', z.testzip() is None and len(nombres) == 12 and all(n.endswith('.jpg') for n in nombres), len(nombres))
        check('PDF a JPG: las imágenes abren', z.read(nombres[0])[:3] == b'\xff\xd8\xff')
        page.close()
    except Exception:
        traceback.print_exc(); check('zip: sin excepciones', False)

    # --- Pestaña en segundo plano: el navegador no dibuja cuadros, el trabajo debe seguir ---
    try:
        page = nueva(ctx, 'eliminar-paginas/', errores)
        page.evaluate('window.requestAnimationFrame = () => 0')  # como una pestaña oculta
        page.set_input_files('[data-input]', str(FX / 'long.pdf'))
        page.wait_for_selector('[data-step="work"]:not([hidden])')
        page.fill('#remove', '2-4')
        f = descargar(page, 'segundo-plano.pdf', timeout=30000)
        check('segundo plano: la herramienta termina igual', f.stat().st_size > 0)
        page.close()
    except Exception:
        traceback.print_exc(); check('segundo plano: sin excepciones', False)

    check('sin errores de consola ni de CSP', not errores, errores[:4])
    ctx.close()

    # --- Sin conexión y aviso de versión nueva (con el modo sin conexión activo) ---
    tmp = Path(tempfile.mkdtemp(prefix='pdf-sw-'))
    servidor = None
    try:
        sitio = tmp / 'sitio'
        subprocess.run(['node', str(RAIZ / 'tools' / 'build.mjs'), '--out', str(sitio)], check=True, capture_output=True)
        servidor = subprocess.Popen([sys.executable, str(RAIZ / 'tools' / 'serve.py'), str(sitio), '8767'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
        base = 'http://127.0.0.1:8767/'
        ctx = b.new_context()
        page = ctx.new_page()
        page.goto(base)
        esperar(page, 'navigator.serviceWorker.controller !== null')
        claves = page.evaluate('caches.keys()')
        check('sin conexión: guarda una copia del sitio y otra de las librerías',
              any(k.startswith('pdf-jmpvlab-libs-') for k in claves) and any(k.startswith('pdf-jmpvlab-') and '-libs-' not in k for k in claves), claves)
        ctx.set_offline(True)
        page.goto(base + 'unir/')
        check('sin conexión: Unir abre', page.title().startswith('Unir PDF'))
        ctx.set_offline(False)

        # Versión nueva: cambia el CSS y se vuelve a generar.
        css = sitio / 'assets' / 'css' / 'styles.css'
        css.write_text(css.read_text() + '\n.marca-version-2 { color: red; }\n')
        # build.mjs siempre parte de public/: se genera la versión 2 desde una copia del proyecto.
        trabajo = tmp / 'trabajo'
        shutil.copytree(RAIZ, trabajo, ignore=shutil.ignore_patterns('.git', 'node_modules', '.claude', 'tests'))
        shutil.copy(css, trabajo / 'public' / 'assets' / 'css' / 'styles.css')
        subprocess.run(['node', str(trabajo / 'tools' / 'build.mjs'), '--out', str(tmp / 'v2')], check=True, capture_output=True)
        for item in (tmp / 'v2').iterdir():
            destino = sitio / item.name
            if item.is_dir():
                shutil.copytree(item, destino, dirs_exist_ok=True)
            else:
                shutil.copy(item, destino)

        page.goto(base + 'unir/')
        page.wait_for_selector('.update-toast', timeout=60000)
        check('versión nueva: aparece el aviso «Actualizar»', page.is_visible('.update-toast'))
        viejo = page.evaluate("fetch('/assets/css/styles.css').then(r => r.text()).then(t => t.includes('marca-version-2'))")
        check('versión nueva: mientras tanto todo sigue de la versión anterior', viejo is False)
        with page.expect_navigation(timeout=30000):
            page.click('.update-toast .btn-primary')
        page.wait_for_load_state('load')
        esperar(page, "fetch('/assets/css/styles.css').then(r => r.text()).then(t => t.includes('marca-version-2'))", 30)
        check('versión nueva: al tocar «Actualizar» se recarga con la nueva', True)
        claves = page.evaluate('caches.keys()')
        check('versión nueva: la copia anterior se borra', len([k for k in claves if '-libs-' not in k]) == 1, claves)

        # Paso desde el modo sin conexión anterior (el que está publicado hoy, con caché
        # «runtime»): esa versión no sabe mostrar el aviso, así que la nueva entra sola.
        page.evaluate("caches.open('pdf-jmpvlab-runtime-viejo')")
        css2 = trabajo / 'public' / 'assets' / 'css' / 'styles.css'
        css2.write_text(css2.read_text() + '\n.marca-version-3 { color: blue; }\n')
        subprocess.run(['node', str(trabajo / 'tools' / 'build.mjs'), '--out', str(tmp / 'v3')], check=True, capture_output=True)
        for item in (tmp / 'v3').iterdir():
            destino = sitio / item.name
            if item.is_dir():
                shutil.copytree(item, destino, dirs_exist_ok=True)
            else:
                shutil.copy(item, destino)
        page.goto(base + 'unir/')
        esperar(page, "fetch('/assets/css/styles.css').then(r => r.text()).then(t => t.includes('marca-version-3'))", 30)
        check('desde la versión anterior: la nueva entra sola, sin aviso', True)
        esperar(page, "caches.keys().then(k => !k.some(x => x.includes('-runtime-')))", 15)
        check('desde la versión anterior: se borra su caché', True)
        ctx.close()
    except Exception:
        traceback.print_exc(); check('modo sin conexión: sin excepciones', False)
    finally:
        if servidor:
            servidor.terminate()
        shutil.rmtree(tmp, ignore_errors=True)
    b.close()

print(f'{sum(res)}/{len(res)} pruebas bien')
raise SystemExit(0 if res and all(res) else 1)
