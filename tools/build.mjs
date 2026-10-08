// Genera las páginas HTML del sitio a partir de site.mjs.
//
//   node tools/build.mjs                 → escribe en public/ (lo que se sube al hosting)
//   node tools/build.mjs --preview DIR   → copia el sitio a DIR con enlaces a index.html,
//                                          para verlo donde no hay URLs limpias
//   node tools/build.mjs --out DIR       → genera una copia completa en DIR sin tocar public/
//                                          (las pruebas la usan con PDF_SERVER_READY=1)
//
// Después de generar el HTML crea sw.js con la lista de archivos y una versión
// calculada a partir de su contenido.

import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { icons } from '../public/assets/js/icons.js';
import { groups, searchWords, site, tools } from './site.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

/** Herramienta del servidor que todavía no se puede usar. */
const isSoon = (t) => Boolean(t.server) && !site.serverReady;

/**
 * Política de seguridad (CSP): una sola fuente para la cabecera de .htaccess y para la
 * etiqueta <meta> de cada página. La etiqueta protege también cuando el hosting entrega
 * el HTML sin pasar por .htaccess.
 */
function csp({ meta = false } = {}) {
  const api = new URL(site.apiUrl).origin;
  const rules = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' lo necesitan PDF.js, qpdf y el OCR para su WebAssembly.
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src 'self' ${api} blob: data:`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ];
  // frame-ancestors no vale dentro de <meta>: solo va en la cabecera.
  if (!meta) rules.push("frame-ancestors 'none'");
  return rules.join('; ');
}

/** Datos estructurados (JSON-LD) para buscadores. No es código: la CSP no lo bloquea. */
function jsonLd(data) {
  const json = JSON.stringify({ '@context': 'https://schema.org', ...data }).replace(/</g, '\\u003c');
  return `\n<script type="application/ld+json">${json}</script>`;
}

const args = process.argv.slice(2);
const previewIndex = args.indexOf('--preview');
const previewDir = previewIndex >= 0 ? args[previewIndex + 1] : null;
const outIndex = args.indexOf('--out');
const outDir = outIndex >= 0 ? args[outIndex + 1] : null;

/* ---------- Plantillas ---------- */

function makeLinker(prefix, preview) {
  // path: '' para el inicio, 'unir/' para una herramienta.
  return (path) => {
    if (preview) return `${prefix}${path}index.html`;
    if (!path) return prefix || './';
    return `${prefix}${path}`;
  };
}

function layout({ prefix, path, title, metaDesc, main, script, preview, noindex = false, server = false, after = '', data = null }) {
  const link = makeLinker(prefix, preview);
  const asset = (p) => `${prefix}${p}`;
  const canonical = `${site.url}/${path}`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">${preview ? '' : `\n<meta http-equiv="Content-Security-Policy" content="${csp({ meta: true })}">`}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${metaDesc}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${canonical}">`}
