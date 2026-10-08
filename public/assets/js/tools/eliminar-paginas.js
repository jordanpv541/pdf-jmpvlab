// Eliminar páginas: marca las páginas que sobran y guarda el PDF sin ellas.
import {
  $,
  $$,
  baseName,
  closePreview,
  fileSummary,
  getPdfLib,
  icons,
  lazyThumbs,
  listToRanges,
  loadPdf,
  nextFrame,
  openPreview,
  pages,
  parseRanges,
  pdfBlob,
  rangesToList,
  readBytes,
  setupTool,
} from '../app.js';
import { cleanOutput, copyPagesClean } from '../pdf-clean.js';

let state = null;

const tool = setupTool({
  kind: 'pdf',
  onFiles: open,
  onRestart: reset,
});

const grid = $('[data-pages]');
const input = $('#remove');
const help = $('[data-remove-help]');
const runButton = $('[data-run]');

function reset() {
  state?.stopThumbs?.();
  closePreview(state?.preview);
  state = null;
  grid.replaceChildren();
  input.value = '';
}

async function open([file]) {
  reset();
  tool.steps.status(`Abriendo «${file.name}»…`);
  const bytes = await readBytes(file);
  const doc = await loadPdf(bytes, file.name);
  const preview = await openPreview(bytes, file.name);
  const count = doc.getPageCount();
  state = { file, doc, preview, count, removed: new Set() };
  tool.steps.clear();
  $('[data-summary]').innerHTML = fileSummary(file, count);
  const cards = [];
  for (let n = 1; n <= count; n += 1) {
    cards.push(`<li class="page-card" data-n="${n}">
      <div class="page-thumb" data-page="${n}"></div>
      <span class="page-num">${n}</span>
      <span class="check check-remove" aria-hidden="true">${icons.close}</span>
      <button type="button" class="page-pick" aria-pressed="false" aria-label="Quitar la página ${n}"></button>
    </li>`);
  }
  grid.innerHTML = cards.join('');
  state.stopThumbs = lazyThumbs(preview, $$('.page-thumb', grid), 200);
  updateHelp();
  tool.showWork();
}

function paint() {
  $$('.page-card', grid).forEach((card) => {
    const on = state.removed.has(Number(card.dataset.n));
    card.classList.toggle('is-removed', on);
    card.classList.toggle('is-selected', on);
    card.querySelector('.page-pick').setAttribute('aria-pressed', String(on));
  });
}

function setHelp(text, isError = false) {
  help.textContent = text;
  help.classList.toggle('is-error', isError);
}

function updateHelp() {
  if (!state) return;
  const text = input.value.trim();
  if (!text) {
    setHelp('Toca las páginas que quieres quitar o escribe sus números. Por ejemplo: 2, 5-7');
    return;
  }
  const result = parseRanges(text, state.count);
  if (result.error) {
    setHelp(result.error, true);
    return;
  }
  const n = new Set(rangesToList(result.ranges)).size;
  const left = state.count - n;
  if (!left) setHelp('Estás quitando todas las páginas. Deja al menos una.', true);
  else setHelp(`Se quitarán ${pages(n)}. Quedarán ${pages(left)}.`);
}

grid.addEventListener('click', (event) => {
  const button = event.target.closest('.page-pick');
  if (!button || !state) return;
  const n = Number(button.closest('.page-card').dataset.n);
  if (state.removed.has(n)) state.removed.delete(n);
  else state.removed.add(n);
  input.value = listToRanges([...state.removed]);
  paint();
  updateHelp();
});

input.addEventListener('input', () => {
  if (!state) return;
  const result = parseRanges(input.value, state.count);
  state.removed = new Set(result.ranges ? rangesToList(result.ranges) : []);
  paint();
  updateHelp();
});

$('[data-select-none]').addEventListener('click', () => {
  if (!state) return;
  input.value = '';
  state.removed.clear();
  paint();
  updateHelp();
});

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Quitando…', async () => {
    const result = parseRanges(input.value, state.count);
    if (result.error) {
      input.focus();
      throw new Error(input.value.trim() ? result.error : 'Elige al menos una página para quitar.');
    }
    const removed = new Set(rangesToList(result.ranges));
    const keep = state.doc.getPageIndices().filter((i) => !removed.has(i + 1));
    if (!keep.length) throw new Error('Estás quitando todas las páginas. Deja al menos una.');
    tool.steps.progress(0, 1, 'Creando el PDF…');
    await nextFrame();
    const { PDFDocument } = await getPdfLib();
    const out = await PDFDocument.create();
    out.setProducer('PDF jmpvlab');
    out.setCreator('PDF jmpvlab');
    const copied = await copyPagesClean(out, state.doc, keep);
    copied.forEach((page) => out.addPage(page));
    await cleanOutput(out);
    const bytes = await out.save();
    tool.finish(pdfBlob(bytes), `${baseName(state.file.name)}-sin-paginas.pdf`);
  })
);
