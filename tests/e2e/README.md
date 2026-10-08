# Pruebas del sitio en el navegador

Abren cada herramienta en Chromium (con Playwright), eligen archivos de `fixtures/`, descargan el resultado y lo revisan: páginas, texto, contraseñas, que el PDF sea válido y que no haya errores en la consola.

## Correrlas

```
pip install -r tests/e2e/requirements.txt
python3 -m playwright install chromium
python3 tests/e2e/run.py
```

También hacen falta los programas `qpdf` y `pdftotext` (en Ubuntu: `sudo apt install qpdf poppler-utils`).

`run.py` sirve `public/` en http://127.0.0.1:8765 con `tools/serve.py` y corre todo. Para correr solo algunas, nómbralas: `python3 tests/e2e/run.py prueba_fuga prueba_sitio`.

## Qué prueba cada archivo

- `prueba_buscador.py`: el buscador y los filtros del inicio.
- `prueba_tema.py`: el interruptor de modo claro u oscuro.
- `prueba_basicas.py`: unir, dividir, organizar, JPG a PDF, PDF a JPG, números, marca de agua y recortar.
- `prueba_paginas.py`: eliminar, extraer, rotar, firmar y censurar.
- `prueba_qpdf.py`: comprimir, proteger, desbloquear, reparar y escanear.
- `prueba_ocr.py`: el OCR.
- `prueba_fuga.py`: que lo que se quita o se censura no quede escondido dentro del archivo.
- `prueba_sitio.py`: «Muy pronto», CSP, teclado en Censurar, contraseñas con «@», firma digital, ZIP, modo sin conexión y aviso de versión nueva.
- `prueba_servidor_aviso.py` y `prueba_servidor_errores.py`: los avisos y mensajes de las herramientas del servidor, con el servidor simulado. Usan una copia del sitio generada con `PDF_SERVER_READY=1` en el puerto 8766.
- `servidor_conversiones.py`: conversiones reales. Solo corre con `run.py --con-servidor` y la API funcionando en `E2E_API` (por defecto http://127.0.0.1:8800).

## Archivos de prueba

Todo lo de `fixtures/` es inventado (no hay datos de nadie). `generar_basicas.py` y `generar_fuga.py` crean parte de ellos; el resto (Word, Excel, PowerPoint, escaneos y PDF con contraseña) se hizo una vez y se guarda tal cual.
