// Recolours the layout's own artwork for a design theme (no AI): a gradient
// map from dark → mid → accent → light palette colours, mixed with the
// original so carving, shading and detail stay visible. Transparent pixels
// stay transparent. Results are cached per image + theme.

const STRENGTH = 0.8; // share of the theme colour in the result

const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
};

// 256-entry lookup: luminance → mapped RGB (palette stops at 0, .4, .75, 1).
const buildLut = (palette) => {
  const stops = [
    [0, hexToRgb(palette[0])],
    [0.4, hexToRgb(palette[1] || palette[0])],
    [0.75, hexToRgb(palette[2] || palette[1] || palette[0])],
    [1, hexToRgb(palette[3] || "#ffffff")],
  ];
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k += 1;
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    for (let c = 0; c < 3; c += 1) lut[i * 3 + c] = c0[c] + (c1[c] - c0[c]) * f;
  }
  return lut;
};

const cache = new WeakMap(); // image/canvas → Map(themeKey → canvas)

/**
 * @param source  HTMLImageElement | canvas (the layout layer)
 * @param theme   recipe.theme ("original" = return source unchanged)
 * @param palette recipe.palette (4 hex colours: dark, mid, accent, light)
 */
export const themedLayer = (source, theme, palette) => {
  if (!source || !theme || theme === "original" || !palette?.length) return source;
  const key = `${theme}:${palette.join(",")}`;
  let perImage = cache.get(source);
  if (!perImage) {
    perImage = new Map();
    cache.set(source, perImage);
  }
  if (perImage.has(key)) return perImage.get(key);

  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  const lut = buildLut(palette);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const l = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    d[i] += (lut[l * 3] - d[i]) * STRENGTH;
    d[i + 1] += (lut[l * 3 + 1] - d[i + 1]) * STRENGTH;
    d[i + 2] += (lut[l * 3 + 2] - d[i + 2]) * STRENGTH;
  }
  ctx.putImageData(img, 0, 0);
  perImage.set(key, canvas);
  return canvas;
};

/** Relative luminance 0…1 of the canvas area under `box` (mm). */
export const areaLuminance = (ctx, box, pxPerMm) => {
  const x = Math.max(0, Math.floor(box.x * pxPerMm));
  const y = Math.max(0, Math.floor(box.y * pxPerMm));
  const w = Math.max(1, Math.min(ctx.canvas.width - x, Math.round(box.width * pxPerMm)));
  const h = Math.max(1, Math.min(ctx.canvas.height - y, Math.round(box.height * pxPerMm)));
  const step = Math.max(1, Math.floor((w * h) / 4000));
  const data = ctx.getImageData(x, y, w, h).data;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    sum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    n += 1;
  }
  return n ? sum / n : 1;
};

/** Average colour (hex) of a thin band of the canvas, for bridging removed areas. */
export const bandColour = (ctx, box, pxPerMm) => {
  const x = Math.max(0, Math.floor(box.x * pxPerMm));
  const y = Math.max(0, Math.min(ctx.canvas.height - 1, Math.floor(box.y * pxPerMm)));
  const w = Math.max(1, Math.min(ctx.canvas.width - x, Math.round(box.width * pxPerMm)));
  const h = Math.max(1, Math.min(ctx.canvas.height - y, Math.round(box.height * pxPerMm)));
  const data = ctx.getImageData(x, y, w, h).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n += 1;
  }
  if (!n) return null;
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
};
