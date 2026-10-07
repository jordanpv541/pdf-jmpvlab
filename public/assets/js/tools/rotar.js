// Rotar PDF: gira todas las páginas de uno o varios archivos.
import {
  $,
  $$,
  baseName,
  escapeHtml,
  firstPageThumb,
  formatBytes,
  getPdfLib,
  icons,
  loadPdf,
  nextFrame,
  pages,
  pdfBlob,
  readBytes,
  setupTool,
  zipBlob,
} from '../app.js';

let items = [];
let nextId = 1;

const tool = setupTool({
  kind: 'pdf',
  multiple: true,
  onFiles: addFiles,
  onRestart: () => {
    items = [];
    render();
  },
});

const list = $('[data-files]');
const runButton = $('[data-run]');

async function addFiles(files) {
  const errors = [];
  const total = files.length;
  for (let i = 0; i < total; i += 1) {
    const file = files[i];
    tool.steps.progress(i, total, total > 1 ? `Abriendo ${i + 1} de ${total}…` : `Abriendo «${file.name}»…`);
    try {
      const bytes = await readBytes(file);
      const doc = await loadPdf(bytes, file.name);
      const thumb = await firstPageThumb(bytes, file.name);
      items.push({ id: nextId++, file, doc, thumb, rotation: 0, count: doc.getPageCount() });
    } catch (error) {
      errors.push(error.message);
    }
    await nextFrame();
  }
  tool.steps.progress(null);
  render();
  if (items.length && $('[data-step="work"]').hidden) tool.showWork();
  if (errors.length) tool.steps.error(errors.join(' '));
}

function describe(rotation) {
  if (!rotation) return 'Sin girar';
  if (rotation === 90) return 'Girado a la derecha';
  if (rotation === 180) return 'Girado de cabeza';
  return 'Girado a la izquierda';
}

function render() {
  list.innerHTML = items
    .map((item) => {
      const name = escapeHtml(item.file.name);
      return `<li class="has-thumb" data-id="${item.id}">
        <span class="file-order" aria-hidden="true"></span>
        <span class="thumb-slot"></span>
        <span class="file-name" title="${name}">${name}<span class="file-meta">${pages(item.count)}, ${formatBytes(item.file.size)}. ${describe(item.rotation)}</span></span>
        <span class="file-actions">
          <button type="button" class="icon-btn" data-act="left" aria-label="Girar «${name}» a la izquierda">${icons.rotateLeft}</button>
          <button type="button" class="icon-btn" data-act="right" aria-label="Girar «${name}» a la derecha">${icons.rotateRight}</button>
          <button type="button" class="icon-btn" data-act="remove" aria-label="Quitar «${name}»">${icons.close}</button>
        </span>
      </li>`;
    })
    .join('');
  items.forEach((item) => {
    const slot = list.querySelector(`li[data-id="${item.id}"] .thumb-slot`);
    if (!slot) return;
    if (item.thumb) {
      item.thumb.style.transform = item.rotation ? `rotate(${item.rotation}deg)` : '';
      slot.replaceWith(item.thumb);
    } else {
      slot.className = 'file-thumb';
    }
  });
  runButton.disabled = !items.length;
}

function turn(item, step) {
  item.rotation = (((item.rotation + step) % 360) + 360) % 360;
}

list.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-act]');
  if (!button) return;
  const id = Number(button.closest('li').dataset.id);
  const index = items.findIndex((item) => item.id === id);
  const act = button.dataset.act;
  if (act === 'remove') {
    items.splice(index, 1);
    render();
    if (!items.length) {
      tool.steps.show('pick');
      $('[data-pick]').focus();
    }
    return;
  }
  turn(items[index], act === 'left' ? -90 : 90);
  render();
  list.querySelector(`li[data-id="${id}"] [data-act="${act}"]`)?.focus();
});

$$('[data-rotate-all]').forEach((button) =>
  button.addEventListener('click', () => {
    const step = Number(button.dataset.rotateAll);
    items.forEach((item) => turn(item, step));
    render();
  })
);

$('[data-add]').addEventListener('click', () => tool.addMore());

async function rotated(PDFLib, item) {
  const { degrees } = PDFLib;
  item.doc.getPages().forEach((page) => {
    page.setRotation(degrees((page.getRotation().angle + item.rotation) % 360));
  });
  const bytes = await item.doc.save();
  // Deja el documento como estaba para poder repetir con otro giro.
  item.doc.getPages().forEach((page) => {
    page.setRotation(degrees((page.getRotation().angle - item.rotation + 360) % 360));
  });
  return bytes;
}

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Girando…', async () => {
    if (!items.length) throw new Error('Elige al menos un PDF.');
    if (items.every((item) => !item.rotation)) {
      throw new Error('Gira al menos un archivo con los botones de flecha.');
    }
    const PDFLib = await getPdfLib();
    if (items.length === 1) {
      tool.steps.progress(0, 1, 'Guardando…');
      await nextFrame();
      const bytes = await rotated(PDFLib, items[0]);
      tool.finish(pdfBlob(bytes), `${baseName(items[0].file.name)}-girado.pdf`);
      return;
    }
    const entries = [];
    for (let i = 0; i < items.length; i += 1) {
      tool.steps.progress(i, items.length, `Girando ${i + 1} de ${items.length}…`);
      await nextFrame();
      entries.push({ name: `${baseName(items[i].file.name)}-girado.pdf`, bytes: await rotated(PDFLib, items[i]) });
    }
    tool.steps.progress(items.length, items.length, 'Preparando el ZIP…');
    await nextFrame();
    tool.finish(await zipBlob(entries), 'pdf-girados.zip', { files: entries.length });
  })
);
