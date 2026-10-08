"""Pruebas en el navegador: lo que se quita o se censura no queda escondido en el archivo.

Cada fixtures/fuga-*.pdf esconde un texto SECRETO en la página 2 de una forma distinta
(enlace desde la página 1, recursos compartidos, enlaces con nombre, formulario, notas,
un documento real de LibreOffice con índice). Se usan las herramientas de verdad y se
revisa el archivo que descarga la persona, objeto por objeto.
Se corren con tests/e2e/run.py.
"""
import subprocess
import tempfile
import traceback
from pathlib import Path

import pymupdf
from playwright.sync_api import sync_playwright

from comun import BASE, FX, salida

OUT = salida('fuga')
CASOS = ['links', 'shared', 'named', 'form', 'irt', 'indice']
res = []


def check(n, c, d=''):
    res.append(bool(c))
    print(('OK  ' if c else 'FAIL'), n, d)


def contenido_pagina2_escondido(original, salida_pdf):
    """¿Algún flujo del archivo de salida es el contenido de la página 2 del original?"""
    secreto = pymupdf.open(original)[1].read_contents()
    d = pymupdf.open(salida_pdf)
    for x in range(1, d.xref_length()):
        try:
            if d.xref_is_stream(x) and d.xref_stream(x) == secreto:
                return True
        except Exception:
            pass
    return False


def texto_en_bruto(pdf, texto):
    with tempfile.TemporaryDirectory() as tmp:
        q = Path(tmp) / 'q.pdf'
        subprocess.run(['qpdf', '--qdf', '--object-streams=disable', str(pdf), str(q)], capture_output=True)
        return texto.encode() in q.read_bytes()


def qpdf_ok(pdf):
    return subprocess.run(['qpdf', '--check', str(pdf)], capture_output=True).returncode == 0


def igual(a, ia, b, ib):
    return pymupdf.open(a)[ia].get_pixmap(dpi=50).samples == pymupdf.open(b)[ib].get_pixmap(dpi=50).samples


def descargar(page, nombre):
    page.click('[data-run]')
    page.wait_for_selector('[data-step="done"]:not([hidden])', timeout=60000)
    with page.expect_download() as d:
        page.click('[data-download]')
    destino = OUT / nombre
    d.value.save_as(destino)
    return destino


def abrir(ctx, ruta, archivo, errores):
    page = ctx.new_page()
    page.on('pageerror', lambda e: errores.append(str(e)))
    page.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
    page.goto(BASE + ruta)
    page.set_input_files('[data-input]', str(archivo))
    page.wait_for_selector('[data-step="work"]:not([hidden])')
    return page


def revisar(caso, herramienta, salida_pdf, iguales):
    original = FX / f'fuga-{caso}.pdf'
    check(f'{caso} {herramienta}: la página 2 no viaja escondida', not contenido_pagina2_escondido(original, salida_pdf))
    secretos = {'links': 'SECRETO-LINK-222', 'shared': 'SECRETO-RES-333', 'named': 'SECRETO-NAMED-666',
                'form': 'SECRETO-CAMPO-444', 'irt': 'SECRETO-NOTA-555'}
    if caso in secretos:
        check(f'{caso} {herramienta}: el secreto no está en los bytes', not texto_en_bruto(salida_pdf, secretos[caso]))
    check(f'{caso} {herramienta}: PDF válido', qpdf_ok(salida_pdf))
    check(f'{caso} {herramienta}: las páginas que quedan se ven igual',
          all(igual(salida_pdf, o, original, s) for o, s in iguales))


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(accept_downloads=True, service_workers='block', viewport={'width': 1280, 'height': 1800})
    errores = []
    for caso in CASOS:
        archivo = FX / f'fuga-{caso}.pdf'
        try:
            page = abrir(ctx, 'eliminar-paginas/', archivo, errores)
            page.fill('#remove', '2')
            revisar(caso, 'eliminar', descargar(page, f'{caso}-eliminar.pdf'), [(0, 0), (1, 2)])
            page.close()

            page = abrir(ctx, 'extraer-paginas/', archivo, errores)
            page.fill('#ranges', '1')
            revisar(caso, 'extraer', descargar(page, f'{caso}-extraer.pdf'), [(0, 0)])
            page.close()

            page = abrir(ctx, 'censurar/', archivo, errores)
            page.wait_for_selector('[data-stage] canvas')
            page.click('[data-next]')
            page.wait_for_function("document.querySelector('[data-page-label]').textContent.startsWith('Página 2')")
            page.click('[data-add-box]')
            revisar(caso, 'censurar', descargar(page, f'{caso}-censurar.pdf'), [(0, 0), (2, 2)])
            page.close()
        except Exception:
            traceback.print_exc()
            check(f'{caso}: sin excepciones', False)

    # Enlaces que siguen funcionando después de quitar y de unir
    try:
        page = abrir(ctx, 'eliminar-paginas/', FX / 'fuga-named.pdf', errores)
        page.fill('#remove', '2')
        f = descargar(page, 'named-eliminar-enlaces.pdf')
        links = sorted(((l.get('kind'), l.get('page'), l.get('uri')) for l in pymupdf.open(f)[0].get_links()), key=str)
        esperado = sorted([(1, 1, None), (2, None, 'https://example.com')], key=str)
        check('enlaces: el que iba a la página quitada se quita, los demás se arreglan', links == esperado, links)
        page.close()

        page = ctx.new_page()
        page.goto(BASE + 'unir/')
        page.set_input_files('[data-input]', [str(FX / 'fuga-indice.pdf'), str(FX / 'fuga-links.pdf')])
        page.wait_for_selector('[data-step="work"]:not([hidden])')
        page.wait_for_timeout(500)
        f = descargar(page, 'unir-enlaces.pdf')
        d = pymupdf.open(f)
        links = sorted((i, l.get('page')) for i, pg in enumerate(d) for l in pg.get_links() if l.get('kind') == 1)
        check('unir: 6 páginas', d.page_count == 6, d.page_count)
        check('unir: cada enlace va a su propia página', links == [(0, 1), (0, 2), (3, 4)], links)
        def tipo(x):
            try:
                return d.xref_get_key(x, 'Type')[1]
            except Exception:  # número libre: el objeto se borró por no usarse
                return None
        paginas = sum(1 for x in range(1, d.xref_length()) if tipo(x) == '/Page')
        check('unir: sin copias escondidas de páginas', paginas == 6, paginas)
        page.close()
    except Exception:
        traceback.print_exc()
        check('enlaces: sin excepciones', False)

    check('sin errores en la consola', not errores, errores[:3])
    b.close()

print(f'{sum(res)}/{len(res)} pruebas bien')
raise SystemExit(0 if res and all(res) else 1)
