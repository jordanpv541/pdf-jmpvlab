// Dividir PDF: sacar páginas a un PDF nuevo, separar por rangos o cortar cada N páginas.
import {
  $,
  closePreview,
  $$,
  baseName,
  checkedValue,
  fileSummary,
  getPdfLib,
  icons,
  lazyThumbs,
  listToRanges,
  loadPdf,
  nextFrame,
  openPreview,
  pad,
  pages,
  parseRanges,
  pdfBlob,
  rangesToList,
  readBytes,
  setupTool,
  toggleFor,
  zipBlob,
} from '../app.js';
import { cleanOutput, copyPagesClean } from '../pdf-clean.js';

let state = null;

const tool = setupTool({
  kind: 'pdf',
  onFiles: open,
  onRestart: reset,
});

const grid = $('[data-pages]');
const rangesInput = $('#ranges');
const rangesHelp = $('[data-ranges-help]');
const rangesLabel = $('[data-ranges-label]');
const everyInput = $('#every');
const everyHelp = $('[data-every-help]');
const runButton = $('[data-run]');
const separateBox = $('#separate');

function reset() {
  state?.stopThumbs?.();
  closePreview(state?.preview);
  state = null;
  grid.replaceChildren();
  rangesInput.value = '';
}

async function open([file]) {
  reset();
  tool.steps.status(`Abriendo «${file.name}»…`);
  const bytes = await readBytes(file);
  const doc = await loadPdf(bytes, file.name);
  const preview = await openPreview(bytes, file.name);
  const count = doc.getPageCount();
  state = { file, doc, preview, count, selected: new Set() };
  tool.steps.clear();

  $('[data-summary]').innerHTML = fileSummary(file, count);
  if (everyInput) everyInput.max = String(count);
  buildGrid();
  updateMode();
  tool.showWork();
}

function buildGrid() {
  const { count } = state;
  const items = [];
  for (let n = 1; n <= count; n += 1) {
    items.push(`<li class="page-card" data-n="${n}">
      <div class="page-thumb" data-page="${n}"></div>
      <span class="page-num">${n}</span>
      <span class="check" aria-hidden="true">${icons.check}</span>
      <button type="button" class="page-pick" aria-pressed="false" aria-label="Página ${n}"></button>
    </li>`);
  }
  grid.innerHTML = items.join('');
  state.stopThumbs = lazyThumbs(state.preview, $$('.page-thumb', grid), 200);
}

function mode() {
  return checkedValue('mode') || 'extraer';
}

function updateMode() {
  const m = mode();
  toggleFor('data-for', m, tool.root);
  if (m === 'extraer') {
    rangesLabel.textContent = 'Páginas que quieres sacar';
    rangesInput.placeholder = '1-3, 5, 8-';
    runButton.textContent = 'Sacar páginas';
  } else if (m === 'rangos') {
    rangesLabel.textContent = 'Partes';
    rangesInput.placeholder = '1-3, 4-6, 7-';
    runButton.textContent = 'Dividir PDF';
  } else {
    runButton.textContent = 'Dividir PDF';
  }
  updateHelp();
}

function setHelp(el, text, isError = false) {
  el.textContent = text;
  el.classList.toggle('is-error', isError);
}

function updateHelp() {
  if (!state) return;
  const m = mode();
  if (m === 'cada') {
    const n = Math.floor(Number(everyInput.value));
    if (!Number.isFinite(n) || n < 1) {
      setHelp(everyHelp, 'Escribe un número de 1 en adelante.', true);
    } else if (n >= state.count) {
      setHelp(everyHelp, `El PDF tiene ${pages(state.count)}. Elige un número menor para dividirlo.`, true);
    } else {
      setHelp(everyHelp, `Se crearán ${Math.ceil(state.count / n)} archivos.`);
    }
    return;
  }
  const text = rangesInput.value.trim();
  if (!text) {
    setHelp(
      rangesHelp,
      m === 'extraer'
        ? 'Escribe los números o toca las páginas de abajo. Por ejemplo: 1-3, 5, 8-'
        : 'Cada rango será un archivo aparte. Por ejemplo: 1-3, 4-6, 7-'
    );
    return;
  }
  const result = parseRanges(text, state.count);
  if (result.error) {
    setHelp(rangesHelp, result.error, true);
    return;
  }
  if (m === 'extraer') {
    const list = rangesToList(result.ranges);
    setHelp(
      rangesHelp,
      separateBox?.checked && list.length > 1
        ? `Se crearán ${list.length} archivos, uno por página.`
        : `Se creará un PDF con ${pages(list.length)}.`
    );
  } else {
    const n = result.ranges.length;
    setHelp(rangesHelp, n === 1 ? 'Se creará 1 archivo.' : `Se crearán ${n} archivos.`);
  }
}

