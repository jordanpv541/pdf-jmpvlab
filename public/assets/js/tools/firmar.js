// Firmar PDF: dibuja, escribe o sube tu firma y colócala sobre la página.
// Es una firma visual (una imagen), no una firma digital con certificado.
import {
  $,
  $$,
  baseName,
  canvasToBlob,
  checkedValue,
  closePreview,
  fileSummary,
  getPdfLib,
  isImage,
  loadPdf,
  nextFrame,
  numberFrom,
  openPreview,
  pdfBlob,
  readBytes,
  renderPage,
  setupTool,
  toggleFor,
  viewTransform,
} from '../app.js';

let state = null;
// Firma lista para usar: { png: Uint8Array, url, ratio } (ratio = ancho / alto)
let signature = null;
// Posición de la esquina superior izquierda, como fracción de la página vista.
const place = { x: 0.55, y: 0.78 };

const tool = setupTool({
  kind: 'pdf',
  onFiles: open,
  onRestart: () => {
    closePreview(state?.preview);
    state = null;
  },
});

const stage = $('[data-stage]');
const overlay = $('[data-overlay]');
const pad = $('[data-pad]');
const label = $('[data-page-label]');
const prevButton = $('[data-prev]');
const nextButton = $('[data-next]');
const sizeInput = $('#sig-size');
const runButton = $('[data-run]');

async function open([file]) {
  closePreview(state?.preview);
  tool.steps.status(`Abriendo «${file.name}»…`);
  const bytes = await readBytes(file);
  const doc = await loadPdf(bytes, file.name);
  const preview = await openPreview(bytes, file.name);
  state = { file, bytes, doc, preview, count: doc.getPageCount(), current: 1 };
  tool.steps.clear();
  $('[data-summary]').innerHTML = fileSummary(file, state.count);
  tool.showWork();
  setupPad();
  await showPage(state.count > 1 ? state.count : 1);
}

/* ---------- Vista de la página ---------- */

async function showPage(n) {
  if (!state) return;
  state.current = n;
  label.textContent = `Página ${n} de ${state.count}`;
  prevButton.disabled = n <= 1;
  nextButton.disabled = n >= state.count;
  const canvas = await renderPage(state.preview, n, { width: 560 });
  if (state.current !== n) return;
  canvas.setAttribute('aria-hidden', 'true');
  stage.querySelector('canvas')?.remove();
  stage.prepend(canvas);
  paintOverlay();
}

prevButton.addEventListener('click', () => state && showPage(state.current - 1));
nextButton.addEventListener('click', () => state && showPage(state.current + 1));

function sizeFraction() {
  return numberFrom(sizeInput, { min: 8, max: 80, fallback: 30 }) / 100;
}

function paintOverlay() {
  const canvas = stage.querySelector('canvas');
  if (!signature || !canvas) {
    overlay.hidden = true;
    return;
  }
  const w = sizeFraction();
  const h = (w * canvas.width) / canvas.height / signature.ratio; // alto como fracción del alto de la página
  place.x = Math.min(Math.max(0, place.x), Math.max(0, 1 - w));
  place.y = Math.min(Math.max(0, place.y), Math.max(0, 1 - h));
  overlay.hidden = false;
  overlay.src = signature.url;
  overlay.style.left = `${place.x * 100}%`;
  overlay.style.top = `${place.y * 100}%`;
  overlay.style.width = `${w * 100}%`;
}

sizeInput.addEventListener('input', () => {
  $('[data-out="sig-size"]').textContent = sizeInput.value;
  paintOverlay();
});

// Arrastrar la firma sobre la página (ratón o dedo).
overlay.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  overlay.setPointerCapture(event.pointerId);
  const rect = stage.getBoundingClientRect();
  const start = { x: event.clientX, y: event.clientY, px: place.x, py: place.y };
  const move = (e) => {
    place.x = start.px + (e.clientX - start.x) / rect.width;
    place.y = start.py + (e.clientY - start.y) / rect.height;
    paintOverlay();
  };
  const up = () => {
    overlay.removeEventListener('pointermove', move);
    overlay.removeEventListener('pointerup', up);
    overlay.removeEventListener('pointercancel', up);
  };
  overlay.addEventListener('pointermove', move);
  overlay.addEventListener('pointerup', up);
  overlay.addEventListener('pointercancel', up);
});

// Mover con el teclado: flechas (Shift para pasos grandes).
overlay.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 0.05 : 0.01;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const delta = moves[event.key];
  if (!delta) return;
  event.preventDefault();
  place.x += delta[0];
  place.y += delta[1];
  paintOverlay();
});

/* ---------- Crear la firma ---------- */

/** Recorta los bordes transparentes de un lienzo. */
function trim(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (right < 0) return null;
  const padPx = 4;
  const out = document.createElement('canvas');
  out.width = right - left + 1 + padPx * 2;
  out.height = bottom - top + 1 + padPx * 2;
  out.getContext('2d').drawImage(canvas, left, top, out.width - padPx * 2, out.height - padPx * 2, padPx, padPx, out.width - padPx * 2, out.height - padPx * 2);
  return out;
}

async function useCanvas(canvas) {
  const trimmed = canvas && trim(canvas);
  if (signature?.url) URL.revokeObjectURL(signature.url);
  if (!trimmed) {
    signature = null;
    paintOverlay();
    return;
  }
  const blob = await canvasToBlob(trimmed, 'image/png');
  signature = {
    png: new Uint8Array(await blob.arrayBuffer()),
    url: URL.createObjectURL(blob),
    ratio: trimmed.width / trimmed.height,
  };
  paintOverlay();
}

function inkColor() {
  return checkedValue('ink') === 'blue' ? '#1f3a93' : '#111111';
}

