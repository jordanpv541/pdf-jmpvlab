// Funciones comunes a todas las herramientas.
// Todo se ejecuta en el navegador: ningún archivo sale del dispositivo.

import { icons } from './icons.js';

export { icons };

const VENDOR = new URL('../../vendor/', import.meta.url);

/* ---------- Utilidades ---------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')} ${units[i]}`;
}

export function pages(n) {
  return n === 1 ? '1 página' : `${n} páginas`;
}

/** Nombre sin extensión y sin caracteres raros, para nombrar resultados. */
export function baseName(name) {
  const noExt = name.replace(/\.[^.]+$/, '');
  const clean = noExt.replace(/[\\/:*?"<>|]+/g, '-').trim();
  return clean || 'documento';
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function readBytes(file) {
  return file.arrayBuffer().then((buf) => new Uint8Array(buf));
}

export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/* ---------- Archivos de entrada ---------- */

const PDF_TYPES = ['application/pdf', 'application/x-pdf'];

export function isPdf(file) {
  return PDF_TYPES.includes(file.type) || /\.pdf$/i.test(file.name);
}

export function isImage(file) {
  return /^image\/(jpeg|png|webp|gif|bmp)$/.test(file.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
}

const BIG_FILE = 150 * 1024 * 1024;

/**
 * Conecta el botón, el input y la zona para soltar archivos.
 * kind: 'pdf' | 'image'
 */
export function setupPicker({ zone, input, button, kind, multiple, onFiles, onError }) {
  let accept = kind === 'pdf' ? isPdf : isImage;
  let label = kind === 'pdf' ? 'un PDF' : 'una imagen JPG o PNG';
  if (Array.isArray(kind)) {
    // Lista de extensiones permitidas, por ejemplo ['docx', 'doc', 'odt']
    const exts = kind.map((e) => e.toLowerCase());
    accept = (file) => exts.includes((file.name.split('.').pop() || '').toLowerCase());
    label = `un archivo ${exts.map((e) => `.${e}`).join(', ')}`;
  }

  const handle = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const good = files.filter(accept);
    const bad = files.filter((f) => !accept(f));
    const chosen = multiple ? good : good.slice(0, 1);
    if (bad.length) {
      const names = bad.map((f) => `«${f.name}»`).join(', ');
      onError(bad.length === 1 ? `${names} no es ${label}.` : `${names} no son archivos válidos para esta herramienta.`);
    }
    if (chosen.some((f) => f.size > BIG_FILE)) {
      onError('Hay un archivo muy grande. Puede tardar o fallar en celulares con poca memoria.');
    }
    if (chosen.length) onFiles(chosen);
  };

  button?.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    handle(input.files);
    input.value = '';
  });

  if (zone) {
    ['dragenter', 'dragover'].forEach((type) =>
      zone.addEventListener(type, (event) => {
        event.preventDefault();
        zone.classList.add('is-over');
      })
    );
    ['dragleave', 'dragend'].forEach((type) =>
      zone.addEventListener(type, () => zone.classList.remove('is-over'))
    );
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('is-over');
      handle(event.dataTransfer?.files);
    });
  }

  // Evita que soltar un archivo fuera de la zona abra el PDF en otra pestaña.
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => event.preventDefault());

  return { handle };
}

/* ---------- Pasos de la pantalla ---------- */

export function createSteps(root) {
  const steps = $$('[data-step]', root);
  const statusEl = $('[data-status]', root);
  const progressEl = $('[data-progress]', root);

  const api = {
    show(name) {
      steps.forEach((el) => {
        el.hidden = el.dataset.step !== name;
      });
    },
    status(message, kind = 'info') {
      if (!statusEl) return;
      statusEl.textContent = message || '';
      statusEl.className = `status ${message ? `is-${kind}` : ''}`;
      statusEl.setAttribute('role', kind === 'error' ? 'alert' : 'status');
      statusEl.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
    },
    error(message) {
      api.status(message, 'error');
    },
    clear() {
      api.status('');
    },
    /** Barra de progreso sin porcentaje, para cuando no se sabe cuánto falta. */
    working(text) {
      if (!progressEl) return;
      progressEl.hidden = false;
      $('progress', progressEl).removeAttribute('value');
      $('.progress-text', progressEl).textContent = text || '';
    },
    progress(done, total, text) {
      if (!progressEl) return;
      if (total == null) {
        progressEl.hidden = true;
        return;
      }
      progressEl.hidden = false;
      const bar = $('progress', progressEl);
      bar.max = total;
      bar.value = done;
      $('.progress-text', progressEl).textContent = text || '';
    },
  };
  return api;
}

