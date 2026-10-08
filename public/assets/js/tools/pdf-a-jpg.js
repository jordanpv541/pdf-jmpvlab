// PDF a JPG: cada página se dibuja con PDF.js y se guarda como imagen.
import {
  $,
  closePreview,
  $$,
  baseName,
  canvasToBlob,
  checkedValue,
  fileSummary,
  getPdfjs,
  nextFrame,
  openPreview,
  pad,
  parseRanges,
  rangesToList,
  readBytes,
  renderPage,
  setupTool,
  zipBlob,
} from '../app.js';

let state = null;

const tool = setupTool({
  kind: 'pdf',
  onFiles: open,
  onRestart: reset,
});

const runButton = $('[data-run]');
const rangesInput = $('#ranges');

function reset() {
  closePreview(state?.doc);
  state = null;
}

async function open([file]) {
  reset();
  tool.steps.status(`Abriendo «${file.name}»…`);
  const bytes = await readBytes(file);
  const doc = await openPreview(bytes, file.name);
  state = { file, doc, count: doc.numPages };
  tool.steps.clear();
  $('[data-summary]').innerHTML = fileSummary(file, state.count);
  tool.showWork();
}

function updateFormat() {
  const ext = checkedValue('format') === 'png' ? 'PNG' : 'JPG';
  const images = checkedValue('what') === 'images';
  runButton.textContent = images ? `Sacar imágenes en ${ext}` : `Convertir a ${ext}`;
  $('[data-dpi]').hidden = images;
}
function updateWhich() {
  const some = checkedValue('which') === 'some';
  $('[data-some]').hidden = !some;
  if (some) rangesInput.focus();
}
$$('input[name="format"], input[name="what"]').forEach((r) => r.addEventListener('change', updateFormat));
$$('input[name="which"]').forEach((r) => r.addEventListener('change', updateWhich));
updateFormat();

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Convirtiendo…', async () => {
    const { doc, count, file } = state;
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

    const png = checkedValue('format') === 'png';
    const type = png ? 'image/png' : 'image/jpeg';
    const ext = png ? 'png' : 'jpg';
    const scale = Number(checkedValue('dpi')) / 72;
    const base = baseName(file.name);
    const width = String(count).length;

    if (checkedValue('what') === 'images') {
      await extractImages(list, { type, ext, base });
      return;
    }

    const entries = [];
    let single = null;
    for (let i = 0; i < list.length; i += 1) {
      const n = list[i];
      tool.steps.progress(i, list.length, `Convirtiendo página ${i + 1} de ${list.length}…`);
      await nextFrame();
      const canvas = await renderPage(doc, n, { scale });
      const blob = await canvasToBlob(canvas, type, 0.9);
      canvas.width = 0;
      canvas.height = 0;
      const name = `${base}-pagina-${pad(n, width)}.${ext}`;
      if (list.length === 1) single = { blob, name };
      else entries.push({ name, blob }); // el ZIP lee cada imagen recién al armarse
    }

    if (single) {
      tool.finish(single.blob, single.name);
      return;
    }
    tool.steps.progress(list.length, list.length, 'Preparando el ZIP…');
    await nextFrame();
    tool.finish(await zipBlob(entries), `${base}-imagenes.zip`, { files: entries.length });
  })
);

/* ---------- Sacar las imágenes que trae el PDF ---------- */

/** Pide a PDF.js una imagen ya decodificada. */
function getImageObject(page, id) {
  const store = id.startsWith('g_') ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000);
    try {
      store.get(id, (obj) => {
        clearTimeout(timer);
        resolve(obj);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** Dibuja en un lienzo la imagen que entrega PDF.js (mapa de bits o píxeles). */
function imageToCanvas(img) {
  if (!img || !img.width || !img.height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
    return canvas;
  }
  if (!img.data) return null;
  const out = ctx.createImageData(img.width, img.height);
  const src = img.data;
  const dst = out.data;
  const pixels = img.width * img.height;
  if (img.kind === 3 || src.length === pixels * 4) {
    dst.set(src.subarray(0, dst.length));
  } else if (img.kind === 2 || src.length === pixels * 3) {
    for (let i = 0, j = 0; i < pixels; i += 1, j += 3) {
      dst[i * 4] = src[j];
      dst[i * 4 + 1] = src[j + 1];
      dst[i * 4 + 2] = src[j + 2];
      dst[i * 4 + 3] = 255;
    }
  } else if (img.kind === 1) {
    // 1 bit por píxel, filas alineadas a byte
    const rowBytes = (img.width + 7) >> 3;
    for (let y = 0; y < img.height; y += 1) {
      for (let x = 0; x < img.width; x += 1) {
        const bit = (src[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0;
        const k = (y * img.width + x) * 4;
        dst[k] = v;
        dst[k + 1] = v;
        dst[k + 2] = v;
        dst[k + 3] = 255;
      }
    }
  } else {
    return null;
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

async function extractImages(list, { type, ext, base }) {
  const { OPS } = await getPdfjs();
  const seen = new Set();
  const entries = [];
  for (let i = 0; i < list.length; i += 1) {
    const n = list[i];
    tool.steps.progress(i, list.length, `Buscando imágenes en la página ${n}…`);
    await nextFrame();
    const page = await state.doc.getPage(n);
    const ops = await page.getOperatorList();
    for (let k = 0; k < ops.fnArray.length; k += 1) {
      if (ops.fnArray[k] !== OPS.paintImageXObject) continue;
      const id = ops.argsArray[k][0];
      if (seen.has(id)) continue;
      seen.add(id);
      const canvas = imageToCanvas(await getImageObject(page, id));
      // Se saltan los adornos muy pequeños.
      if (!canvas || canvas.width < 24 || canvas.height < 24) continue;
      if (type === 'image/jpeg') {
        // El JPG no tiene transparencia: se pone fondo blanco.
        const flat = document.createElement('canvas');
        flat.width = canvas.width;
        flat.height = canvas.height;
        const fctx = flat.getContext('2d');
        fctx.fillStyle = '#ffffff';
        fctx.fillRect(0, 0, flat.width, flat.height);
        fctx.drawImage(canvas, 0, 0);
        canvas.width = 0;
        entries.push({ blob: await canvasToBlob(flat, type, 0.92) });
        flat.width = 0;
      } else {
        entries.push({ blob: await canvasToBlob(canvas, type) });
        canvas.width = 0;
      }
    }
    page.cleanup();
  }
  if (!entries.length) throw new Error('No encontramos imágenes dentro de este PDF. Si quieres cada página como imagen, elige «Cada página como imagen».');
  const width = Math.max(3, String(entries.length).length);
  if (entries.length === 1) {
    tool.finish(entries[0].blob, `${base}-imagen-001.${ext}`);
    return;
  }
  tool.steps.progress(list.length, list.length, 'Preparando el ZIP…');
  const files = entries.map((entry, i) => ({ name: `${base}-imagen-${pad(i + 1, width)}.${ext}`, blob: entry.blob }));
  tool.finish(await zipBlob(files), `${base}-imagenes.zip`, { files: files.length });
}
