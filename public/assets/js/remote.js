// Conversiones que se hacen en nuestro servidor (Word, Excel, PowerPoint, HTML, PDF/A).
// El archivo viaja cifrado por HTTPS, se convierte y el servidor lo borra al responder.

/** Tamaño máximo que acepta el servidor (MAX_UPLOAD_MB en server/.env). */
export const MAX_UPLOAD_MB = 50;

/** Dirección de la API, escrita en la página por build.mjs. */
export function apiBase() {
  return document.querySelector('meta[name="pdf-api"]')?.content?.replace(/\/$/, '') || '';
}

function fileNameFrom(header, fallback) {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* sigue con el otro formato */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : fallback;
}

/**
 * Envía el formulario a /v1/convert/{kind}.
 * onUpload(fracción 0..1) avisa cuánto se subió; onWaiting() cuando ya solo falta la respuesta.
 * Devuelve { blob, filename, note }.
 */
export function convertRemote(kind, form, { onUpload, onWaiting, fallbackName = 'resultado' } = {}) {
  const base = apiBase();
  if (!base) return Promise.reject(new Error('Esta herramienta todavía no tiene servidor configurado.'));
  if (!navigator.onLine) return Promise.reject(new Error('Necesitas conexión a internet para esta herramienta.'));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${base}/v1/convert/${kind}`);
    xhr.responseType = 'blob';
    xhr.timeout = 5 * 60 * 1000;

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onUpload?.(event.loaded / event.total);
    });
    xhr.upload.addEventListener('load', () => onWaiting?.());

    xhr.addEventListener('load', async () => {
      if (xhr.status === 200) {
        const filename = fileNameFrom(xhr.getResponseHeader('Content-Disposition'), fallbackName);
        let note = xhr.getResponseHeader('X-Result-Note') || '';
        try {
          note = decodeURIComponent(note);
        } catch {
          /* se deja como vino */
        }
        resolve({ blob: xhr.response, filename, note });
        return;
      }
      let message = '';
      try {
        message = JSON.parse(await xhr.response.text()).error || '';
      } catch {
        /* respuesta sin JSON */
      }
      if (!message) {
        if (xhr.status === 413) message = 'El archivo es demasiado grande para el servidor.';
        else if (xhr.status === 429) message = 'Hiciste muchas conversiones seguidas. Espera unos minutos.';
        else if (xhr.status >= 500) message = 'El servidor de conversiones tuvo un problema. Intenta de nuevo en un rato.';
        else message = 'No se pudo convertir el archivo.';
      }
      reject(new Error(message));
    });
    xhr.addEventListener('error', () =>
      reject(new Error('No pudimos conectar con el servidor de conversiones. Revisa tu conexión o intenta más tarde.'))
    );
    xhr.addEventListener('timeout', () => reject(new Error('El servidor tardó demasiado en responder. Prueba con un archivo más pequeño.')));
    xhr.send(form);
  });
}