/** Bloquea un botón mientras trabaja y muestra un texto. */
export async function busy(button, text, task) {
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = text;
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

/* ---------- Descargas ---------- */

let lastUrl = null;

export function setDownload(link, blob, filename) {
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(blob);
  link.href = lastUrl;
  link.download = filename;
  const nameEl = document.querySelector('[data-done-file]');
  if (nameEl) nameEl.textContent = `${filename} (${formatBytes(blob.size)})`;
}

export function pdfBlob(bytes) {
  return new Blob([bytes], { type: 'application/pdf' });
}

/**
 * Arma un ZIP sin comprimir (las imágenes y los PDF ya vienen comprimidos).
 * Cada entrada trae `bytes` (Uint8Array) o `blob`. Se arma por partes: cada archivo se
 * lee y se pasa al ZIP de a uno, así un PDF con muchas páginas no llena la memoria del celular.
 */
export async function zipBlob(entries) {
  const { Zip, ZipPassThrough } = await import(new URL('fflate/fflate.js', VENDOR).href);
  const parts = [];
  let failure = null;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else parts.push(new Blob([chunk]));
  });
  const used = new Set();
  for (const entry of entries) {
    let unique = entry.name;
    let n = 2;
    while (used.has(unique)) {
      unique = entry.name.replace(/(\.[^.]+)$/, `-${n}$1`);
      n += 1;
    }
    used.add(unique);
    const file = new ZipPassThrough(unique);
    zip.add(file);
    const bytes = entry.bytes || new Uint8Array(await entry.blob.arrayBuffer());
    file.push(bytes, true);
    if (failure) throw failure;
  }
  zip.end();
  if (failure) throw failure;
  return new Blob(parts, { type: 'application/zip' });
}

export function pad(n, width) {
  return String(n).padStart(width, '0');
}

/* ---------- pdf-lib ---------- */

let pdfLibPromise = null;
export function getPdfLib() {
  if (!pdfLibPromise) pdfLibPromise = import(new URL('pdf-lib/pdf-lib.esm.min.js', VENDOR).href);
  return pdfLibPromise;
}

// Si alguno de los PDF abiertos tiene firma digital, se avisa que al guardarlo deja de valer.
let signedLoaded = false;

/** true si el PDF tiene al menos una firma digital (un campo de firma con valor). */
export function hasDigitalSignature(doc, PDFLib) {
  const { PDFArray, PDFDict, PDFName } = PDFLib;
  const form = doc.catalog.lookup(PDFName.of('AcroForm'));
  if (!(form instanceof PDFDict)) return false;
  const stack = [];
  const fields = form.lookup(PDFName.of('Fields'));
  if (fields instanceof PDFArray) for (let i = 0; i < fields.size(); i += 1) stack.push([fields.lookup(i), 0]);
  let checked = 0;
  while (stack.length && checked < 5000) {
    const [field, depth] = stack.pop();
    checked += 1;
    if (!(field instanceof PDFDict) || depth > 32) continue;
    if (field.get(PDFName.of('FT')) === PDFName.of('Sig') && field.get(PDFName.of('V')) !== undefined) return true;
    const kids = field.lookup(PDFName.of('Kids'));
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i += 1) stack.push([kids.lookup(i), depth + 1]);
  }
  return false;
}

/** Abre un PDF con pdf-lib y traduce los errores a mensajes claros. */
export async function loadPdf(bytes, fileName) {
  const PDFLib = await getPdfLib();
  let doc;
  try {
    doc = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    throw friendlyPdfError(error, fileName);
  }
  try {
    if (hasDigitalSignature(doc, PDFLib)) signedLoaded = true;
  } catch {
    /* si no se puede revisar, no se avisa */
  }
  return doc;
}