<meta name="theme-color" content="#f4f5f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1419" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">${server ? `\n<meta name="pdf-api" content="${site.apiUrl}">` : ''}${preview ? '\n<meta name="pdf-preview" content="1">' : ''}
<link rel="icon" href="${asset('assets/icons/favicon.svg')}" type="image/svg+xml">
<link rel="icon" href="${asset('assets/icons/favicon-32.png')}" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${asset('assets/icons/apple-touch-icon.png')}">
<link rel="manifest" href="${asset('manifest.webmanifest')}">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_ES">
<meta property="og:site_name" content="${site.name}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${metaDesc}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${site.url}/assets/icons/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="${asset('assets/fonts/figtree-latin.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${asset('assets/fonts/bricolage-grotesque-latin.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${asset('assets/css/styles.css')}">
<script src="${asset('assets/js/theme.js')}"></script>
${script ? `<script type="module" src="${asset(script)}"></script>` : ''}${data && !preview && !noindex ? jsonLd(data) : ''}
</head>
<body>
<a class="skip" href="#main">Saltar al contenido</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="wordmark" href="${link('')}">${icons.logo}<span>${site.name}</span></a>
    <nav class="header-nav" aria-label="Principal">
      <a href="${link('')}#herramientas">Herramientas</a>
      <a class="nav-optional" href="${link('privacidad/')}">Privacidad</a>
      <button type="button" class="btn btn-quiet btn-small" id="install" hidden>Instalar app</button>
      <div class="tema-selector">
        <button type="button" class="tema-boton" id="theme-toggle" data-tema="light" aria-label="Cambiar a modo oscuro" title="Cambiar a modo oscuro">${icons.sun.replace('<svg ', '<svg class="icono-sol" ')}${icons.moon.replace('<svg ', '<svg class="icono-luna" ')}</button>
      </div>
    </nav>
  </div>
</header>
${main}${after}
<footer class="site-footer">
  <div class="wrap footer-row">
    <div class="footer-brand">
      <a class="wordmark" href="${link('')}">${icons.logo}<span>${site.name}</span></a>
      <p>Herramientas PDF gratis, sin anuncios y sin cuentas. Código libre con licencia AGPL.</p>
    </div>
    <ul class="footer-links">
      <li><a href="${link('')}#herramientas">Todas las herramientas</a></li>
      <li><a href="${link('privacidad/')}">Privacidad</a></li>
      <li><a href="${link('terminos/')}">Términos y créditos</a></li>
      <li><a href="${site.sourceUrl}" rel="noopener">Código fuente</a></li>
    </ul>
  </div>
</footer>
</body>
</html>
`;
}

/** Ficha de una herramienta: una hoja con la esquina doblada. */
function tile(t, link) {
  const words = `${t.name} ${t.desc} ${searchWords[t.slug] || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const tag = isSoon(t)
    ? `\n                <span class="tile-tag">${icons.clock}Muy pronto</span>`
    : t.server
      ? `\n                <span class="tile-tag">${icons.server}Usa nuestro servidor</span>`
      : '';
  return `
          <li>
            <a class="tile${isSoon(t) ? ' is-soon' : ''}" href="${link(`${t.slug}/`)}" data-search="${words}">
              <span class="tile-icon">${icons[t.slug]}</span>
              <span class="tile-text">
                <span class="tile-name">${t.name}</span>
                <span class="tile-desc">${t.desc}</span>${tag}
              </span>
            </a>
          </li>`;
}

function homeMain(link) {
  const shelves = groups
    .map((group) => {
      const items = tools
        .filter((t) => t.group === group.id)
        .map((t) => tile(t, link))
        .join('');
      return `
      <section class="tool-group" data-group="${group.id}" aria-labelledby="g-${group.id}">
        <h2 id="g-${group.id}">${group.title}</h2>
        <ul class="tiles">${items}
        </ul>
      </section>`;
    })
    .join('');
  const filters = [`<button type="button" class="filter" data-filter="" aria-pressed="true">Todas</button>`]
    .concat(groups.map((g) => `<button type="button" class="filter" data-filter="${g.id}" aria-pressed="false">${g.title}</button>`))
    .join('\n      ');
  const local = tools.filter((t) => !t.server).length;
  const remote = tools.filter((t) => t.server).length;

  return `<main id="main" class="home">
  <section class="hero wrap">
    <h1>Tus PDF, sin anuncios y sin cuentas.</h1>
    <p class="hero-sub">Une, divide, comprime, convierte y firma. Casi todo se hace en tu navegador, sin subir tus archivos.</p>
    <form class="finder" role="search" data-finder>
      <label class="finder-label" for="buscar">¿Qué quieres hacer?</label>
      <div class="finder-field">
        ${icons.search}
        <input id="buscar" type="search" placeholder="Unir, comprimir, Word…" autocomplete="off" spellcheck="false" enterkeyhint="go" data-search-input>
        <kbd aria-hidden="true">/</kbd>
      </div>
    </form>
  </section>

  <section class="catalog wrap" id="herramientas" aria-label="Herramientas">
    <div class="filters" role="group" aria-label="Mostrar herramientas de">
      ${filters}
    </div>
    <p class="catalog-empty" data-empty hidden>No encontramos una herramienta con esa palabra. Prueba con otra, por ejemplo «unir», «comprimir» o «Word».</p>
    <p class="visually-hidden" data-count aria-live="polite"></p>${shelves}
  </section>

  <section class="where wrap" aria-labelledby="where-title">
    <h2 id="where-title">Dónde se procesan tus archivos</h2>
    <div class="where-grid">
      <div class="where-item">
        <span class="where-icon">${icons.device}</span>
        <h3>En tu navegador</h3>
        <p class="where-count">${local} herramientas</p>
        <p>El archivo no sale de tu equipo. Después de la primera visita funcionan incluso sin internet (el OCR, después de usarlo una vez).</p>
      </div>
      <div class="where-item">
        <span class="where-icon">${icons.server}</span>
        <h3>En nuestro servidor</h3>
        <p class="where-count">${remote} conversiones</p>
        <p>${site.serverReady ? 'Word, Excel, PowerPoint, HTML y PDF/A. El archivo viaja cifrado y se borra apenas termina.' : 'Word, Excel, PowerPoint, HTML y PDF/A. Muy pronto: estamos terminando de montar el servidor.'}</p>
      </div>
    </div>
    <p class="where-more"><a href="${link('privacidad/')}">Cómo cuidamos tus archivos</a></p>
  </section>
</main>`;
}

/** Otras herramientas del mismo grupo (y si faltan, de otros), al pie de cada herramienta. */
function relatedAside(tool, link) {
  const usable = tools.filter((t) => !isSoon(t) && t.slug !== tool.slug);
  const same = usable.filter((t) => t.group === tool.group);
  const others = usable.filter((t) => t.group !== tool.group);
  const picks = same.concat(others).slice(0, 4);
  return `
<aside class="related wrap" aria-labelledby="related-title">
  <h2 id="related-title">Otras herramientas</h2>
  <ul class="tiles tiles-related">${picks.map((t) => tile(t, link)).join('')}
  </ul>
</aside>`;
}

/** Herramienta del servidor mientras el servidor no está listo: aviso en vez de la zona de carga. */
function soonMain(tool, link) {
  return `<main id="main" class="tool" data-tool="${tool.slug}">
  <a class="back" href="${link('')}#herramientas">${icons.back}Todas las herramientas</a>
  <div class="tool-head">
    <span class="tool-icon">${icons[tool.slug]}</span>
    <div>
      <h1>${tool.name}</h1>
      <p class="lede">${tool.lede}</p>
    </div>
  </div>

  <section class="soon-panel" aria-labelledby="soon-title">
    <span class="soon-icon">${icons.clock}</span>
    <h2 id="soon-title">Muy pronto</h2>
    <p>Esta conversión necesita nuestro servidor, que estamos terminando de montar. Cuando esté listo vas a poder usarla aquí mismo, gratis y sin cuentas.</p>
    <p>Mientras tanto, abajo tienes herramientas que ya funcionan en tu navegador.</p>
  </section>
</main>`;
}

function toolMain(tool, link, preview) {
  if (isSoon(tool)) return soonMain(tool, link);
  const previewNote = preview
    ? '\n    <p class="preview-note">Esto es una vista previa: aquí el botón de descarga está bloqueado. En el sitio publicado funciona normal.</p>'
    : '';
  const accept = tool.accept
    ? tool.accept.map((e) => `.${e}`).join(',')
    : tool.capture
      ? 'image/*'
      : tool.kind === 'pdf'
        ? 'application/pdf,.pdf'
        : 'image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp';
  const serverData = tool.server ? ` data-kind="${tool.slug}" data-accept="${tool.accept.join(',')}" data-out="${tool.out}"` : '';
  const note = tool.server
    ? `<p class="local-note server-note">${icons.server}<span>${tool.serverNote || 'Este archivo se sube a nuestro servidor solo para convertirlo y se borra apenas termina. No lo guardamos ni lo vemos.'}</span></p>`
    : `<p class="local-note">${icons.lock}<span>Tus archivos no salen de tu dispositivo. Todo se hace en tu navegador.</span></p>`;
  return `<main id="main" class="tool" data-tool="${tool.slug}"${serverData}>
  <a class="back" href="${link('')}#herramientas">${icons.back}Todas las herramientas</a>
  <div class="tool-head">
    <span class="tool-icon">${icons[tool.slug]}</span>
    <div>
      <h1>${tool.name}</h1>
      <p class="lede">${tool.lede}</p>
    </div>
  </div>${preview && (tool.previewWarning || tool.server) ? `\n  <p class="preview-note">${tool.previewWarning || 'En esta vista previa esta herramienta no funciona: usa el servidor de conversiones, que todavía no está montado.'}</p>` : ''}

  <section class="step" data-step="pick" aria-label="Elegir archivos">
    <div class="drop-sheet">
    <div class="drop" data-drop>
      <span class="drop-icon">${icons.upload}</span>
      <button type="button" class="btn btn-primary" data-pick>${tool.pickText}</button>
      <p class="drop-hint">${tool.dropHint}</p>
      <input type="file" accept="${accept}"${tool.multiple && !tool.capture ? ' multiple' : ''}${tool.capture ? ' capture="environment"' : ''} hidden data-input>${tool.pickExtra ? `\n      ${tool.pickExtra}` : ''}
    </div>
    </div>${tool.pickAfter ? `\n    ${tool.pickAfter}` : ''}
    ${note}
  </section>

  <section class="step" data-step="work" hidden aria-label="Opciones">${tool.work}
  </section>

  <div class="progress" data-progress hidden>
    <progress max="1" value="0" aria-label="Avance"></progress>
    <p class="progress-text" aria-live="polite"></p>
  </div>
  <p class="status" data-status role="status" aria-live="polite"></p>

  <section class="step done" data-step="done" hidden tabindex="-1" aria-labelledby="done-title">
    <h2 id="done-title"><span class="done-badge">${icons.check}</span>Listo para descargar</h2>
    <p class="done-file" data-done-file></p>
    <p class="done-note" data-done-note></p>
    <div class="result-pages" data-result></div>
    <p class="result-note" data-result-note></p>${previewNote}
    <div class="actions">
      <a class="btn btn-primary" href="#" data-download>${icons.download}Descargar</a>
      <button type="button" class="btn btn-quiet" data-adjust>Volver a las opciones</button>
      <button type="button" class="btn btn-quiet" data-restart>Empezar con otro archivo</button>
    </div>
  </section>
</main>`;
}

function proseMain(html) {
  return `<main id="main" class="prose">${html}</main>`;
}

function privacyHtml(link) {
  const contact = site.contactEmail
    ? `<p>Si tienes preguntas sobre esta política, escribe a <a href="mailto:${site.contactEmail}">${site.contactEmail}</a>.</p>`
    : `<h2>Dudas o problemas</h2>
  <p>Escríbenos en los <a href="${site.issuesUrl}" rel="noopener">temas del repositorio en GitHub</a> (necesitas una cuenta gratis de GitHub). No pegues ahí datos personales ni archivos privados: lo que se escribe es público.</p>`;
  const local = tools.filter((t) => !t.server).map((t) => t.name);
  const remote = tools.filter((t) => t.server).map((t) => t.name);
  const list = (names) => names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1];
  return `
  <h1>Privacidad</h1>
  <p class="updated">Última actualización: ${site.updated}</p>

  <h2>La mayoría de herramientas no sube tus archivos</h2>
  <p>${list(local)} funcionan dentro de tu navegador. El archivo se lee y se procesa en tu dispositivo: no se envía a ningún servidor, no lo vemos y no lo guardamos.</p>
  <p>Puedes comprobarlo: después de cargar una de estas herramientas, desconéctate de internet y verás que sigue funcionando.</p>

  <h2>Herramientas que usan nuestro servidor</h2>
  <p>${list(remote)} necesitan programas que no caben en un navegador, así que usan nuestro servidor. Cada una lo avisa antes de elegir el archivo.${site.serverReady ? ' Así funciona:' : ' Todavía no están disponibles porque estamos terminando de montar el servidor. Así van a funcionar:'}</p>
  <ul>
    <li>Tu archivo viaja cifrado (HTTPS) hasta nuestro servidor en Oracle Cloud.</li>
    <li>Se convierte y el resultado vuelve a tu navegador en la misma conexión.</li>
    <li>El archivo original y el resultado se borran apenas termina la conversión. No se guardan copias ni se usan para nada más.</li>
    <li>En HTML a PDF con una dirección web, el servidor abre la página que escribiste para convertirla.</li>
  </ul>

  <h2>Qué datos se generan al visitar el sitio</h2>
  <ul>
    <li>No usamos cookies, ni herramientas de analítica, ni publicidad.</li>
    <li>El servidor que aloja las páginas guarda registros técnicos de cada visita, como la dirección IP, la fecha y la página pedida. Es algo normal en cualquier sitio web y sirve para mantenerlo funcionando y protegerlo de ataques.</li>
    <li>El servidor de conversiones no guarda registros de visitas ni nombres de archivos. Recuerda tu dirección IP en memoria por unos minutos solo para limitar abusos (por ejemplo, alguien que manda cientos de archivos) y luego la olvida.</li>
    <li>El navegador guarda una copia de los archivos del sitio (no de tus documentos) para que funcione sin conexión. Puedes borrarla desde la configuración de tu navegador.</li>
  </ul>

  <h2>Puedes revisar el código</h2>
  <p>Todo el código del sitio y del servidor es público, así que cualquiera puede comprobar lo que dice esta página: <a href="${site.sourceUrl}" rel="noopener">${site.sourceUrl.replace(/^https:\/\//, '')}</a>.</p>
  ${contact}
  <p><a href="${link('')}">Volver a las herramientas</a></p>`;
}

function termsHtml(link) {
  return `
  <h1>Términos y créditos</h1>
  <p class="updated">Última actualización: ${site.updated}</p>

  <h2>Uso del sitio</h2>
  <ul>
    <li>${site.name} es gratis y se ofrece tal como está, sin garantías de ningún tipo.</li>
    <li>Revisa siempre el resultado antes de usarlo para algo importante y guarda una copia de tus archivos originales.</li>
    <li>Usa las herramientas solo con archivos que tengas derecho a modificar.</li>
    <li>No somos responsables por pérdidas de datos o daños que resulten del uso del sitio.</li>
  </ul>

  <h2>Código libre</h2>
  <p>El código de ${site.name} se publica con la licencia GNU AGPL versión 3 o posterior. Puedes leerlo, copiarlo y modificarlo en <a href="${site.sourceUrl}" rel="noopener">${site.sourceUrl.replace(/^https:\/\//, '')}</a>, siempre que compartas tus cambios con la misma licencia.</p>

  <h2>Software de terceros</h2>
  <p>Este sitio usa estas piezas de código abierto, cada una con su propia licencia:</p>
  <ul>
    <li>pdf-lib, para crear y modificar PDF. Licencia MIT.</li>
    <li>PDF.js de Mozilla, para mostrar las páginas y convertirlas en imágenes. Licencia Apache 2.0.</li>
    <li>fflate, para crear archivos ZIP. Licencia MIT.</li>
    <li>Bricolage Grotesque y Figtree, las fuentes del sitio. Licencia SIL Open Font License 1.1.</li>
    <li>Tabler Icons, los íconos. Licencia MIT.</li>
    <li>Dancing Script, Great Vibes y Caveat, las fuentes para escribir firmas. Licencia SIL Open Font License 1.1.</li>
    <li>qpdf, para poner y quitar contraseñas y compactar archivos. Licencia Apache 2.0.</li>
    <li>Tesseract OCR y tesseract.js, para reconocer texto en páginas escaneadas. Licencia Apache 2.0.</li>
    <li>En el servidor: Gotenberg (MIT), LibreOffice (MPL 2.0), Chromium (BSD), PyMuPDF (AGPL 3.0), pdf2docx (MIT), openpyxl (MIT) y python-pptx (MIT).</li>
  </ul>
  <p>Las licencias completas están junto a cada librería, en las carpetas <code>vendor</code> y <code>assets</code> del sitio.</p>
  <p><a href="${link('')}">Volver a las herramientas</a></p>`;
}

function notFoundHtml(link) {
  return `
  <h1>Esta página no existe</h1>
  <p>Puede que el enlace esté mal escrito o que la página se haya movido.</p>
  <p><a class="btn btn-primary" href="${link('')}">Ver todas las herramientas</a></p>`;
}

/* ---------- Generación ---------- */

function pagesFor(preview) {
  const out = [];
  const home = makeLinker('', preview);
  out.push({
    file: 'index.html',
    html: layout({
      prefix: '',
      path: '',
      title: preview ? site.name : `${site.name}: herramientas PDF gratis y sin anuncios`,
      metaDesc: 'Une, divide, comprime, convierte y firma PDF gratis. Sin anuncios ni cuentas, y casi todo pasa en tu navegador.',
      main: homeMain(home),
      script: 'assets/js/home.js',
      preview,
      data: {
        '@type': 'WebApplication',
        name: site.name,
        url: `${site.url}/`,
        description: 'Herramientas PDF gratis, sin anuncios y sin cuentas. Casi todo pasa en tu navegador.',
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Cualquiera con un navegador moderno',
        inLanguage: 'es',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
    }),
  });

  for (const tool of tools) {
    const link = makeLinker('../', preview);
    out.push({
      file: `${tool.slug}/index.html`,
      html: layout({
        prefix: '../',
        path: `${tool.slug}/`,
        title: `${tool.title} | ${site.name}`,
        metaDesc: tool.metaDesc,
        main: toolMain(tool, link, preview),
        after: relatedAside(tool, link),
        // Las que aún no funcionan solo necesitan lo común (modo sin conexión, instalar).
        script: isSoon(tool) ? 'assets/js/home.js' : `assets/js/tools/${tool.server ? 'convertir' : tool.script || tool.slug}.js`,
        server: tool.server && !isSoon(tool),
        noindex: isSoon(tool),
        preview,
        data: {
          '@type': 'WebApplication',
          name: tool.name,
          url: `${site.url}/${tool.slug}/`,
          description: tool.metaDesc,
          applicationCategory: 'UtilitiesApplication',
          operatingSystem: 'Cualquiera con un navegador moderno',
          inLanguage: 'es',
          isAccessibleForFree: true,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          isPartOf: { '@type': 'WebSite', name: site.name, url: `${site.url}/` },
        },
      }),
    });
  }

  const sub = makeLinker('../', preview);
  out.push({
    file: 'privacidad/index.html',
    html: layout({
      prefix: '../',
      path: 'privacidad/',
      title: `Privacidad | ${site.name}`,
      metaDesc: `Cómo trata ${site.name} tus archivos y tus datos: todo se procesa en tu navegador.`,
      main: proseMain(privacyHtml(sub)),
      script: 'assets/js/home.js',
      preview,
    }),
  });
  out.push({
    file: 'terminos/index.html',
    html: layout({
      prefix: '../',
      path: 'terminos/',
      title: `Términos y créditos | ${site.name}`,
      metaDesc: `Condiciones de uso de ${site.name} y software de código abierto que utiliza.`,
      main: proseMain(termsHtml(sub)),
      script: 'assets/js/home.js',
      preview,
    }),
  });

  // La página 404 se sirve desde cualquier ruta, por eso usa rutas absolutas.
  // En la vista previa no hace falta.
  if (!preview) {
    const abs = makeLinker('/', false);
    out.push({
      file: '404.html',
      html: layout({
        prefix: '/',
        path: '404.html',
        title: `Página no encontrada | ${site.name}`,
        metaDesc: 'Esta página no existe.',
        main: proseMain(notFoundHtml(abs)),
        script: 'assets/js/home.js',
        preview,
        noindex: true,
      }),
    });
  }
  return out;
}

async function writePages(dir, preview) {
  for (const { file, html } of pagesFor(preview)) {
    const target = join(dir, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html);
  }
}

async function listFiles(dir) {
  const result = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else result.push(full);
    }
  }
  await walk(dir);
  return result;
}

