// Copiar páginas sin arrastrar lo que se quitó.
//
// pdf-lib copia todo lo que una página "apunta". Si una página que se queda tiene un
// enlace a otra que se quitó (un índice, por ejemplo), la página quitada viaja escondida
// dentro del archivo con todo su texto. Lo mismo pasa con los recursos que varias páginas
// comparten, con los campos de formulario y con las notas que responden a otras notas.
//
// copyPagesClean() copia como out.copyPages() pero marca de qué página viene cada copia.
// cleanOutput() se llama justo antes de out.save(): arregla los enlaces internos, quita
// toda referencia a páginas que no están, deja en cada página solo los recursos que usa
// y borra los objetos que quedaron sueltos. Así lo quitado deja de existir en el archivo.

import { getPdfLib } from './app.js';

const MARK = 'JmpvOrigen';
const SHARED = 'JmpvCompartido';

let nextDocId = 1;
const docIds = new WeakMap();
// Por cada documento de salida: página de salida que reemplaza a una página de origen.
const standIns = new WeakMap();

function docId(doc) {
  if (!docIds.has(doc)) {
    docIds.set(doc, nextDocId);
    nextDocId += 1;
  }
  return docIds.get(doc);
}

/** Herramientas de pdf-lib que se usan aquí. */
async function lib() {
  const L = await getPdfLib();
  const N = (name) => L.PDFName.of(name);
  return { L, N };
}

/* ---------- Destinos (a dónde lleva un enlace) ---------- */

function bytesKey(obj, L) {
  if (obj instanceof L.PDFString || obj instanceof L.PDFHexString) {
    return Array.from(obj.asBytes()).join(',');
  }
  if (obj instanceof L.PDFName) {
    return Array.from(new TextEncoder().encode(obj.decodeText())).join(',');
  }
  return null;
}

