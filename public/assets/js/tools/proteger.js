// Proteger PDF: pone contraseña (cifrado AES de 256 bits) con qpdf.
import { $, baseName, fileSummary, nextFrame, pdfBlob, readBytes, setupTool } from '../app.js';
import { protection, runQpdf } from '../qpdf.js';

let state = null;

const tool = setupTool({
  kind: 'pdf',
  onFiles: open,
  onRestart: () => {
    state = null;
    $('#pw').value = '';
    $('#pw2').value = '';
  },
});

const runButton = $('[data-run]');
const pw = $('#pw');
const pw2 = $('#pw2');

async function open([file]) {
  tool.steps.status(`Revisando «${file.name}»…`);
  const bytes = await readBytes(file);
  const kind = await protection(bytes);
  if (kind !== 'none') {
    throw new Error(`«${file.name}» ya está protegido. Si quieres cambiarle la contraseña, primero quítasela con Desbloquear PDF.`);
  }
  state = { file, bytes };
  tool.steps.clear();
  $('[data-summary]').innerHTML = fileSummary(file);
  tool.showWork();
  pw.focus();
}

$('#show-pw').addEventListener('change', (event) => {
  const type = event.target.checked ? 'text' : 'password';
  pw.type = type;
  pw2.type = type;
});

function updateHelp() {
  const help = $('[data-pw-help]');
  if (pw.value && pw.value.length < 6) {
    help.textContent = 'Es corta. Una contraseña de 8 o más caracteres es mucho más difícil de adivinar.';
  } else {
    help.textContent = 'Usa una que recuerdes. Si la olvidas, nadie podrá abrir el archivo, ni siquiera nosotros.';
  }
}
pw.addEventListener('input', updateHelp);
updateHelp();

/** Contraseña de dueño al azar: protege las restricciones sin que tengas que recordarla. */
function randomOwnerPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Protegiendo…', async () => {
    if (!pw.value) {
      pw.focus();
      throw new Error('Escribe una contraseña.');
    }
    if (pw.value !== pw2.value) {
      pw2.focus();
      throw new Error('Las dos contraseñas no son iguales. Escríbelas de nuevo.');
    }
    tool.steps.progress(0, 1, 'Cifrando el archivo…');
    await nextFrame();
    // Las contraseñas van como --user-password=…: así una que empieza con «@» o «-»
    // no se confunde con un archivo o una opción de qpdf.
    const args = [
      '--encrypt',
      `--user-password=${pw.value}`,
      `--owner-password=${randomOwnerPassword()}`,
      '--bits=256',
      `--print=${$('#allow-print').checked ? 'full' : 'none'}`,
      `--extract=${$('#allow-copy').checked ? 'y' : 'n'}`,
      `--modify=${$('#allow-edit').checked ? 'all' : 'none'}`,
      '--',
      '/in.pdf',
      '/out.pdf',
    ];
    const { code, files } = await runQpdf(args, { inputs: { '/in.pdf': state.bytes }, outputs: ['/out.pdf'] });
    if ((code !== 0 && code !== 3) || !files['/out.pdf']) {
      throw new Error('No se pudo proteger el archivo. Puede estar dañado; prueba primero con Reparar PDF.');
    }
    tool.finish(pdfBlob(files['/out.pdf']), `${baseName(state.file.name)}-protegido.pdf`, {
      note: 'Guarda la contraseña en un lugar seguro. Si la olvidas, no hay forma de recuperar el archivo.',
    });
  })
);
