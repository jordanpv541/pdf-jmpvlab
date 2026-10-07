// Íconos propios del sitio (SVG en línea). Trazo con currentColor
// para que respeten el color del texto en modo claro y oscuro.

const line = (paths, size = 24) =>
  `<svg viewBox="0 0 ${size} ${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;

export const icons = {
  logo: `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M8 3h11l7 7v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="var(--sheet)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/><path d="M19 3v5a2 2 0 0 0 2 2h5z" fill="var(--manila)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/><path d="M10.5 17h11M10.5 22h7" stroke="var(--stamp)" stroke-width="2.4" stroke-linecap="round"/></svg>`,

  // Herramientas
  unir: line('<path d="M4 3.5h7.5v10H4z"/><path d="M12.5 10.5H20v10h-7.5z"/><path d="M8 13.5v3.5h4.5"/><path d="M10.6 15.3 12.5 17l-1.9 1.7"/>'),
  dividir: line('<path d="M6 3h9l3 3v15H6z"/><path d="M3 12h2.5M8 12h2M12.5 12h2M17 12h4" stroke-dasharray="0"/><path d="M9 7h4M9 16.5h6"/>'),
  organizar: line('<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/>'),
  'jpg-a-pdf': line('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.6"/><path d="m4 18 5.5-5.5 3.5 3.5 2.5-2.5L20 18"/>'),
  'pdf-a-jpg': line('<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v3h3"/><circle cx="10" cy="10.5" r="1.3"/><path d="m7.5 18 3.5-3.5 2 2 1.5-1.5 2 2"/>'),
  'numeros-de-pagina': line('<path d="M6 3h12v18H6z"/><path d="M9 7h6M9 10.5h6"/><path d="M11.4 15.4 12.6 14.5V19"/>'),
  'marca-de-agua': line('<path d="M6 3h12v18H6z"/><path d="m7.5 17.5 9-11" stroke-dasharray="2.2 2.2"/>'),
  recortar: line('<path d="M6.5 2.5v14a1 1 0 0 0 1 1h14"/><path d="M2.5 6.5h14a1 1 0 0 1 1 1v14"/>'),
  escanear: line('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 7.5h8v9H8z"/><path d="M3 12h18"/>'),
  comprimir: line('<path d="M6 3h12v18H6z"/><path d="M12 6v4M9.5 8 12 10.5 14.5 8"/><path d="M12 18v-4M9.5 16l2.5-2.5 2.5 2.5"/>'),
  reparar: line('<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.6-.4-.4-2.6z"/>'),
  proteger: line('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2.5"/>'),
  desbloquear: line('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7"/><path d="M12 14.5v2.5"/>'),
  ocr: line('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8.5 15.5 11 8.5h1l2.5 7M9.4 13h4.2"/>'),
  'word-a-pdf': line('<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v3h3"/><path d="m8.5 10 1.3 5 1.4-4 1.4 4 1.3-5"/>'),
  'excel-a-pdf': line('<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v3h3"/><path d="M8.5 10h7v6.5h-7zM8.5 13.25h7M12 10v6.5"/>'),
  'powerpoint-a-pdf': line('<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M12 16.5V20M8.5 20h7"/><path d="M8 8h4.5a2 2 0 0 1 0 4H8z"/>'),
  'html-a-pdf': line('<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v3h3"/><path d="m10 10.5-2 2 2 2M14 10.5l2 2-2 2"/>'),
  'pdf-a-word': line('<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v3h3"/><path d="M9 9.5h6M9 12.5h6M9 15.5h4"/>'),
  'pdf-a-excel': line('<path d="M3.5 5.5h17v13h-17z"/><path d="M3.5 9.8h17M3.5 14.2h17M9.2 5.5v13M14.8 5.5v13"/>'),
  'pdf-a-powerpoint': line('<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M12 16.5V20M8.5 20h7"/><path d="m10 8 4 2.5-4 2.5z"/>'),
  'pdf-a-pdfa': line('<path d="M4 7h16v13H4z"/><path d="M3 4h18v3H3z"/><path d="M10 11h4"/>'),
  'eliminar-paginas': line('<path d="M6 3h12v18H6z"/><path d="m9.5 9.5 5 5M14.5 9.5l-5 5"/>'),
  'extraer-paginas': line('<path d="M13 21H5V3h9l3 3v5"/><path d="M14 3v3h3"/><path d="M13 17h8"/><path d="m18 14 3 3-3 3"/>'),
  rotar: line('<rect x="6.5" y="8.5" width="11" height="12.5" rx="1"/><path d="M4.5 6.5a8.5 8.5 0 0 1 13-3.2"/><path d="M18 1.5v3h-3"/>'),
  firmar: line('<path d="M3 17.5c2.5-3.5 4.5 1.5 6.5-1.5S12 11 14 14"/><path d="m14.5 9.5 5.5-5.5 2 2-5.5 5.5-2.8.8z"/><path d="M3 21h18"/>'),
  censurar: line('<path d="M6 3h12v18H6z"/><path d="M9 7h6M9 17.5h3.5"/><rect x="8.5" y="10.5" width="7" height="3.5" fill="currentColor"/>'),

  // Interfaz
  server: line('<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5"/><path d="M12 12v8"/><path d="m9 15 3-3 3 3"/>'),
  lock: line('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  back: line('<path d="m14.5 6-6 6 6 6"/>'),
  up: line('<path d="m6 14.5 6-6 6 6"/>'),
  down: line('<path d="m6 9.5 6 6 6-6"/>'),
  left: line('<path d="m14.5 6-6 6 6 6"/>'),
  right: line('<path d="m9.5 6 6 6-6 6"/>'),
  close: line('<path d="M6 6l12 12M18 6 6 18"/>'),
  rotateLeft: line('<path d="M4.5 9.5A8 8 0 1 1 6 16"/><path d="M4 4.5v5h5"/>'),
  rotateRight: line('<path d="M19.5 9.5A8 8 0 1 0 18 16"/><path d="M20 4.5v5h-5"/>'),
  trash: line('<path d="M4.5 7h15"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 13h9l1-13"/>'),
  restore: line('<path d="M9 14 4.5 9.5 9 5"/><path d="M5 9.5h9.5a5 5 0 0 1 0 10H11"/>'),
  check: line('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 24),
  plus: line('<path d="M12 5v14M5 12h14"/>'),
  download: line('<path d="M12 4v11"/><path d="m7 10.5 5 5 5-5"/><path d="M5 20h14"/>'),
};
