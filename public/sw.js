// Generado por tools/build.mjs. No lo edites a mano.
const VERSION = '7b1a7cdc744b';
const CACHE = 'pdf-jmpvlab-' + VERSION;
const RUNTIME = 'pdf-jmpvlab-runtime-' + VERSION;
const PRECACHE = [
  "assets/css/styles.css",
  "assets/fonts/atkinson-hyperlegible-next-latin-400-normal.woff2",
  "assets/fonts/atkinson-hyperlegible-next-latin-600-normal.woff2",
  "assets/fonts/atkinson-hyperlegible-next-latin-800-normal.woff2",
  "assets/fonts/atkinson-hyperlegible-next-latin-ext-400-normal.woff2",
  "assets/fonts/atkinson-hyperlegible-next-latin-ext-600-normal.woff2",
  "assets/fonts/atkinson-hyperlegible-next-latin-ext-800-normal.woff2",
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
  "assets/js/qpdf.js",
  "assets/js/remote.js",
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
  "vendor/fflate/fflate.js",
  "vendor/pdf-lib/pdf-lib.esm.min.js",
  "vendor/pdfjs/pdf.min.mjs",
  "vendor/pdfjs/pdf.worker.min.mjs",
  "vendor/qpdf/qpdf.mjs",
  "vendor/qpdf/qpdf.wasm",
  "word-a-pdf/"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        PRECACHE.map((path) =>
          fetch(new Request(path, { cache: 'reload' })).then((response) => {
            if (!response.ok) throw new Error(path + ' ' + response.status);
            return cache.put(path, response);
          })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith('pdf-jmpvlab-') && key !== CACHE && key !== RUNTIME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Páginas: primero la red, para ver cambios; sin conexión, la copia.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match(new URL('./', self.location).href))
        )
    );
    return;
  }

  // Archivos del sitio: primero la copia guardada.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok && url.pathname.includes('/vendor/')) {
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
