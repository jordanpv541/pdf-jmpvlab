"""Pruebas en el navegador: mensajes de error del servidor (simulado). Se corren con tests/e2e/run.py."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from comun import API, BASE, FX, salida
OUT = salida('servidor-errores')
res=[]
def check(n,c,d=''): res.append(bool(c)); print(('OK  ' if c else 'FAIL'), n, d)
def attempt(page, setup):
    page.unroute('**/v1/**'); setup()
    page.goto(BASE+'pdf-a-word/')
    page.set_input_files('[data-input]', str(FX/'a.pdf'))
    page.wait_for_selector('[data-step="work"]:not([hidden])')
    page.click('[data-run]')
    page.wait_for_selector('[data-status].is-error', timeout=30000)
    return page.inner_text('[data-status]'), page.is_enabled('[data-run]')
with sync_playwright() as p:
    b=p.chromium.launch(); page=b.new_page()
    msg, en = attempt(page, lambda: page.route('**/v1/**', lambda r: r.abort()))
    check('servidor caído: mensaje claro', 'No pudimos conectar' in msg, msg); check('botón vuelve a funcionar', en)
    msg, en = attempt(page, lambda: page.route('**/v1/**', lambda r: r.fulfill(status=429, body='', headers={'Access-Control-Allow-Origin':'*'})))
    check('429 sin cuerpo: mensaje de espera', 'Espera unos minutos' in msg, msg)
    msg, en = attempt(page, lambda: page.route('**/v1/**', lambda r: r.fulfill(status=503, json={'error':'Hay mucha gente convirtiendo ahora. Intenta en un minuto.'}, headers={'Access-Control-Allow-Origin':'*'})))
    check('503 con JSON: usa el mensaje del servidor', 'mucha gente' in msg, msg)
    msg, en = attempt(page, lambda: page.route('**/v1/**', lambda r: r.fulfill(status=502, body='<html>Bad gateway</html>', headers={'Access-Control-Allow-Origin':'*'})))
    check('502 HTML: mensaje genérico', 'tuvo un problema' in msg, msg)
    # sin conexión
    page.unroute('**/v1/**')
    page.goto(BASE+'pdf-a-word/')
    page.set_input_files('[data-input]', str(FX/'a.pdf'))
    page.wait_for_selector('[data-step="work"]:not([hidden])')
    page.context.set_offline(True)
    page.click('[data-run]'); page.wait_for_selector('[data-status].is-error', timeout=10000)
    check('sin internet: lo dice', 'conexión a internet' in page.inner_text('[data-status]'), page.inner_text('[data-status]'))
    page.context.set_offline(False)
    b.close()
print(f'{sum(res)}/{len(res)} pruebas bien')
raise SystemExit(0 if res and all(res) else 1)
