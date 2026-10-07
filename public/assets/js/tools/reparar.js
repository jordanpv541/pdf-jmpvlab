// Reparar PDF.
// 1. pdf-lib lee el archivo objeto por objeto (sin confiar en su índice interno) y lo
//    vuelve a guardar con una estructura nueva. Arregla la mayoría de archivos cortados
//    o con el índice roto, y conserva texto, enlaces y marcadores.
// 2. Si eso falla, PDF.js intenta dibujar las páginas y se guardan como imagen.
import {
  $,
  baseName,
  canvasToBlob,
  closePreview,
  fileSummary,
  getPdfLib,
  nextFrame,
  openPreview,
  pdfBlob,
  readBytes,
  renderPage,
  setupTool,
} from '../app.js';
import { runQpdf } from '../qpdf.js';

let state = null;

const tool = setupTool({
  kind: 'pdf',
  onFiles: open,
  onRestart: () => {
    state = null;
  },
});

const runButton = $('[data-run]');

async function open([file]) {
  const bytes = await readBytes(file);
  state = { file, bytes };
  $('[data-summary]').innerHTML = fileSummary(file);
  tool.showWork();
}

/** Revisa la estructura con qpdf: 'ok', 'problemas' o 'cifrado'. */
async function diagnose(bytes) {
  try {
    const { code, log } = await runQpdf(['--check', '/in.pdf'], { inputs: { '/in.pdf': bytes } });
    if (log.some((line) => /password/i.test(line))) return 'cifrado';
    return code === 0 ? 'ok' : 'problemas';
  } catch {
    return 'problemas';
  }
}

async function rebuildWithPdfLib(bytes) {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
  if (!doc.getPageCount()) throw new Error('sin páginas');
  return doc.save();
}

async function rebuildAsImages(bytes, name) {
  const preview = await openPreview(bytes, name);
  const { PDFDocument } = await getPdfLib();
  const out = await PDFDocument.create();
  out.setProducer('PDF jmpvlab');
  try {
    for (let n = 1; n <= preview.numPages; n += 1) {
      tool.steps.progress(n - 1, preview.numPages, `Recuperando la página ${n}…`);
      await nextFrame();
      let canvas;
      try {
        canvas = await renderPage(preview, n, { scale: 150 / 72 });
      } catch {
        continue;
      }
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.88);
      const page = await preview.getPage(n);
      const [x0, y0, x1, y1] = page.view;
      const w = x1 - x0;
      const h = y1 - y0;
      const rotated = page.rotate % 180 !== 0;
      canvas.width = 0;
      const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const pw = rotated ? h : w;
      const ph = rotated ? w : h;
      out.addPage([pw, ph]).drawImage(img, { x: 0, y: 0, width: pw, height: ph });
    }
  } finally {
    closePreview(preview);
  }
  if (!out.getPageCount()) throw new Error('sin páginas');
  return out.save();
}

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Reparando…', async () => {
    const { file, bytes } = state;
    tool.steps.progress(0, 1, 'Revisando el archivo…');
    await nextFrame();
    const health = await diagnose(bytes);
    if (health === 'cifrado') throw new Error('Este PDF tiene contraseña. Quítasela primero con Desbloquear PDF.');

    tool.steps.progress(0, 1, 'Reconstruyendo la estructura…');
    await nextFrame();
    try {
      const out = await rebuildWithPdfLib(bytes);
      tool.finish(pdfBlob(out), `${baseName(file.name)}-reparado.pdf`, {
        note:
          health === 'ok'
            ? 'No encontramos problemas en la estructura. Igual guardamos una copia limpia.'
            : 'Encontramos problemas en la estructura y los corregimos. Revisa que se vea bien.',
      });
      return;
    } catch {
      /* se intenta el plan B */
    }

    try {
      const out = await rebuildAsImages(bytes, file.name);
      tool.finish(pdfBlob(out), `${baseName(file.name)}-reparado.pdf`, {
        note: 'El archivo estaba muy dañado: recuperamos las páginas como imagen, así que el texto ya no se puede seleccionar.',
      });
    } catch {
      throw new Error(`No se pudo reparar «${file.name}». Está demasiado dañado o no es un PDF.`);
    }
  })
);