function syncGridFromText() {
  if (!state) return;
  const result = parseRanges(rangesInput.value, state.count);
  state.selected = new Set(result.ranges ? rangesToList(result.ranges) : []);
  paintSelection();
}

function paintSelection() {
  $$('.page-card', grid).forEach((card) => {
    const on = state.selected.has(Number(card.dataset.n));
    card.classList.toggle('is-selected', on);
    card.querySelector('.page-pick').setAttribute('aria-pressed', String(on));
  });
}

grid.addEventListener('click', (event) => {
  const button = event.target.closest('.page-pick');
  if (!button || !state) return;
  const n = Number(button.closest('.page-card').dataset.n);
  if (state.selected.has(n)) state.selected.delete(n);
  else state.selected.add(n);
  rangesInput.value = listToRanges([...state.selected]);
  paintSelection();
  updateHelp();
});

$('[data-select-all]').addEventListener('click', () => {
  if (!state) return;
  rangesInput.value = `1-${state.count}`;
  syncGridFromText();
  updateHelp();
});

$('[data-select-none]').addEventListener('click', () => {
  rangesInput.value = '';
  syncGridFromText();
  updateHelp();
});

rangesInput.addEventListener('input', () => {
  syncGridFromText();
  updateHelp();
});
everyInput?.addEventListener('input', updateHelp);
separateBox?.addEventListener('change', updateHelp);
$$('input[name="mode"]').forEach((radio) => radio.addEventListener('change', updateMode));

/* ---------- Crear los archivos ---------- */

async function makePart(PDFDocument, indices) {
  const out = await PDFDocument.create();
  out.setProducer('PDF jmpvlab');
  out.setCreator('PDF jmpvlab');
  const copied = await copyPagesClean(out, state.doc, indices);
  copied.forEach((page) => out.addPage(page));
  await cleanOutput(out);
  return out.save();
}

function partName(base, a, b, width) {
  return a === b ? `${base}-pagina-${pad(a, width)}.pdf` : `${base}-paginas-${pad(a, width)}-${pad(b, width)}.pdf`;
}

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Dividiendo…', async () => {
    const { PDFDocument } = await getPdfLib();
    const { count, file } = state;
    const base = baseName(file.name);
    const width = String(count).length;
    const m = mode();

    let ranges;
    if (m === 'cada') {
      const n = Math.floor(Number(everyInput.value));
      if (!Number.isFinite(n) || n < 1) throw new Error('Escribe cuántas páginas quieres en cada archivo.');
      if (n >= count) throw new Error(`El PDF tiene ${pages(count)}. Elige un número menor para dividirlo.`);
      ranges = [];
      for (let a = 1; a <= count; a += n) ranges.push([a, Math.min(count, a + n - 1)]);
    } else {
      const result = parseRanges(rangesInput.value, count);
      if (result.error) {
        rangesInput.focus();
        throw new Error(result.error);
      }
      ranges = result.ranges;
    }

    if (m === 'extraer' && separateBox?.checked) {
      // Cada página elegida en su propio archivo.
      ranges = [...new Set(rangesToList(ranges))].map((n) => [n, n]);
    } else if (m === 'extraer') {
      const list = rangesToList(ranges);
      tool.steps.progress(0, 1, 'Creando el PDF…');
      await nextFrame();
      const bytes = await makePart(PDFDocument, list.map((n) => n - 1));
      tool.finish(pdfBlob(bytes), `${base}-paginas.pdf`);
      return;
    }

    if (ranges.length === 1) {
      const [a, b] = ranges[0];
      const bytes = await makePart(PDFDocument, rangesToList([[a, b]]).map((n) => n - 1));
      tool.finish(pdfBlob(bytes), partName(base, a, b, width));
      return;
    }

    const entries = [];
    for (let i = 0; i < ranges.length; i += 1) {
      const [a, b] = ranges[i];
      tool.steps.progress(i, ranges.length, `Creando archivo ${i + 1} de ${ranges.length}…`);
      const bytes = await makePart(PDFDocument, rangesToList([[a, b]]).map((n) => n - 1));
      entries.push({ name: partName(base, a, b, width), bytes });
      if (i % 5 === 4) await nextFrame();
    }
    tool.steps.progress(ranges.length, ranges.length, 'Preparando el ZIP…');
    await nextFrame();
    tool.finish(await zipBlob(entries), `${base}-dividido.zip`, { files: entries.length });
  })
);
