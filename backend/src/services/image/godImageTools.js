// Free, on-server God-image tools (no AI, no external service, no cost).
// Every tool returns a NEW image; the original is never changed.
//
//   removeBackground — makes a plain / near-plain background transparent:
//     the background colour is read from the picture's border and removed
//     where it connects to the border (flood fill), with a soft edge. A busy
//     photo background cannot be separated this way: the result says so and
//     the designer decides in the preview (Apply / Discard).
//   enhance — larger (Lanczos) + gentle sharpening and contrast. It makes
//     soft pictures print cleaner but cannot invent detail that is missing.
const sharp = require("sharp");

const MAX_ENHANCED_PX = 4800; // longest side after enhancement
const COLOUR_TOLERANCE = 42; // RGB distance still counted as background
const EDGE_TOLERANCE = 80; // up to here: partly transparent (soft edge)

const dist = (data, i, c) => {
  const dr = data[i] - c[0];
  const dg = data[i + 1] - c[1];
  const db = data[i + 2] - c[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

// Most common colour along the border (quantised), and its share of it.
const borderColour = (data, W, H) => {
  const counts = new Map();
  let total = 0;
  const add = (x, y) => {
    const i = (y * W + x) * 4;
    if (data[i + 3] < 16) return; // already transparent
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const e = counts.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n += 1;
    e.r += data[i];
    e.g += data[i + 1];
    e.b += data[i + 2];
    counts.set(key, e);
    total += 1;
  };
  for (let x = 0; x < W; x++) {
    add(x, 0);
    add(x, H - 1);
  }
  for (let y = 1; y < H - 1; y++) {
    add(0, y);
    add(W - 1, y);
  }
  if (!total) return null;
  let best = null;
  for (const e of counts.values()) if (!best || e.n > best.n) best = e;
  return { colour: [best.r / best.n, best.g / best.n, best.b / best.n], share: best.n / total };
};

/**
 * @returns {Promise<{ buffer, widthPx, heightPx, removedShare, plainBackground, alreadyTransparent }>}
 *   buffer — PNG with transparency (same pixel size as the original)
 */
const removeBackground = async (input) => {
  const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const bg = borderColour(data, W, H);
  if (!bg) {
    const png = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    return { buffer: png, widthPx: W, heightPx: H, removedShare: 0, plainBackground: true, alreadyTransparent: true };
  }
  const N = W * H;
  const state = new Uint8Array(N); // 0 unvisited, 1 background, 2 edge
  const queue = new Int32Array(N);
  let head = 0;
  let tail = 0;
  const seed = (p) => {
    if (state[p]) return;
    const d = dist(data, p * 4, bg.colour);
    if (d <= COLOUR_TOLERANCE) {
      state[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < W; x++) {
    seed(x);
    seed((H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    seed(y * W);
    seed(y * W + W - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % W;
    const y = (p - x) / W;
    const visit = (q) => {
      if (state[q]) return;
      const d = dist(data, q * 4, bg.colour);
      if (d <= COLOUR_TOLERANCE) {
        state[q] = 1;
        queue[tail++] = q;
      } else if (d <= EDGE_TOLERANCE) {
        state[q] = 2; // soft edge: partly transparent, not spread further
      }
    };
    if (x > 0) visit(p - 1);
    if (x < W - 1) visit(p + 1);
    if (y > 0) visit(p - W);
    if (y < H - 1) visit(p + W);
  }
  const out = Buffer.from(data);
  let removed = 0;
  for (let p = 0; p < N; p++) {
    if (state[p] === 1) {
      out[p * 4 + 3] = 0;
      removed += 1;
    } else if (state[p] === 2) {
      const d = dist(data, p * 4, bg.colour);
      const keep = (d - COLOUR_TOLERANCE) / (EDGE_TOLERANCE - COLOUR_TOLERANCE);
      out[p * 4 + 3] = Math.round(out[p * 4 + 3] * Math.max(0, Math.min(1, keep)));
    }
  }
  const png = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  return {
    buffer: png,
    widthPx: W,
    heightPx: H,
    removedShare: removed / N,
    plainBackground: bg.share >= 0.5,
    alreadyTransparent: false,
  };
};

/**
 * Enlarges towards `targetLongPx` (at most ×2 per use and MAX_ENHANCED_PX),
 * with gentle sharpening and contrast. Keeps transparency and aspect ratio.
 * @returns {Promise<{ buffer, widthPx, heightPx, contentType, scale }>}
 */
const enhance = async (input, { targetLongPx = null } = {}) => {
  const img = sharp(input).rotate();
  const meta = await img.metadata();
  const longSide = Math.max(meta.width || 0, meta.height || 0) || 1;
  const wanted = targetLongPx ? targetLongPx / longSide : 2;
  const scale = Math.max(1, Math.min(2, wanted, MAX_ENHANCED_PX / longSide));
  const width = Math.round((meta.width || 1) * scale);
  const hasAlpha = Boolean(meta.hasAlpha);
  let pipeline = img
    .resize({ width, kernel: sharp.kernel.lanczos3 })
    .modulate({ saturation: 1.04 })
    .linear(1.04, -4)
    .sharpen({ sigma: 1.1, m1: 0.6, m2: 2.2 });
  pipeline = hasAlpha ? pipeline.png() : pipeline.jpeg({ quality: 95, chromaSubsampling: "4:4:4" });
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    buffer: data,
    widthPx: info.width,
    heightPx: info.height,
    contentType: hasAlpha ? "image/png" : "image/jpeg",
    scale,
  };
};

module.exports = { removeBackground, enhance, MAX_ENHANCED_PX };
