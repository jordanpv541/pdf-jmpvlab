// Marca de agua de texto o imagen, centrada o en mosaico, respetando páginas giradas.
import {
  $,
  $$,
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
  toggleFor,
  viewTransform,
} from '../app.js';

let state = null;
let mark = null; // imagen elegida: { name, bytes, type }

const tool = setupTool({
  kind: 'pdf',
  onFiles: open,
  onRestart: () => {
    state = null;
  },
});

const runButton = $('[data-run]');
const textInput = $('#wm-text');

async function open([file]) {
  tool.steps.status(`Abriendo «${file.name}»…`);
  const bytes = await readBytes(file);
  const doc = await loadPdf(bytes, file.name);
  state = { file, bytes, doc, count: doc.getPageCount() };
  tool.steps.clear();
  $('[data-summary]').innerHTML = fileSummary(file, state.count);
  $('#wm-from').max = String(state.count);
  $('#wm-to').max = String(state.count);
  $('#wm-from').value = '1';
  $('#wm-to').value = String(state.count);
  tool.showWork();
  refresh();
}

/* ---------- Opciones ---------- */

function readOptions() {
  const kind = checkedValue('kind');
  const count = state.count;
  const from = Math.round(numberFrom($('#wm-from'), { min: 1, max: count, fallback: 1 }));
  const to = Math.round(numberFrom($('#wm-to'), { min: 1, max: count, fallback: count }));
  if (from > to) throw new Error('«Desde la página» debe ser menor o igual que «Hasta la página».');
  const opts = {
    kind,
    layout: checkedValue('layout'),
    pos: checkedValue('pos') || 'mc',
    angle: Number(checkedValue('angle')) || 0,
    opacity: numberFrom($('#wm-opacity'), { min: 5, max: 100, fallback: 30 }) / 100,
    below: checkedValue('layer') === 'below',
    from,
    to,
  };
  if (kind === 'text') {
    opts.text = textInput.value.trim();
    if (!opts.text) throw new Error('Escribe el texto de la marca de agua.');
    opts.size = numberFrom($('#wm-size'), { min: 8, max: 300, fallback: 60 });
    opts.color = hexToRgb($('#wm-color').value);
    opts.family = $('#wm-font').value;
    opts.bold = $('#wm-bold').checked;
  } else {
    if (!mark) throw new Error('Elige la imagen que quieres usar como marca de agua.');
    opts.scale = numberFrom($('#wm-scale'), { min: 5, max: 100, fallback: 40 }) / 100;
  }
  return opts;
}

$$('input[name="kind"]').forEach((r) =>
  r.addEventListener('change', () => toggleFor('data-kind', checkedValue('kind'), tool.root))
);
$$('input[name="layout"]').forEach((r) =>
  r.addEventListener('change', () => toggleFor('data-layout', checkedValue('layout'), tool.root))
);

$$('[data-out]').forEach((output) => {
  const input = document.getElementById(output.dataset.out);
  input.addEventListener('input', () => {
    output.textContent = input.value;
  });
});

const markInput = $('[data-wm-input]');
$('[data-wm-pick]').addEventListener('click', () => markInput.click());
markInput.addEventListener('change', async () => {
  const file = markInput.files?.[0];
  markInput.value = '';
  if (!file) return;
  const bytes = await readBytes(file);
  const type = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'png' : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'jpg' : null;
  if (!type) {
    tool.steps.error(`«${file.name}» no es una imagen PNG o JPG.`);
    return;
  }
  mark = { name: file.name, bytes, type };
  $('[data-wm-name]').textContent = file.name;
  tool.steps.clear();
  refresh();
});

/* ---------- Dibujo ---------- */

const rad = (deg) => (deg * Math.PI) / 180;

