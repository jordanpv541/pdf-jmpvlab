// Recortar PDF: cambia el área visible (CropBox) de las páginas.
import {
  $,
  closePreview,
  $$,
  MM,
  baseName,
  checkedValue,
  fileSummary,
  loadPdf,
  nextFrame,
  numberFrom,
  openPreview,
  pdfBlob,
  readBytes,
  renderPage,
  setupTool,
  viewTransform,
} from '../app.js';

let state = null;

const tool = setupTool({
  kind: 'pdf',
  onFiles: open,
  onRestart: reset,
});

const stage = $('[data-crop-preview]');
const box = $('[data-crop-box]');
const label = $('[data-page-label]');
const prevButton = $('[data-prev]');
const nextButton = $('[data-next]');
const runButton = $('[data-run]');
const inputs = $$('[data-side]');
const autoHelp = $('[data-auto-help]');

const MIN_SIDE = 36; // media pulgada: lo mínimo que dejamos de página

function reset() {
  closePreview(state?.preview);
  state = null;
  stage.querySelector('canvas')?.remove();
}

async function open([file]) {
  reset();
  tool.steps.status(`Abriendo «${file.name}»…`);
  const bytes = await readBytes(file);
  const doc = await loadPdf(bytes, file.name);
  const preview = await openPreview(bytes, file.name);
  state = { file, bytes, doc, preview, count: doc.getPageCount(), current: 1 };
  tool.steps.clear();
  $('[data-summary]').innerHTML = fileSummary(file, state.count);
  inputs.forEach((input) => {
    input.value = '0';
  });
  autoHelp.textContent = 'Mide los bordes en blanco de la página que estás viendo.';
  tool.showWork();
  await showPage(1);
}

function margins() {
  const m = {};
  inputs.forEach((input) => {
    m[input.dataset.side] = numberFrom(input, { min: 0, max: 2000, fallback: 0 }) * MM;
  });
  return m;
}

async function showPage(n) {
  if (!state) return;
  state.current = n;
  label.textContent = `Página ${n} de ${state.count}`;
  prevButton.disabled = n <= 1;
  nextButton.disabled = n >= state.count;
  const canvas = await renderPage(state.preview, n, { width: 520 });
  if (state.current !== n) return;
  canvas.setAttribute('aria-hidden', 'true');
  stage.querySelector('canvas')?.remove();
  stage.prepend(canvas);
  paintBox();
}

function paintBox() {
  if (!state) return;
  const page = state.doc.getPage(state.current - 1);
  const { viewW, viewH } = viewTransform(page);
  const m = margins();
  const pct = (value, total) => `${Math.min(100, (value / total) * 100)}%`;
  box.style.left = pct(m.left, viewW);
  box.style.right = pct(m.right, viewW);
  box.style.top = pct(m.top, viewH);
  box.style.bottom = pct(m.bottom, viewH);
  const tooSmall = viewW - m.left - m.right < MIN_SIDE || viewH - m.top - m.bottom < MIN_SIDE;
  box.classList.toggle('is-invalid', tooSmall);
}

inputs.forEach((input) => input.addEventListener('input', paintBox));
prevButton.addEventListener('click', () => state && showPage(state.current - 1));
nextButton.addEventListener('click', () => state && showPage(state.current + 1));

/* ---------- Detectar bordes blancos ---------- */

$('[data-auto]').addEventListener('click', async () => {
  if (!state) return;
  tool.steps.clear();
  const canvas = await renderPage(state.preview, state.current, { width: 900 });
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const ink = (x, y) => {
    const i = (y * width + x) * 4;
    return data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235;
  };
  let top = -1;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!ink(x, y)) continue;
      if (top < 0) top = y;
      bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  canvas.width = 0;
  canvas.height = 0;
  if (top < 0) {
    autoHelp.textContent = 'Esta página está en blanco: no hay bordes que medir.';
    return;
  }
  const page = state.doc.getPage(state.current - 1);
  const { viewW, viewH } = viewTransform(page);
  const toMm = (px, totalPx, totalPt) => (px / totalPx) * totalPt / MM;
  const pad = 2; // deja 2 mm de aire alrededor del contenido
  const values = {
    top: toMm(top, height, viewH) - pad,
    bottom: toMm(height - 1 - bottom, height, viewH) - pad,
    left: toMm(left, width, viewW) - pad,
    right: toMm(width - 1 - right, width, viewW) - pad,
  };
  inputs.forEach((input) => {
    input.value = String(Math.max(0, Math.floor(values[input.dataset.side])));
  });
  paintBox();
  autoHelp.textContent = 'Listo. Revisa la vista previa y ajusta si hace falta.';
});

/* ---------- Guardar ---------- */

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Recortando…', async () => {
    const m = margins();
    if (!m.top && !m.bottom && !m.left && !m.right) {
      throw new Error('Escribe cuántos milímetros quieres quitar de al menos un lado.');
    }
    tool.steps.progress(0, 1, 'Recortando…');
    await nextFrame();
    const doc = await loadPdf(state.bytes, state.file.name);
    const indices = checkedValue('scope') === 'current' ? [state.current - 1] : doc.getPageIndices();
    for (const i of indices) {
      const page = doc.getPage(i);
      const { viewW, viewH, toPage } = viewTransform(page);
      if (viewW - m.left - m.right < MIN_SIDE || viewH - m.top - m.bottom < MIN_SIDE) {
        throw new Error(`Con esos márgenes la página ${i + 1} quedaría demasiado pequeña. Usa números más pequeños.`);
      }
      const a = toPage(m.left, m.bottom);
      const b = toPage(viewW - m.right, viewH - m.top);
      page.setCropBox(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    }
    tool.steps.progress(1, 1, 'Guardando…');
    await nextFrame();
    const bytes = await doc.save();
    tool.finish(pdfBlob(bytes), `${baseName(state.file.name)}-recortado.pdf`);
  })
);
