# PDF jmpvlab

Herramientas PDF gratis, sin anuncios y sin cuentas. Código libre con licencia AGPL 3.0.

27 herramientas. 19 funcionan dentro del navegador y los archivos nunca salen del equipo:

- Organizar: unir (con opción de intercalar páginas), dividir, organizar páginas, eliminar páginas, extraer páginas y rotar.
- Optimizar: comprimir, reparar y OCR (reconocer texto en escaneos).
- Convertir: JPG a PDF, escanear con la cámara del celular y PDF a JPG (páginas o las imágenes que trae).
- Editar: números de página, marca de agua y recortar.
- Firmar y proteger: firmar, censurar, proteger con contraseña y desbloquear.

8 usan nuestro servidor, porque necesitan LibreOffice o Chromium. El archivo se sube, se convierte y se borra:

- Word, Excel, PowerPoint y HTML (archivo o dirección de una página) a PDF.
- PDF a Word, Excel y PowerPoint, y PDF a PDF/A.

El servidor está en `server/` y tiene su propia guía: [server/README.md](server/README.md).

## Qué hay en cada carpeta

- `public/` es el sitio terminado. Esto es lo que se sube al hosting.
- `public/assets/` tiene los estilos, la fuente, los íconos y el código de cada herramienta (`assets/js/tools/`).
- `public/vendor/` tiene las librerías de terceros, cada una con su licencia.
- `tools/site.mjs` tiene los textos del sitio y el formulario de cada herramienta.
- `tools/build.mjs` genera las páginas HTML, `sw.js`, `sitemap.xml` y `robots.txt`.
- `tools/serve.py` es un servidor local con las mismas cabeceras de seguridad que `.htaccess`.
- `tools/make_icons.py` genera los íconos PNG y la imagen para redes sociales.
- `server/` es el servidor de conversiones (API en Python, Gotenberg y Caddy, en Docker).

Las páginas HTML de `public/` se generan: si cambias un texto, edítalo en `tools/site.mjs` o `tools/build.mjs` y vuelve a generar.

## Antes de publicar

1. Abre `tools/site.mjs` y cambia `url` si el dominio no será `https://pdf.jmpvlab.com`, y `apiUrl` si el servidor no será `https://api-pdf.jmpvlab.com`.
2. Si quieres un correo de contacto en la página de privacidad, ponlo en `contactEmail`.
3. Genera el sitio: `node tools/build.mjs` (necesita Node 18 o más nuevo). También escribe la dirección del servidor en la regla de seguridad (CSP) de `.htaccess`, que solo deja conectarse al propio sitio y a la API.
4. Revisa los textos de Privacidad y Términos. Son un punto de partida, no asesoría legal.

## Probar en tu computadora

```
node tools/build.mjs
python3 tools/serve.py
```

Luego abre http://127.0.0.1:8765. No sirve abrir los HTML con doble clic: los módulos de JavaScript necesitan un servidor.

## Subir a SiteGround

El sitio es estático (HTML, CSS y JavaScript): no usa PHP ni base de datos. Las 8 conversiones de servidor se conectan directo a `api-pdf.jmpvlab.com`, que va aparte (ver [server/README.md](server/README.md)). Si ese servidor no está, el resto del sitio funciona igual.

1. En Site Tools, crea el subdominio (por ejemplo `pdf.jmpvlab.com`).
2. Activa el certificado SSL gratuito para el subdominio y luego **HTTPS Enforce**.
3. Abre el administrador de archivos en la carpeta del subdominio y sube **el contenido** de `public/` (no la carpeta en sí). Lo más fácil es subir el ZIP del sitio y descomprimirlo ahí.
4. Comprueba que `.htaccess` se subió. Es un archivo oculto; en el administrador de archivos de SiteGround se ve activando la opción de mostrar archivos ocultos.
5. Abre el sitio y prueba una herramienta. Si el navegador dice que un archivo `.mjs` tiene un tipo MIME incorrecto, es que `.htaccess` no se está aplicando.
6. Cuando todo funcione con HTTPS, puedes quitar el `#` de la línea `Strict-Transport-Security` en `.htaccess`.

Para publicar cambios: vuelve a generar con `node tools/build.mjs` y sube otra vez el contenido de `public/`. El archivo `sw.js` cambia de versión solo, y los visitantes reciben la nueva versión en su siguiente visita.

## Cómo funciona

