// Unir PDF: junta varios archivos en el orden elegido. Cada archivo se puede girar.
import {
  $,
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
  if (items.length) {
    if (!$('[data-step="work"]').hidden) {
      list.lastElementChild?.scrollIntoView({ block: 'nearest' });
    } else {
      tool.showWork();
    }
  }
  if (errors.length) tool.steps.error(errors.join(' '));
  else if (items.length === 1) tool.steps.status('Agrega al menos otro PDF para unirlos.');
}

function render() {
  list.innerHTML = items
    .map((item, i) => {
      const name = escapeHtml(item.file.name);
      const turned = item.rotation ? `, girado ${item.rotation}°` : '';
      return `<li class="has-thumb" data-id="${item.id}">
        <span class="file-order" aria-hidden="true">${i + 1}</span>
        <span class="thumb-slot"></span>
        <span class="file-name" title="${name}">${name}<span class="file-meta">${pages(item.count)}, ${formatBytes(item.file.size)}${turned}</span></span>
        <span class="file-actions">
          <button type="button" class="icon-btn" data-act="rotate" aria-label="Girar «${name}» a la derecha">${icons.rotateRight}</button>
          <button type="button" class="icon-btn" data-act="up" aria-label="Subir «${name}»"${i === 0 ? ' disabled' : ''}>${icons.up}</button>
          <button type="button" class="icon-btn" data-act="down" aria-label="Bajar «${name}»"${i === items.length - 1 ? ' disabled' : ''}>${icons.down}</button>
          <button type="button" class="icon-btn" data-act="remove" aria-label="Quitar «${name}»">${icons.close}</button>
        </span>
      </li>`;
    })
    .join('');
  // Las miniaturas ya dibujadas se reutilizan (no se vuelven a crear).
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
  runButton.disabled = items.length < 2;
}

list.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-act]');
  if (!button) return;
  const id = Number(button.closest('li').dataset.id);
  const index = items.findIndex((item) => item.id === id);
  const act = button.dataset.act;

  if (act === 'rotate') {
    items[index].rotation = (items[index].rotation + 90) % 360;
    render();
    list.querySelector(`li[data-id="${id}"] [data-act="rotate"]`)?.focus();
    return;
  }

  if (act === 'remove') {
    items.splice(index, 1);
    render();
    tool.steps.clear();
    if (!items.length) {
      tool.steps.show('pick');
      $('[data-pick]').focus();
      return;
    }
    if (items.length === 1) tool.steps.status('Agrega al menos otro PDF para unirlos.');
    const next = list.children[Math.min(index, items.length - 1)];
    next?.querySelector('[data-act="remove"]')?.focus();
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

$('#interleave').addEventListener('change', () => {
  $('[data-reverse]').hidden = !$('#interleave').checked;
});

$('[data-sort]').addEventListener('click', () => {
  items.sort((a, b) => a.file.name.localeCompare(b.file.name, 'es', { numeric: true, sensitivity: 'base' }));
  render();
});

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Uniendo…', async () => {
    if (items.length < 2) throw new Error('Agrega al menos dos PDF para unirlos.');
    const { PDFDocument, degrees } = await getPdfLib();
    const out = await PDFDocument.create();
    out.setProducer('PDF jmpvlab');
    out.setCreator('PDF jmpvlab');
    const total = items.length;
    // Copia todas las páginas de cada archivo, ya giradas.
    const copies = [];
    for (let i = 0; i < total; i += 1) {
      tool.steps.progress(i, total, `Uniendo ${i + 1} de ${total}…`);
      const { doc, rotation } = items[i];
      const copied = await out.copyPages(doc, doc.getPageIndices());
      copied.forEach((page) => {
        if (rotation) page.setRotation(degrees((page.getRotation().angle + rotation) % 360));
      });
      copies.push(copied);
      await nextFrame();
    }
    if ($('#interleave').checked) {
      // Una página de cada archivo por turnos.
      const reverse = $('#reverse').checked;
      const lists = copies.map((list, i) => (reverse && i > 0 ? [...list].reverse() : list));
      const longest = Math.max(...lists.map((list) => list.length));
      for (let k = 0; k < longest; k += 1) {
        lists.forEach((list) => {
          if (list[k]) out.addPage(list[k]);
        });
      }
    } else {
      copies.flat().forEach((page) => out.addPage(page));
    }
    tool.steps.progress(total, total, 'Guardando…');
    await nextFrame();
    const bytes = await out.save();
    tool.finish(pdfBlob(bytes), 'unido.pdf');
  })
);