function showSignedNote(root) {
  const work = $('[data-step="work"]', root);
  if (!work) return;
  let note = $('[data-signed-note]', work);
  if (!note) {
    note = document.createElement('p');
    note.className = 'signed-note';
    note.dataset.signedNote = '';
    note.textContent =
      'Este PDF tiene una firma digital. Al guardar los cambios, la firma deja de ser válida: quien lo reciba verá que el documento fue modificado.';
    work.prepend(note);
  }
  note.hidden = !signedLoaded;
}

export function friendlyPdfError(error, fileName = 'el archivo') {
  const text = String(error?.message || error || '');
  const name = fileName ? `«${fileName}»` : 'El archivo';
  if (/encrypt/i.test(error?.name || '') || /encrypt/i.test(text) || /password/i.test(text)) {
    return new Error(`${name} está protegido con contraseña o restricciones. Quítale la protección con Desbloquear PDF y vuelve a intentarlo.`);
  }
  return new Error(`No se pudo leer ${name}. Puede estar dañado o no ser un PDF.`);
}

/* ---------- PDF.js (vistas previas) ---------- */

let pdfjsPromise = null;
export function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(new URL('pdfjs/pdf.min.mjs', VENDOR).href).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs/pdf.worker.min.mjs', VENDOR).href;
      return lib;
    });
  }
  return pdfjsPromise;
}

export async function openPreview(bytes, fileName) {
  const pdfjs = await getPdfjs();
  const base = new URL('pdfjs/', VENDOR).href;
  try {
    const task = pdfjs.getDocument({
      data: bytes.slice(), // copia: PDF.js se queda con el buffer original
      wasmUrl: `${base}wasm/`,
      cMapUrl: `${base}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${base}standard_fonts/`,
      iccUrl: `${base}iccs/`,
      isEvalSupported: false,
      enableXfa: false,
    });
    return await task.promise;
  } catch (error) {
    if (error?.name === 'PasswordException') {
      throw new Error(`«${fileName}» tiene contraseña. Quítasela con Desbloquear PDF y vuelve a intentarlo.`);
    }
    throw new Error(`No se pudo leer «${fileName}». Puede estar dañado o no ser un PDF.`);
  }
}

/** Miniatura de la primera página para las listas de archivos. Devuelve null si falla. */
export async function firstPageThumb(bytes, fileName, width = 96) {
  try {
    const doc = await openPreview(bytes, fileName);
    const canvas = await renderPage(doc, 1, { width });
    closePreview(doc);
    canvas.className = 'file-thumb';
    canvas.setAttribute('aria-hidden', 'true');
    return canvas;
  } catch {
    return null;
  }
}

/** Libera la memoria de un documento abierto con PDF.js. */
export function closePreview(doc) {
  try {
    doc?.loadingTask?.destroy();
  } catch {
    /* ya estaba cerrado */
  }
}

// Límites seguros para el lienzo, sobre todo en celulares.
const MAX_SIDE = 8192;
const MAX_AREA = 16_000_000;

/** Dibuja una página en un canvas. width = ancho deseado en píxeles o scale. */
export async function renderPage(doc, pageNumber, { width, scale, background = '#ffffff' } = {}) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  let s = scale ?? (width ? width / base.width : 1);
  const w = base.width * s;
  const h = base.height * s;
  const shrink = Math.min(1, MAX_SIDE / w, MAX_SIDE / h, Math.sqrt(MAX_AREA / (w * h)));
  s *= shrink;
  const viewport = page.getViewport({ scale: s });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
}

/**
 * Dibuja miniaturas solo cuando se ven en pantalla, de una en una,
 * para no gastar memoria con PDF largos.
 */
