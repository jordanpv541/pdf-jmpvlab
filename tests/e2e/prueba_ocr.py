"""Pruebas en el navegador: prueba ocr. Se corren con tests/e2e/run.py."""
import traceback, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
from pypdf import PdfReader
from comun import API, BASE, FX, salida
OUT = salida('ocr')
res=[]
def check(n,c,d=''): res.append(bool(c)); print(('OK  ' if c else 'FAIL'), n, d)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(accept_downloads=True)
    page=ctx.new_page(); errs=[]
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type in ('error','warning') else None)
    page.on('requestfailed', lambda r: errs.append('reqfail ' + r.url))
    reqs=[]; page.on('request', lambda r: reqs.append(r.url))
    page.goto(BASE+'ocr/')
    page.set_input_files('[data-input]', str(FX/'escaneado.pdf'))
    page.wait_for_selector('[data-step="work"]:not([hidden])')
    page.click('[data-run]')
    page.wait_for_selector('[data-step="done"]:not([hidden])', timeout=240000)
    with page.expect_download() as d: page.click('[data-download]')
    f=OUT/d.value.suggested_filename; d.value.save_as(f)
    t=[x.extract_text() for x in PdfReader(f).pages]
    check('ocr: texto reconocido en la hoja 1', 'biblioteca' in t[0] and 'hoja 1' in t[0], repr(t[0][:120]))
    check('ocr: texto reconocido en la hoja 2', 'Gracias' in t[1], repr(t[1][:80]))
    check('ocr: tildes', 'Número' in t[0] or 'páginas' in t[0], '')
    print('nota:', page.inner_text('[data-done-note]'))
    r=subprocess.run(['qpdf','--check',str(f)],capture_output=True,text=True); check('ocr: PDF válido', r.returncode==0, r.stderr[-100:])
    check('ocr: solo archivos propios', all(u.startswith(BASE) or u.startswith('blob:') or u.startswith('data:') for u in reqs), [u for u in reqs if not u.startswith(BASE)][:3])
    check('ocr: sin errores', not errs, str(errs[:5]))
    # páginas con texto se saltan
    page.click('[data-restart]')
    page.set_input_files('[data-input]', str(FX/'a.pdf'))
    page.wait_for_selector('[data-step="work"]:not([hidden])')
    page.click('[data-run]'); page.wait_for_timeout(1500)
    check('ocr: avisa si ya tiene texto', 'ya tienen texto' in page.inner_text('[data-status]'), page.inner_text('[data-status]'))
    b.close()
print(f'{sum(res)}/{len(res)} pruebas bien')
raise SystemExit(0 if res and all(res) else 1)