const toUrlPath = (file, base) => relative(base, file).split(sep).join('/');

/**
 * sw.js: guarda una copia del sitio para usarlo sin conexión.
 *
 * - Cada versión del sitio tiene su propia copia (páginas, estilos y código). Todo sale de
 *   esa copia, así una página nunca mezcla archivos de dos versiones.
 * - Las librerías (vendor/) van en otra copia que solo cambia cuando cambian ellas: una
 *   actualización del sitio no vuelve a bajar 4 MB ni borra el OCR ya guardado.
 * - Una versión nueva espera a que la persona toque «Actualizar» (o cierre el sitio).
 * - Con «ahorro de datos» activado, las librerías se guardan recién cuando se usan.
 */
async function writeServiceWorker(dir, preview) {
  const skip = /(^|\/)(sw\.js|\.htaccess|404\.html|robots\.txt|sitemap\.xml)$/;
  const files = (await listFiles(dir)).filter((f) => !skip.test(toUrlPath(f, dir))).sort();
  const rel = files.map((f) => toUrlPath(f, dir));

  // Lo pesado o poco usado se guarda la primera vez que se usa, no al instalar.
  const lazy = (p) =>
    /^vendor\/pdfjs\/(cmaps|standard_fonts|iccs|wasm)\//.test(p) ||
    /^vendor\/tesseract\//.test(p) ||
    /^assets\/screenshots\//.test(p) ||
    /LICENSE|NOTICE|OFL\.txt|og-image/.test(p);
  const isLib = (p) => p.startsWith('vendor/');
  const pageUrl = (p) => {
    if (preview) return p;
    if (p === 'index.html') return './';
    if (p.endsWith('/index.html')) return p.slice(0, -'index.html'.length);
    return p;
  };
  const shell = rel.filter((p) => !lazy(p) && !isLib(p)).map(pageUrl);
  const libs = rel.filter((p) => !lazy(p) && isLib(p));

  const all = createHash('sha256');
  const vendor = createHash('sha256');
  for (const f of files) {
    const path = toUrlPath(f, dir);
    const bytes = await readFile(f);
    all.update(path).update(bytes);
    if (isLib(path)) vendor.update(path).update(bytes);
  }
  const version = all.digest('hex').slice(0, 12);
  const libsVersion = vendor.digest('hex').slice(0, 12);

  const sw = `// Generado por tools/build.mjs. No lo edites a mano.
const VERSION = '${version}';
const SHELL = 'pdf-jmpvlab-' + VERSION;
const LIBS = 'pdf-jmpvlab-libs-${libsVersion}';
const SHELL_FILES = ${JSON.stringify(shell, null, 2)};
const LIB_FILES = ${JSON.stringify(libs, null, 2)};

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
`;
  await writeFile(join(dir, 'sw.js'), sw);
  return { version, count: shell.length + libs.length };
}