export function lazyThumbs(doc, targets, width = 220) {
  const queue = [];
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    while (queue.length) {
      const { holder, pageNumber } = queue.shift();
      try {
        const canvas = await renderPage(doc, pageNumber, { width });
        canvas.setAttribute('aria-hidden', 'true');
        holder.replaceChildren(canvas);
      } catch {
        holder.textContent = '';
      }
    }
    running = false;
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        queue.push({ holder: entry.target, pageNumber: Number(entry.target.dataset.page) });
      });
      run();
    },
    { rootMargin: '400px 0px' }
  );

  targets.forEach((holder) => observer.observe(holder));
  return () => observer.disconnect();
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen.'))), type, quality);
  });
}

/* ---------- Rangos de páginas ---------- */

/**
 * Convierte "1-3, 5, 8-" en rangos [[1,3],[5,5],[8,total]].
 * Devuelve { ranges } o { error }.
 */
export function parseRanges(text, total) {
  const clean = String(text || '').replace(/\s+/g, '');
  if (!clean) return { error: 'Escribe qué páginas quieres, por ejemplo 1-3, 5.' };
  const ranges = [];
  for (const part of clean.split(/[,;]+/).filter(Boolean)) {
    const match = part.match(/^(\d*)-(\d*)$|^(\d+)$/);
    if (!match) return { error: `«${part}» no es un rango válido. Usa números y guiones, por ejemplo 2-4.` };
    let start;
    let end;
    if (match[3]) {
      start = end = Number(match[3]);
    } else {
      start = match[1] ? Number(match[1]) : 1;
      end = match[2] ? Number(match[2]) : total;
      if (!match[1] && !match[2]) return { error: '«-» solo no es un rango válido.' };
    }
    if (start < 1 || end < 1) return { error: 'Las páginas empiezan en 1.' };
    if (start > total || end > total) {
      return { error: `El documento tiene ${pages(total)}. Revisa «${part}».` };
    }
    if (start > end) return { error: `En «${part}» el primer número debe ser menor que el segundo.` };
    ranges.push([start, end]);
  }
  return { ranges };
}

export function rangesToList(ranges) {
  const list = [];
  ranges.forEach(([a, b]) => {
    for (let i = a; i <= b; i += 1) list.push(i);
  });
  return list;
}

/** Convierte una lista de números en texto compacto: [1,2,3,5] → "1-3, 5". */
export function listToRanges(list) {
  const sorted = [...new Set(list)].sort((a, b) => a - b);
  const parts = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
    parts.push(i === j ? `${sorted[i]}` : `${sorted[i]}-${sorted[j]}`);
    i = j + 1;
  }
  return parts.join(', ');
}

/* ---------- Geometría de páginas giradas ---------- */

/**
 * Para una página con /Rotate, devuelve una función que traduce un punto
 * expresado "como se ve" (origen abajo a la izquierda de lo visible) al
 * sistema de coordenadas real de la página, y el giro que hay que sumar
 * al texto para que se vea derecho.
 */
export function viewTransform(page) {
  const box = page.getCropBox();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const { x, y, width, height } = box;
  const viewW = rotation % 180 === 0 ? width : height;
  const viewH = rotation % 180 === 0 ? height : width;
  // /Rotate gira la página en sentido horario al mostrarla.
  const toPage = (vx, vy) => {
    switch (rotation) {
      case 90:
        return { x: x + width - vy, y: y + vx };
      case 180:
        return { x: x + width - vx, y: y + height - vy };
      case 270:
        return { x: x + vy, y: y + height - vx };
      default:
        return { x: x + vx, y: y + vy };
    }
  };
  return { viewW, viewH, rotation, toPage };
}

/** Pasa un color "#rrggbb" a valores de 0 a 1. */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}

