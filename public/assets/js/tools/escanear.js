// Escanear a PDF: fotos de hojas tomadas con el celular → PDF con aspecto de escaneo.
import {
  $,
  $$,
  canvasToBlob,
  checkedValue,
  escapeHtml,
  formatBytes,
  getPdfLib,
  icons,
  nextFrame,
  pdfBlob,
  setupTool,
} from '../app.js';
import { pageLayout, photoCanvas, prefersLetter, toDocument, toGray } from '../images.js';

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
const preview = $('[data-preview]');
const galleryInput = $('[data-input-gallery]');

if (prefersLetter()) {
  const letter = $('input[name="size"][value="carta"]');
  if (letter) letter.checked = true;
}

// Elegir fotos ya guardadas (sin abrir la cámara)
$$('[data-pick-gallery]').forEach((button) => button.addEventListener('click', () => galleryInput.click()));
galleryInput.addEventListener('change', () => {
  tool.picker.handle(galleryInput.files);
  galleryInput.value = '';
});
$('[data-add]').addEventListener('click', () => tool.addMore());

async function addFiles(files) {
  files.forEach((file) => items.push({ id: nextId++, file, url: URL.createObjectURL(file), rotation: 0 }));
  render();
  if ($('[data-step="work"]').hidden) tool.showWork();
  else list.lastElementChild?.scrollIntoView({ block: 'nearest' });
  refreshPreview();
}

function render() {
  list.innerHTML = items
    .map((item, i) => {
      const name = escapeHtml(item.file.name);
      return `<li class="has-thumb" data-id="${item.id}">
        <span class="file-order" aria-hidden="true">${i + 1}</span>
        <img class="file-thumb" src="${item.url}" alt="" data-rot="${item.rotation}">
        <span class="file-name" title="${name}">Hoja ${i + 1}<span class="file-meta">${formatBytes(item.file.size)}</span></span>
        <span class="file-actions">
          <button type="button" class="icon-btn" data-act="rotr" aria-label="Girar la hoja ${i + 1}">${icons.rotateRight}</button>
          <button type="button" class="icon-btn" data-act="up" aria-label="Subir la hoja ${i + 1}"${i === 0 ? ' disabled' : ''}>${icons.up}</button>
          <button type="button" class="icon-btn" data-act="down" aria-label="Bajar la hoja ${i + 1}"${i === items.length - 1 ? ' disabled' : ''}>${icons.down}</button>
          <button type="button" class="icon-btn" data-act="remove" aria-label="Quitar la hoja ${i + 1}">${icons.close}</button>
        </span>
      </li>`;
    })
    .join('');
  $$('img[data-rot]', list).forEach((img) => {
    const r = Number(img.dataset.rot);
    img.style.transform = r ? `rotate(${r}deg)` : '';
  });
  runButton.disabled = !items.length;
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
    refreshPreview();
    if (!items.length) {
      tool.steps.show('pick');
      $('[data-pick]').focus();
    }
    return;
  }
  if (act === 'rotr') {
    items[index].rotation = (items[index].rotation + 90) % 360;
    render();
    refreshPreview();
    list.querySelector(`li[data-id="${id}"] [data-act="rotr"]`)?.focus();
    return;
  }
  const target = act === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return;
  [items[index], items[target]] = [items[target], items[index]];
  render();
  refreshPreview();
  list.querySelector(`li[data-id="${id}"] [data-act="${act}"]`)?.focus();
});

function applyFilter(canvas) {
  const filter = checkedValue('filter');
  if (filter === 'document') return toDocument(canvas);
  if (filter === 'gray') return toGray(canvas);
  return canvas;
}

// Vista previa del filtro sobre la primera hoja
let previewToken = 0;
async function refreshPreview() {
  previewToken += 1;
  const mine = previewToken;
  if (!items.length) {
    preview.replaceChildren();
    return;
  }
  try {
    const canvas = applyFilter(await photoCanvas(items[0].file, items[0].rotation, 700));
    if (mine !== previewToken) return;
    canvas.setAttribute('aria-hidden', 'true');
    preview.replaceChildren(canvas);
  } catch {
    preview.textContent = '';
  }
}
$$('input[name="filter"]').forEach((r) => r.addEventListener('change', refreshPreview));

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Creando PDF…', async () => {
    if (!items.length) throw new Error('Toma o elige al menos una foto.');
    const { PDFDocument } = await getPdfLib();
    const out = await PDFDocument.create();
    out.setProducer('PDF jmpvlab');
    out.setCreator('PDF jmpvlab');
    const size = checkedValue('size');
    const total = items.length;
    for (let i = 0; i < total; i += 1) {
      tool.steps.progress(i, total, `Procesando la hoja ${i + 1} de ${total}…`);
      await nextFrame();
      let canvas;
      try {
        canvas = applyFilter(await photoCanvas(items[i].file, items[i].rotation, 2400));
      } catch {
        throw new Error(`No se pudo leer la foto «${items[i].file.name}».`);
      }
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
      canvas.width = 0;
      const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const { pw, ph, x, y, w, h } = pageLayout(img, size, 'auto', 0);
      out.addPage([pw, ph]).drawImage(img, { x, y, width: w, height: h });
    }
    tool.steps.progress(total, total, 'Guardando…');
    await nextFrame();
    tool.finish(pdfBlob(await out.save()), 'escaneo.pdf');
  })
);