async function writeSitemap(dir) {
  const urls = ['', ...tools.filter((t) => !isSoon(t)).map((t) => `${t.slug}/`), 'privacidad/', 'terminos/'];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${site.url}/${u}</loc></url>`).join('\n')}
</urlset>
`;
  await writeFile(join(dir, 'sitemap.xml'), xml);
  await writeFile(join(dir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);
}

// La cabecera CSP de .htaccess sale de la misma función que la etiqueta <meta>.
async function syncCsp(dir) {
  const file = join(dir, '.htaccess');
  const text = await readFile(file, 'utf8');
  const next = text.replace(/(Header always set Content-Security-Policy )"[^"]*"/, `$1"${csp()}"`);
  if (next === text) return;
  await writeFile(file, next);
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

if (previewDir) {
  if (await exists(previewDir)) await rm(previewDir, { recursive: true });
  await cp(PUBLIC, previewDir, { recursive: true, filter: (src) => !/(\.htaccess|404\.html|sw\.js|robots\.txt|sitemap\.xml)$/.test(src) });
  // Quita las páginas de producción copiadas y genera las de vista previa.
  await writePages(previewDir, true);
  // La página principal de la vista previa se publica sin <html>, <head> ni <body>:
  // el servicio de vista previa los agrega por su cuenta.
  const mainPage = join(previewDir, 'index.html');
  const stripped = (await readFile(mainPage, 'utf8'))
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<\/?html[^>]*>\s*/gi, '')
    .replace(/<\/?head>\s*/gi, '')
    .replace(/<\/?body>\s*/gi, '');
  await writeFile(mainPage, stripped);
  // La vista previa no lleva modo sin conexión: se publica en un servidor ajeno.
  console.log(`Vista previa en ${previewDir}`);
} else {
  let target = PUBLIC;
  if (outDir) {
    if (await exists(outDir)) await rm(outDir, { recursive: true });
    await cp(PUBLIC, outDir, { recursive: true });
    target = outDir;
  }
  await writePages(target, false);
  await writeSitemap(target);
  await syncCsp(target);
  const { version, count } = await writeServiceWorker(target, false);
  console.log(`Sitio generado en ${outDir || 'public/'} (sw ${version}, ${count} archivos en caché inicial)`);
}