/** Lee un número de un input y lo limita a un rango. */
export function numberFrom(input, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
  const value = Number(String(input.value).replace(',', '.'));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function checkedValue(name, root = document) {
  return root.querySelector(`input[name="${name}"]:checked`)?.value;
}

export const MM = 72 / 25.4;

/** Nombre de una fuente estándar de PDF según familia y grosor. */
export function standardFontName(StandardFonts, family, bold) {
  const map = {
    helvetica: ['Helvetica', 'HelveticaBold'],
    times: ['TimesRoman', 'TimesRomanBold'],
    courier: ['Courier', 'CourierBold'],
  };
  const pair = map[family] || map.helvetica;
  return StandardFonts[pair[bold ? 1 : 0]];
}

/** Comprueba que la fuente estándar pueda escribir el texto (no admite emojis ni otros alfabetos). */
export function checkEncodable(font, text) {
  try {
    font.encodeText(text);
  } catch {
    throw new Error('El texto tiene caracteres que esta fuente no puede escribir, como emojis o letras de otros alfabetos. Usa letras, números y signos comunes.');
  }
}

/** Texto de resumen: «archivo.pdf» 12 páginas, 1,2 MB */
export function fileSummary(file, count) {
  const parts = [];
  if (Number.isFinite(count)) parts.push(pages(count));
  parts.push(formatBytes(file.size));
  return `«${escapeHtml(file.name)}» <span>${parts.join(', ')}</span>`;
}

/**
 * Vista previa en vivo: build() devuelve los bytes de un PDF de una página
 * hecho con el mismo código que el resultado final, así lo que se ve es lo que sale.
 */
export function livePreview(holder, build, { width = 480, delay = 250, onError } = {}) {
  let timer = null;
  let token = 0;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      token += 1;
      const mine = token;
      try {
        const bytes = await build();
        if (!bytes || mine !== token) return;
        const doc = await openPreview(bytes, 'vista previa');
        const canvas = await renderPage(doc, 1, { width });
        closePreview(doc);
        if (mine !== token) return;
        canvas.setAttribute('aria-hidden', 'true');
        holder.replaceChildren(canvas);
        onError?.(null);
      } catch (error) {
        if (mine !== token) return;
        if (onError) onError(error);
        else console.warn('Vista previa:', error);
      }
    }, delay);
  };
}

/** Muestra u oculta los bloques [data-for="a b"] según el valor elegido. */
export function toggleFor(attr, value, root = document) {
  root.querySelectorAll(`[${attr}]`).forEach((el) => {
    el.hidden = !el.getAttribute(attr).split(' ').includes(value);
  });
}

/* ---------- Inicio común ---------- */

/** Aviso discreto cuando hay una versión nueva del sitio esperando. */
function offerUpdate(worker) {
  if (document.querySelector('.update-toast')) return;
  const box = document.createElement('div');
  box.className = 'update-toast';
  box.setAttribute('role', 'status');
  const text = document.createElement('p');
  text.textContent = 'Hay una versión nueva del sitio. Al actualizar se recarga la página.';
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'btn btn-primary btn-small';
  go.innerHTML = `${icons.refresh}Actualizar`;
  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'btn btn-quiet btn-small';
  later.textContent = 'Ahora no';
  go.addEventListener('click', () => {
    wantReload = true;
    go.disabled = true;
    worker.postMessage('actualizar');
  });
  later.addEventListener('click', () => box.remove());
  const actions = document.createElement('div');
  actions.className = 'update-actions';
  actions.append(go, later);
  box.append(text, actions);
  document.body.append(box);
}

let wantReload = false;

function registerServiceWorker() {
  if (document.querySelector('meta[name="pdf-preview"]')) return;
  try {
    if (!('serviceWorker' in navigator)) return;
    const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!secure) return;
    const url = new URL('../../sw.js', import.meta.url);
    // Solo se recarga si la persona pidió actualizar.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (wantReload) {
        wantReload = false;
        location.reload();
      }
    });
    navigator.serviceWorker
      .register(url, { scope: new URL('../../', import.meta.url).pathname })
      .then((registration) => {
        const offer = (worker) => {
          if (worker && navigator.serviceWorker.controller) offerUpdate(worker);
        };
        offer(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed') offer(worker);
          });
        });
      })
      .catch(() => {});
  } catch {
    /* algunos marcos no permiten el modo sin conexión */
  }
}

function setupInstallButton() {
  const button = document.getElementById('install');
  if (!button) return;
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event;
    button.hidden = false;
  });
  button.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
    button.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    button.hidden = true;
  });
}

export function initPage() {
  registerServiceWorker();
  setupInstallButton();
}

/* ---------- Vista del resultado ---------- */

let resultUrl = null;
let resultToken = 0;