- **pdf-lib** crea y modifica los PDF (unir, dividir, girar, numerar, marca de agua, recortar, imágenes a PDF).
- **PDF.js** muestra las páginas (miniaturas y vistas previas) y las convierte en imágenes. Se usa la compilación *legacy*, que funciona también en navegadores de hace un par de años; la normal exige navegadores muy recientes.
- **fflate** arma los ZIP cuando el resultado son varios archivos.
- **Firmar** usa tres fuentes manuscritas (Dancing Script, Great Vibes y Caveat, licencia OFL) para las firmas escritas. La firma se guarda como imagen dentro del PDF: es una firma visual, no una firma digital con certificado.
- **qpdf** (compilado a WebAssembly) pone y quita contraseñas con cifrado AES de 256 bits, y compacta los archivos al comprimir. Se carga solo en esas herramientas.
- **Tesseract** (tesseract.js) reconoce el texto en el OCR. Sus archivos pesan unos 17 MB en el servidor, pero cada visitante descarga solo lo que usa (unos 6 MB la primera vez en español) y no se guardan al instalar la app.
- **Censurar** vuelve a dibujar como imagen las páginas que tienen recuadros. Así lo tapado desaparece del archivo de verdad, aunque esas páginas pierden el texto seleccionable.
- `sw.js` guarda una copia del sitio en el navegador para que funcione sin conexión e instalado como app. Las herramientas de servidor necesitan internet y lo avisan.
- **Conversiones de servidor:** `assets/js/tools/convertir.js` sirve para las 8; cada página dice en `<main>` qué conversión es. Office y PDF/A usan LibreOffice (vía Gotenberg), HTML usa Chromium, y PDF a Word, Excel y PowerPoint usan PyMuPDF, pdf2docx, openpyxl y python-pptx.

## Límites conocidos

- Las herramientas que editan no abren PDF protegidos: primero hay que quitar la protección con Desbloquear PDF (el sitio lo indica).
- La versión de qpdf para el navegador no sabe recuperar archivos dañados; por eso Reparar usa pdf-lib, y si eso falla, PDF.js (rescata las páginas como imagen).
- El OCR tarda unos segundos por página y más en celulares. Reconoce español e inglés.
- Comprimir achica sobre todo las fotos. Un PDF que es solo texto casi no baja de peso.
- pdf-lib no recibe actualizaciones desde 2021. Funciona bien para lo que hace aquí, pero conviene vigilar alternativas mantenidas.
- La marca de agua y los números usan la fuente Helvetica de los PDF, que no tiene emojis ni alfabetos como el cirílico o el árabe. El sitio avisa si el texto tiene esos caracteres.
- Recortar solo oculta lo que queda fuera (CropBox). El contenido sigue dentro del archivo, y el sitio lo advierte.
- En celulares con poca memoria, los PDF muy grandes (cientos de MB) pueden fallar.
- PDF a Word funciona bien con documentos de texto; con diseños complejos el resultado puede necesitar retoques. pdf2docx ya no recibe mantenimiento activo.
- PDF a PowerPoint pone cada página como imagen (con su texto en las notas): se ve igual, pero no se edita como una presentación normal.
- PDF a Excel solo encuentra tablas con líneas o columnas claras. Si no hay tablas, pasa el texto línea por línea.
- Las conversiones de servidor aceptan hasta 50 MB y 300 páginas, y 30 conversiones cada 10 minutos por persona.

## Licencia

El código de este proyecto es software libre con licencia **AGPL 3.0 o posterior** (archivo `LICENSE`). Se eligió porque el servidor usa PyMuPDF, que es AGPL. En resumen: cualquiera puede usar, copiar y cambiar el código, pero si pone una versión modificada en internet tiene que publicar sus cambios con la misma licencia. El sitio enlaza al código en el pie de página ("Código fuente").

Las librerías de `public/vendor/` y las fuentes conservan sus propias licencias (cada carpeta trae la suya). La página Términos y créditos las lista.

## Pendiente de decidir

- **Nombre y dominio definitivos.** "PDF jmpvlab", `pdf.jmpvlab.com` y `api-pdf.jmpvlab.com` son provisionales.

## Actualizar las librerías

Las librerías están copiadas en `public/vendor/` (no se cargan de CDN, para no depender de terceros ni filtrar datos de visitas). Para actualizarlas:

```
npm install pdf-lib pdfjs-dist fflate
cp node_modules/pdf-lib/dist/pdf-lib.esm.min.js public/vendor/pdf-lib/
cp node_modules/pdfjs-dist/legacy/build/pdf.min.mjs node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs public/vendor/pdfjs/
cp -r node_modules/pdfjs-dist/cmaps node_modules/pdfjs-dist/standard_fonts node_modules/pdfjs-dist/wasm node_modules/pdfjs-dist/iccs public/vendor/pdfjs/
cp node_modules/fflate/esm/browser.js public/vendor/fflate/fflate.js
node tools/build.mjs
```

Después de actualizar, prueba cada herramienta antes de subir.
