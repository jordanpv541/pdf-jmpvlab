// OCR PDF: reconoce el texto de páginas escaneadas con Tesseract (en el navegador)
// y le agrega al PDF una capa de texto invisible. La página se ve igual, pero
// ahora se puede buscar, seleccionar y copiar el texto.
import {
  $,
  $$,
  baseName,
  checkedValue,
  closePreview,
  fileSummary,
  getPdfLib,
  loadPdf,
  nextFrame,
  openPreview,
  pages,
  parseRanges,
  pdfBlob,
  rangesToList,
  readBytes,
  renderPage,
  setupTool,
  viewTransform,
} from '../app.js';

const BASE = new URL('../../../vendor/tesseract/', import.meta.url);
const DPI = 220;

let state = null;

const tool = setupTool({
  kind: 'pdf',
  onFiles: open,
  onRestart: () => {
    closePreview(state?.preview);
    state = null;
  },
});

const runButton = $('[data-run]');
const rangesInput = $('#ranges');

async function open([file]) {
  closePreview(state?.preview);
  tool.steps.status(`Abriendo «${file.name}»…`);
  const bytes = await readBytes(file);
  await loadPdf(bytes, file.name); // avisa si está protegido o dañado
  const preview = await openPreview(bytes, file.name);
  state = { file, bytes, preview, count: preview.numPages };
  tool.steps.clear();
  $('[data-summary]').innerHTML = fileSummary(file, state.count);
  tool.showWork();
}

$$('input[name="which"]').forEach((r) =>
  r.addEventListener('change', () => {
    const some = checkedValue('which') === 'some';
    $('[data-some]').hidden = !some;
    if (some) rangesInput.focus();
  })
);

/** true si la página ya tiene texto de verdad (no hace falta OCR). */
async function hasText(n) {
  const page = await state.preview.getPage(n);
  const content = await page.getTextContent();
  const chars = content.items.reduce((sum, item) => sum + (item.str ? item.str.trim().length : 0), 0);
  return chars > 20;
}

let tesseractPromise = null;
function getTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = import(new URL('tesseract.esm.min.js', BASE).href)
      .then((m) => m.default || m)
      .catch((error) => {
        tesseractPromise = null;
        throw error;
      });
  }
  return tesseractPromise;
}

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Leyendo…', async () => {
    const { count, file } = state;
    let list;
    if (checkedValue('which') === 'some') {
      const result = parseRanges(rangesInput.value, count);
      if (result.error) {
        rangesInput.focus();
        throw new Error(result.error);
      }
      list = [...new Set(rangesToList(result.ranges))];
    } else {
      list = Array.from({ length: count }, (_, i) => i + 1);
    }

    // Saltar páginas que ya tienen texto
    if ($('#skip-text').checked) {
      const todo = [];
      for (const n of list) if (!(await hasText(n))) todo.push(n);
      if (!todo.length) {
        throw new Error('Todas las páginas elegidas ya tienen texto que se puede buscar. No hace falta OCR.');
      }
      list = todo;
    }

    tool.steps.progress(0, list.length, 'Preparando el lector de texto (la primera vez descarga unos 6 MB)…');
    await nextFrame();
    let worker;
    try {
      const Tesseract = await getTesseract();
      worker = await Tesseract.createWorker(checkedValue('lang') || 'spa', Tesseract.OEM.LSTM_ONLY, {
        workerPath: new URL('worker.min.js', BASE).href,
        corePath: new URL('core/', BASE).href.replace(/\/$/, ''),
        langPath: new URL('lang/', BASE).href.replace(/\/$/, ''),
        workerBlobURL: false,
        gzip: true,
      });
    } catch {
      throw new Error('No se pudo preparar el lector de texto. Revisa tu conexión y vuelve a intentarlo.');
    }

    const { degrees } = await getPdfLib();
    const doc = await loadPdf(state.bytes, file.name);
    let words = 0;
    try {
      for (let i = 0; i < list.length; i += 1) {
        const n = list[i];
        tool.steps.progress(i, list.length, `Leyendo la página ${n} (${i + 1} de ${list.length})…`);
        await nextFrame();
        const canvas = await renderPage(state.preview, n, { scale: DPI / 72 });
        const { data } = await worker.recognize(canvas, { pdfTitle: baseName(file.name), pdfTextOnly: true }, { pdf: true, text: true });
        canvas.width = 0;
        words += (data.text || '').split(/\s+/).filter(Boolean).length;
        const textPdf = data.pdf instanceof Uint8Array ? data.pdf : new Uint8Array(data.pdf);
        const [layer] = await doc.embedPdf(textPdf, [0]);
        const page = doc.getPage(n - 1);
        const { viewW, viewH, rotation, toPage } = viewTransform(page);
        const start = toPage(0, 0);
        page.drawPage(layer, { x: start.x, y: start.y, width: viewW, height: viewH, rotate: degrees(rotation) });
      }
    } finally {
      await worker.terminate().catch(() => {});
    }

    tool.steps.progress(list.length, list.length, 'Guardando…');
    await nextFrame();
    const bytes = await doc.save();
    const note = words
      ? `Reconocimos unas ${words.toLocaleString('es')} palabras en ${pages(list.length)}. Ahora puedes buscar y copiar el texto.`
      : 'No encontramos texto en las páginas. Si son fotos o dibujos, es normal.';
    tool.finish(pdfBlob(bytes), `${baseName(file.name)}-ocr.pdf`, { note });
  })
);
