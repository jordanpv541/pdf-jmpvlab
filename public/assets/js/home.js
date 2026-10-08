// Inicio: buscador de herramientas, filtros por grupo, modo sin conexión y botón de instalar.
import { $, $$, initPage } from './app.js';

initPage();

const input = $('[data-search-input]');
const form = $('[data-finder]');
const filters = $$('[data-filter]');
const groupsEls = $$('.tool-group');
const empty = $('[data-empty]');
const count = $('[data-count]');

let group = '';

/** Sin tildes y en minúsculas, igual que el texto guardado en cada ficha. */
const plain = (text) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

function apply() {
  // Las palabras de una letra («a», «y») no filtran nada útil.
  const words = plain(input?.value || '').split(/\s+/).filter((w) => w.length > 1);
  let shown = 0;
  for (const section of groupsEls) {
    const inGroup = !group || section.dataset.group === group;
    let visible = 0;
    for (const li of $$('li', section)) {
      const text = $('.tile', li).dataset.search;
      const match = inGroup && words.every((w) => text.includes(w));
      li.hidden = !match;
      if (match) visible += 1;
    }
    section.hidden = visible === 0;
    shown += visible;
  }
  if (empty) empty.hidden = shown > 0;
  if (count) count.textContent = words.length || group ? `${shown} ${shown === 1 ? 'herramienta' : 'herramientas'}` : '';
}

input?.addEventListener('input', apply);

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  // Enter abre la herramienta si solo queda una; si no, lleva a la primera.
  const visible = $$('.tile').filter((a) => !a.closest('li').hidden);
  if (visible.length === 1) visible[0].click();
  else visible[0]?.focus();
});

for (const button of filters) {
  button.addEventListener('click', () => {
    group = button.dataset.filter;
    for (const other of filters) other.setAttribute('aria-pressed', String(other === button));
    apply();
  });
}

// La tecla «/» lleva al buscador, como en muchos sitios. Solo donde hay buscador:
// en las demás páginas «/» sigue sirviendo para buscar en la página (Firefox).
if (input) {
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    event.preventDefault();
    input.focus();
  });
}

// Si el navegador recuerda lo escrito al volver atrás, se aplica el filtro.
if (input?.value) apply();
