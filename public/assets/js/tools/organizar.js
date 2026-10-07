// Organizar páginas: girar, mover y quitar páginas.
import {
  $,
  closePreview,
  $$,
  baseName,
  fileSummary,
  getPdfLib,
  icons,
  lazyThumbs,
  loadPdf,
  nextFrame,
  openPreview,
  pages,
  pdfBlob,
  readBytes,
  setupTool,
} from '../app.js';

let state = null;

const tool = setupTool({
  kind: 'pdf',
  onFiles: open,
  onRestart: reset,
});

const grid = $('[data-pages]');
const summary = $('[data-summary]');
const runButton = $('[data-run]');

function reset() {
  state?.stopThumbs?.();
  closePreview(state?.preview);
  state = null;
  grid.replaceChildren();
}

async function open([file]) {
  reset();
  tool.steps.status(`Abriendo «${file.name}»…`);
  const bytes = await readBytes(file);
  const doc = await loadPdf(bytes, file.name);
  const preview = await openPreview(bytes, file.name);
  const count = doc.getPageCount();
  // Por cada página original: giro agregado y si se quitó.
  const info = Array.from({ length: count }, (_, i) => ({
    index: i,
    base: doc.getPage(i).getRotation().angle,
    delta: 0,
    removed: false,
  }));
  state = { file, doc, preview, count, info };
  tool.steps.clear();
  buildGrid();
  updateSummary();
  tool.showWork();
}

function cardHtml(i) {
  const n = i + 1;
  return `<li class="page-card" draggable="true" data-index="${i}">
    <div class="page-thumb" data-page="${n}"></div>
    <span class="page-num">${n}</span>
    <button type="button" class="icon-btn page-remove" data-act="remove" aria-pressed="false" aria-label="Quitar la página ${n}">${icons.trash}</button>
    <div class="page-controls">
      <button type="button" class="icon-btn" data-act="prev" aria-label="Mover la página ${n} hacia atrás">${icons.left}</button>
      <button type="button" class="icon-btn" data-act="rotl" aria-label="Girar la página ${n} a la izquierda">${icons.rotateLeft}</button>
      <button type="button" class="icon-btn" data-act="rotr" aria-label="Girar la página ${n} a la derecha">${icons.rotateRight}</button>
      <button type="button" class="icon-btn" data-act="next" aria-label="Mover la página ${n} hacia adelante">${icons.right}</button>
    </div>
  </li>`;
}

function buildGrid() {
  grid.innerHTML = state.info.map((_, i) => cardHtml(i)).join('');
  state.stopThumbs = lazyThumbs(state.preview, $$('.page-thumb', grid), 200);
  updateEnds();
}

const cards = () => $$('.page-card', grid);
const infoOf = (card) => state.info[Number(card.dataset.index)];

function updateSummary() {
  const removed = state.info.filter((p) => p.removed).length;
  const kept = state.count - removed;
  let extra = pages(kept);
  if (removed) extra += removed === 1 ? ', 1 quitada' : `, ${removed} quitadas`;
  summary.innerHTML = `${fileSummary(state.file, state.count)}<br><span>Quedarán ${extra}.</span>`;
}

function updateEnds() {
  const list = cards();
  list.forEach((card, pos) => {
    card.querySelector('[data-act="prev"]').disabled = pos === 0;
    card.querySelector('[data-act="next"]').disabled = pos === list.length - 1;
  });
}

function paintRotation(card) {
  const { delta } = infoOf(card);
  const thumb = card.querySelector('.page-thumb');
  const quarter = ((delta / 90) % 2 + 2) % 2 === 1;
  thumb.style.transform = delta ? `rotate(${delta}deg) scale(${quarter ? 0.75 : 1})` : '';
}

function paintRemoved(card) {
  const p = infoOf(card);
  const n = p.index + 1;
  card.classList.toggle('is-removed', p.removed);
  const button = card.querySelector('[data-act="remove"]');
  button.setAttribute('aria-pressed', String(p.removed));
  button.setAttribute('aria-label', p.removed ? `Recuperar la página ${n}` : `Quitar la página ${n}`);
  button.innerHTML = p.removed ? icons.restore : icons.trash;
}

