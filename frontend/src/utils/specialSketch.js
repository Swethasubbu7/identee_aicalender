// Special Die-Cut WITHOUT AI: an honest layout sketch instead of a fake
// design. The template artwork of these layouts is one flattened picture
// with its own sample deity, which cannot be separated without AI — so it is
// never drawn as a visible layer here (no old deity, panels or borders
// showing through). The sketch shows:
//   - the approved die-cut shape (cutline) with a plain themed background,
//   - a decorative border that follows the cutline,
//   - the customer's god image, large, with soft edges, in all the space
//     that is not needed by enabled text or the calendar pad,
// and the app then prints only the text the customer entered and enabled.
// The real composition (new frame, flowers, ornaments) is made by the AI.

const DEFAULT_PALETTE = ["#4a1218", "#7a2230", "#d4a73a", "#fff4dc"];
const MARGIN_MM = 12;

const paletteOf = (palette) => (palette && palette.length >= 4 ? palette : DEFAULT_PALETTE);

/** Background, subtle pattern and a border along the cutline (ctx in mm, clipped to the cutline). */
export const drawSketchBackground = (ctx, { widthMm, heightMm, cutline, palette }) => {
  const [dark, mid, gold, light] = paletteOf(palette);
  const cx = widthMm / 2;
  const cy = heightMm * 0.4;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(widthMm, heightMm) * 0.75);
  glow.addColorStop(0, mid);
  glow.addColorStop(1, dark);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, widthMm, heightMm);

  // Quiet diamond pattern so the board does not look empty.
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = gold;
  ctx.lineWidth = 0.5;
  const step = 14;
  for (let y = -step; y < heightMm + step; y += step) {
    for (let x = ((y / step) % 2) * (step / 2) - step; x < widthMm + step; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, y - step / 2.5);
      ctx.lineTo(x + step / 2.5, y);
      ctx.lineTo(x, y + step / 2.5);
      ctx.lineTo(x - step / 2.5, y);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();

  // Border following the die-cut shape: a broad gold band and a fine inner
  // line (the stroke is centred on the cutline, so only its inner half shows).
  if (cutline) {
    const band = (color, width, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineJoin = "round";
      ctx.lineWidth = width;
      ctx.stroke(cutline);
      ctx.restore();
    };
    band(gold, 16); // 8 mm inside the shape
    band(light, 11, 0.7); // fine light line at ~5 mm
    band(gold, 10); // gold band 0–5 mm
  }
};

/**
 * Area for the god image: the board above the enabled text and the
 * calendar pad (all of it when no text is shown), inside a margin.
 * @param blockers boxes (mm) the god image must stay clear of
 */
export const sketchGodArea = ({ widthMm, heightMm }, blockers) => {
  const top = MARGIN_MM;
  const bottom = Math.min(heightMm - MARGIN_MM, ...blockers.map((b) => b.y - 3));
  return { x: MARGIN_MM, y: top, width: widthMm - 2 * MARGIN_MM, height: Math.max(20, bottom - top) };
};

/** The god image, as large as fits the area, with a halo and soft edges. */
export const drawSketchGod = (ctx, img, area, palette) => {
  const [, , gold, light] = paletteOf(palette);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.min(area.width / iw, area.height / ih);
  const w = iw * s;
  const h = ih * s;
  const x = area.x + (area.width - w) / 2;
  const y = area.y + (area.height - h) / 2;

  // Halo behind the deity.
  const r = Math.max(w, h) * 0.62;
  const halo = ctx.createRadialGradient(x + w / 2, y + h * 0.42, r * 0.1, x + w / 2, y + h * 0.42, r);
  halo.addColorStop(0, light);
  halo.addColorStop(0.55, gold);
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = halo;
  ctx.fillRect(x - r, y - r, w + 2 * r, h + 2 * r);
  ctx.restore();

  // Soft edges (no hard rectangle): the picture fades out towards its border.
  const scale = 4; // px per mm for the masked copy
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, c.width, c.height);
  // Elliptical fade matched to the picture's shape: every edge (sides, top,
  // bottom, corners) dissolves into the board — no straight photo edge.
  g.globalCompositeOperation = "destination-in";
  g.setTransform(c.width / 2, 0, 0, c.height / 2, c.width / 2, c.height / 2); // unit circle = the picture's ellipse
  const fade = g.createRadialGradient(0, 0, 0.62, 0, 0, 1);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = fade;
  g.fillRect(-1, -1, 2, 2);
  ctx.drawImage(c, x, y, w, h);
};
