// Comprimir PDF en dos pasos:
// 1. Las fotos JPEG de adentro se achican y se vuelven a guardar con menos calidad.
// 2. qpdf compacta el resto: comprime mejor los datos, pasa a JPEG las imágenes
//    sin comprimir y descarta objetos que ya nadie usa.
// El texto, los enlaces y los marcadores no se tocan.
import {
  $,
  baseName,
  canvasToBlob,
  checkedValue,
  fileSummary,
  formatBytes,
  getPdfLib,
  loadPdf,
  nextFrame,
  pdfBlob,
  readBytes,
  setupTool,
} from '../app.js';
import { protection, runQpdf } from '../qpdf.js';

let state = null;

const tool = setupTool({
  kind: 'pdf',
  onFiles: open,
  onRestart: () => {
    state = null;
  },
});

const runButton = $('[data-run]');

const LEVELS = {
  extrema: { maxSide: 1100, quality: 0.45, optimize: true },
  recomendada: { maxSide: 1700, quality: 0.65, optimize: true },
  baja: { maxSide: 2600, quality: 0.82, optimize: false },
};

async function open([file]) {
  tool.steps.status(`Revisando «${file.name}»…`);
  const bytes = await readBytes(file);
  if ((await protection(bytes)) === 'user') {
    throw new Error(`«${file.name}» tiene contraseña. Quítasela primero con Desbloquear PDF.`);
  }
  state = { file, bytes };
  tool.steps.clear();
  $('[data-summary]').innerHTML = fileSummary(file);
  tool.showWork();
}

/** Quita el bloque EXIF de un JPEG: dentro de un PDF no debe girar la imagen. */
function stripExif(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const parts = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    if (marker === 0xda) break; // empiezan los datos de la imagen
    const size = (bytes[i + 2] << 8) | bytes[i + 3];
    const isExif = marker === 0xe1 && bytes[i + 4] === 0x45 && bytes[i + 5] === 0x78;
    if (!isExif) parts.push(bytes.subarray(i, i + 2 + size));
    i += 2 + size;
  }
  parts.push(bytes.subarray(i));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  parts.forEach((p) => {
    out.set(p, o);
    o += p.length;
  });
  return out;
}

/** Recomprime las fotos JPEG del documento. Devuelve cuántas cambió. */
async function shrinkJpegs(doc, level, onProgress) {
  const { PDFName, PDFArray, PDFRef, PDFRawStream, PDFNumber } = await getPdfLib();
  const N = (name) => PDFName.of(name);
  const context = doc.context;
  const candidates = [];

  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (dict.get(N('Subtype')) !== N('Image')) continue;
    let filter = dict.get(N('Filter'));
    if (filter instanceof PDFArray) filter = filter.size() === 1 ? filter.get(0) : null;
    if (filter !== N('DCTDecode')) continue;
    if (dict.has(N('Decode')) || dict.get(N('ImageMask'))?.toString() === 'true') continue;
    // Solo RGB o gris: los JPEG en CMYK pierden color al pasar por el navegador.
    let cs = dict.get(N('ColorSpace'));
    if (cs instanceof PDFRef) cs = context.lookup(cs);
    let components = 0;
    if (cs === N('DeviceRGB') || cs === N('CalRGB')) components = 3;
    else if (cs === N('DeviceGray') || cs === N('CalGray')) components = 1;
    else if (cs instanceof PDFArray && cs.get(0) === N('ICCBased')) {
      let profile = cs.get(1);
      if (profile instanceof PDFRef) profile = context.lookup(profile);
      const n = profile?.dict?.get(N('N'));
      components = n instanceof PDFNumber ? n.asNumber() : 0;
    } else if (cs instanceof PDFArray && (cs.get(0) === N('CalRGB') || cs.get(0) === N('CalGray'))) {
      components = cs.get(0) === N('CalRGB') ? 3 : 1;
    }
    if (components !== 1 && components !== 3) continue;
    candidates.push({ ref, obj, hasMask: dict.has(N('SMask')) || dict.has(N('Mask')) });
  }

  let changed = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    onProgress(i, candidates.length);
    const { ref, obj, hasMask } = candidates[i];
    const original = obj.contents;
    let bitmap;
    try {
      bitmap = await createImageBitmap(new Blob([stripExif(original)], { type: 'image/jpeg' }));
    } catch {
      continue;
    }
    // Con máscara de transparencia se conserva el tamaño para que sigan calzando.
    const scale = hasMask ? 1 : Math.min(1, level.maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await canvasToBlob(canvas, 'image/jpeg', level.quality);
    const smaller = new Uint8Array(await blob.arrayBuffer());
    const width = canvas.width;
    const height = canvas.height;
    canvas.width = 0;
    if (smaller.length >= original.length * 0.9) continue;
    const dict = obj.dict;
    dict.set(N('Width'), PDFNumber.of(width));
    dict.set(N('Height'), PDFNumber.of(height));
    dict.set(N('ColorSpace'), N('DeviceRGB'));
    dict.set(N('BitsPerComponent'), PDFNumber.of(8));
    dict.set(N('Filter'), N('DCTDecode'));
    dict.delete(N('DecodeParms'));
    dict.set(N('Length'), PDFNumber.of(smaller.length));
    context.assign(ref, PDFRawStream.of(dict, smaller));
    changed += 1;
    if (i % 4 === 3) await nextFrame();
  }
  return changed;
}

runButton.addEventListener('click', () =>
  tool.run(runButton, 'Comprimiendo…', async () => {
    const level = LEVELS[checkedValue('level')] || LEVELS.recomendada;
    const { file, bytes } = state;

    // Paso 1: fotos JPEG
    let stage1 = bytes;
    try {
      tool.steps.progress(0, 1, 'Leyendo el documento…');
      await nextFrame();
      const doc = await loadPdf(bytes, file.name);
      const changed = await shrinkJpegs(doc, level, (i, n) =>
        tool.steps.progress(i, n, `Achicando imagen ${i + 1} de ${n}…`)
      );
      if (changed) stage1 = await doc.save({ useObjectStreams: false });
    } catch {
      // Si pdf-lib no puede con el archivo (por ejemplo, restricciones), seguimos solo con qpdf.
      stage1 = bytes;
    }

    // Paso 2: qpdf
    tool.steps.progress(1, 1, 'Compactando el resto del archivo…');
    await nextFrame();
    const args = ['--object-streams=generate', '--recompress-flate', '--compression-level=9'];
    if (level.optimize) args.push('--optimize-images');
    args.push('/in.pdf', '/out.pdf');
    const { code, files } = await runQpdf(args, { inputs: { '/in.pdf': stage1 }, outputs: ['/out.pdf'] });
    let result = (code === 0 || code === 3) && files['/out.pdf'] ? files['/out.pdf'] : stage1;
    if (result.length > stage1.length) result = stage1;

    const before = bytes.length;
    if (result.length >= before * 0.98) {
      tool.finish(pdfBlob(bytes), file.name, {
        note: 'Este PDF ya estaba bien comprimido: no pudimos achicarlo más. Te dejamos el archivo original.',
      });
      return;
    }
    const saved = Math.round((1 - result.length / before) * 100);
    tool.finish(pdfBlob(result), `${baseName(file.name)}-comprimido.pdf`, {
      note: `Pasó de ${formatBytes(before)} a ${formatBytes(result.length)}: pesa ${saved} % menos.`,
    });
  })
);