/** Busca un nombre en un árbol de nombres (/Names /Dests). */
function findInNameTree(context, node, key, L, N, depth = 0) {
  if (!(node instanceof L.PDFDict) || depth > 32) return undefined;
  const names = node.lookup(N('Names'));
  if (names instanceof L.PDFArray) {
    for (let i = 0; i + 1 < names.size(); i += 2) {
      if (bytesKey(names.lookup(i), L) === key) return names.lookup(i + 1);
    }
  }
  const kids = node.lookup(N('Kids'));
  if (kids instanceof L.PDFArray) {
    for (let i = 0; i < kids.size(); i += 1) {
      const found = findInNameTree(context, kids.lookup(i), key, L, N, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** Convierte un destino con nombre en un destino explícito [página /XYZ …], o null. */
function resolveNamedDest(src, value, L, N) {
  const key = bytesKey(value, L);
  if (key == null) return null;
  const catalog = src.catalog;
  let found;
  const tree = catalog.lookup(N('Names'));
  const destsTree = tree instanceof L.PDFDict ? tree.lookup(N('Dests')) : undefined;
  if (destsTree) found = findInNameTree(src.context, destsTree, key, L, N);
  if (found === undefined) {
    const old = catalog.lookup(N('Dests'));
    if (old instanceof L.PDFDict) {
      const text = value instanceof L.PDFName ? value.decodeText() : value.decodeText?.();
      if (text) found = old.lookup(N(text));
    }
  }
  if (found instanceof L.PDFDict) found = found.lookup(N('D'));
  return found instanceof L.PDFArray ? found : null;
}

/** Dónde guarda el destino una anotación de enlace: { holder, key } o null. */
function destSlot(annot, L, N) {
  if (annot.get(N('Dest')) !== undefined) return { holder: annot, key: N('Dest') };
  const action = annot.lookup(N('A'));
  if (action instanceof L.PDFDict && action.get(N('S')) === N('GoTo') && action.get(N('D')) !== undefined) {
    return { holder: action, key: N('D') };
  }
  return null;
}

function annotsOf(node, L, N) {
  const annots = node.lookup(N('Annots'));
  return annots instanceof L.PDFArray ? annots : null;
}

/* ---------- Copiar ---------- */

/**
 * Igual que out.copyPages(src, indices), pero deja marcado de qué página viene cada copia
 * y convierte los enlaces con nombre en enlaces directos para poder arreglarlos después.
 */
export async function copyPagesClean(out, src, indices) {
  const { L, N } = await lib();
  const id = docId(src);
  const srcPages = src.getPages();
  const restore = [];

  // Recursos heredados o compartidos por varias páginas: hay que podarlos en la copia.
  const resourceUse = new Map();
  for (const page of srcPages) {
    const raw = page.node.get(N('Resources'));
    if (raw instanceof L.PDFRef) resourceUse.set(raw, (resourceUse.get(raw) || 0) + 1);
  }

  try {
    srcPages.forEach((page, index) => {
      const node = page.node;
      restore.push(() => node.delete(N(MARK)));
      node.set(N(MARK), L.PDFString.of(`${id}:${index}`));
      const raw = node.get(N('Resources'));
      const shared = raw === undefined || (raw instanceof L.PDFRef && resourceUse.get(raw) > 1);
      if (shared) {
        restore.push(() => node.delete(N(SHARED)));
        node.set(N(SHARED), L.PDFBool.True);
      }
    });

    // Enlaces con nombre en las páginas que se copian → destino directo (temporal).
    for (const index of new Set(indices)) {
      const annots = annotsOf(srcPages[index].node, L, N);
      if (!annots) continue;
      for (let i = 0; i < annots.size(); i += 1) {
        const annot = annots.lookup(i);
        if (!(annot instanceof L.PDFDict) || annot.get(N('Subtype')) !== N('Link')) continue;
        const slot = destSlot(annot, L, N);
        if (!slot) continue;
        const value = slot.holder.lookup(slot.key);
        if (value instanceof L.PDFArray) continue;
        const explicit = resolveNamedDest(src, value, L, N);
        const original = slot.holder.get(slot.key);
        restore.push(() => slot.holder.set(slot.key, original));
        if (explicit) slot.holder.set(slot.key, explicit);
        else slot.holder.set(slot.key, L.PDFNull);
      }
    }

    return await out.copyPages(src, indices);
  } finally {
    restore.reverse().forEach((undo) => undo());
  }
}

/**
 * La página `page` de la salida reemplaza a la página `index` de `src`
 * (por ejemplo, la página censurada que se volvió imagen). Los enlaces que iban
 * a la página original llevarán a esta.
 */
export function standIn(out, page, src, index) {
  if (!standIns.has(out)) standIns.set(out, new Map());
  standIns.get(out).set(`${docId(src)}:${index}`, page.ref);
}

/* ---------- Limpiar antes de guardar ---------- */

function markOf(dict, L, N) {
  const mark = dict.get(N(MARK));
  return mark instanceof L.PDFString ? mark.asString() : null;
}

function isPageDict(obj, L, N) {
  return obj instanceof L.PDFDict && obj.get(N('Type')) === N('Page');
}

const ANNOT_TYPES = new Set([
  'Text', 'Link', 'FreeText', 'Line', 'Square', 'Circle', 'Polygon', 'PolyLine', 'Highlight',
  'Underline', 'Squiggly', 'StrikeOut', 'Stamp', 'Caret', 'Ink', 'Popup', 'FileAttachment',
  'Sound', 'Movie', 'Widget', 'Screen', 'PrinterMark', 'TrapNet', 'Watermark', '3D', 'Redact',
  'Projection', 'RichMedia',
]);

function isAnnotDict(obj, L, N) {
  if (!(obj instanceof L.PDFDict) || obj instanceof L.PDFPageLeaf) return false;
  const subtype = obj.get(N('Subtype'));
  return subtype instanceof L.PDFName && ANNOT_TYPES.has(subtype.decodeText()) && obj.get(N('Rect')) !== undefined;
}

/** Bytes sin comprimir de un flujo, o null si no se puede leer. */
function streamBytes(stream, L) {
  try {
    if (stream instanceof L.PDFRawStream) return L.decodePDFRawStream(stream).decode();
    if (typeof stream.getUnencodedContents === 'function') return stream.getUnencodedContents();
  } catch {
    /* filtro que no se puede leer */
  }
  return null;
}

/** Nombres (/Algo) que aparecen en un flujo de contenido. */
function namesIn(bytes, into) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    text += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  const re = /\/([^\x00\t\n\f\r \/\[\]()<>{}%]*)/g;
  let m;
  while ((m = re.exec(text))) {
    into.add(m[1].replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
  }
}

const PRUNABLE = ['XObject', 'Font', 'ExtGState', 'Pattern', 'Shading', 'ColorSpace', 'Properties'];

/**
 * Deja en los recursos de la página solo lo que su contenido usa. Devuelve false si no
 * pudo leer algún contenido (entonces no toca nada, para no romper la página).
 */
function pruneResources(context, node, L, N) {
  const resources = node.Resources();
  if (!(resources instanceof L.PDFDict)) return true;
  const used = new Set();
  const pending = [];
  const contents = node.lookup(N('Contents'));
  if (contents instanceof L.PDFArray) {
    for (let i = 0; i < contents.size(); i += 1) pending.push(contents.lookup(i));
  } else if (contents) {
    pending.push(contents);
  }
  const seen = new Set();
  // Formularios, patrones y fuentes Type3 sin recursos propios usan los de la página.
  const borrowers = (dict) => {
    for (const cat of ['XObject', 'Pattern', 'Font']) {
      const sub = dict.lookup(N(cat));
      if (!(sub instanceof L.PDFDict)) continue;
      for (const [name, value] of sub.entries()) {
        if (!used.has(name.decodeText())) continue;
        const obj = context.lookup(value);
        const objDict = obj instanceof L.PDFStream ? obj.dict : obj;
        if (!(objDict instanceof L.PDFDict) || objDict.get(N('Resources')) !== undefined) continue;
        if (seen.has(obj)) continue;
        seen.add(obj);
        if (obj instanceof L.PDFStream) pending.push(obj);
        const procs = objDict.lookup(N('CharProcs'));
        if (procs instanceof L.PDFDict) for (const [, p] of procs.entries()) pending.push(context.lookup(p));
      }
    }
  };
  while (pending.length) {
    const stream = pending.pop();
    if (!(stream instanceof L.PDFStream)) continue;
    const bytes = streamBytes(stream, L);
    if (!bytes) return false;
    namesIn(bytes, used);
    borrowers(resources);
  }

  const fresh = context.obj({});
  for (const [key, value] of resources.entries()) {
    const name = key.decodeText();
    const sub = context.lookup(value);
    if (PRUNABLE.includes(name) && sub instanceof L.PDFDict) {
      const kept = context.obj({});
      for (const [entry, ref] of sub.entries()) {
        if (used.has(entry.decodeText())) kept.set(entry, ref);
      }
      fresh.set(key, kept);
    } else {
      fresh.set(key, value);
    }
  }
  node.set(N('Resources'), fresh);
  return true;
}

/** Quita de los campos de formulario los widgets que no quedaron en ninguna página. */
function pruneFieldTree(context, field, validAnnots, L, N, depth = 0) {
  if (depth > 32) return false;
  const kids = field.lookup(N('Kids'));
  if (!(kids instanceof L.PDFArray)) return validAnnots.has(field);
  let keep = validAnnots.has(field);
  for (let i = kids.size() - 1; i >= 0; i -= 1) {
    const ref = kids.get(i);
    const kid = context.lookup(ref);
    const alive = kid instanceof L.PDFDict && (validAnnots.has(kid) || pruneFieldTree(context, kid, validAnnots, L, N, depth + 1));
    if (alive) keep = true;
    else kids.remove(i);
  }
  return keep;
}

/**
 * Antes de out.save(): enlaces internos a páginas que siguen → a su copia; enlaces a
 * páginas que no están → fuera. Quita referencias a páginas y notas que no quedaron,
 * poda recursos compartidos y borra lo que quedó suelto.
 */
export async function cleanOutput(out) {
  const { L, N } = await lib();
  const context = out.context;
  await out.flush();

  const pages = out.getPages();
  const validPages = new Set(pages.map((p) => p.ref));
  const target = new Map(standIns.get(out) || []);
  for (const page of pages) {
    const mark = markOf(page.node, L, N);
    if (mark && !target.has(mark)) target.set(mark, page.ref);
  }

  // 1. Enlaces y /P de cada anotación de las páginas que quedan.
  const validAnnots = new Set();
  for (const page of pages) {
    const annots = annotsOf(page.node, L, N);
    if (!annots) continue;
    for (let i = annots.size() - 1; i >= 0; i -= 1) {
      const annot = annots.lookup(i);
      if (!(annot instanceof L.PDFDict)) {
        annots.remove(i);
        continue;
      }
      if (annot.get(N('P')) !== undefined) annot.set(N('P'), page.ref);
      if (annot.get(N('Subtype')) === N('Link')) {
        const slot = destSlot(annot, L, N);
        if (slot) {
          const dest = slot.holder.lookup(slot.key);
          let ok = false;
          if (dest instanceof L.PDFArray && dest.size() > 0) {
            const first = dest.get(0);
            if (first instanceof L.PDFRef && validPages.has(first)) {
              ok = true;
            } else if (first instanceof L.PDFRef) {
              const pageDict = context.lookup(first);
              const mark = pageDict instanceof L.PDFDict ? markOf(pageDict, L, N) : null;
              const ref = mark ? target.get(mark) : undefined;
              if (ref) {
                const fixed = context.obj([ref, ...dest.asArray().slice(1)]);
                slot.holder.set(slot.key, fixed);
                ok = true;
              }
            } else if (first instanceof L.PDFNumber) {
              ok = true; // enlace a otro archivo: no apunta a nada de este documento
            }
          }
          if (!ok) {
            annots.remove(i);
            continue;
          }
        }
      }
      validAnnots.add(annot);
    }
  }

  // 2. Campos de formulario: fuera los widgets de páginas que no están.
  const roots = new Set();
  for (const annot of validAnnots) {
    let field = annot;
    for (let d = 0; d < 32; d += 1) {
      const parent = field.lookup(N('Parent'));
      if (!(parent instanceof L.PDFDict)) break;
      field = parent;
    }
    if (field !== annot) roots.add(field);
  }
  roots.forEach((root) => pruneFieldTree(context, root, validAnnots, L, N));

  // 3. Recursos compartidos: solo lo que cada página usa.
  for (const page of pages) {
    if (page.node.get(N(SHARED)) !== undefined) pruneResources(context, page.node, L, N);
    page.node.delete(N(SHARED));
    page.node.delete(N(MARK));
  }

  // 4. Cualquier otra referencia a una página o nota que no quedó se borra.
  const refOfPage = new Map(pages.map((p) => [p.node, p.ref]));
  const isGhost = (obj) =>
    (isPageDict(obj, L, N) && !validPages.has(refOfPage.get(obj))) || (isAnnotDict(obj, L, N) && !validAnnots.has(obj));

  const trailer = context.trailerInfo;
  const visited = new Set();
  const stack = [trailer.Root, trailer.Info].filter(Boolean);
  while (stack.length) {
    let obj = stack.pop();
    if (obj instanceof L.PDFRef) {
      if (visited.has(obj)) continue;
      visited.add(obj);
      obj = context.lookup(obj);
    }
    if (obj instanceof L.PDFStream) obj = obj.dict;
    if (obj instanceof L.PDFDict) {
      for (const [key, value] of obj.entries()) {
        const resolved = value instanceof L.PDFRef ? context.lookup(value) : value;
        if (resolved && isGhost(resolved)) {
          obj.delete(key);
          continue;
        }
        if (value instanceof L.PDFRef || value instanceof L.PDFDict || value instanceof L.PDFArray || value instanceof L.PDFStream) {
          stack.push(value);
        }
      }
    } else if (obj instanceof L.PDFArray) {
      for (let i = obj.size() - 1; i >= 0; i -= 1) {
        const value = obj.get(i);
        const resolved = value instanceof L.PDFRef ? context.lookup(value) : value;
        if (resolved && isGhost(resolved)) {
          obj.set(i, L.PDFNull);
          continue;
        }
        if (value instanceof L.PDFRef || value instanceof L.PDFDict || value instanceof L.PDFArray || value instanceof L.PDFStream) {
          stack.push(value);
        }
      }
    }
  }

  // 5. Los objetos a los que ya nada apunta no se guardan.
  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!visited.has(ref)) context.delete(ref);
  }
  standIns.delete(out);
}
