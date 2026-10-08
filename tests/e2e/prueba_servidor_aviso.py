"""Pruebas en el navegador: aviso cuando el servidor no responde (con el servidor simulado). Se corren con tests/e2e/run.py."""
from playwright.sync_api import sync_playwright
from comun import API, BASE, FX, salida
OUT = salida('servidor-aviso')
res=[]
def check(n,c,d=''): res.append(bool(c)); print(('OK  ' if c else 'FAIL'), n, d)
with sync_playwright() as p:
    b=p.chromium.launch(); page=b.new_page(); errs=[]
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/v1/health', lambda r: r.fulfill(status=200, json={'ok': True, 'maxUploadMb': 50}, headers={'Access-Control-Allow-Origin':'*'}))
    page.goto(BASE+'pdf-a-word/'); page.wait_for_timeout(1500)
    check('servidor arriba: sin aviso', page.locator('.server-down').count()==0)
    page.unroute('**/v1/health')
    page.route('**/v1/health', lambda r: r.abort())
    page.goto(BASE+'pdf-a-word/'); page.wait_for_selector('.server-down', timeout=10000)
    check('servidor caído: aviso visible', page.is_visible('.server-down'), page.inner_text('.server-down'))
    page.set_input_files('[data-input]', str(FX)+'/a.pdf'); page.wait_for_selector('[data-step="work"]:not([hidden])')
    check('servidor caído: igual deja elegir archivo', page.is_visible('[data-step="work"]'))
    page.unroute('**/v1/health')
    page.route('**/v1/health', lambda r: r.fulfill(status=200, json={'ok': True, 'maxUploadMb': 1}, headers={'Access-Control-Allow-Origin':'*'}))
    page.goto(BASE+'word-a-pdf/'); page.wait_for_timeout(1500)
    page.set_input_files('[data-input]', str(FX)+'/informe.docx'); page.wait_for_timeout(500)
    import os; size=os.path.getsize(str(FX)+'/informe.docx')
    print('   tamaño informe.docx:', size)
    check('usa el límite que dice el servidor', ('1 MB' in page.inner_text('[data-status]')) == (size > 1024*1024), page.inner_text('[data-status]'))
    page.unroute('**/v1/health')
    page.route('**/v1/health', lambda r: None)  # cuelga: nunca responde
    page.goto(BASE+'excel-a-pdf/'); page.wait_for_selector('.server-down', timeout=15000)
    check('servidor que no contesta: aviso tras unos segundos', page.is_visible('.server-down'))
    check('sin errores de página', not errs, errs[:3])
    b.close()
print(f'{sum(res)}/{len(res)} pruebas bien')
raise SystemExit(0 if res and all(res) else 1)