// Dibujar
let padReady = false;
let drawn = false;
function setupPad() {
  if (padReady) return;
  padReady = true;
  const ratio = window.devicePixelRatio || 1;
  const resize = () => {
    const rect = pad.getBoundingClientRect();
    if (!rect.width) return;
    pad.width = Math.round(rect.width * ratio);
    pad.height = Math.round(rect.height * ratio);
    drawn = false;
  };
  resize();
  let last = null;
  const ctx = pad.getContext('2d');
  const point = (e) => {
    const rect = pad.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * ratio, y: (e.clientY - rect.top) * ratio };
  };
  pad.addEventListener('pointerdown', (e) => {
    if (!pad.width) resize();
    pad.setPointerCapture(e.pointerId);
    last = point(e);
    ctx.strokeStyle = inkColor();
    ctx.fillStyle = inkColor();
    ctx.lineWidth = 3 * ratio;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(last.x, last.y, 1.5 * ratio, 0, Math.PI * 2);
    ctx.fill();
  });
  pad.addEventListener('pointermove', (e) => {
    if (!last) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    drawn = true;
  });
  const end = () => {
    if (!last) return;
    last = null;
    drawn = true;
    useCanvas(pad);
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
}

$('[data-clear]').addEventListener('click', () => {
  pad.getContext('2d').clearRect(0, 0, pad.width, pad.height);
  drawn = false;
  useCanvas(null);
});

// Escribir
const FONTS = {
  dancing: '"Dancing Script", cursive',
  vibes: '"Great Vibes", cursive',
  caveat: 'Caveat, cursive',
};

async function typedSignature() {
  const text = $('#sig-name').value.trim();
  if (!text) {
    useCanvas(null);
    return;
  }
  const family = FONTS[checkedValue('sigfont')] || FONTS.dancing;
  const size = 120;
  try {
    await document.fonts.load(`${size}px ${family}`, text);
  } catch {
    /* si la fuente no carga, se usa la de respaldo */
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `${size}px ${family}`;
  canvas.width = Math.ceil(ctx.measureText(text).width + size);
  canvas.height = Math.ceil(size * 1.8);
  ctx.font = `${size}px ${family}`;
  ctx.fillStyle = inkColor();
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, canvas.height / 2);
  useCanvas(canvas);
}
$('#sig-name').addEventListener('input', typedSignature);
$$('input[name="sigfont"]').forEach((r) => r.addEventListener('change', typedSignature));

// Imagen
let uploaded = null;
const sigInput = $('[data-sig-input]');
$('[data-sig-pick]').addEventListener('click', () => sigInput.click());
sigInput.addEventListener('change', async () => {
  const file = sigInput.files?.[0];
  sigInput.value = '';
  if (!file) return;
  if (!isImage(file)) {
    tool.steps.error(`«${file.name}» no es una imagen PNG o JPG.`);
    return;
  }
  try {
    uploaded = await createImageBitmap(file);
  } catch {
    tool.steps.error(`No se pudo leer la imagen «${file.name}».`);
    return;
  }
  tool.steps.clear();
  $('[data-sig-name]').textContent = file.name;
  imageSignature();
});
$('#sig-clean').addEventListener('change', imageSignature);

function imageSignature() {
  if (!uploaded) return;
  const scale = Math.min(1, 1400 / uploaded.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(uploaded.width * scale);
  canvas.height = Math.round(uploaded.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(uploaded, 0, 0, canvas.width, canvas.height);
  if ($('#sig-clean').checked) {
    // Vuelve transparente el papel blanco o gris claro de una foto.
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const light = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (light > 200) d[i + 3] = 0;
      else if (light > 150) d[i + 3] = Math.round(d[i + 3] * ((200 - light) / 50));
    }
    ctx.putImageData(img, 0, 0);
  }
  useCanvas(canvas);
}

// Cambiar de tipo de firma
function refreshKind() {
  const kind = checkedValue('sigkind');
  toggleFor('data-sig', kind, tool.root);
  if (kind === 'draw') {
    setupPad();
    if (drawn) useCanvas(pad);
    else useCanvas(null);
  } else if (kind === 'type') typedSignature();
  else if (uploaded) imageSignature();
  else useCanvas(null);
}
$$('input[name="sigkind"]').forEach((r) => r.addEventListener('change', refreshKind));
$$('input[name="ink"]').forEach((r) =>
  r.addEventListener('change', () => {
    if (checkedValue('sigkind') === 'type') typedSignature();
  })
);

/* ---------- Guardar ---------- */

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Firmando…', async () => {
    if (!signature) throw new Error('Primero crea tu firma: dibújala, escríbela o sube una imagen.');
    tool.steps.progress(0, 1, 'Poniendo la firma…');
    await nextFrame();
    const { degrees } = await getPdfLib();
    const doc = await loadPdf(state.bytes, state.file.name);
    const png = await doc.embedPng(signature.png);
    const targets = checkedValue('scope') === 'all' ? doc.getPages() : [doc.getPage(state.current - 1)];
    const size = sizeFraction();
    for (const page of targets) {
      const { viewW, viewH, rotation, toPage } = viewTransform(page);
      const w = viewW * size;
      const h = w / signature.ratio;
      const vx = Math.min(place.x * viewW, viewW - w);
      const vy = Math.max(0, viewH - place.y * viewH - h); // de arriba-abajo a abajo-arriba
      const start = toPage(vx, vy);
      page.drawImage(png, { x: start.x, y: start.y, width: w, height: h, rotate: degrees(rotation) });
    }
    tool.steps.progress(1, 1, 'Guardando…');
    await nextFrame();
    const bytes = await doc.save();
    tool.finish(pdfBlob(bytes), `${baseName(state.file.name)}-firmado.pdf`);
  })
);
