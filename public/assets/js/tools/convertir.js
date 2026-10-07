// Herramientas de conversión que usan el servidor. La misma lógica sirve para todas;
// cada página dice en <main> qué conversión es (data-kind) y qué archivos acepta (data-accept).
import { $, $$, checkedValue, escapeHtml, fileSummary, setupTool } from '../app.js';
import { convertRemote, MAX_UPLOAD_MB } from '../remote.js';

const main = $('main');
const kind = main.dataset.kind;
const accept = (main.dataset.accept || 'pdf').split(',');

let state = null;

const tool = setupTool({
  kind: accept.length === 1 && accept[0] === 'pdf' ? 'pdf' : accept,
  onFiles: open,
  onRestart: () => {
    state = null;
  },
});

const runButton = $('[data-run]');

async function open([file]) {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    tool.steps.error(`«${file.name}» pesa más de ${MAX_UPLOAD_MB} MB, el máximo para convertir en el servidor.`);
    return;
  }
  state = { file };
  $('[data-summary]').innerHTML = fileSummary(file);
  tool.showWork();
}

// HTML a PDF: también se puede escribir la dirección de una página.
const urlForm = $('[data-url-form]');
urlForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#page-url');
  let url = input.value.trim();
  if (!url) {
    tool.steps.error('Escribe la dirección de la página.');
    input.focus();
    return;
  }
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    if (/\s/.test(url)) throw new Error('espacios');
    const parsed = new URL(url);
    // Un dominio con punto (ejemplo.com) o una IP entre corchetes; el servidor revisa el resto.
    if (!/^([a-z0-9-]+\.)+[a-z0-9-]+$|^\[.+\]$/i.test(parsed.hostname)) throw new Error('dominio');
    url = parsed.href;
  } catch {
    tool.steps.error('Esa dirección no es válida. Revisa que esté bien escrita.');
    input.focus();
    return;
  }
  tool.steps.clear();
  state = { url };
  $('[data-summary]').innerHTML = `«${escapeHtml(url)}» <span>página web</span>`;
  tool.showWork();
});

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Convirtiendo…', async () => {
    if (!state) throw new Error('Elige un archivo.');
    const form = new FormData();
    if (state.file) form.append('file', state.file, state.file.name);
    if (state.url) form.append('url', state.url);
    $$('[data-field]', main).forEach((field) => {
      const name = field.dataset.field;
      const value = field.matches('fieldset') ? checkedValue(name) : field.value;
      if (value) form.append(name, value);
    });

    tool.steps.progress(0, 1, state.file ? 'Subiendo el archivo…' : 'Abriendo la página…');
    const result = await convertRemote(kind, form, {
      fallbackName: main.dataset.out || 'resultado',
      onUpload: (part) => tool.steps.progress(part, 1, `Subiendo el archivo… ${Math.round(part * 100)} %`),
      onWaiting: () => tool.steps.working('Convirtiendo en el servidor…'),
    });
    tool.finish(result.blob, result.filename, { note: result.note });
  })
);
