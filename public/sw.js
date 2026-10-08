// Generado por tools/build.mjs. No lo edites a mano.
const VERSION = '4e74d9afce65';
const SHELL = 'pdf-jmpvlab-' + VERSION;
const LIBS = 'pdf-jmpvlab-libs-e9773cf63a17';
const SHELL_FILES = [
  "assets/css/styles.css",
  "assets/fonts/bricolage-grotesque-latin.woff2",
  "assets/fonts/figtree-latin-ext.woff2",
  "assets/fonts/figtree-latin.woff2",
  "assets/fonts/firma/caveat-latin-400-normal.woff2",
  "assets/fonts/firma/dancing-script-latin-400-normal.woff2",
  "assets/fonts/firma/great-vibes-latin-400-normal.woff2",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/favicon-32.png",
  "assets/icons/favicon.svg",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/maskable-512.png",
  "assets/js/app.js",
  "assets/js/home.js",
  "assets/js/icons.js",
  "assets/js/images.js",
  "assets/js/pdf-clean.js",
  "assets/js/qpdf.js",
  "assets/js/remote.js",
  "assets/js/theme.js",
  "assets/js/tools/censurar.js",
  "assets/js/tools/comprimir.js",
  "assets/js/tools/convertir.js",
  "assets/js/tools/desbloquear.js",
  "assets/js/tools/dividir.js",
  "assets/js/tools/eliminar-paginas.js",
  "assets/js/tools/escanear.js",
  "assets/js/tools/firmar.js",
  "assets/js/tools/jpg-a-pdf.js",
  "assets/js/tools/marca-de-agua.js",
  "assets/js/tools/numeros-de-pagina.js",
  "assets/js/tools/ocr.js",
  "assets/js/tools/organizar.js",
  "assets/js/tools/pdf-a-jpg.js",
  "assets/js/tools/proteger.js",
  "assets/js/tools/recortar.js",
  "assets/js/tools/reparar.js",
  "assets/js/tools/rotar.js",
  "assets/js/tools/unir.js",
  "censurar/",
  "comprimir/",
  "desbloquear/",
  "dividir/",
  "eliminar-paginas/",
  "escanear/",
  "excel-a-pdf/",
  "extraer-paginas/",
  "firmar/",
  "html-a-pdf/",
  "./",
  "jpg-a-pdf/",
  "manifest.webmanifest",
  "marca-de-agua/",
  "numeros-de-pagina/",
  "ocr/",
  "organizar/",
  "pdf-a-excel/",
  "pdf-a-jpg/",
  "pdf-a-pdfa/",
  "pdf-a-powerpoint/",
  "pdf-a-word/",
  "powerpoint-a-pdf/",
  "privacidad/",
  "proteger/",
  "recortar/",
  "reparar/",
  "rotar/",
  "terminos/",
  "unir/",
  "word-a-pdf/"
];
const LIB_FILES = [
  "vendor/fflate/fflate.js",
  "vendor/pdf-lib/pdf-lib.esm.min.js",
  "vendor/pdfjs/pdf.min.mjs",
  "vendor/pdfjs/pdf.worker.min.mjs",
  "vendor/qpdf/qpdf.mjs",
  "vendor/qpdf/qpdf.wasm"
];

// Pide el archivo al servidor, sin usar la caché del navegador (puede ser de otra versión).
function fresh(path) {
  return fetch(new Request(path, { cache: 'reload' })).then((response) => {
    if (!response.ok) throw new Error(path + ' ' + response.status);
    return response;
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      await Promise.all(SHELL_FILES.map(async (path) => shell.put(path, await fresh(path))));
      const saveData = Boolean(self.navigator.connection && self.navigator.connection.saveData);
      if (!saveData) {
        const libs = await caches.open(LIBS);
        await Promise.all(
          LIB_FILES.map(async (path) => {
            if (await libs.match(path)) return;
            await libs.put(path, await fresh(path));
          })
        );
      }
      // Las versiones anteriores a este sistema no saben mostrar el aviso de «Actualizar»:
      // si la que funciona ahora es una de esas, la nueva entra de una vez.
      const keys = await caches.keys();
      if (keys.some((key) => key.startsWith('pdf-jmpvlab-runtime-'))) await self.skipWaiting();
    })()
  );
});

// La página pide activar la versión nueva cuando la persona toca «Actualizar».
self.addEventListener('message', (event) => {
  if (event.data === 'actualizar') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith('pdf-jmpvlab-') && key !== SHELL && key !== LIBS).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

async function respond(request, url) {
  const shell = await caches.open(SHELL);
  const libs = await caches.open(LIBS);
  const hit = (await shell.match(request, { ignoreSearch: true })) || (await libs.match(request, { ignoreSearch: true }));
  if (hit) return hit;
  try {
    // Sin copia guardada: a la red. Para archivos se pide revisar que la copia del
    // navegador siga vigente, porque el hosting la guarda por un año.
    const response = request.mode === 'navigate' ? await fetch(request) : await fetch(request, { cache: 'no-cache' });
    if (response.ok && url.pathname.includes('/vendor/')) await libs.put(request, response.clone());
    return response;
  } catch (error) {
    if (request.mode === 'navigate') {
      const home = await shell.match('./');
      if (home) return home;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(respond(request, url));
});
