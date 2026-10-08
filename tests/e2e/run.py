"""Corre las pruebas del sitio en un navegador de verdad (Chromium con Playwright).

  python3 tests/e2e/run.py                  todas las que no necesitan el servidor
  python3 tests/e2e/run.py prueba_ocr       solo las que se nombran
  python3 tests/e2e/run.py --con-servidor   también conversiones reales con la API
                                            (tiene que estar corriendo en E2E_API)

Prueba la carpeta public/ tal como se sube al hosting, servida en 127.0.0.1:8765 con
tools/serve.py (mismas cabeceras que .htaccess). Las pruebas de las herramientas del
servidor usan una copia generada con PDF_SERVER_READY=1 en 127.0.0.1:8766.
"""
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent

# Sobre public/ tal cual
NORMALES = [
    'prueba_buscador', 'prueba_tema', 'prueba_basicas', 'prueba_paginas', 'prueba_qpdf',
    'prueba_ocr', 'prueba_fuga', 'prueba_sitio',
]
# Sobre la copia con el servidor «listo» (la API se simula en el navegador)
LISTO = ['prueba_servidor_aviso', 'prueba_servidor_errores']
# Necesitan la API de verdad
CON_SERVIDOR = ['servidor_conversiones']


def esperar(url, segundos=20):
    fin = time.time() + segundos
    while time.time() < fin:
        try:
            urllib.request.urlopen(url, timeout=2)
            return
        except Exception:
            time.sleep(0.3)
    raise SystemExit(f'No responde {url}')


def servir(carpeta, puerto, env=None):
    proc = subprocess.Popen(
        [sys.executable, str(RAIZ / 'tools' / 'serve.py'), str(carpeta), str(puerto)],
        env={**os.environ, **(env or {})},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    esperar(f'http://127.0.0.1:{puerto}/')
    return proc


def correr(nombre, base, extra_env=None):
    print(f'\n=== {nombre} ===', flush=True)
    env = {**os.environ, 'E2E_BASE': base, **(extra_env or {})}
    r = subprocess.run([sys.executable, str(AQUI / f'{nombre}.py')], env=env, cwd=AQUI)
    return r.returncode == 0


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    con_servidor = '--con-servidor' in sys.argv
    api = os.environ.get('E2E_API', 'http://127.0.0.1:8800')
    elegidas = set(args)
    usar = lambda lista: [n for n in lista if not elegidas or n in elegidas]

    resultados = {}
    procesos = []
    try:
        normales = usar(NORMALES)
        if normales:
            procesos.append(servir(RAIZ / 'public', 8765))
            for n in normales:
                resultados[n] = correr(n, 'http://127.0.0.1:8765/')

        listos = usar(LISTO) + (usar(CON_SERVIDOR) if con_servidor else [])
        if listos:
            copia = Path(tempfile.mkdtemp(prefix='pdf-listo-'))
            env = {'PDF_SERVER_READY': '1', 'PDF_API_URL': api}
            subprocess.run(['node', str(RAIZ / 'tools' / 'build.mjs'), '--out', str(copia)], env={**os.environ, **env}, check=True)
            procesos.append(servir(copia, 8766, env))
            for n in listos:
                resultados[n] = correr(n, 'http://127.0.0.1:8766/', {'E2E_API': api})
    finally:
        for p in procesos:
            p.terminate()

    print('\nResumen:')
    for n, ok in resultados.items():
        print(f"  {'bien ' if ok else 'FALLA'} {n}")
    if not resultados:
        raise SystemExit('No hay pruebas con ese nombre.')
    raise SystemExit(0 if all(resultados.values()) else 1)


if __name__ == '__main__':
    main()
