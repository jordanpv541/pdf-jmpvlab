// Desbloquear PDF: quita la contraseña o las restricciones con qpdf.
import { $, baseName, fileSummary, nextFrame, pdfBlob, readBytes, setupTool } from '../app.js';
import { protection, runQpdf } from '../qpdf.js';

let state = null;

const tool = setupTool({
  kind: 'pdf',
  onFiles: open,
  onRestart: () => {
    state = null;
    $('#pw').value = '';
  },
});

const runButton = $('[data-run]');
const pw = $('#pw');
const info = $('[data-lock-info]');

async function open([file]) {
  tool.steps.status(`Revisando «${file.name}»…`);
  const bytes = await readBytes(file);
  const kind = await protection(bytes);
  state = { file, bytes, kind };
  tool.steps.clear();
  $('[data-summary]').innerHTML = fileSummary(file);
  $('[data-needs-pw]').hidden = kind !== 'user';
  runButton.hidden = kind === 'none';
  if (kind === 'none') {
    info.textContent = 'Este PDF no tiene contraseña ni restricciones. Ya lo puedes usar en cualquier herramienta.';
  } else if (kind === 'owner') {
    info.textContent = 'Este PDF se abre sin contraseña, pero tiene restricciones (por ejemplo, no deja imprimir o copiar). Las podemos quitar.';
  } else {
    info.textContent = 'Este PDF pide contraseña para abrirlo. Escríbela para quitarla.';
  }
  tool.showWork();
  if (kind === 'user') pw.focus();
}

$('#show-pw').addEventListener('change', (event) => {
  pw.type = event.target.checked ? 'text' : 'password';
});

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Desbloqueando…', async () => {
    if (state.kind === 'user' && !pw.value) {
      pw.focus();
      throw new Error('Escribe la contraseña del PDF.');
    }
    tool.steps.progress(0, 1, 'Quitando la protección…');
    await nextFrame();
    const args = state.kind === 'user' ? [`--password=${pw.value}`] : [];
    args.push('--decrypt', '/in.pdf', '/out.pdf');
    const { code, log, files } = await runQpdf(args, { inputs: { '/in.pdf': state.bytes }, outputs: ['/out.pdf'] });
    if (log.some((line) => /invalid password/i.test(line))) {
      pw.select();
      throw new Error('La contraseña no es correcta. Revisa mayúsculas y minúsculas.');
    }
    if ((code !== 0 && code !== 3) || !files['/out.pdf']) {
      throw new Error('No se pudo desbloquear el archivo. Puede estar dañado.');
    }
    tool.finish(pdfBlob(files['/out.pdf']), `${baseName(state.file.name)}-desbloqueado.pdf`);
  })
);
