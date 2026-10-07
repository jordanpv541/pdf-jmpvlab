// JPG a PDF: una imagen por página.
import {
  $,
  $$,
  baseName,
  canvasToBlob,
  checkedValue,
  escapeHtml,
  formatBytes,
  getPdfLib,
  icons,
  nextFrame,
  pdfBlob,
  readBytes,
  setupTool,
  zipBlob,
} from '../app.js';
import { pageLayout, prefersLetter } from '../images.js';

let items = [];
let nextId = 1;

const tool = setupTool({
  kind: 'image',
  multiple: true,
  onFiles: addFiles,
  onRestart: () => {
    items.forEach((item) => URL.revokeObjectURL(item.url));
    items = [];
    render();
  },
});

const list = $('[data-files]');
const runButton = $('[data-run]');

if (prefersLetter()) {
  const letter = $('input[name="size"][value="carta"]');
  if (letter) letter.checked = true;
}

async function addFiles(files) {
  files.forEach((file) => items.push({ id: nextId++, file, url: URL.createObjectURL(file) }));
  render();
  if ($('[data-step="work"]').hidden) tool.showWork();
  else list.lastElementChild?.scrollIntoView({ block: 'nearest' });
}

function render() {
  list.innerHTML = items
    .map((item, i) => {
      const name = escapeHtml(item.file.name);
      return `<li class="has-thumb" data-id="${item.id}">
        <span class="file-order" aria-hidden="true">${i + 1}</span>
        <img class="file-thumb" src="${item.url}" alt="" loading="lazy" decoding="async">
        <span class="file-name" title="${name}">${name}<span class="file-meta">${formatBytes(item.file.size)}</span></span>
        <span class="file-actions">
          <button type="button" class="icon-btn" data-act="up" aria-label="Subir «${name}»"${i === 0 ? ' disabled' : ''}>${icons.up}</button>
          <button type="button" class="icon-btn" data-act="down" aria-label="Bajar «${name}»"${i === items.length - 1 ? ' disabled' : ''}>${icons.down}</button>
          <button type="button" class="icon-btn" data-act="remove" aria-label="Quitar «${name}»">${icons.close}</button>
        </span>
      </li>`;
    })
    .join('');
  runButton.disabled = items.length === 0;
}

list.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-act]');
  if (!button) return;
  const id = Number(button.closest('li').dataset.id);
  const index = items.findIndex((item) => item.id === id);
  const act = button.dataset.act;
  if (act === 'remove') {
    URL.revokeObjectURL(items[index].url);
    items.splice(index, 1);
    render();
    if (!items.length) {
      tool.steps.show('pick');
      $('[data-pick]').focus();
      return;
    }
    list.children[Math.min(index, items.length - 1)]?.querySelector('[data-act="remove"]')?.focus();
    return;
  }
  const target = act === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return;
  [items[index], items[target]] = [items[target], items[index]];
  render();
  const moved = list.querySelector(`li[data-id="${id}"] [data-act="${act}"]`);
  if (moved && !moved.disabled) moved.focus();
  else list.querySelector(`li[data-id="${id}"] [data-act="${act === 'up' ? 'down' : 'up'}"]`)?.focus();
});

$('[data-add]').addEventListener('click', () => tool.addMore());

function updateOrientation() {
  $('[data-orientation]').hidden = checkedValue('size') === 'imagen';
}
$$('input[name="size"]').forEach((radio) => radio.addEventListener('change', updateOrientation));
updateOrientation();

/* ---------- Lectura de imágenes ---------- */

function sniff(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  return 'other';
}

/** Lee la orientación EXIF de un JPEG (1 = normal). */
function jpegOrientation(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return 1;
    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2);
    if (marker === 0xe1 && view.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 > view.byteLength) return 1;
      const entries = view.getUint16(ifd, little);
      for (let i = 0; i < entries; i += 1) {
        const entry = ifd + 2 + i * 12;
        if (entry + 10 > view.byteLength) return 1;
        if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
      }
      return 1;
    }
    if (marker === 0xda) return 1; // empieza la imagen; no hay EXIF
    offset += 2 + size;
  }
  return 1;
}

// Límite seguro de píxeles para el lienzo (algunos celulares no aguantan más).
const MAX_AREA = 16_000_000;

/** Vuelve a codificar la imagen con un lienzo (gira según EXIF y convierte formatos). */
async function reencode(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`No se pudo leer la imagen «${file.name}».`);
  }
  const scale = Math.min(1, Math.sqrt(MAX_AREA / (bitmap.width * bitmap.height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  canvas.width = 0;
  canvas.height = 0;
  return new Uint8Array(await blob.arrayBuffer());
}

async function embed(out, file) {
  const bytes = await readBytes(file);
  const type = sniff(bytes);
  if (type === 'jpg' && jpegOrientation(bytes) === 1) {
    try {
      return await out.embedJpg(bytes);
    } catch {
      /* se intenta con el lienzo */
    }
  }
  if (type === 'png') {
    try {
      return await out.embedPng(bytes);
    } catch {
      /* se intenta con el lienzo */
    }
  }
  return out.embedJpg(await reencode(file));
}

/* ---------- Crear el PDF ---------- */


async function newDoc(PDFDocument) {
  const doc = await PDFDocument.create();
  doc.setProducer('PDF jmpvlab');
  doc.setCreator('PDF jmpvlab');
  return doc;
}

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Creando PDF…', async () => {
    if (!items.length) throw new Error('Elige al menos una imagen.');
    const { PDFDocument } = await getPdfLib();
    const size = checkedValue('size');
    const orient = checkedValue('orient');
    const margin = Number(checkedValue('margin')) || 0;
    const separate = $('#separate')?.checked && items.length > 1;
    const total = items.length;
    const entries = [];
    let out = await newDoc(PDFDocument);
    for (let i = 0; i < total; i += 1) {
      tool.steps.progress(i, total, `Agregando imagen ${i + 1} de ${total}…`);
      await nextFrame();
      if (separate && i > 0) out = await newDoc(PDFDocument);
      const img = await embed(out, items[i].file);
      const { pw, ph, x, y, w, h } = pageLayout(img, size, orient, margin);
      const page = out.addPage([pw, ph]);
      page.drawImage(img, { x, y, width: w, height: h });
      if (separate) entries.push({ name: `${baseName(items[i].file.name)}.pdf`, bytes: await out.save() });
    }
    tool.steps.progress(total, total, 'Guardando…');
    await nextFrame();
    if (separate) {
      tool.finish(await zipBlob(entries), 'imagenes-pdf.zip', { files: entries.length });
      return;
    }
    const bytes = await out.save();
    const name = total === 1 ? `${baseName(items[0].file.name)}.pdf` : 'imagenes.pdf';
    tool.finish(pdfBlob(bytes), name);
  })
);
