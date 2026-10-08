// Tema claro u oscuro. Es un script normal (no módulo) y se carga en <head> para
// aplicar el tema guardado antes de que se pinte la página. Si nunca se eligió,
// se sigue el modo del sistema. Mismo interruptor que bin.jmpvlab.com.
(function () {
  var KEY = 'pdf-theme';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var COLORS = { light: '#f4f5f7', dark: '#0f1419' };

  function saved() {
    try {
      var value = localStorage.getItem(KEY);
      return value === 'dark' || value === 'light' ? value : null;
    } catch (e) {
      return null;
    }
  }

  function current() {
    return saved() || (media && media.matches ? 'dark' : 'light');
  }

  function paint(theme) {
    var button = document.getElementById('theme-toggle');
    if (button) {
      var next = theme === 'dark' ? 'claro' : 'oscuro';
      button.setAttribute('data-tema', theme);
      button.setAttribute('aria-label', 'Cambiar a modo ' + next);
      button.setAttribute('title', 'Cambiar a modo ' + next);
    }
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i += 1) {
      if (saved()) metas[i].setAttribute('content', COLORS[theme]);
    }
  }

  var initial = saved();
  if (initial) root.setAttribute('data-theme', initial);

  function ready() {
    paint(current());
    var button = document.getElementById('theme-toggle');
    if (button) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          button.classList.add('is-ready');
        });
      });
      button.addEventListener('click', function () {
        var theme = current() === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', theme);
        try {
          localStorage.setItem(KEY, theme);
        } catch (e) {
          /* sin almacenamiento: el cambio dura hasta recargar */
        }
        paint(theme);
      });
    }
    // Si sigue el sistema y el sistema cambia, el interruptor se actualiza.
    if (media && media.addEventListener) {
      media.addEventListener('change', function () {
        if (!saved()) paint(current());
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
