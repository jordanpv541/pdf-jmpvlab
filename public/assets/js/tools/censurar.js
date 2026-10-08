// Censurar PDF: tapa zonas y borra de verdad lo que hay debajo.
// Las páginas con recuadros se vuelven a dibujar como imagen, así el texto tapado
// deja de existir en el archivo (no solo queda oculto).
import {
  $,
  baseName,
  canvasToBlob,
  checkedValue,
  closePreview,
  fileSummary,
  getPdfLib,
  icons,
  loadPdf,
  nextFrame,
  openPreview,
  pages,
  pdfBlob,
  readBytes,
  renderPage,
  setupTool,
  viewTransform,
} from '../app.js';
import { cleanOutput, copyPagesClean, standIn } from '../pdf-clean.js';

let state = null;

const tool = setupTool({
  kind: 'pdf',
  onFiles: open,
  onRestart: () => {
    closePreview(state?.preview);
    state = null;
  },
});

const stage = $('[data-stage]');
const label = $('[data-page-label]');
const prevButton = $('[data-prev]');
const nextButton = $('[data-next]');
const countText = $('[data-boxes-count]');
const runButton = $('[data-run]');

const DPI = 200;

async function open([file]) {
  closePreview(state?.preview);
  tool.steps.status(`Abriendo «${file.name}»…`);
  const bytes = await readBytes(file);
  const doc = await loadPdf(bytes, file.name);
  const preview = await openPreview(bytes, file.name);
  // boxes: Map(número de página → [{ x, y, w, h }]) en fracciones de la página vista
  state = { file, doc, preview, count: doc.getPageCount(), current: 1, boxes: new Map() };
  tool.steps.clear();
  $('[data-summary]').innerHTML = fileSummary(file, state.count);
  tool.showWork();
  await showPage(1);
}

async function showPage(n) {
  if (!state) return;
  state.current = n;
  label.textContent = `Página ${n} de ${state.count}`;
  prevButton.disabled = n <= 1;
  nextButton.disabled = n >= state.count;
  const canvas = await renderPage(state.preview, n, { width: 900 });
  if (state.current !== n) return;
  canvas.setAttribute('aria-hidden', 'true');
  stage.replaceChildren(canvas);
  paintBoxes();
}

prevButton.addEventListener('click', () => state && showPage(state.current - 1));
nextButton.addEventListener('click', () => state && showPage(state.current + 1));

function boxesOf(n) {
  if (!state.boxes.has(n)) state.boxes.set(n, []);
  return state.boxes.get(n);
}

function fill() {
  return checkedValue('fill') === 'white' ? 'white' : 'black';
}

function placeBox(el, b) {
  el.style.left = `${b.x * 100}%`;
  el.style.top = `${b.y * 100}%`;
  el.style.width = `${b.w * 100}%`;
  el.style.height = `${b.h * 100}%`;
}

/** Recuadro que debe recibir el foco después de volver a dibujarlos (teclado). */
let focusIndex = null;

function paintBoxes() {
  stage.querySelectorAll('.redact-box').forEach((el) => el.remove());
  const list = boxesOf(state.current);
  list.forEach((b, i) => {
    const el = document.createElement('div');
    el.className = `redact-box is-${fill()}`;
    el.tabIndex = 0;
    el.dataset.index = String(i);
    el.setAttribute('role', 'group');
    el.setAttribute(
      'aria-label',
      `Recuadro ${i + 1} de la página ${state.current}. Flechas para moverlo, Mayús y flechas para cambiar su tamaño, Suprimir para quitarlo.`
    );
    placeBox(el, b);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'redact-remove';
    remove.dataset.index = String(i);
    remove.setAttribute('aria-label', `Quitar el recuadro ${i + 1}`);
    remove.innerHTML = icons.close;
    el.append(remove);
    stage.append(el);
  });
  if (focusIndex != null) {
    stage.querySelector(`.redact-box[data-index="${focusIndex}"]`)?.focus();
    focusIndex = null;
  }
  updateCount();
}

/* ---------- Con teclado ---------- */

const clamp01 = (v) => Math.min(1, Math.max(0, v));

$('[data-add-box]').addEventListener('click', () => {
  if (!state) return;
  const list = boxesOf(state.current);
  list.push({ x: 0.3, y: 0.45, w: 0.4, h: 0.06 });
  focusIndex = list.length - 1;
  paintBoxes();
});