async function showResult(blob, filename, files) {
  const holder = $('[data-result]');
  const note = $('[data-result-note]');
  if (!holder) return;
  resultToken += 1;
  const mine = resultToken;
  holder.replaceChildren();
  if (note) note.textContent = '';
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;

  if (blob.type.startsWith('image/')) {
    resultUrl = URL.createObjectURL(blob);
    const img = document.createElement('img');
    img.src = resultUrl;
    img.alt = 'Vista previa de la imagen';
    holder.append(img);
    return;
  }
  if (blob.type === 'application/zip') {
    if (note && files) note.textContent = `El ZIP trae ${files} archivos.`;
    return;
  }
  if (blob.type !== 'application/pdf') return;

  try {
    const doc = await openPreview(new Uint8Array(await blob.arrayBuffer()), filename);
    const shown = Math.min(doc.numPages, 8);
    for (let n = 1; n <= shown; n += 1) {
      const canvas = await renderPage(doc, n, { width: 240 });
      if (mine !== resultToken) break;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Página ${n}`);
      holder.append(canvas);
    }
    if (note && mine === resultToken) {
      note.textContent =
        doc.numPages > shown ? `Primeras ${shown} de ${doc.numPages} páginas.` : `${pages(doc.numPages)} en total.`;
    }
    closePreview(doc);
  } catch {
    /* la vista del resultado es opcional */
  }
}

/**
 * Arma la pantalla común de una herramienta: elegir archivo → opciones → listo.
 * onFiles recibe los archivos elegidos (también los que se agregan después).
 * onRestart limpia el estado propio de la herramienta.
 */
export function setupTool({ kind = 'pdf', multiple = false, onFiles, onRestart }) {
  initPage();
  const root = $('main');
  const steps = createSteps(root);
  const input = $('[data-input]', root);
  const download = $('[data-download]', root);
  let loading = false;

  const picker = setupPicker({
    zone: $('[data-drop]', root),
    input,
    button: $('[data-pick]', root),
    kind,
    multiple,
    onFiles: async (files) => {
      if (loading) return;
      loading = true;
      steps.clear();
      try {
        await onFiles(files);
      } catch (error) {
        steps.progress(null);
        steps.error(error?.message || String(error));
      } finally {
        loading = false;
      }
    },
    onError: (message) => steps.error(message),
  });

  const tool = {
    root,
    steps,
    picker,
    /** Abre el selector de archivos para agregar más. */
    addMore() {
      input.click();
    },
    /** Muestra el paso de opciones y lleva el foco a su título. */
    showWork() {
      showSignedNote(root);
      steps.show('work');
      const heading = $('[data-step="work"] [data-focus]', root);
      heading?.focus({ preventScroll: false });
    },
    /** Ejecuta la tarea principal con el botón bloqueado y errores claros. */
    async run(button, workingText, task) {
      steps.clear();
      try {
        await busy(button, workingText, task);
      } catch (error) {
        steps.progress(null);
        steps.error(error?.message || 'Algo salió mal. Vuelve a intentarlo.');
      }
    },
    /** Deja listo el archivo para descargar y muestra cómo quedó. */
    finish(blob, filename, { files, note } = {}) {
      setDownload(download, blob, filename);
      const noteEl = $('[data-done-note]', root);
      if (noteEl) noteEl.textContent = note || '';
      steps.progress(null);
      steps.clear();
      steps.show('done');
      $('[data-step="done"]', root)?.focus();
      showResult(blob, filename, files);
    },
  };

  $('[data-restart]', root)?.addEventListener('click', () => {
    signedLoaded = false;
    steps.clear();
    steps.progress(null);
    onRestart?.();
    steps.show('pick');
    $('[data-pick]', root)?.focus();
  });

  $('[data-adjust]', root)?.addEventListener('click', () => {
    steps.clear();
    tool.showWork();
  });

  // Dejar caer archivos sobre la lista también los agrega.
  $$('[data-drop-more]', root).forEach((zone) => {
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      zone.classList.add('is-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('is-over');
      if (event.dataTransfer?.files?.length) picker.handle(event.dataTransfer.files);
    });
  });

  return tool;
}
