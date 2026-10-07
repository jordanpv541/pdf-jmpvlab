// qpdf compilado a WebAssembly: contraseñas, reparar y compactar PDF.
// Se carga solo en las herramientas que lo usan (pesa alrededor de 1,3 MB).

const BASE = new URL('../../vendor/qpdf/', import.meta.url);

let factoryPromise = null;

function load() {
  if (!factoryPromise) {
    factoryPromise = import(new URL('qpdf.mjs', BASE).href).catch(() => {
      factoryPromise = null;
      throw new Error('No se pudo cargar el motor de PDF. Revisa tu conexión y vuelve a intentarlo.');
    });
  }
  return factoryPromise.then((m) => m.default);
}

/**
 * Ejecuta qpdf como en la línea de comandos.
 * inputs: { '/ruta.pdf': Uint8Array }, outputs: ['/salida.pdf']
 * Devuelve { code, log, files }. Códigos de qpdf: 0 bien, 2 error, 3 bien con advertencias.
 */
// Esta versión de qpdf escribe sus mensajes directo en la consola.
// Mientras trabaja, los desviamos a una lista para poder leerlos.
let sink = null;
const original = { log: console.log, error: console.error };
const capture = (kind) => (...parts) => {
  if (sink) sink.push(parts.join(' '));
  else original[kind](...parts);
};

export async function runQpdf(args, { inputs = {}, outputs = [] } = {}) {
  const createModule = await load();
  const log = [];
  console.log = capture('log');
  console.error = capture('error');
  sink = log;
  let qpdf;
  let code;
  try {
    // Una instancia nueva por tarea: así un error no deja a qpdf en mal estado.
    // El navegador guarda el .wasm en caché, así que no se descarga cada vez.
    qpdf = await createModule({
      locateFile: (name) => new URL(name, BASE).href,
      noInitialRun: true,
    });
    for (const [path, bytes] of Object.entries(inputs)) qpdf.FS.writeFile(path, bytes);
    try {
      code = qpdf.callMain(args);
    } catch (error) {
      code = typeof error?.status === 'number' ? error.status : 2;
      log.push(String(error?.message || error));
    }
  } finally {
    sink = null;
    console.log = original.log;
    console.error = original.error;
  }
  const files = {};
  for (const path of outputs) {
    try {
      files[path] = qpdf.FS.readFile(path);
    } catch {
      /* no se creó */
    }
  }
  return { code, log, files };
}

/** true si el PDF está cifrado (tenga o no contraseña para abrirlo). */
export async function isEncrypted(bytes) {
  const { code } = await runQpdf(['--is-encrypted', '/in.pdf'], { inputs: { '/in.pdf': bytes } });
  return code === 0;
}

/**
 * Qué protección tiene: 'none' (sin cifrar), 'owner' (se abre sin contraseña pero tiene
 * restricciones) o 'user' (pide contraseña para abrirlo).
 */
export async function protection(bytes) {
  const { code, log } = await runQpdf(['--requires-password', '/in.pdf'], { inputs: { '/in.pdf': bytes } });
  // qpdf 12 responde «invalid password» (código 2) cuando el archivo pide contraseña.
  if (code === 0 || log.some((line) => /invalid password/i.test(line))) return 'user';
  if (code === 3) return 'owner';
  return 'none';
}
