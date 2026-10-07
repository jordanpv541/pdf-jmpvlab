// Ayudas para herramientas que trabajan con fotos e imágenes.

export const SIZES = { a4: [595.28, 841.89], carta: [612, 792] };
const MAX_SIDE = 14400; // límite de tamaño de página en PDF

// Carta es el tamaño habitual en América (salvo algunos países) y Filipinas.
const LETTER_REGIONS = ['US', 'CA', 'MX', 'CO', 'VE', 'CL', 'PH', 'CR', 'GT', 'PA', 'DO', 'PR', 'SV', 'HN', 'NI'];

export function prefersLetter() {
  const region = (navigator.language || '').split('-')[1]?.toUpperCase();
  return LETTER_REGIONS.includes(region);
}

/**
 * Calcula el tamaño de la página y dónde va la imagen.
 * size: 'a4' | 'carta' | 'imagen'; orient: 'auto' | 'vertical' | 'horizontal'; margin en puntos.
 */
export function pageLayout(img, size, orient, margin) {
  const iw = img.width;
  const ih = img.height;
  let pw;
  let ph;
  if (size === 'imagen') {
    // 96 ppp: 1 píxel = 0,75 puntos
    let w = iw * 0.75;
    let h = ih * 0.75;
    const fit = Math.min(1, (MAX_SIDE - 2 * margin) / w, (MAX_SIDE - 2 * margin) / h);
    w *= fit;
    h *= fit;
    return { pw: w + 2 * margin, ph: h + 2 * margin, x: margin, y: margin, w, h };
  }
  [pw, ph] = SIZES[size] || SIZES.a4;
  const landscape = orient === 'horizontal' || (orient === 'auto' && iw > ih);
  if (landscape) [pw, ph] = [ph, pw];
  const availW = pw - 2 * margin;
  const availH = ph - 2 * margin;
  const scale = Math.min(availW / iw, availH / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { pw, ph, x: (pw - w) / 2, y: (ph - h) / 2, w, h };
}

/**
 * Lee una foto (respetando la orientación de la cámara), la gira en pasos de 90°
 * y la achica si es muy grande. Devuelve un lienzo.
 */
export async function photoCanvas(file, rotation = 0, maxSide = 2400) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const quarter = ((rotation / 90) % 2 + 2) % 2 === 1;
  const canvas = document.createElement('canvas');
  canvas.width = quarter ? h : w;
  canvas.height = quarter ? w : h;
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  bitmap.close?.();
  return canvas;
}

/** Pasa la imagen a escala de grises. */
export function toGray(canvas) {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Efecto de documento escaneado: quita sombras y deja el papel blanco.
 * Divide cada píxel por una versión muy borrosa de la foto (el "fondo"),
 * así las zonas con sombra se aclaran igual que las bien iluminadas.
 */
export function toDocument(canvas) {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');
  toGray(canvas);

  // Fondo: achicar mucho y volver a agrandar con suavizado es un desenfoque barato.
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(width / 24));
  small.height = Math.max(1, Math.round(height / 24));
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(canvas, 0, 0, small.width, small.height);
  // Un "cierre" sencillo: el fondo toma el valor más claro de cada vecindad,
  // para que el texto oscuro no cuente como fondo.
  const sImg = sctx.getImageData(0, 0, small.width, small.height);
  const sd = sImg.data;
  const sw = small.width;
  const sh = small.height;
  const bright = new Uint8ClampedArray(sw * sh);
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      let max = 0;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const xx = Math.min(sw - 1, Math.max(0, x + dx));
          const yy = Math.min(sh - 1, Math.max(0, y + dy));
          const v = sd[(yy * sw + xx) * 4];
          if (v > max) max = v;
        }
      }
      bright[y * sw + x] = max;
    }
  }
  for (let i = 0; i < bright.length; i += 1) {
    sd[i * 4] = bright[i];
    sd[i * 4 + 1] = bright[i];
    sd[i * 4 + 2] = bright[i];
  }
  sctx.putImageData(sImg, 0, 0);
  const bg = document.createElement('canvas');
  bg.width = width;
  bg.height = height;
  const bctx = bg.getContext('2d', { willReadFrequently: true });
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(small, 0, 0, width, height);
  const bgd = bctx.getImageData(0, 0, width, height).data;

  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const base = Math.max(40, bgd[i]);
    let v = (d[i] / base) * 255;
    // Contraste: el papel se vuelve blanco y la tinta más oscura.
    v = (v - 60) * (255 / (235 - 60));
    v = v > 250 ? 255 : v < 0 ? 0 : v;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  small.width = 0;
  bg.width = 0;
  return canvas;
}
