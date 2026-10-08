// Contenido del sitio: nombre, herramientas y el marcado propio de cada una.
// build.mjs usa esto para generar el HTML final.

import { icons } from '../public/assets/js/icons.js';

export const site = {
  name: 'PDF jmpvlab',
  // Dominio provisional. Cámbialo antes de publicar.
  url: 'https://pdf.jmpvlab.com',
  // Correo de contacto para la página de privacidad. Déjalo vacío para no mostrarlo.
  contactEmail: '',
  updated: '6 de octubre de 2026',
  // Servidor de conversiones (fase 3). Se puede cambiar al generar: PDF_API_URL=... node tools/build.mjs
  apiUrl: process.env.PDF_API_URL || 'https://api-pdf.jmpvlab.com',
  // Código fuente público (licencia AGPL)
  sourceUrl: 'https://github.com/jordanpv541/pdf-jmpvlab',
};

export const groups = [
  { id: 'organizar', title: 'Organizar' },
  { id: 'optimizar', title: 'Optimizar' },
  { id: 'a-pdf', title: 'Convertir a PDF' },
  { id: 'desde-pdf', title: 'Convertir desde PDF' },
  { id: 'editar', title: 'Editar' },
  { id: 'firmar', title: 'Firmar y proteger' },
];

/** Palabras extra para el buscador del inicio (sin tildes; se comparan sin tildes). */
export const searchWords = {
  unir: 'juntar combinar fusionar agrupar varios',
  dividir: 'separar partir cortar sacar',
  organizar: 'ordenar mover reordenar girar quitar paginas',
  'eliminar-paginas': 'borrar quitar sacar paginas',
  'extraer-paginas': 'sacar separar copiar paginas',
  rotar: 'girar voltear orientacion',
  comprimir: 'reducir achicar peso tamano liviano pesado',
  reparar: 'arreglar danado corrupto no abre',
  ocr: 'texto escaneo escaneado reconocer buscar copiar',
  'jpg-a-pdf': 'imagen imagenes foto fotos png jpeg',
  escanear: 'camara celular foto hojas documento',
  'pdf-a-jpg': 'imagen imagenes foto png jpeg',
  'numeros-de-pagina': 'numerar paginacion numeros',
  'marca-de-agua': 'sello logo texto confidencial',
  recortar: 'margenes bordes cortar',
  firmar: 'firma firmar',
  censurar: 'tapar ocultar borrar datos privados',
  proteger: 'contrasena clave bloquear seguridad',
  desbloquear: 'quitar contrasena clave desproteger',
  'word-a-pdf': 'doc docx documento odt',
  'excel-a-pdf': 'xls xlsx hoja calculo',
  'powerpoint-a-pdf': 'ppt pptx presentacion diapositivas',
  'html-a-pdf': 'web pagina url sitio enlace',
  'pdf-a-word': 'doc docx editar documento',
  'pdf-a-excel': 'xls xlsx tabla tablas hoja',
  'pdf-a-powerpoint': 'ppt pptx presentacion diapositivas',
  'pdf-a-pdfa': 'archivar archivo largo plazo institucion',
};

/* ---------- Ayudas de marcado ---------- */

const chips = (name, options, { label } = {}) =>
  `<div class="chips"${label ? ` role="radiogroup" aria-label="${label}"` : ''}>${options
    .map(
      (o) =>
        `<label class="chip"><input type="radio" name="${name}" value="${o.value}"${o.checked ? ' checked' : ''}${
          o.aria ? ` aria-label="${o.aria}"` : ''
        }><span>${o.label}</span></label>`
    )
    .join('')}</div>`;

const summary = '<p class="file-summary" tabindex="-1" data-focus data-summary></p>';

const checkbox = (id, label, { checked = false } = {}) =>
  `<label class="check-row"><input type="checkbox" id="${id}"${checked ? ' checked' : ''}><span>${label}</span></label>`;

/** Selector de posición 3 × 3 dibujado como una hoja. */
const posGrid = (checked) => {
  const rows = [
    ['t', 'Arriba'],
    ['m', 'En medio'],
    ['b', 'Abajo'],
  ];
  const cols = [
    ['l', 'Izquierda', 'a la izquierda'],
    ['c', 'Centro', 'al centro'],
    ['r', 'Derecha', 'a la derecha'],
  ];
  return `<div class="pos-grid">${rows
    .map(([r, rowLabel]) =>
      cols
        .map(([c, , aria]) => {
          const name = r === 'm' && c === 'c' ? 'En el centro' : `${rowLabel} ${aria}`;
          return `<label class="pos-spot" title="${name}"><input type="radio" name="pos" value="${r}${c}" aria-label="${name}"${
            `${r}${c}` === checked ? ' checked' : ''
          }><span aria-hidden="true"></span></label>`;
        })
        .join('')
    )
    .join('')}</div>`;
};

const fontRow = (prefix, { bold = false } = {}) => `
          <div class="row">
            <div>
              <label class="field-label" for="${prefix}font">Fuente</label>
              <select id="${prefix}font">
                <option value="helvetica">Helvetica</option>
                <option value="times">Times</option>
                <option value="courier">Courier</option>
              </select>
            </div>
            <div>${checkbox(`${prefix}bold`, 'Negrita', { checked: bold })}</div>
          </div>`;

const pageNav = `<figcaption class="page-nav">
            <button type="button" class="icon-btn" data-prev aria-label="Ver la página anterior">${icons.left}</button>
            <span data-page-label>Página 1</span>
            <button type="button" class="icon-btn" data-next aria-label="Ver la página siguiente">${icons.right}</button>
          </figcaption>`;

const runButton = (text) =>
  `<div class="actions"><button type="button" class="btn btn-primary" data-run>${text}</button></div>`;

const preview = (caption) =>
  `<figure class="live-preview"><div class="live-preview-page" data-preview aria-hidden="true"></div><figcaption data-preview-caption>${caption}</figcaption></figure>`;

/* ---------- Herramientas ---------- */