// Flechas: mover. Mayús + flechas: cambiar el tamaño. Suprimir o Retroceso: quitar.
stage.addEventListener('keydown', (event) => {
  const el = event.target.closest('.redact-box');
  if (!el || !state || event.target !== el) return;
  const i = Number(el.dataset.index);
  const list = boxesOf(state.current);
  const b = list[i];
  if (!b) return;
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    list.splice(i, 1);
    paintBoxes();
    countText.textContent = `Recuadro quitado. ${countText.textContent}`;
    $('[data-add-box]').focus();
    return;
  }
  const step = 0.01;
  const keys = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const delta = keys[event.key];
  if (!delta) return;
  event.preventDefault();
  if (event.shiftKey) {
    b.w = Math.min(1 - b.x, Math.max(0.02, b.w + delta[0]));
    b.h = Math.min(1 - b.y, Math.max(0.01, b.h + delta[1]));
  } else {
    b.x = clamp01(Math.min(1 - b.w, b.x + delta[0]));
    b.y = clamp01(Math.min(1 - b.h, b.y + delta[1]));
  }
  focusIndex = i;
  paintBoxes();
});

function updateCount() {
  let total = 0;
  let pagesWith = 0;
  state.boxes.forEach((list) => {
    total += list.length;
    if (list.length) pagesWith += 1;
  });
  countText.textContent = total
    ? `${total === 1 ? '1 recuadro' : `${total} recuadros`} en ${pages(pagesWith)}.`
    : 'Todavía no hay recuadros.';
}

document.addEventListener('change', (event) => {
  if (event.target.name === 'fill' && state) paintBoxes();
});

stage.addEventListener('click', (event) => {
  const button = event.target.closest('.redact-remove');
  if (!button || !state) return;
  boxesOf(state.current).splice(Number(button.dataset.index), 1);
  paintBoxes();
});

// Dibujar recuadros arrastrando sobre la página.
stage.addEventListener('pointerdown', (event) => {
  if (!state || event.target.closest('.redact-remove') || event.button > 0) return;
  event.preventDefault();
  stage.setPointerCapture(event.pointerId);
  const rect = stage.getBoundingClientRect();
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const sx = clamp((event.clientX - rect.left) / rect.width);
  const sy = clamp((event.clientY - rect.top) / rect.height);
  const ghost = document.createElement('div');
  ghost.className = `redact-box is-${fill()} is-drawing`;
  stage.append(ghost);
  let box = { x: sx, y: sy, w: 0, h: 0 };
  const move = (e) => {
    const x = clamp((e.clientX - rect.left) / rect.width);
    const y = clamp((e.clientY - rect.top) / rect.height);
    box = { x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) };
    placeBox(ghost, box);
  };
  const up = () => {
    stage.removeEventListener('pointermove', move);
    stage.removeEventListener('pointerup', up);
    stage.removeEventListener('pointercancel', up);
    ghost.remove();
    if (box.w > 0.01 && box.h > 0.005) boxesOf(state.current).push(box);
    paintBoxes();
  };
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
});

$('[data-clear-page]').addEventListener('click', () => {
  if (!state) return;
  state.boxes.set(state.current, []);
  paintBoxes();
});

/* ---------- Guardar ---------- */

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Censurando…', async () => {
    const marked = [...state.boxes.entries()].filter(([, list]) => list.length).map(([n]) => n);
    if (!marked.length) throw new Error('Dibuja al menos un recuadro sobre lo que quieres tapar.');
    const { PDFDocument } = await getPdfLib();
    const out = await PDFDocument.create();
    out.setProducer('PDF jmpvlab');
    out.setCreator('PDF jmpvlab');
    const markedSet = new Set(marked);
    const keepIdx = state.doc.getPageIndices().filter((i) => !markedSet.has(i + 1));
    const copies = await copyPagesClean(out, state.doc, keepIdx);
    let k = 0;
    let done = 0;
    for (let n = 1; n <= state.count; n += 1) {
      if (!markedSet.has(n)) {
        out.addPage(copies[k]);
        k += 1;
        continue;
      }
      tool.steps.progress(done, marked.length, `Borrando lo tapado en la página ${n}…`);
      await nextFrame();
      const canvas = await renderPage(state.preview, n, { scale: DPI / 72 });
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = fill() === 'white' ? '#ffffff' : '#000000';
      state.boxes.get(n).forEach((b) => {
        ctx.fillRect(
          Math.floor(b.x * canvas.width),
          Math.floor(b.y * canvas.height),
          Math.ceil(b.w * canvas.width) + 1,
          Math.ceil(b.h * canvas.height) + 1
        );
      });
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
      canvas.width = 0;
      canvas.height = 0;
      const jpg = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const { viewW, viewH } = viewTransform(state.doc.getPage(n - 1));
      const page = out.addPage([viewW, viewH]);
      page.drawImage(jpg, { x: 0, y: 0, width: viewW, height: viewH });
      standIn(out, page, state.doc, n - 1);
      done += 1;
    }
    tool.steps.progress(marked.length, marked.length, 'Guardando…');
    await nextFrame();
    // Sin esto, lo tapado puede seguir escondido en el archivo (enlaces, recursos compartidos).
    await cleanOutput(out);
    const bytes = await out.save();
    tool.finish(pdfBlob(bytes), `${baseName(state.file.name)}-censurado.pdf`);
  })
);
