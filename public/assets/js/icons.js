// Íconos del sitio: Tabler Icons (MIT, tabler.io/icons; licencia en assets/icons/LICENSE-tabler-icons.txt),
// en línea y con trazo currentColor para que sigan el color del texto en modo claro y oscuro.

const line = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;

export const icons = {
  // Logo propio: una hoja con la esquina doblada.
  logo: `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M8 3h11l7 7v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="var(--panel)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/><path d="M19 3v5a2 2 0 0 0 2 2h5z" fill="var(--brand)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/><path d="M10.5 17h11M10.5 22h7" stroke="var(--brand)" stroke-width="2.4" stroke-linecap="round"/></svg>`,

  unir: line('<path d="M8 7l4 -4l4 4"/><path d="M12 3v5.394a6.737 6.737 0 0 1 -3 5.606a6.737 6.737 0 0 0 -3 5.606v1.394"/><path d="M12 3v5.394a6.737 6.737 0 0 0 3 5.606a6.737 6.737 0 0 1 3 5.606v1.394"/>'), // arrow-merge
  dividir: line('<path d="M3 7a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M3 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M8.6 8.6l10.4 10.4"/><path d="M8.6 15.4l10.4 -10.4"/>'), // scissors
  organizar: line('<path d="M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/><path d="M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/><path d="M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/><path d="M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/>'), // layout-grid
  'eliminar-paginas': line('<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"/><path d="M10 12l4 4m0 -4l-4 4"/>'), // file-x
  'extraer-paginas': line('<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M11.5 21h-4.5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v5m-5 6h7m-3 -3l3 3l-3 3"/>'), // file-export
  rotar: line('<path d="M4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5"/>'), // rotate-clockwise
  comprimir: line('<path d="M18 10h-4v-4"/><path d="M20 4l-6 6"/><path d="M6 14h4v4"/><path d="M10 14l-6 6"/>'), // arrows-diagonal-minimize-2
  reparar: line('<path d="M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5"/>'), // tool
  ocr: line('<path d="M4 8v-2a2 2 0 0 1 2 -2h2"/><path d="M4 16v2a2 2 0 0 0 2 2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M16 20h2a2 2 0 0 0 2 -2v-2"/><path d="M12 16v-7"/><path d="M9 9h6"/>'), // text-recognition
  'jpg-a-pdf': line('<path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"/><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"/>'), // photo
  escanear: line('<path d="M5 12h14"/><path d="M3 7v-2a2 2 0 0 1 2 -2h2"/><path d="M3 17v2a2 2 0 0 0 2 2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M17 21h2a2 2 0 0 0 2 -2v-2"/>'), // scan
  'word-a-pdf': line('<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M5 15v6h1a2 2 0 0 0 2 -2v-2a2 2 0 0 0 -2 -2h-1"/><path d="M20 16.5a1.5 1.5 0 0 0 -3 0v3a1.5 1.5 0 0 0 3 0"/><path d="M12.5 15a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1 -3 0v-3a1.5 1.5 0 0 1 1.5 -1.5"/>'), // file-type-doc
  'excel-a-pdf': line('<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M4 15l4 6"/><path d="M4 21l4 -6"/><path d="M17 20.25c0 .414 .336 .75 .75 .75h1.25a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-1a1 1 0 0 1 -1 -1v-1a1 1 0 0 1 1 -1h1.25a.75 .75 0 0 1 .75 .75"/><path d="M11 15v6h3"/>'), // file-type-xls
  'powerpoint-a-pdf': line('<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6"/><path d="M11 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6"/><path d="M16.5 15h3"/><path d="M18 15v6"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/>'), // file-type-ppt
  'html-a-pdf': line('<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M2 21v-6"/><path d="M5 15v6"/><path d="M2 18h3"/><path d="M20 15v6h2"/><path d="M13 21v-6l2 3l2 -3v6"/><path d="M7.5 15h3"/><path d="M9 15v6"/>'), // file-type-html
  'pdf-a-jpg': line('<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M11 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6"/><path d="M20 15h-1a2 2 0 0 0 -2 2v2a2 2 0 0 0 2 2h1v-3"/><path d="M5 15h3v4.5a1.5 1.5 0 0 1 -3 0"/>'), // file-type-jpg
  'pdf-a-word': line('<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M5 15v6h1a2 2 0 0 0 2 -2v-2a2 2 0 0 0 -2 -2h-1"/><path d="M20 16.5a1.5 1.5 0 0 0 -3 0v3a1.5 1.5 0 0 0 3 0"/><path d="M12.5 15a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1 -3 0v-3a1.5 1.5 0 0 1 1.5 -1.5"/>'), // file-type-doc
  'pdf-a-excel': line('<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M4 15l4 6"/><path d="M4 21l4 -6"/><path d="M17 20.25c0 .414 .336 .75 .75 .75h1.25a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-1a1 1 0 0 1 -1 -1v-1a1 1 0 0 1 1 -1h1.25a.75 .75 0 0 1 .75 .75"/><path d="M11 15v6h3"/>'), // file-type-xls
  'pdf-a-powerpoint': line('<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6"/><path d="M11 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6"/><path d="M16.5 15h3"/><path d="M18 15v6"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/>'), // file-type-ppt
  'pdf-a-pdfa': line('<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 8v-3a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-5"/><path d="M3 14a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M4.5 17l-1.5 5l3 -1.5l3 1.5l-1.5 -5"/>'), // file-certificate
  'numeros-de-pagina': line('<path d="M11 6h9"/><path d="M11 12h9"/><path d="M12 18h8"/><path d="M4 16a2 2 0 1 1 4 0c0 .591 -.5 1 -1 1.5l-3 2.5h4"/><path d="M6 10v-6l-2 2"/>'), // list-numbers
  'marca-de-agua': line('<path d="M7.502 19.423c2.602 2.105 6.395 2.105 8.996 0c2.602 -2.105 3.262 -5.708 1.566 -8.546l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.376 1.376 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546"/>'), // droplet
  recortar: line('<path d="M8 5v10a1 1 0 0 0 1 1h10"/><path d="M5 8h10a1 1 0 0 1 1 1v10"/>'), // crop
  firmar: line('<path d="M3 17c3.333 -3.333 5 -6 5 -8c0 -3 -1 -3 -2 -3s-2.032 1.085 -2 3c.034 2.048 1.658 4.877 2.5 6c1.5 2 2.5 2.5 3.5 1l2 -3c.333 2.667 1.333 4 3 4c.53 0 2.639 -2 3 -2c.517 0 1.517 .667 3 2"/>'), // signature
  censurar: line('<path d="M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3"/><path d="M18 13.3l-6.3 -6.3"/>'), // eraser
  proteger: line('<path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6"/><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"/><path d="M8 11v-4a4 4 0 1 1 8 0v4"/>'), // lock
  desbloquear: line('<path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -6"/><path d="M11 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M8 11v-5a4 4 0 0 1 8 0"/>'), // lock-open
  server: line('<path d="M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-1"/><path d="M9 15l3 -3l3 3"/><path d="M12 12l0 9"/>'), // cloud-upload
  lock: line('<path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3"/><path d="M11 11a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M12 12l0 2.5"/>'), // shield-lock
  back: line('<path d="M5 12l14 0"/><path d="M5 12l6 6"/><path d="M5 12l6 -6"/>'), // arrow-left
  up: line('<path d="M12 5l0 14"/><path d="M18 11l-6 -6"/><path d="M6 11l6 -6"/>'), // arrow-up
  down: line('<path d="M12 5l0 14"/><path d="M18 13l-6 6"/><path d="M6 13l6 6"/>'), // arrow-down
  left: line('<path d="M5 12l14 0"/><path d="M5 12l6 6"/><path d="M5 12l6 -6"/>'), // arrow-left
  right: line('<path d="M5 12l14 0"/><path d="M13 18l6 -6"/><path d="M13 6l6 6"/>'), // arrow-right
  close: line('<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>'), // x
  rotateLeft: line('<path d="M19.95 11a8 8 0 1 0 -.5 4m.5 5v-5h-5"/>'), // rotate
  rotateRight: line('<path d="M4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5"/>'), // rotate-clockwise
  trash: line('<path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>'), // trash
  restore: line('<path d="M9 14l-4 -4l4 -4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/>'), // arrow-back-up
  check: line('<path d="M5 12l5 5l10 -10"/>'), // check
  plus: line('<path d="M12 5l0 14"/><path d="M5 12l14 0"/>'), // plus
  download: line('<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 11l5 5l5 -5"/><path d="M12 4l0 12"/>'), // download
  sun: line('<path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>'), // sun
  moon: line('<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008"/>'), // moon
  search: line('<path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/>'), // search
  clock: line('<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 7v5l3 3"/>'), // clock
  refresh: line('<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>'), // refresh
  upload: line('<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 9l5 -5l5 5"/><path d="M12 4l0 12"/>'), // upload
  device: line('<path d="M3 19l18 0"/><path d="M5 7a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v8a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1l0 -8"/>'), // device-laptop
  offline: line('<path d="M12 18l.01 0"/><path d="M9.172 15.172a4 4 0 0 1 5.656 0"/><path d="M6.343 12.343a7.963 7.963 0 0 1 3.864 -2.14m4.163 .155a7.965 7.965 0 0 1 3.287 2"/><path d="M3.515 9.515a12 12 0 0 1 3.544 -2.455m3.101 -.92a12 12 0 0 1 10.325 3.374"/><path d="M3 3l18 18"/>'), // wifi-off
};