export const tools = [
  {
    slug: 'unir',
    group: 'organizar',
    name: 'Unir PDF',
    desc: 'Junta varios PDF en uno, en el orden que elijas.',
    title: 'Unir PDF gratis y sin anuncios',
    metaDesc: 'Une varios PDF en uno solo desde tu navegador. Gratis, sin anuncios, sin cuenta y sin subir tus archivos.',
    lede: 'Elige dos o más PDF, ponlos en orden y júntalos en un solo archivo.',
    kind: 'pdf',
    multiple: true,
    pickText: 'Elegir archivos PDF',
    dropHint: 'o suéltalos aquí',
    work: `
      <h2 class="field-label" tabindex="-1" data-focus>Se unirán en este orden</h2>
      <ol class="file-list" data-files data-drop-more></ol>
      <div class="list-tools">
        <button type="button" class="btn btn-quiet btn-small" data-add>${icons.plus}Agregar más PDF</button>
        <button type="button" class="btn btn-quiet btn-small" data-sort>Ordenar por nombre</button>
      </div>
      <div class="options">
        <div>
          ${checkbox('interleave', 'Intercalar las páginas')}
          <span class="field-help">Toma una página de cada archivo por turnos: 1.ª del primero, 1.ª del segundo, 2.ª del primero… Sirve para escaneos de doble cara.</span>
          <div class="subfield" data-reverse hidden>
            ${checkbox('reverse', 'Leer al revés los archivos que siguen al primero')}
            <span class="field-help">Úsalo si escaneaste el reverso de las hojas empezando por la última.</span>
          </div>
        </div>
      </div>
      ${runButton('Unir PDF')}`,
  },
  {
    slug: 'dividir',
    group: 'organizar',
    name: 'Dividir PDF',
    desc: 'Saca las páginas que necesitas o separa el PDF en partes.',
    title: 'Dividir PDF y extraer páginas gratis',
    metaDesc: 'Extrae páginas de un PDF o sepáralo en varios archivos desde tu navegador. Gratis, sin anuncios y sin subir nada.',
    lede: 'Saca algunas páginas a un PDF nuevo o separa el documento en varios archivos.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <div class="options">
        <fieldset>
          <legend>¿Qué quieres hacer?</legend>
          ${chips('mode', [
            { value: 'extraer', label: 'Sacar algunas páginas', checked: true },
            { value: 'rangos', label: 'Separar en partes' },
            { value: 'cada', label: 'Cortar cada cierto número de páginas' },
          ])}
        </fieldset>
        <div data-for="extraer rangos">
          <label class="field-label" for="ranges" data-ranges-label>Páginas</label>
          <input type="text" id="ranges" autocomplete="off" spellcheck="false" placeholder="1-3, 5, 8-">
          <span class="field-help" data-ranges-help></span>
        </div>
        <div data-for="extraer">
          ${checkbox('separate', 'Guardar cada página en un archivo aparte')}
        </div>
        <div data-for="cada" hidden>
          <label class="field-label" for="every">Páginas por archivo</label>
          <input type="number" id="every" min="1" step="1" value="1" inputmode="numeric">
          <span class="field-help" data-every-help></span>
        </div>
      </div>
      <div class="pages-block" data-for="extraer">
        <div class="grid-tools">
          <button type="button" class="btn btn-quiet btn-small" data-select-all>Elegir todas</button>
          <button type="button" class="btn btn-quiet btn-small" data-select-none>Quitar selección</button>
        </div>
        <ol class="page-grid" data-pages></ol>
      </div>
      ${runButton('Sacar páginas')}`,
  },
  {
    slug: 'organizar',
    group: 'organizar',
    name: 'Organizar páginas',
    desc: 'Gira, cambia de lugar o quita páginas de un PDF.',
    title: 'Organizar páginas de un PDF gratis',
    metaDesc: 'Gira, reordena y elimina páginas de un PDF desde tu navegador. Gratis, sin anuncios y sin subir tus archivos.',
    lede: 'Mira todas las páginas, gíralas, cámbialas de lugar o quita las que sobran.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <p class="field-help hint">Usa los botones de cada página. En computadora también puedes arrastrarlas.</p>
      <div class="grid-tools">
        <button type="button" class="btn btn-quiet btn-small" data-rotate-all="-90">${icons.rotateLeft}Girar todas a la izquierda</button>
        <button type="button" class="btn btn-quiet btn-small" data-rotate-all="90">${icons.rotateRight}Girar todas a la derecha</button>
        <button type="button" class="btn btn-quiet btn-small" data-reset>Deshacer cambios</button>
      </div>
      <ol class="page-grid page-grid-edit" data-pages></ol>
      ${runButton('Guardar PDF')}`,
  },
  {
    slug: 'eliminar-paginas',
    group: 'organizar',
    name: 'Eliminar páginas',
    desc: 'Quita las páginas que no necesitas.',
    title: 'Eliminar páginas de un PDF gratis',
    metaDesc: 'Quita páginas de un PDF desde tu navegador. Gratis, sin anuncios y sin subir tus archivos.',
    lede: 'Toca las páginas que sobran y guarda el PDF sin ellas.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <div class="options">
        <div>
          <label class="field-label" for="remove">Páginas que quieres quitar</label>
          <input type="text" id="remove" autocomplete="off" spellcheck="false" placeholder="2, 5-7">
          <span class="field-help" data-remove-help></span>
        </div>
      </div>
      <div class="pages-block">
        <div class="grid-tools">
          <button type="button" class="btn btn-quiet btn-small" data-select-none>Quitar selección</button>
        </div>
        <ol class="page-grid page-grid-remove" data-pages></ol>
      </div>
      ${runButton('Quitar páginas')}`,
  },
  {
    slug: 'extraer-paginas',
    script: 'dividir',
    group: 'organizar',
    name: 'Extraer páginas',
    desc: 'Saca algunas páginas a un PDF nuevo.',
    title: 'Extraer páginas de un PDF gratis',
    metaDesc: 'Saca las páginas que necesitas de un PDF a un archivo nuevo, desde tu navegador. Gratis y sin anuncios.',
    lede: 'Elige las páginas que quieres y guárdalas en un PDF nuevo.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <div class="options">
        <div data-for="extraer">
          <label class="field-label" for="ranges" data-ranges-label>Páginas</label>
          <input type="text" id="ranges" autocomplete="off" spellcheck="false" placeholder="1-3, 5, 8-">
          <span class="field-help" data-ranges-help></span>
        </div>
        <div data-for="extraer">
          ${checkbox('separate', 'Guardar cada página en un archivo aparte')}
        </div>
      </div>
      <div class="pages-block" data-for="extraer">
        <div class="grid-tools">
          <button type="button" class="btn btn-quiet btn-small" data-select-all>Elegir todas</button>
          <button type="button" class="btn btn-quiet btn-small" data-select-none>Quitar selección</button>
        </div>
        <ol class="page-grid" data-pages></ol>
      </div>
      ${runButton('Sacar páginas')}`,
  },
  {
    slug: 'rotar',
    group: 'organizar',
    name: 'Rotar PDF',
    desc: 'Gira todas las páginas de uno o varios PDF.',
    title: 'Rotar PDF gratis',
    metaDesc: 'Gira las páginas de uno o varios PDF desde tu navegador. Gratis, sin anuncios y sin subir tus archivos.',
    lede: 'Gira documentos completos. Para girar páginas sueltas, usa Organizar páginas.',
    kind: 'pdf',
    multiple: true,
    pickText: 'Elegir archivos PDF',
    dropHint: 'o suéltalos aquí',
    work: `
      <h2 class="field-label" tabindex="-1" data-focus>Archivos</h2>
      <ol class="file-list" data-files data-drop-more></ol>
      <div class="list-tools">
        <button type="button" class="btn btn-quiet btn-small" data-rotate-all="-90">${icons.rotateLeft}Girar todos a la izquierda</button>
        <button type="button" class="btn btn-quiet btn-small" data-rotate-all="90">${icons.rotateRight}Girar todos a la derecha</button>
        <button type="button" class="btn btn-quiet btn-small" data-add>${icons.plus}Agregar más PDF</button>
      </div>
      ${runButton('Rotar PDF')}`,
  },
  {
    slug: 'comprimir',
    group: 'optimizar',
    name: 'Comprimir PDF',
    desc: 'Haz que tu PDF pese menos sin perder el texto.',
    title: 'Comprimir PDF gratis',
    metaDesc: 'Reduce el peso de un PDF desde tu navegador, sin subirlo a ningún lado. Gratis y sin anuncios.',
    lede: 'Achica las fotos que trae el PDF y compacta el resto. El texto no cambia.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <div class="options">
        <fieldset>
          <legend>Nivel de compresión</legend>
          ${chips('level', [
            { value: 'extrema', label: 'Máxima' },
            { value: 'recomendada', label: 'Recomendada', checked: true },
            { value: 'baja', label: 'Ligera' },
          ])}
          <span class="field-help">Máxima pesa menos, pero las fotos pierden nitidez. Ligera casi no cambia cómo se ven.</span>
        </fieldset>
      </div>
      <p class="field-help note">Funciona mejor con PDF que tienen fotos o páginas escaneadas. Si el PDF es solo texto, puede que ya esté bien comprimido.</p>
      ${runButton('Comprimir PDF')}`,
  },
  {
    slug: 'reparar',
    group: 'optimizar',
    name: 'Reparar PDF',
    desc: 'Arregla un PDF que no abre bien o que dice que está dañado.',
    title: 'Reparar PDF dañado gratis',
    metaDesc: 'Intenta arreglar un PDF dañado desde tu navegador, sin subirlo a ningún lado. Gratis y sin anuncios.',
    lede: 'Volvemos a leer el archivo, corregimos su estructura y lo guardamos limpio.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <p class="field-help note">Sirve cuando el archivo se descargó a medias, tiene errores internos o otros programas no lo abren. No puede recuperar páginas que ya no están en el archivo.</p>
      ${runButton('Reparar PDF')}`,
  },
  {
    slug: 'ocr',
    group: 'optimizar',
    previewWarning: 'En esta vista previa el OCR no funciona, porque necesita archivos que este servidor no admite. En tu dominio sí funciona.',
    name: 'OCR PDF',
    desc: 'Convierte un escaneo en texto que se puede buscar y copiar.',
    title: 'OCR PDF gratis: texto buscable en escaneos',
    metaDesc: 'Reconoce el texto de un PDF escaneado desde tu navegador y vuélvelo buscable. Gratis, sin anuncios y sin subir nada.',
    lede: 'Leemos el texto de tus páginas escaneadas. El PDF se ve igual, pero ahora puedes buscar y copiar.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <div class="options">
        <fieldset>
          <legend>Idioma del documento</legend>
          ${chips('lang', [
            { value: 'spa', label: 'Español', checked: true },
            { value: 'eng', label: 'Inglés' },
            { value: 'spa+eng', label: 'Los dos' },
          ])}
        </fieldset>
        <fieldset>
          <legend>Páginas</legend>
          ${chips('which', [
            { value: 'all', label: 'Todas', checked: true },
            { value: 'some', label: 'Solo algunas' },
          ])}
          <div class="subfield" data-some hidden>
            <label class="field-label" for="ranges">¿Cuáles?</label>
            <input type="text" id="ranges" autocomplete="off" spellcheck="false" placeholder="1-3, 5, 8-">
          </div>
        </fieldset>
        ${checkbox('skip-text', 'Saltar las páginas que ya tienen texto', { checked: true })}
      </div>
      <p class="field-help note">La primera vez se descarga el lector de texto (unos 6 MB, o 9 MB con los dos idiomas); después queda guardado en tu navegador. Cada página tarda unos segundos, más en celulares.</p>
      ${runButton('Reconocer texto')}`,
  },
  {
    slug: 'jpg-a-pdf',
    group: 'a-pdf',
    name: 'JPG a PDF',
    desc: 'Convierte fotos e imágenes en un PDF.',
    title: 'Convertir JPG a PDF gratis',
    metaDesc: 'Convierte fotos JPG o PNG en un PDF desde tu navegador. Gratis, sin anuncios y sin subir tus imágenes.',
    lede: 'Convierte fotos JPG o PNG en un PDF, una imagen por página.',
    kind: 'image',
    multiple: true,
    pickText: 'Elegir imágenes',
    dropHint: 'o suéltalas aquí',
    work: `
      <h2 class="field-label" tabindex="-1" data-focus>Imágenes en el orden del PDF</h2>
      <ol class="file-list" data-files data-drop-more></ol>
      <div class="list-tools">
        <button type="button" class="btn btn-quiet btn-small" data-add>${icons.plus}Agregar más imágenes</button>
      </div>
      <div class="options">
        <fieldset>
          <legend>Tamaño de página</legend>
          ${chips('size', [
            { value: 'a4', label: 'A4', checked: true },
            { value: 'carta', label: 'Carta' },
            { value: 'imagen', label: 'Igual a la imagen' },
          ])}
        </fieldset>
        <fieldset data-orientation>
          <legend>Orientación</legend>
          ${chips('orient', [
            { value: 'auto', label: 'Según la imagen', checked: true },
            { value: 'vertical', label: 'Vertical' },
            { value: 'horizontal', label: 'Horizontal' },
          ])}
        </fieldset>
        <fieldset>
          <legend>Margen</legend>
          ${chips('margin', [
            { value: '0', label: 'Sin margen', checked: true },
            { value: '20', label: 'Pequeño' },
            { value: '40', label: 'Grande' },
          ])}
        </fieldset>
        ${checkbox('separate', 'Crear un PDF por cada imagen')}
      </div>
      ${runButton('Crear PDF')}`,
  },
  {
    slug: 'escanear',
    group: 'a-pdf',
    name: 'Escanear a PDF',
    desc: 'Toma fotos de tus hojas con el celular y júntalas en un PDF.',
    title: 'Escanear documentos a PDF con el celular',
    metaDesc: 'Convierte fotos de hojas en un PDF que parece escaneado, desde tu celular. Gratis, sin anuncios y sin subir nada.',
    lede: 'Toma una foto de cada hoja. Quitamos las sombras para que se vea como un escaneo.',
    kind: 'image',
    multiple: true,
    capture: true,
    pickText: 'Tomar foto',
    dropHint: 'En computadora puedes soltar aquí tus fotos.',
    pickExtra: `<button type="button" class="btn btn-quiet" data-pick-gallery>Elegir fotos guardadas</button>
      <input type="file" accept="image/*" multiple hidden data-input-gallery>`,
    work: `
      <h2 class="field-label" tabindex="-1" data-focus>Hojas en el orden del PDF</h2>
      <ol class="file-list" data-files data-drop-more></ol>
      <div class="list-tools">
        <button type="button" class="btn btn-quiet btn-small" data-add>${icons.plus}Tomar otra foto</button>
        <button type="button" class="btn btn-quiet btn-small" data-pick-gallery>Elegir fotos guardadas</button>
      </div>
      <div class="edit-layout">
        <div class="options">
          <fieldset>
            <legend>Aspecto</legend>
            ${chips('filter', [
              { value: 'document', label: 'Documento', checked: true },
              { value: 'gray', label: 'Gris' },
              { value: 'color', label: 'Color original' },
            ])}
            <span class="field-help">Documento quita sombras y deja el papel blanco. Usa color original para fotos o dibujos.</span>
          </fieldset>
          <fieldset>
            <legend>Tamaño de página</legend>
            ${chips('size', [
              { value: 'a4', label: 'A4', checked: true },
              { value: 'carta', label: 'Carta' },
            ])}
          </fieldset>
        </div>
        ${preview('Así se verá la primera hoja')}
      </div>
      ${runButton('Crear PDF')}`,
  },
  {
    slug: 'pdf-a-jpg',
    group: 'desde-pdf',
    name: 'PDF a JPG',
    desc: 'Guarda cada página de un PDF como imagen.',
    title: 'Convertir PDF a JPG gratis',
    metaDesc: 'Convierte las páginas de un PDF en imágenes JPG o PNG desde tu navegador. Gratis, sin anuncios y sin subir nada.',
    lede: 'Guarda cada página como una imagen JPG o PNG.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <div class="options">
        <fieldset>
          <legend>¿Qué quieres?</legend>
          ${chips('what', [
            { value: 'pages', label: 'Cada página como imagen', checked: true },
            { value: 'images', label: 'Sacar las imágenes que trae' },
          ])}
        </fieldset>
        <fieldset>
          <legend>Formato</legend>
          ${chips('format', [
            { value: 'jpg', label: 'JPG', checked: true },
            { value: 'png', label: 'PNG' },
          ])}
          <span class="field-help">JPG pesa menos. PNG se ve más nítido con texto y dibujos.</span>
        </fieldset>
        <fieldset data-dpi>
          <legend>Calidad</legend>
          ${chips('dpi', [
            { value: '150', label: 'Normal (150 ppp)', checked: true },
            { value: '300', label: 'Alta (300 ppp)' },
          ])}
          <span class="field-help">La calidad alta sirve para imprimir, pero las imágenes pesan más.</span>
        </fieldset>
        <fieldset>
          <legend>Páginas</legend>
          ${chips('which', [
            { value: 'all', label: 'Todas', checked: true },
            { value: 'some', label: 'Solo algunas' },
          ])}
          <div class="subfield" data-some hidden>
            <label class="field-label" for="ranges">¿Cuáles?</label>
            <input type="text" id="ranges" autocomplete="off" spellcheck="false" placeholder="1-3, 5, 8-">
            <span class="field-help">Por ejemplo: 1-3, 5, 8-</span>
          </div>
        </fieldset>
      </div>
      ${runButton('Convertir a JPG')}`,
  },
  {
    slug: 'numeros-de-pagina',
    group: 'editar',
    name: 'Números de página',
    desc: 'Numera las páginas en la esquina que prefieras.',
    title: 'Poner números de página a un PDF gratis',
    metaDesc: 'Agrega números de página a un PDF desde tu navegador. Elige posición, formato y tamaño. Gratis y sin anuncios.',
    lede: 'Agrega números a las páginas y elige dónde y cómo se ven.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <div class="edit-layout">
        <div class="options">
          <fieldset>
            <legend>Posición</legend>
            ${posGrid('bc')}
          </fieldset>
          <fieldset>
            <legend>Modo</legend>
            ${chips('mode', [
              { value: 'unica', label: 'Página única', checked: true },
              { value: 'doble', label: 'Doble cara' },
            ])}
            <span class="field-help">En doble cara, las páginas pares llevan el número del lado contrario, como en un libro.</span>
          </fieldset>
          <div>
            <label class="field-label" for="format">Texto</label>
            <select id="format">
              <option value="n">1</option>
              <option value="pagina">Página 1</option>
              <option value="pagina-de">Página 1 de 10</option>
              <option value="n-de">1 / 10</option>
              <option value="custom">Personalizado</option>
            </select>
            <div class="subfield" data-custom hidden>
              <label class="field-label" for="custom">Tu texto</label>
              <input type="text" id="custom" value="Hoja {n} de {p}" maxlength="80" autocomplete="off">
              <span class="field-help">Escribe {n} donde va el número y {p} donde va el total.</span>
            </div>
          </div>
          <div class="row">
            <div>
              <label class="field-label" for="from">Desde la página</label>
              <input type="number" id="from" min="1" step="1" value="1" inputmode="numeric">
            </div>
            <div>
              <label class="field-label" for="to">Hasta la página</label>
              <input type="number" id="to" min="1" step="1" inputmode="numeric">
            </div>
            <div>
              <label class="field-label" for="start">Primer número</label>
              <input type="number" id="start" min="0" step="1" value="1" inputmode="numeric">
            </div>
          </div>
          <span class="field-help">Para no numerar la portada, empieza desde la página 2.</span>
          <div class="row">
            <div>
              <label class="field-label" for="size">Tamaño de letra</label>
              <input type="number" id="size" min="6" max="72" step="1" value="11" inputmode="numeric">
            </div>
            <div>
              <label class="field-label" for="margin">Distancia al borde (mm)</label>
              <input type="number" id="margin" min="0" max="100" step="1" value="10" inputmode="numeric">
            </div>
            <div>
              <label class="field-label" for="color">Color</label>
              <input type="color" id="color" value="#1a1a1a">
            </div>
          </div>${fontRow('')}
        </div>
        ${preview('Vista previa')}
      </div>
      ${runButton('Agregar números')}`,
  },
  {
    slug: 'marca-de-agua',
    group: 'editar',
    name: 'Marca de agua',
    desc: 'Pon un texto o un logo encima de cada página.',
    title: 'Poner marca de agua a un PDF gratis',
    metaDesc: 'Agrega una marca de agua de texto o imagen a un PDF desde tu navegador. Gratis, sin anuncios y sin subir nada.',
    lede: 'Pon un texto o una imagen sobre todas las páginas.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <div class="edit-layout">
        <div class="options">
          <fieldset>
            <legend>Tipo de marca</legend>
            ${chips('kind', [
              { value: 'text', label: 'Texto', checked: true },
              { value: 'image', label: 'Imagen' },
            ])}
          </fieldset>
          <div class="subfield" data-kind="text">
            <label class="field-label" for="wm-text">Texto</label>
            <input type="text" id="wm-text" value="Confidencial" maxlength="120" autocomplete="off">
            <div class="row">
              <div>
                <label class="field-label" for="wm-size">Tamaño de letra</label>
                <input type="number" id="wm-size" min="8" max="300" step="1" value="60" inputmode="numeric">
              </div>
              <div>
                <label class="field-label" for="wm-color">Color</label>
                <input type="color" id="wm-color" value="#c0392b">
              </div>
            </div>${fontRow('wm-', { bold: true })}
          </div>
          <div class="subfield" data-kind="image" hidden>
            <span class="field-label">Imagen</span>
            <div class="image-pick">
              <button type="button" class="btn btn-quiet btn-small" data-wm-pick>Elegir imagen PNG o JPG</button>
              <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" hidden data-wm-input>
              <span class="field-help" data-wm-name>Ninguna imagen elegida.</span>
            </div>
            <label class="field-label" for="wm-scale">Ancho: <output for="wm-scale" data-out="wm-scale">40</output> % de la página</label>
            <input type="range" id="wm-scale" min="5" max="100" step="1" value="40">
          </div>
          <fieldset>
            <legend>Ubicación</legend>
            ${chips('layout', [
              { value: 'single', label: 'Una vez', checked: true },
              { value: 'tile', label: 'Repetida en mosaico' },
            ])}
            <div class="subfield" data-layout="single">
              ${posGrid('mc')}
            </div>
          </fieldset>
          <fieldset>
            <legend>Inclinación</legend>
            ${chips('angle', [
              { value: '0', label: 'Recta' },
              { value: '45', label: 'Diagonal', checked: true },
              { value: '90', label: 'Vertical' },
            ])}
          </fieldset>
          <div>
            <label class="field-label" for="wm-opacity">Opacidad: <output for="wm-opacity" data-out="wm-opacity">30</output> %</label>
            <input type="range" id="wm-opacity" min="5" max="100" step="5" value="30">
          </div>
          <fieldset>
            <legend>Capa</legend>
            ${chips('layer', [
              { value: 'above', label: 'Encima del contenido', checked: true },
              { value: 'below', label: 'Debajo del contenido' },
            ])}
            <span class="field-help">Debajo no se ve sobre fotos ni páginas escaneadas, porque las tapan.</span>
          </fieldset>
          <div class="row">
            <div>
              <label class="field-label" for="wm-from">Desde la página</label>
              <input type="number" id="wm-from" min="1" step="1" value="1" inputmode="numeric">
            </div>
            <div>
              <label class="field-label" for="wm-to">Hasta la página</label>
              <input type="number" id="wm-to" min="1" step="1" inputmode="numeric">
            </div>
          </div>
        </div>
        ${preview('Vista previa')}
      </div>
      ${runButton('Agregar marca de agua')}`,
  },
  {
    slug: 'recortar',
    group: 'editar',
    name: 'Recortar PDF',
    desc: 'Quita los márgenes que sobran de las páginas.',
    title: 'Recortar márgenes de un PDF gratis',
    metaDesc: 'Recorta los márgenes de las páginas de un PDF desde tu navegador. Gratis, sin anuncios y sin subir tus archivos.',
    lede: 'Quita los bordes que sobran. Mira el resultado antes de guardar.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <div class="edit-layout">
        <div class="options">
          <fieldset>
            <legend>Cuánto quitar de cada lado (mm)</legend>
            <div class="margin-grid">
              ${[
                ['top', 'Arriba'],
                ['bottom', 'Abajo'],
                ['left', 'Izquierda'],
                ['right', 'Derecha'],
              ]
                .map(
                  ([id, label]) =>
                    `<div><label class="field-label" for="crop-${id}">${label}</label><input type="number" id="crop-${id}" min="0" step="1" value="0" inputmode="decimal" data-side="${id}"></div>`
                )
                .join('')}
            </div>
          </fieldset>
          <div>
            <button type="button" class="btn btn-quiet btn-small" data-auto>Quitar los bordes blancos</button>
            <span class="field-help" data-auto-help aria-live="polite">Mide los bordes en blanco de la página que estás viendo.</span>
          </div>
          <fieldset>
            <legend>Recortar</legend>
            ${chips('scope', [
              { value: 'all', label: 'Todas las páginas', checked: true },
              { value: 'current', label: 'Solo la página que estás viendo' },
            ])}
          </fieldset>
        </div>
        <figure class="live-preview">
          <div class="crop-stage">
            <div class="crop-preview" data-crop-preview>
              <div class="crop-box" data-crop-box></div>
            </div>
          </div>
          <figcaption class="page-nav">
            <button type="button" class="icon-btn" data-prev aria-label="Ver la página anterior">${icons.left}</button>
            <span data-page-label>Página 1</span>
            <button type="button" class="icon-btn" data-next aria-label="Ver la página siguiente">${icons.right}</button>
          </figcaption>
        </figure>
      </div>
      <p class="field-help note">Recortar oculta lo que queda fuera del recuadro, pero ese contenido sigue dentro del archivo. No lo uses para borrar datos privados.</p>
      ${runButton('Recortar PDF')}`,
  },
  {
    slug: 'firmar',
    group: 'firmar',
    name: 'Firmar PDF',
    desc: 'Dibuja o escribe tu firma y ponla en el documento.',
    title: 'Firmar PDF gratis',
    metaDesc: 'Firma un PDF desde tu navegador: dibuja, escribe o sube tu firma y colócala donde quieras. Gratis y sin anuncios.',
    lede: 'Crea tu firma, arrástrala a su lugar y guarda el PDF firmado.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <div class="edit-layout edit-layout-wide">
        <div class="options">
          <fieldset>
            <legend>Tu firma</legend>
            ${chips('sigkind', [
              { value: 'draw', label: 'Dibujar', checked: true },
              { value: 'type', label: 'Escribir' },
              { value: 'image', label: 'Subir imagen' },
            ])}
            <div class="subfield" data-sig="draw">
              <canvas class="sig-pad" data-pad aria-label="Zona para dibujar tu firma con el dedo o el ratón"></canvas>
              <div class="list-tools">
                <button type="button" class="btn btn-quiet btn-small" data-clear>Borrar y empezar otra vez</button>
              </div>
            </div>
            <div class="subfield" data-sig="type" hidden>
              <label class="field-label" for="sig-name">Tu nombre</label>
              <input type="text" id="sig-name" maxlength="60" autocomplete="name">
              <span class="field-label sub-label">Estilo de letra</span>
              <div class="chips">
                <label class="chip"><input type="radio" name="sigfont" value="dancing" checked><span class="font-dancing">Firma</span></label>
                <label class="chip"><input type="radio" name="sigfont" value="vibes"><span class="font-vibes">Firma</span></label>
                <label class="chip"><input type="radio" name="sigfont" value="caveat"><span class="font-caveat">Firma</span></label>
              </div>
            </div>
            <div class="subfield" data-sig="image" hidden>
              <div class="image-pick">
                <button type="button" class="btn btn-quiet btn-small" data-sig-pick>Elegir imagen PNG o JPG</button>
                <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" hidden data-sig-input>
                <span class="field-help" data-sig-name>Ninguna imagen elegida.</span>
              </div>
              ${checkbox('sig-clean', 'Quitar el fondo blanco del papel', { checked: true })}
            </div>
          </fieldset>
          <fieldset>
            <legend>Color de la tinta</legend>
            ${chips('ink', [
              { value: 'black', label: 'Negro', checked: true },
              { value: 'blue', label: 'Azul' },
            ])}
          </fieldset>
          <div>
            <label class="field-label" for="sig-size">Ancho: <output for="sig-size" data-out="sig-size">30</output> % de la página</label>
            <input type="range" id="sig-size" min="8" max="80" step="1" value="30">
          </div>
          <fieldset>
            <legend>Dónde firmar</legend>
            ${chips('scope', [
              { value: 'current', label: 'Solo en la página que estás viendo', checked: true },
              { value: 'all', label: 'En todas las páginas' },
            ])}
          </fieldset>
        </div>
        <figure class="live-preview">
          <div class="crop-stage">
            <div class="sign-stage" data-stage>
              <img class="sig-overlay" data-overlay alt="Tu firma. Arrástrala o muévela con las flechas del teclado." tabindex="0" draggable="false" hidden>
            </div>
          </div>
          ${pageNav}
        </figure>
      </div>
      <p class="field-help note">Arrastra la firma sobre la página para ponerla donde va. Es una firma visual, como firmar a mano sobre el papel; no es una firma digital con certificado.</p>
      ${runButton('Firmar PDF')}`,
  },
  {
    slug: 'censurar',
    group: 'firmar',
    name: 'Censurar PDF',
    desc: 'Tapa datos privados y bórralos de verdad.',
    title: 'Censurar PDF y tapar datos privados gratis',
    metaDesc: 'Tapa y borra de verdad datos privados de un PDF desde tu navegador. Gratis, sin anuncios y sin subir tus archivos.',
    lede: 'Dibuja recuadros sobre lo que no se debe ver. Lo que tapes se borra del archivo.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <p class="field-help hint">Arrastra sobre la página para dibujar un recuadro. Toca la × de un recuadro para quitarlo.</p>
      <figure class="live-preview redact-figure">
        <div class="crop-stage">
          <div class="redact-stage" data-stage></div>
        </div>
        ${pageNav}
      </figure>
      <div class="list-tools">
        <span class="field-help" data-boxes-count aria-live="polite"></span>
        <button type="button" class="btn btn-quiet btn-small" data-clear-page>Quitar los recuadros de esta página</button>
      </div>
      <div class="options">
        <fieldset>
          <legend>Color del recuadro</legend>
          ${chips('fill', [
            { value: 'black', label: 'Negro', checked: true },
            { value: 'white', label: 'Blanco' },
          ])}
        </fieldset>
      </div>
      <p class="field-help note">Las páginas con recuadros se guardan como imagen: lo tapado desaparece del archivo, pero el texto de esas páginas ya no se podrá seleccionar ni buscar. Las demás páginas quedan igual. También se quitan los datos del documento, como el autor y el título.</p>
      ${runButton('Censurar PDF')}`,
  },
  {
    slug: 'proteger',
    group: 'firmar',
    name: 'Proteger PDF',
    desc: 'Ponle contraseña para que nadie más lo abra.',
    title: 'Poner contraseña a un PDF gratis',
    metaDesc: 'Protege un PDF con contraseña (cifrado AES de 256 bits) desde tu navegador. Gratis, sin anuncios y sin subir nada.',
    lede: 'Ponle contraseña al PDF. Sin ella, nadie puede abrirlo.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <div class="options">
        <div>
          <label class="field-label" for="pw">Contraseña</label>
          <input type="password" id="pw" autocomplete="new-password" spellcheck="false">
          <span class="field-help" data-pw-help></span>
        </div>
        <div>
          <label class="field-label" for="pw2">Repite la contraseña</label>
          <input type="password" id="pw2" autocomplete="new-password" spellcheck="false">
        </div>
        ${checkbox('show-pw', 'Mostrar lo que escribo')}
        <fieldset>
          <legend>Qué se puede hacer con el PDF abierto</legend>
          <div class="check-list">
            ${checkbox('allow-print', 'Imprimir', { checked: true })}
            ${checkbox('allow-copy', 'Copiar el texto', { checked: true })}
            ${checkbox('allow-edit', 'Hacer cambios', { checked: true })}
          </div>
          <span class="field-help">La mayoría de programas respeta estas restricciones, pero no todos.</span>
        </fieldset>
      </div>
      ${runButton('Proteger PDF')}`,
  },
  {
    slug: 'desbloquear',
    group: 'firmar',
    name: 'Desbloquear PDF',
    desc: 'Quita la contraseña o las restricciones de un PDF.',
    title: 'Quitar contraseña a un PDF gratis',
    metaDesc: 'Quita la contraseña o las restricciones de un PDF que te pertenece, desde tu navegador. Gratis y sin anuncios.',
    lede: 'Quita la contraseña de un PDF tuyo para usarlo sin pedirla cada vez.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <p class="lock-info" data-lock-info></p>
      <div class="options" data-needs-pw hidden>
        <div>
          <label class="field-label" for="pw">Contraseña del PDF</label>
          <input type="password" id="pw" autocomplete="current-password" spellcheck="false">
        </div>
        ${checkbox('show-pw', 'Mostrar lo que escribo')}
      </div>
      <p class="field-help note">Úsalo solo con archivos que son tuyos o que tienes permiso de modificar. Si no sabes la contraseña, no la podemos adivinar.</p>
      ${runButton('Desbloquear PDF')}`,
  },
  {
    slug: 'word-a-pdf',
    group: 'a-pdf',
    server: true,
    accept: ['docx', 'doc', 'odt', 'rtf', 'txt'],
    out: 'documento.pdf',
    name: 'Word a PDF',
    desc: 'Convierte documentos de Word en PDF.',
    title: 'Convertir Word a PDF gratis',
    metaDesc: 'Convierte archivos de Word (DOCX, DOC, ODT, RTF) a PDF. Gratis, sin anuncios y sin cuenta.',
    lede: 'Convierte un documento de Word en PDF, con el mismo diseño.',
    kind: 'file',
    multiple: false,
    pickText: 'Elegir archivo de Word',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      ${runButton('Convertir a PDF')}`,
  },
  {
    slug: 'excel-a-pdf',
    group: 'a-pdf',
    server: true,
    accept: ['xlsx', 'xls', 'ods', 'csv'],
    out: 'documento.pdf',
    name: 'Excel a PDF',
    desc: 'Convierte hojas de cálculo en PDF.',
    title: 'Convertir Excel a PDF gratis',
    metaDesc: 'Convierte hojas de Excel (XLSX, XLS, ODS, CSV) a PDF. Gratis, sin anuncios y sin cuenta.',
    lede: 'Convierte una hoja de cálculo en PDF. Cada hoja del libro sale en sus propias páginas.',
    kind: 'file',
    multiple: false,
    pickText: 'Elegir archivo de Excel',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      ${runButton('Convertir a PDF')}`,
  },
  {
    slug: 'powerpoint-a-pdf',
    group: 'a-pdf',
    server: true,
    accept: ['pptx', 'ppt', 'odp'],
    out: 'documento.pdf',
    name: 'PowerPoint a PDF',
    desc: 'Convierte presentaciones en PDF.',
    title: 'Convertir PowerPoint a PDF gratis',
    metaDesc: 'Convierte presentaciones de PowerPoint (PPTX, PPT, ODP) a PDF. Gratis, sin anuncios y sin cuenta.',
    lede: 'Convierte una presentación en PDF, una diapositiva por página.',
    kind: 'file',
    multiple: false,
    pickText: 'Elegir presentación',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      ${runButton('Convertir a PDF')}`,
  },
  {
    slug: 'html-a-pdf',
    serverNote: 'Nuestro servidor abre la página o el archivo solo para convertirlo, y borra todo apenas termina. No guardamos nada.',
    group: 'a-pdf',
    server: true,
    accept: ['html', 'htm'],
    out: 'pagina.pdf',
    name: 'HTML a PDF',
    desc: 'Guarda una página web o un archivo HTML como PDF.',
    title: 'Convertir HTML o una página web a PDF gratis',
    metaDesc: 'Convierte una página web o un archivo HTML a PDF. Gratis, sin anuncios y sin cuenta.',
    lede: 'Escribe la dirección de una página o elige un archivo HTML.',
    kind: 'file',
    multiple: false,
    pickText: 'Elegir archivo HTML',
    dropHint: 'o suéltalo aquí',
    pickAfter: `<form class="url-form" data-url-form novalidate>
      <label class="field-label" for="page-url">O escribe la dirección de una página</label>
      <div class="url-row">
        <input type="url" id="page-url" inputmode="url" autocomplete="url" placeholder="https://ejemplo.com" spellcheck="false">
        <button type="submit" class="btn btn-quiet">Usar esta página</button>
      </div>
      <span class="field-help">Solo páginas públicas: las que piden iniciar sesión se verán como la pantalla de entrada.</span>
    </form>`,
    work: `
      ${summary}
      <div class="options">
        <fieldset data-field="paper">
          <legend>Tamaño de papel</legend>
          ${chips('paper', [
            { value: 'a4', label: 'A4', checked: true },
            { value: 'carta', label: 'Carta' },
          ])}
        </fieldset>
      </div>
      ${runButton('Convertir a PDF')}`,
  },
  {
    slug: 'pdf-a-word',
    group: 'desde-pdf',
    server: true,
    accept: ['pdf'],
    out: 'documento.docx',
    name: 'PDF a Word',
    desc: 'Convierte un PDF en un documento de Word editable.',
    title: 'Convertir PDF a Word gratis',
    metaDesc: 'Convierte un PDF en un documento de Word (DOCX) que puedes editar. Gratis, sin anuncios y sin cuenta.',
    lede: 'Convierte un PDF en un documento de Word que puedes editar.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <p class="field-help note">Funciona mejor con PDF que tienen texto. Si es un escaneo, pásalo antes por OCR PDF.</p>
      ${runButton('Convertir a Word')}`,
  },
  {
    slug: 'pdf-a-excel',
    group: 'desde-pdf',
    server: true,
    accept: ['pdf'],
    out: 'tablas.xlsx',
    name: 'PDF a Excel',
    desc: 'Saca las tablas de un PDF a una hoja de Excel.',
    title: 'Convertir PDF a Excel gratis',
    metaDesc: 'Saca las tablas de un PDF a una hoja de Excel (XLSX). Gratis, sin anuncios y sin cuenta.',
    lede: 'Buscamos las tablas del PDF y las pasamos a Excel, una hoja por página.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <p class="field-help note">Funciona mejor con tablas que tienen líneas o columnas bien alineadas. Si no hay tablas, copiamos el texto línea por línea.</p>
      ${runButton('Convertir a Excel')}`,
  },
  {
    slug: 'pdf-a-powerpoint',
    group: 'desde-pdf',
    server: true,
    accept: ['pdf'],
    out: 'presentacion.pptx',
    name: 'PDF a PowerPoint',
    desc: 'Convierte cada página en una diapositiva.',
    title: 'Convertir PDF a PowerPoint gratis',
    metaDesc: 'Convierte un PDF en una presentación de PowerPoint (PPTX). Gratis, sin anuncios y sin cuenta.',
    lede: 'Cada página del PDF se vuelve una diapositiva.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <p class="field-help note">Cada página queda como imagen en su diapositiva, así se ve igual que el PDF. El texto va en las notas del orador.</p>
      ${runButton('Convertir a PowerPoint')}`,
  },
  {
    slug: 'pdf-a-pdfa',
    group: 'desde-pdf',
    server: true,
    accept: ['pdf'],
    out: 'documento-pdfa.pdf',
    name: 'PDF a PDF/A',
    desc: 'Convierte un PDF al formato para archivar documentos.',
    title: 'Convertir PDF a PDF/A gratis',
    metaDesc: 'Convierte un PDF a PDF/A, el formato para guardar documentos por muchos años. Gratis y sin anuncios.',
    lede: 'PDF/A es el formato que piden muchas instituciones para guardar documentos a largo plazo.',
    kind: 'pdf',
    multiple: false,
    pickText: 'Elegir PDF',
    dropHint: 'o suéltalo aquí',
    work: `
      ${summary}
      <div class="options">
        <fieldset data-field="pdfa">
          <legend>Versión</legend>
          ${chips('pdfa', [
            { value: 'PDF/A-1b', label: 'PDF/A-1b' },
            { value: 'PDF/A-2b', label: 'PDF/A-2b', checked: true },
            { value: 'PDF/A-3b', label: 'PDF/A-3b' },
          ])}
          <span class="field-help">Si no te piden una versión en especial, deja PDF/A-2b.</span>
        </fieldset>
      </div>
      ${runButton('Convertir a PDF/A')}`,
  },
];