/** Centros (en coordenadas "como se ve") donde va cada copia de la marca. */
function centers(viewW, viewH, w, h, opts) {
  const cos = Math.cos(rad(opts.angle));
  const sin = Math.sin(rad(opts.angle));
  if (opts.layout !== 'tile') {
    // Caja que ocupa la marca ya girada, para que no se salga de la página.
    const boxW = Math.abs(w * cos) + Math.abs(h * sin);
    const boxH = Math.abs(w * sin) + Math.abs(h * cos);
    const m = 24;
    let cx = viewW / 2;
    let cy = viewH / 2;
    const [vertical, horizontal] = opts.pos;
    if (horizontal === 'l') cx = m + boxW / 2;
    if (horizontal === 'r') cx = viewW - m - boxW / 2;
    if (vertical === 't') cy = viewH - m - boxH / 2;
    if (vertical === 'b') cy = m + boxH / 2;
    return [[cx, cy]];
  }
  const stepU = w + Math.max(40, h * 1.5);
  const stepV = h * 3 + 24;
  const reach = Math.hypot(viewW, viewH) / 2 + Math.max(w, h);
  const list = [];
  let row = 0;
  for (let v = -reach; v <= reach; v += stepV, row += 1) {
    const shift = row % 2 ? stepU / 2 : 0;
    for (let u = -reach + shift; u <= reach; u += stepU) {
      const x = viewW / 2 + u * cos - v * sin;
      const y = viewH / 2 + u * sin + v * cos;
      if (x < -w / 2 || x > viewW + w / 2 || y < -w / 2 || y > viewH + w / 2) continue;
      list.push([x, y]);
    }
  }
  return list;
}

/** Pasa lo último que se dibujó en la página al fondo, debajo del contenido original. */
function sendToBack(PDFArray, page) {
  const contents = page.node.Contents();
  if (!(contents instanceof PDFArray) || contents.size() < 2) return;
  const last = contents.get(contents.size() - 1);
  contents.remove(contents.size() - 1);
  contents.insert(0, last);
}

async function applyMark(doc, pagesToMark, opts) {
  const { StandardFonts, rgb, degrees, PDFArray } = await getPdfLib();
  let font = null;
  let image = null;
  if (opts.kind === 'text') {
    font = await doc.embedFont(standardFontName(StandardFonts, opts.family, opts.bold));
    checkEncodable(font, opts.text);
  } else {
    image = mark.type === 'png' ? await doc.embedPng(mark.bytes) : await doc.embedJpg(mark.bytes);
  }

  for (const page of pagesToMark) {
    const { viewW, viewH, rotation, toPage } = viewTransform(page);
    const phi = opts.angle + rotation; // giro final en la página
    const cos = Math.cos(rad(phi));
    const sin = Math.sin(rad(phi));
    let w;
    let h;
    if (font) {
      w = font.widthOfTextAtSize(opts.text, opts.size);
      h = font.heightAtSize(opts.size, { descender: false });
    } else {
      w = viewW * opts.scale;
      h = (w * image.height) / image.width;
    }
    for (const [cx, cy] of centers(viewW, viewH, w, h, opts)) {
      const c = toPage(cx, cy);
      // Esquina de inicio para que el centro quede en c.
      const x = c.x - (w / 2) * cos + (h / 2) * sin;
      const y = c.y - (w / 2) * sin - (h / 2) * cos;
      if (font) {
        page.drawText(opts.text, {
          x,
          y,
          size: opts.size,
          font,
          color: rgb(opts.color.r, opts.color.g, opts.color.b),
          opacity: opts.opacity,
          rotate: degrees(phi),
        });
      } else {
        page.drawImage(image, { x, y, width: w, height: h, opacity: opts.opacity, rotate: degrees(phi) });
      }
    }
    if (opts.below) sendToBack(PDFArray, page);
  }
}

/* ---------- Vista previa ---------- */

const refresh = livePreview(
  $('[data-preview]'),
  async () => {
    if (!state) return null;
    const opts = readOptions();
    const { PDFDocument } = await getPdfLib();
    const tmp = await PDFDocument.create();
    const [page] = await tmp.copyPages(state.doc, [opts.from - 1]);
    tmp.addPage(page);
    await applyMark(tmp, [tmp.getPage(0)], opts);
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
  tool.run(runButton, 'Agregando…', async () => {
    const opts = readOptions();
    tool.steps.progress(0, 1, 'Agregando la marca de agua…');
    await nextFrame();
    const doc = await loadPdf(state.bytes, state.file.name);
    await applyMark(doc, doc.getPages().slice(opts.from - 1, opts.to), opts);
    tool.steps.progress(1, 1, 'Guardando…');
    await nextFrame();
    const bytes = await doc.save();
    tool.finish(pdfBlob(bytes), `${baseName(state.file.name)}-marca-de-agua.pdf`);
  })
);
