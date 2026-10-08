"""Pruebas en el navegador: servidor conversiones. Se corren con tests/e2e/run.py."""
import subprocess, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from pypdf import PdfReader
from comun import API, BASE, FX, salida
OUT = salida('servidor')
res=[]
def check(n,c,d=''): res.append(bool(c)); print(('OK  ' if c else 'FAIL'), n, d)

def convert(page, slug, fixture, timeout=120000):
    page.goto(BASE+slug+'/')
    page.set_input_files('[data-input]', str(FX/fixture))
    page.wait_for_selector('[data-step="work"]:not([hidden])')
    page.click('[data-run]')
    page.wait_for_selector('[data-step="done"]:not([hidden]), [data-status].is-error', timeout=timeout)
    if not page.is_visible('[data-step="done"]'):
        return None, page.inner_text('[data-status]')
    with page.expect_download() as d: page.click('[data-download]')
    f=OUT/d.value.suggested_filename; d.value.save_as(f)
    return f, page.inner_text('[data-step="done"]')

with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(accept_downloads=True)
    page=ctx.new_page(); errs=[]
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    reqs=[]; page.on('request', lambda r: reqs.append(r.url))

    for slug, fx, words in [('word-a-pdf','informe.docx',None),('excel-a-pdf','ventas.xlsx',None),('powerpoint-a-pdf','charla.pptx',None),('html-a-pdf','pagina.html',None)]:
        f, info = convert(page, slug, fx)
        ok = f and f.suffix=='.pdf' and len(PdfReader(f).pages)>=1
        check(f'{slug}: PDF descargado', ok, f.name if f else info)

    f, info = convert(page, 'pdf-a-word', 'a.pdf')
    check('pdf-a-word: .docx válido', f and f.suffix=='.docx' and 'word/document.xml' in zipfile.ZipFile(f).namelist(), f.name if f else info)
    f, info = convert(page, 'pdf-a-excel', 'tabla.pdf')
    ok = False
    if f:
        import openpyxl
        ws = openpyxl.load_workbook(f).worksheets[0]
        vals = [c.value for row in ws.iter_rows() for c in row]
        ok = 'Cuaderno' in vals and 12 in vals and 3.5 in vals
        print('   valores:', vals[:12])
    check('pdf-a-excel: tabla con números', ok, f.name if f else info)
    f, info = convert(page, 'pdf-a-powerpoint', 'b.pdf')
    check('pdf-a-powerpoint: .pptx válido', f and f.suffix=='.pptx' and any(n.startswith('ppt/slides/slide') for n in zipfile.ZipFile(f).namelist()), f.name if f else info)
    print('   nota:', info.replace('\n',' | ')[:200])
    f, info = convert(page, 'pdf-a-pdfa', 'a.pdf')
    check('pdf-a-pdfa: PDF descargado', f and f.suffix=='.pdf', f.name if f else info)

    # errores
    f, info = convert(page, 'pdf-a-word', 'user.pdf')
    check('pdf-a-word: PDF con contraseña da mensaje claro', f is None and 'contraseña' in info.lower(), info)
    page.goto(BASE+'html-a-pdf/')
    page.fill('#page-url', '127.0.0.1')
    page.click('[data-url-form] button')
    page.wait_for_selector('[data-step="work"]:not([hidden])')
    check('html-a-pdf: muestra la dirección', 'https://127.0.0.1/' in page.inner_text('[data-summary]'), page.inner_text('[data-summary]'))
    page.click('[data-run]')
    page.wait_for_selector('[data-status].is-error', timeout=30000)
    check('html-a-pdf: dirección interna bloqueada', 'pública' in page.inner_text('[data-status]'), page.inner_text('[data-status]'))
    page.goto(BASE+'html-a-pdf/')
    page.fill('#page-url', 'ht tp://mal')
    page.click('[data-url-form] button')
    check('html-a-pdf: dirección inválida avisada', 'no es válida' in page.inner_text('[data-status]'), page.inner_text('[data-status]'))
    # tipo equivocado
    page.goto(BASE+'word-a-pdf/')
    page.set_input_files('[data-input]', str(FX/'a.pdf'))
    page.wait_for_timeout(500)
    check('word-a-pdf: rechaza un PDF', page.is_hidden('[data-step="work"]'), page.inner_text('[data-status]'))
    check('solo se conecta al sitio y a la API', all(u.startswith(BASE) or u.startswith(API) or u.startswith('blob:') or u.startswith('data:') for u in reqs), [u for u in reqs if not (u.startswith(BASE) or u.startswith(API))][:3])
    real_errs=[e for e in errs if '400' not in e and 'Failed to load resource' not in e]
    check('sin errores de página', not real_errs, str(real_errs[:5]))
    b.close()
print(f'{sum(res)}/{len(res)} pruebas bien')
raise SystemExit(0 if res and all(res) else 1)
