// Números de página: escribe el número en cada página, respetando páginas giradas.
import {
  $,
  $$,
  MM,
  baseName,
  checkedValue,
  fileSummary,
  getPdfLib,
  hexToRgb,
  livePreview,
  loadPdf,
  nextFrame,
  numberFrom,
  pdfBlob,
  readBytes,
  setupTool,
  standardFontName,
  checkEncodable,
  viewTransform,
} from '../app.js';

let state = null;

const tool = setupTool({
  kind: 'pdf',
  onFiles: open,
  onRestart: () => {
    state = null;
  },
});

const runButton = $('[data-run]');
const fromInput = $('#from');
const toInput = $('#to');
const startInput = $('#start');

async function open([file]) {
  tool.steps.status(`Abriendo «${file.name}»…`);
  const bytes = await readBytes(file);
  const doc = await loadPdf(bytes, file.name);
  const count = doc.getPageCount();
  state = { file, bytes, doc, count };
  tool.steps.clear();
  $('[data-summary]').innerHTML = fileSummary(file, count);
  fromInput.max = String(count);
  toInput.max = String(count);
  fromInput.value = '1';
  toInput.value = String(count);
  updateFormatLabels();
  tool.showWork();
  refresh();
}

/** Lee las opciones del formulario. Lanza un error si algo no cuadra. */
function readOptions() {
  const { count } = state;
  const from = Math.round(numberFrom(fromInput, { min: 1, max: count, fallback: 1 }));
  const to = Math.round(numberFrom(toInput, { min: 1, max: count, fallback: count }));
  if (from > to) throw new Error('«Desde la página» debe ser menor o igual que «Hasta la página».');
  const format = $('#format').value;
  const custom = $('#custom').value;
  if (format === 'custom' && !custom.includes('{n}')) {
    throw new Error('El texto personalizado debe incluir {n}, que es donde va el número.');
  }
  return {
    pos: checkedValue('pos') || 'bc',
    facing: checkedValue('mode') === 'doble',
    format,
    custom,
    from,
    to,
    start: Math.round(numberFrom(startInput, { min: 0, max: 99999, fallback: 1 })),
    size: numberFrom($('#size'), { min: 6, max: 72, fallback: 11 }),
    margin: numberFrom($('#margin'), { min: 0, max: 100, fallback: 10 }) * MM,
    color: hexToRgb($('#color').value),
    family: $('#font').value,
    bold: $('#bold').checked,
  };
}

function label(opts, n, last) {
  switch (opts.format) {
    case 'pagina':
      return `Página ${n}`;
    case 'pagina-de':
      return `Página ${n} de ${last}`;
    case 'n-de':
      return `${n} / ${last}`;
    case 'custom':
      return opts.custom.replaceAll('{n}', String(n)).replaceAll('{p}', String(last));
    default:
      return String(n);
  }
}

function updateFormatLabels() {
  // Muestra ejemplos con el total real del documento.
  if (!state) return;
  const last = state.count;
  $$('#format option').forEach((option) => {
    if (option.value !== 'custom') option.textContent = label({ format: option.value }, 1, last);
  });
}

function updateCustom() {
  $('[data-custom]').hidden = $('#format').value !== 'custom';
}
$('#format').addEventListener('change', updateCustom);
updateCustom();

/**
 * Escribe los números. targets: [{ page, n, index }] (index = posición de la página en el documento)
 */
async function stamp(doc, targets, opts, last) {
  const { StandardFonts, rgb, degrees } = await getPdfLib();
  const font = await doc.embedFont(standardFontName(StandardFonts, opts.family, opts.bold));
  const color = rgb(opts.color.r, opts.color.g, opts.color.b);
  const capHeight = font.heightAtSize(opts.size, { descender: false });
  checkEncodable(font, label(opts, last, last));

  for (const { page, n, index } of targets) {
    const text = label(opts, n, last);
    const width = font.widthOfTextAtSize(text, opts.size);
    const { viewW, viewH, rotation, toPage } = viewTransform(page);
    const m = Math.min(opts.margin, viewW / 3, viewH / 3);
    const vertical = opts.pos[0];
    let horizontal = opts.pos[1];
    // Doble cara: en las páginas pares el número va del lado contrario, como en un libro.
    if (opts.facing && index % 2 === 1) {
      if (horizontal === 'l') horizontal = 'r';
      else if (horizontal === 'r') horizontal = 'l';
    }
    let vy = m;
    if (vertical === 't') vy = viewH - m - capHeight;
    if (vertical === 'm') vy = (viewH - capHeight) / 2;
    let vx = (viewW - width) / 2;
    if (horizontal === 'l') vx = m;
    if (horizontal === 'r') vx = viewW - m - width;
    const point = toPage(vx, vy);
    page.drawText(text, {
      x: point.x,
      y: point.y,
      size: opts.size,
      font,
      color,
      rotate: degrees(rotation),
    });
  }
}

/* ---------- Vista previa ---------- */

const refresh = livePreview(
  $('[data-preview]'),
  async () => {
    if (!state) return null;
    let opts;
    try {
      opts = readOptions();
    } catch {
      return null;
    }
    const { PDFDocument } = await getPdfLib();
    const tmp = await PDFDocument.create();
    const [page] = await tmp.copyPages(state.doc, [opts.from - 1]);
    tmp.addPage(page);
    const last = opts.start + (opts.to - opts.from);
    await stamp(tmp, [{ page: tmp.getPage(0), n: opts.start, index: opts.from - 1 }], opts, last);
    $('[data-preview-caption]').textContent = `Vista previa de la página ${opts.from}`;
    return tmp.save();
  },
  {
    width: 480,
    onError: (error) => {
      if (error) tool.steps.error(error.message);
      else tool.steps.clear();
    },
  }
);

tool.root.querySelector('.options').addEventListener('input', refresh);
tool.root.querySelector('.options').addEventListener('change', refresh);

/* ---------- Guardar ---------- */

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Numerando…', async () => {
    const opts = readOptions();
    tool.steps.progress(0, 1, 'Agregando números…');
    await nextFrame();
    // Se trabaja sobre una copia fresca para poder repetir con otras opciones.
    const doc = await loadPdf(state.bytes, state.file.name);
    const targets = [];
    for (let i = opts.from; i <= opts.to; i += 1) {
      targets.push({ page: doc.getPage(i - 1), n: opts.start + (i - opts.from), index: i - 1 });
    }
    const last = opts.start + (opts.to - opts.from);
    await stamp(doc, targets, opts, last);
    tool.steps.progress(1, 1, 'Guardando…');
    await nextFrame();
    const bytes = await doc.save();
    tool.finish(pdfBlob(bytes), `${baseName(state.file.name)}-numerado.pdf`);
  })
);