grid.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-act]');
  if (!button || !state) return;
  const card = button.closest('.page-card');
  const p = infoOf(card);
  const act = button.dataset.act;

  if (act === 'rotl' || act === 'rotr') {
    p.delta += act === 'rotl' ? -90 : 90;
    paintRotation(card);
  } else if (act === 'remove') {
    p.removed = !p.removed;
    paintRemoved(card);
    updateSummary();
  } else if (act === 'prev' && card.previousElementSibling) {
    grid.insertBefore(card, card.previousElementSibling);
    updateEnds();
    focusOrFallback(card, 'prev', 'next');
  } else if (act === 'next' && card.nextElementSibling) {
    grid.insertBefore(card.nextElementSibling, card);
    updateEnds();
    focusOrFallback(card, 'next', 'prev');
  }
});

function focusOrFallback(card, act, other) {
  const button = card.querySelector(`[data-act="${act}"]`);
  if (!button.disabled) button.focus();
  else card.querySelector(`[data-act="${other}"]`).focus();
}

$$('[data-rotate-all]').forEach((button) =>
  button.addEventListener('click', () => {
    if (!state) return;
    const step = Number(button.dataset.rotateAll);
    cards().forEach((card) => {
      infoOf(card).delta += step;
      paintRotation(card);
    });
  })
);

$('[data-reset]').addEventListener('click', () => {
  if (!state) return;
  const list = cards().sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index));
  list.forEach((card) => {
    const p = infoOf(card);
    p.delta = 0;
    p.removed = false;
    paintRotation(card);
    paintRemoved(card);
    grid.appendChild(card);
  });
  updateEnds();
  updateSummary();
});

/* ---------- Arrastrar y soltar (computadora) ---------- */

let dragging = null;

grid.addEventListener('dragstart', (event) => {
  const card = event.target.closest?.('.page-card');
  if (!card) return;
  dragging = card;
  card.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', card.dataset.index);
});

grid.addEventListener('dragend', () => {
  dragging?.classList.remove('is-dragging');
  cards().forEach((c) => c.classList.remove('is-drop-target'));
  dragging = null;
});

grid.addEventListener('dragover', (event) => {
  if (!dragging) return;
  const card = event.target.closest('.page-card');
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  cards().forEach((c) => c.classList.toggle('is-drop-target', c === card && c !== dragging));
});

grid.addEventListener('drop', (event) => {
  if (!dragging) return;
  event.preventDefault();
  const card = event.target.closest('.page-card');
  if (card && card !== dragging) {
    const rect = card.getBoundingClientRect();
    const after = event.clientX > rect.left + rect.width / 2;
    grid.insertBefore(dragging, after ? card.nextElementSibling : card);
    updateEnds();
  }
  cards().forEach((c) => c.classList.remove('is-drop-target'));
});

/* ---------- Guardar ---------- */

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Guardando…', async () => {
    const order = cards()
      .map(infoOf)
      .filter((p) => !p.removed);
    if (!order.length) throw new Error('Deja al menos una página.');
    const { PDFDocument, degrees } = await getPdfLib();
    tool.steps.progress(0, 1, 'Creando el PDF…');
    await nextFrame();
    const out = await PDFDocument.create();
    out.setProducer('PDF jmpvlab');
    out.setCreator('PDF jmpvlab');
    const copied = await out.copyPages(
      state.doc,
      order.map((p) => p.index)
    );
    copied.forEach((page, i) => {
      const angle = (((order[i].base + order[i].delta) % 360) + 360) % 360;
      page.setRotation(degrees(angle));
      out.addPage(page);
    });
    const bytes = await out.save();
    tool.finish(pdfBlob(bytes), `${baseName(state.file.name)}-organizado.pdf`);
  })
);
