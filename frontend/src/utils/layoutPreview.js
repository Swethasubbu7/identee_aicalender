// Live preview of a production layout with designer content.
//
// Fixed (from the layout, never changed here): trim size, cutline, frame,
// cake mount, calendar area, region boxes. Designer content is only drawn
// inside its region. All drawing happens in millimetres (ctx scaled by
// pxPerMm), the same units as the stored geometry.

import { themedLayer, areaLuminance, bandColour } from "./themeEffects";
import { compositionMode } from "./composition";
import { drawBoxStyle } from "./sideBoxStyles";
import { iconForProducts } from "./productIcons";
import { sectionAreas, sectionOf } from "./sectionAreas";
import { drawSketchBackground, drawSketchGod, sketchGodArea } from "./specialSketch";
import { fontPairForStyle, requestGoogleFont } from "./fontSets";
import { textScaleFor } from "./textSizes";

export const MM_PER_PT = 25.4 / 72;

// "Cambria-Bold" → { family: "Cambria", weight: 700 }; "CenturyGothic-Bold"
// → "Century Gothic"; "Cinzel-Black" → weight 900.
// "ArialRoundedMTBold" (no hyphen) → "Arial Rounded", 700.
// Fonts the browser may not have get a close free substitute (fallback,
// from Google Fonts) instead of falling back to Times.
const STYLE_WORDS = /(SemiBold|DemiBold|ExtraBold|Bold|Black|Heavy|Light|Regular|Italic|Oblique)+$/;
const SUBSTITUTES = [
  [/rounded/i, "Nunito", "sans-serif"],
  [/century gothic|futura|avant|gotham|geometric/i, "Josefin Sans", "sans-serif"],
  [/times|cambria|georgia|garamond|book antiqua|palatino|baskerville|minion|bodoni|serif/i, "Lora", "serif"],
  [/impact|bebas|anton|haettenschweiler/i, "Anton", "sans-serif"],
  [/script|brush|hand|calligraph/i, "Dancing Script", "cursive"],
];
export const cssFontFromPdf = (pdfName) => {
  if (!pdfName) return { family: "Lora", weight: 400, style: "normal", generic: "serif" };
  let [base, suffix = ""] = pdfName.replace(/^[A-Z]{6}\+/, "").split("-");
  if (!suffix) {
    const m = STYLE_WORDS.exec(base.replace(/(PSMT|MT|PS)$/, ""));
    if (m && m.index > 0) {
      suffix = m[0];
      base = base.slice(0, m.index);
    }
  }
  const family = base
    .replace(/(PSMT|MT|PS)$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  const s = suffix.toLowerCase();
  const weight = /black|heavy/.test(s) ? 900 : /extrabold/.test(s) ? 800 : /semibold|demibold/.test(s) ? 600 : /bold/.test(s) ? 700 : /light/.test(s) ? 300 : 400;
  const style = /italic|oblique/.test(s) ? "italic" : "normal";
  const sub = SUBSTITUTES.find(([re]) => re.test(family));
  return { family, weight, style, fallback: sub ? sub[1] : "Poppins", generic: sub ? sub[2] : "sans-serif" };
};

const fontString = (font, sizeMm) =>
  `${font.style} ${font.weight} ${sizeMm}px "${font.family}"${font.fallback ? `, "${font.fallback}"` : ""}, ${font.generic || "serif"}`;

// Make sure the fonts used by the layout's text regions are loaded before drawing.
export const loadLayoutFonts = async (variant) => {
  if (!document.fonts?.load) return;
  const fonts = (variant?.regions || [])
    .map((r) => r.textStyle?.fontFamily)
    .filter(Boolean)
    .map(cssFontFromPdf);
  // The substitutes come from Google Fonts (added on demand).
  for (const f of fonts) if (f.fallback) requestGoogleFont({ family: f.fallback, weight: Math.min(f.weight, 800), style: f.style });
  await Promise.all(
    fonts.flatMap((f) => [
      document.fonts.load(fontString(f, 20)).catch(() => null),
      f.fallback ? document.fonts.load(`${f.style} ${Math.min(f.weight, 800)} 20px "${f.fallback}"`).catch(() => null) : null,
    ]),
  );
};

// JPEG has no transparency: outside the cutline must be white, not black.
export const flattenOnWhite = (canvas) => {
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
};

const imageCache = new Map();
export const loadImage = (url) => {
  if (!url) return Promise.resolve(null);
  if (!imageCache.has(url)) {
    imageCache.set(
      url,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => {
          imageCache.delete(url);
          reject(new Error(`Could not load image ${url}`));
        };
        img.src = url;
      }),
    );
  }
  return imageCache.get(url);
};

const regionPath = (region) => {
  const p = new Path2D();
  if (region.shape === "path" && region.path) {
    p.addPath(new Path2D(region.path));
  } else {
    p.rect(region.box.x, region.box.y, region.box.width, region.box.height);
  }
  return p;
};

const inset = (box, d) => ({ x: box.x + d, y: box.y + d, width: box.width - 2 * d, height: box.height - 2 * d });

// Scale the image to cover the box completely, centred (cropping overflow).
const drawCover = (ctx, img, box) => {
  const s = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  ctx.drawImage(img, box.x + (box.width - w) / 2, box.y + (box.height - h) / 2, w, h);
};

// The God image's rectangle in its area: "cover" (fills the God opening) or
// "contain" (whole picture), then the designer's size and position
// (placement = { dx, dy, scale }: offset as a share of the area, size ×).
// The picture is never stretched: its proportions stay as uploaded.
export const GOD_SCALE_MIN = 0.3;
export const GOD_SCALE_MAX = 3;
export const placedRect = (img, area, placement, fit = "cover", anchor = "centre") => {
  const iw = img?.naturalWidth || img?.width || 1;
  const ih = img?.naturalHeight || img?.height || 1;
  const base = fit === "contain" ? Math.min(area.width / iw, area.height / ih) : Math.max(area.width / iw, area.height / ih);
  const scale = Math.min(GOD_SCALE_MAX, Math.max(GOD_SCALE_MIN, Number(placement?.scale) || 1));
  const w = iw * base * scale;
  const h = ih * base * scale;
  const dx = (Number(placement?.dx) || 0) * area.width;
  const dy = (Number(placement?.dy) || 0) * area.height;
  // "top": the top of the picture (crown) starts at the top of the area.
  const y = anchor === "top" ? area.y + dy : area.y + (area.height - h) / 2 + dy;
  return { x: area.x + (area.width - w) / 2 + dx, y, width: w, height: h };
};

// Draws a picture with softly faded edges (bottom most, sides a little), so
// it merges into the artwork around it instead of looking pasted on.
// Only the part inside `area` is drawn; the fades are at the edges of what
// is visible.
const drawFeathered = (ctx, img, r, area, pxPerMm) => {
  const x0 = Math.max(r.x, area.x);
  const y0 = Math.max(r.y, area.y);
  const x1 = Math.min(r.x + r.width, area.x + area.width);
  const y1 = Math.min(r.y + r.height, area.y + area.height);
  if (x1 <= x0 || y1 <= y0) return;
  const vis = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const sx = ((vis.x - r.x) / r.width) * iw;
  const sy = ((vis.y - r.y) / r.height) * ih;
  const sw = (vis.width / r.width) * iw;
  const sh = (vis.height / r.height) * ih;
  const w = Math.max(1, Math.round(vis.width * pxPerMm));
  const h = Math.max(1, Math.round(vis.height * pxPerMm));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  g.globalCompositeOperation = "destination-in";
  const v = g.createLinearGradient(0, 0, 0, h);
  v.addColorStop(0, "rgba(0,0,0,0.85)");
  v.addColorStop(0.04, "rgba(0,0,0,1)");
  v.addColorStop(0.74, "rgba(0,0,0,1)");
  v.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  const hz = g.createLinearGradient(0, 0, w, 0);
  hz.addColorStop(0, "rgba(0,0,0,0)");
  hz.addColorStop(0.07, "rgba(0,0,0,1)");
  hz.addColorStop(0.93, "rgba(0,0,0,1)");
  hz.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = hz;
  g.fillRect(0, 0, w, h);
  ctx.drawImage(c, vis.x, vis.y, vis.width, vis.height);
};

// Text area inside a region: a container box keeps the smallest gap the
// sample text left to any of the box edges (taken from the source artwork);
// a pure text region uses its box.
const textArea = (region) => {
  const { box, textBox } = region;
  if (!textBox) return box;
  const gaps = [
    textBox.x - box.x,
    box.x + box.width - (textBox.x + textBox.width),
    textBox.y - box.y,
    box.y + box.height - (textBox.y + textBox.height),
  ];
  const margin = Math.max(0, Math.min(...gaps));
  return margin > 0 ? inset(box, margin) : box;
};

/**
 * Draws `text` into the region using the layout's own text style, shrinking
 * the font only if the text does not fit. Returns { fittedPt, layoutPt }.
 */
// Relative luminance of "#rrggbb" (0 = black, 1 = white).
const hexLuminance = (hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const drawRegionText = (ctx, region, text, { alpha = 1, font: fontOverride = null, color = null, wrap = false, outline = false, scale = 1, fill = false, twoLines = false, forceTwoLines = false, targetMm = null } = {}) => {
  const style = region.textStyle || {};
  const baseFont = fontOverride ? { style: "normal", ...fontOverride } : cssFontFromPdf(style.fontFamily);
  // Layout setting: a heavier weight for this text area (e.g. 700 = bold).
  const font = Number(style.fontWeight) > 0 ? { ...baseFont, weight: Number(style.fontWeight) } : baseFont;
  const hs = style.horizontalScale || 1;
  // Lettering drawn as shapes fills its area edge to edge; new text gets a
  // little breathing room so it never touches the band / box edges.
  const full = textArea(region);
  const area = region.textBox ? full : { x: full.x + full.width * 0.04, y: full.y + full.height * 0.08, width: full.width * 0.92, height: full.height * 0.84 };
  const sourceLines = String(text)
    .split("\n")
    .map((l) => (style.textCase === "upper" ? l.toUpperCase() : l).trimEnd())
    .filter((l, i, all) => l.length > 0 || i < all.length - 1);
  if (sourceLines.length === 0) return null;
  // Box text may wrap long lines at spaces (never inside a word) so it can
  // stay large; the words themselves are never changed.
  const wrapLines = (maxWidth) => {
    if (!wrap) return sourceLines;
    const out = [];
    for (const line of sourceLines) {
      let current = "";
      for (const word of line.split(/\s+/).filter(Boolean)) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && ctx.measureText(candidate).width * hs > maxWidth) {
          out.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      out.push(current);
    }
    return out;
  };
  let lines = sourceLines;

  // Text converted to curves has no size in the file: size it to its area.
  const layoutPt = style.maxPt || style.minPt || area.height / MM_PER_PT;
  // The designer's size % (Customise → Text style) scales the automatic size;
  // the text still never grows out of its area.
  const layoutMm = layoutPt * MM_PER_PT;
  // fill: a single line may grow into free height in its area (up to 30 %
  // above the layout's own size), so names and text lines read clearly.
  // Box text (several lines) may also grow up to 30 % when it has room;
  // the fitting below shrinks it again if it does not fit.
  const startMm = !fill
    ? layoutMm
    : sourceLines.length === 1 && !wrap
      ? Math.max(layoutMm, Math.min(area.height * 0.8, layoutMm * 1.3))
      : layoutMm * 1.3;
  let sizeMm = startMm * scale;
  // Line spacing as in the sample text, if it had several lines.
  const sampleLines = new Set((region.sampleText || "").split("\n").map((l) => l.trim())).size;
  const lineRatio =
    region.textBox && sampleLines > 1 ? region.textBox.height / sampleLines / layoutMm : 1.2;

  const measure = (size) => {
    ctx.font = fontString(font, size);
    lines = wrapLines(area.width);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width)) * hs;
    return { widest, height: size * (lines.length === 1 ? 1 : lineRatio * lines.length) };
  };
  let m = measure(sizeMm);
  // targetMm (business name edited after AI generation only): exactly this
  // size, or the largest size that fits its own area — exact, not in 5 %
  // steps, so a smaller / larger choice always gives a smaller / larger name.
  const targetFit = targetMm > 0 ? measure(targetMm) : null;
  const targetK = targetFit ? Math.min(1, area.width / targetFit.widest, area.height / targetFit.height) : 1;
  if (targetFit) {
    sizeMm = targetMm * targetK;
    m = measure(sizeMm);
  }
  while (!targetFit && (m.widest > area.width || m.height > area.height) && sizeMm > 1) {
    sizeMm *= 0.95;
    m = measure(sizeMm);
  }
  // twoLines: a long single line may break into two lines INSIDE its own
  // area (never moved to another line) when that makes the text clearly
  // larger; the break is at the space that balances the two lines best.
  let ratio = lineRatio;
  if (!targetFit && twoLines && !wrap && sourceLines.length === 1) {
    const words = sourceLines[0].split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      ctx.font = fontString(font, 10);
      let best = null;
      for (let i = 1; i < words.length; i += 1) {
        const pair = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
        const w = Math.max(...pair.map((l) => ctx.measureText(l).width));
        if (!best || w < best.w) best = { w, pair };
      }
      const s2 = Math.min((area.width / (best.w * hs)) * 10, area.height / (2 * 1.15), startMm * scale);
      // forceTwoLines: the layout asks for two lines (textStyle.maxLines = 2).
      if (s2 > sizeMm * 1.15 || forceTwoLines) {
        lines = best.pair;
        sizeMm = s2;
        ratio = 1.15;
      }
    }
  }

  const align = style.align || "center";
  const lineHeight = lines.length === 1 ? sizeMm : sizeMm * ratio;
  const blockTop = area.y + (area.height - lineHeight * lines.length) / 2;
  const anchorX =
    align === "left" ? area.x : align === "right" ? area.x + area.width : area.x + area.width / 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = fontString(font, sizeMm);
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  const drawAll = (color, dx = 0, dy = 0) => {
    ctx.fillStyle = color;
    // Lettering on busy artwork (the layout's own name was outlined letter
    // shapes): a contrasting edge keeps it readable.
    const edge = outline ? (hexLuminance(color) < 0.5 ? "#ffffff" : "#2a1a0f") : null;
    lines.forEach((line, i) => {
      ctx.save();
      ctx.translate(anchorX + dx, blockTop + lineHeight * (i + 0.5) + dy);
      ctx.scale(hs, 1);
      if (edge) {
        ctx.strokeStyle = edge;
        ctx.lineJoin = "round";
        ctx.lineWidth = sizeMm * 0.1;
        ctx.strokeText(line, 0, 0);
      }
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
  };
  // A recipe colour replaces the layout colour (and its shadow, which was
  // designed for the layout colours).
  if (!color && style.shadow?.color) drawAll(style.shadow.color, style.shadow.dxMm || 0, style.shadow.dyMm || 0);
  // Letters that were shapes in the file have no reliable colour of their
  // own: a dark ink with a light edge.
  // The layout's own colour is kept (the outline edge keeps it readable);
  // dark ink only when the file gave no colour.
  const ink = color || style.color || (outline ? "#1a2a4f" : "#000000");
  drawAll(ink);
  ctx.restore();
  if (targetFit) return { fittedPt: sizeMm / MM_PER_PT, layoutPt, capped: targetK < 1 - 1e-6 };
  return { fittedPt: sizeMm / MM_PER_PT, layoutPt, capped: scale > 1 && sizeMm < startMm * scale - 1e-6 };
};

// Areas of a layer pair (full / bare, same size) where the bare layer erased
// artwork: each box grows to the erased shapes connected to it (1 px per mm
// grid, search limited to about one box size around it).
const erasedMaskCache = new WeakMap();
const erasedMask = (full, bare, widthMm, heightMm, perMm = 1) => {
  const cached = erasedMaskCache.get(bare)?.[perMm];
  if (cached && cached.full === full) return cached;
  const w = Math.max(1, Math.round(widthMm * perMm));
  const h = Math.max(1, Math.round(heightMm * perMm));
  const pixels = (img) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    return g.getImageData(0, 0, w, h).data;
  };
  const a = pixels(full);
  const b = pixels(bare);
  // Erased = the full layer painted something the bare one does not show:
  // transparent now, or a different colour (the background revealed).
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i += 1) {
    const k = i * 4;
    if (a[k + 3] < 128) continue;
    const diff = Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]);
    mask[i] = b[k + 3] < 40 || diff > 36 ? 1 : 0;
  }
  const out = { full, mask, w, h };
  erasedMaskCache.set(bare, { ...(erasedMaskCache.get(bare) || {}), [perMm]: out });
  return out;
};

const growToErased = (list, full, bare, widthMm, heightMm) => {
  if (!list.length) return list;
  let m;
  try {
    m = erasedMask(full, bare, widthMm, heightMm);
  } catch {
    return list; // unreadable layers: keep the mapped areas
  }
  const { mask, w, h } = m;
  const sx = w / widthMm;
  const sy = h / heightMm;
  return list.map((box) => {
    const x0 = Math.max(0, Math.floor((box.x - box.width) * sx));
    const y0 = Math.max(0, Math.floor((box.y - box.height) * sy));
    const x1 = Math.min(w - 1, Math.ceil((box.x + 2 * box.width) * sx));
    const y1 = Math.min(h - 1, Math.ceil((box.y + 2 * box.height) * sy));
    const seen = new Uint8Array(w * h);
    const stack = [];
    for (let y = Math.max(0, Math.floor(box.y * sy)); y <= Math.min(h - 1, Math.ceil((box.y + box.height) * sy)); y += 1) {
      for (let x = Math.max(0, Math.floor(box.x * sx)); x <= Math.min(w - 1, Math.ceil((box.x + box.width) * sx)); x += 1) {
        const i = y * w + x;
        if (mask[i] && !seen[i]) {
          seen[i] = 1;
          stack.push(i);
        }
      }
    }
    let gx0 = Infinity;
    let gy0 = Infinity;
    let gx1 = -Infinity;
    let gy1 = -Infinity;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w;
      const y = (i - x) / w;
      if (x < gx0) gx0 = x;
      if (x > gx1) gx1 = x;
      if (y < gy0) gy0 = y;
      if (y > gy1) gy1 = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
          const j = ny * w + nx;
          if (mask[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    if (gx0 === Infinity) return box;
    const gx = Math.min(box.x, gx0 / sx - 1);
    const gy = Math.min(box.y, gy0 / sy - 1);
    return {
      ...box,
      x: gx,
      y: gy,
      width: Math.max(box.x + box.width, (gx1 + 1) / sx + 1) - gx,
      height: Math.max(box.y + box.height, (gy1 + 1) / sy + 1) - gy,
    };
  });
};

// Where the layout artwork of removed sections is replaced (canvas pixels,
// opaque = removed): removed side boxes exactly (they are measured), removed
// text bands except where a side box that is still shown lies.
const buildRemovalMask = (canvas, pxPerMm, removed, shownBoxes) => {
  const m = document.createElement("canvas");
  m.width = canvas.width;
  m.height = canvas.height;
  const g = m.getContext("2d");
  g.setTransform(pxPerMm, 0, 0, pxPerMm, 0, 0);
  g.fillStyle = "#000";
  for (const b of removed.filter((r) => r.kind !== "box")) g.fillRect(b.x, b.y, b.width, b.height);
  g.globalCompositeOperation = "destination-out";
  for (const b of shownBoxes) g.fillRect(b.x, b.y, b.width, b.height);
  g.globalCompositeOperation = "source-over";
  for (const b of removed.filter((r) => r.kind === "box")) g.fillRect(b.x, b.y, b.width, b.height);
  return m;
};

// Draws what `paint` draws (mm coordinates) only inside / outside the mask.
const drawMasked = (ctx, mask, where, paint) => {
  const c = document.createElement("canvas");
  c.width = ctx.canvas.width;
  c.height = ctx.canvas.height;
  const g = c.getContext("2d");
  const t = ctx.getTransform();
  g.setTransform(t.a, 0, 0, t.d, 0, 0);
  paint(g);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = where === "inside" ? "destination-in" : "destination-out";
  g.drawImage(mask, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(c, 0, 0);
  ctx.restore();
};

// Free preview (AI off): removing a section from the layout file usually
// reveals the layout's own background underneath (the pattern simply runs on
// — nothing to fill there). Only pixels where the bare layers are EMPTY
// (nothing behind the removed strip / box) inside a removed section are
// filled, smoothly (push-pull), from the layout's background area around
// them — never from the god picture, the frame or a section still shown —
// so no strip, box, border or edge remains. The god picture is never touched.
const FILL_PER_MM = 2;
const layerAlpha = (img, w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const a = new Uint8Array(w * h);
  for (let i = 0; i < a.length; i += 1) a[i] = d[i * 4 + 3];
  return a;
};
const fillEmptyRemoved = (ctx, { removalMask, bareLayers, protect, sources, noSource, widthMm, heightMm }) => {
  const bare = bareLayers.filter(Boolean);
  if (!removalMask || !bare.length) return false;
  const k = FILL_PER_MM;
  const w = Math.max(1, Math.round(widthMm * k));
  const h = Math.max(1, Math.round(heightMm * k));
  let alphas;
  let removal;
  try {
    alphas = bare.map((img) => layerAlpha(img, w, h));
    removal = layerAlpha(removalMask, w, h);
  } catch {
    return false; // unreadable layers
  }
  const inside = (boxes, x, y) => boxes.some((b) => x >= b.x * k && x < (b.x + b.width) * k && y >= b.y * k && y < (b.y + b.height) * k);
  // Empty = removed here and no bare layer paints anything; grown by 1 px
  // so soft edges are covered.
  const empty = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) if (removal[i] > 127 && alphas.every((a) => a[i] < 128)) empty[i] = 1;
  const hole = new Uint8Array(w * h);
  let holes = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const on =
        empty[i] ||
        (x > 0 && empty[i - 1]) ||
        (x < w - 1 && empty[i + 1]) ||
        (y > 0 && empty[i - w]) ||
        (y < h - 1 && empty[i + w]);
      if (on && removal[i] > 127 && !inside(protect, x, y)) {
        hole[i] = 1;
        holes += 1;
      }
    }
  }
  if (!holes) return false;

  // The design as composed so far, on the fill grid.
  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const g = work.getContext("2d", { willReadFrequently: true });
  g.drawImage(ctx.canvas, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;

  // Push: averages of the known background pixels on coarser levels.
  const levels = [];
  let cw = w;
  let ch = h;
  let col = new Float32Array(w * h * 3);
  let wt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const x = i % w;
    const y = (i - x) / w;
    if (hole[i] || d[i * 4 + 3] < 200 || inside(protect, x, y) || inside(noSource, x, y)) continue;
    if (sources.length && !inside(sources, x, y)) continue;
    col[i * 3] = d[i * 4];
    col[i * 3 + 1] = d[i * 4 + 1];
    col[i * 3 + 2] = d[i * 4 + 2];
    wt[i] = 1;
  }
  levels.push({ cw, ch, col, wt });
  while (cw > 1 || ch > 1) {
    const nw = Math.max(1, Math.ceil(cw / 2));
    const nh = Math.max(1, Math.ceil(ch / 2));
    const ncol = new Float32Array(nw * nh * 3);
    const nwt = new Float32Array(nw * nh);
    for (let y = 0; y < ch; y += 1) {
      for (let x = 0; x < cw; x += 1) {
        const i = y * cw + x;
        if (!wt[i]) continue;
        const j = (y >> 1) * nw + (x >> 1);
        ncol[j * 3] += col[i * 3] * wt[i];
        ncol[j * 3 + 1] += col[i * 3 + 1] * wt[i];
        ncol[j * 3 + 2] += col[i * 3 + 2] * wt[i];
        nwt[j] += wt[i];
      }
    }
    for (let j = 0; j < nw * nh; j += 1) {
      if (!nwt[j]) continue;
      ncol[j * 3] /= nwt[j];
      ncol[j * 3 + 1] /= nwt[j];
      ncol[j * 3 + 2] /= nwt[j];
      nwt[j] = Math.min(1, nwt[j]);
    }
    cw = nw;
    ch = nh;
    col = ncol;
    wt = nwt;
    levels.push({ cw, ch, col, wt });
  }
  // Pull: unknown pixels take the (bilinear) colour of the coarser level.
  for (let l = levels.length - 2; l >= 0; l -= 1) {
    const fine = levels[l];
    const coarse = levels[l + 1];
    for (let y = 0; y < fine.ch; y += 1) {
      for (let x = 0; x < fine.cw; x += 1) {
        const i = y * fine.cw + x;
        if (fine.wt[i] >= 1) continue;
        const fx = Math.min(coarse.cw - 1, Math.max(0, (x - 0.5) / 2));
        const fy = Math.min(coarse.ch - 1, Math.max(0, (y - 0.5) / 2));
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const x1 = Math.min(coarse.cw - 1, x0 + 1);
        const y1 = Math.min(coarse.ch - 1, y0 + 1);
        const ax = fx - x0;
        const ay = fy - y0;
        const a = 1 - fine.wt[i];
        for (let c = 0; c < 3; c += 1) {
          const v =
            coarse.col[(y0 * coarse.cw + x0) * 3 + c] * (1 - ax) * (1 - ay) +
            coarse.col[(y0 * coarse.cw + x1) * 3 + c] * ax * (1 - ay) +
            coarse.col[(y1 * coarse.cw + x0) * 3 + c] * (1 - ax) * ay +
            coarse.col[(y1 * coarse.cw + x1) * 3 + c] * ax * ay;
          fine.col[i * 3 + c] = fine.col[i * 3 + c] * fine.wt[i] + v * a;
        }
        fine.wt[i] = 1;
      }
    }
  }
  // Only the empty pixels are written back (smoothly scaled to the canvas).
  const out = levels[0].col;
  for (let i = 0; i < w * h; i += 1) {
    if (!hole[i]) {
      d[i * 4 + 3] = 0;
      continue;
    }
    d[i * 4] = out[i * 3];
    d[i * 4 + 1] = out[i * 3 + 1];
    d[i * 4 + 2] = out[i * 3 + 2];
    d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(work, 0, 0, widthMm, heightMm);
  ctx.restore();
  return true;
};

// Free preview fill (AI off): each removed area is covered with the artwork
// beside it — the neighbouring strip (above, below, left or right) holding
// the most artwork, mirrored and tiled into the area — so no empty strip,
// box or leftover border remains. The god picture and the cake are never
// copied or covered: areas are trimmed away from them, and a strip that
// crosses them is sampled from its clear part only (stretched to fit).
// Smaller areas are filled first so they can feed the larger ones.
// Reads the canvas as composed so far (mm coordinates, pxPerMm scale).
const fillFromNeighbours = (ctx, areas, avoid, pxPerMm, widthMm, heightMm) => {
  if (!areas.length) return;
  const canvas = ctx.canvas;
  const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const clampBox = (b) => {
    const x = Math.max(0, b.x);
    const y = Math.max(0, b.y);
    return { ...b, x, y, width: Math.min(widthMm, b.x + b.width) - x, height: Math.min(heightMm, b.y + b.height) - y };
  };
  // Cut the area back from a god / cake region that covers most of one side.
  const trim = (b) => {
    let r = clampBox(b);
    for (const a of avoid) {
      if (!overlaps(r, a)) continue;
      const ox = Math.min(r.x + r.width, a.x + a.width) - Math.max(r.x, a.x);
      const oy = Math.min(r.y + r.height, a.y + a.height) - Math.max(r.y, a.y);
      if (ox >= r.width * 0.4) {
        if (a.y + a.height / 2 < r.y + r.height / 2) r = { ...r, height: r.y + r.height - (a.y + a.height), y: a.y + a.height };
        else r = { ...r, height: a.y - r.y };
      } else if (oy >= r.height * 0.4) {
        if (a.x + a.width / 2 < r.x + r.width / 2) r = { ...r, width: r.x + r.width - (a.x + a.width), x: a.x + a.width };
        else r = { ...r, width: a.x - r.x };
      }
    }
    return r;
  };
  // Longest clear run of [from, to) once the given intervals are removed.
  const clearRun = (from, to, cuts) => {
    let best = null;
    let start = from;
    for (const [c0, c1] of [...cuts].sort((p, q) => p[0] - q[0])) {
      if (c0 > start && (!best || c0 - start > best[1] - best[0])) best = [start, Math.min(c0, to)];
      start = Math.max(start, c1);
    }
    if (to > start && (!best || to - start > best[1] - best[0])) best = [start, to];
    return best && best[1] - best[0] > 0 ? best : null;
  };
  const score = (r) => {
    const x = Math.round(r.x * pxPerMm);
    const y = Math.round(r.y * pxPerMm);
    const w = Math.round(r.width * pxPerMm);
    const h = Math.round(r.height * pxPerMm);
    if (w < 2 || h < 2 || x < 0 || y < 0 || x + w > canvas.width || y + h > canvas.height) return -1;
    const d = ctx.getImageData(x, y, w, h).data;
    const step = Math.max(4, Math.floor(d.length / 4 / 4000) * 4);
    let art = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += step) {
      n += 1;
      if (d[i + 3] > 200 && !(d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235)) art += 1;
    }
    return n ? art / n : -1;
  };
  const targets = areas.map(trim).filter((b) => b.width >= 2 && b.height >= 2);
  const filled = new Set();
  for (const b of [...targets].sort((p, q) => p.width * p.height - q.width * q.height)) {
    // Removed areas not filled yet stop a strip (board edges too).
    const blockers = targets.filter((o) => o !== b && !filled.has(o));
    const spanX = (o) => o.x < b.x + b.width && b.x < o.x + o.width;
    const spanY = (o) => o.y < b.y + b.height && b.y < o.y + o.height;
    const free = {
      above: Math.min(b.y, ...blockers.filter((o) => spanX(o) && o.y + o.height <= b.y + 0.5).map((o) => b.y - (o.y + o.height))),
      below: Math.min(heightMm - b.y - b.height, ...blockers.filter((o) => spanX(o) && o.y >= b.y + b.height - 0.5).map((o) => o.y - b.y - b.height)),
      left: Math.min(b.x, ...blockers.filter((o) => spanY(o) && o.x + o.width <= b.x + 0.5).map((o) => b.x - (o.x + o.width))),
      right: Math.min(widthMm - b.x - b.width, ...blockers.filter((o) => spanY(o) && o.x >= b.x + b.width - 0.5).map((o) => o.x - b.x - b.width)),
    };
    const d = (side) => Math.min(40, free[side] - 1);
    const candidates = [
      { side: "above", r: { x: b.x, y: b.y - d("above") - 0.5, width: b.width, height: d("above") } },
      { side: "below", r: { x: b.x, y: b.y + b.height + 0.5, width: b.width, height: d("below") } },
      { side: "left", r: { x: b.x - d("left") - 0.5, y: b.y, width: d("left"), height: b.height } },
      { side: "right", r: { x: b.x + b.width + 0.5, y: b.y, width: d("right"), height: b.height } },
    ]
      .filter((c) => c.r.width >= 3 && c.r.height >= 3 && !blockers.some((o) => overlaps(c.r, o)))
      .map((c) => {
        // Sample only the part of the strip clear of the god and the cake.
        const vertical = c.side === "above" || c.side === "below";
        const hits = avoid.filter((a) => overlaps(c.r, a));
        const run = vertical
          ? clearRun(c.r.x, c.r.x + c.r.width, hits.map((a) => [a.x, a.x + a.width]))
          : clearRun(c.r.y, c.r.y + c.r.height, hits.map((a) => [a.y, a.y + a.height]));
        if (!run) return null;
        const src = vertical ? { ...c.r, x: run[0], width: run[1] - run[0] } : { ...c.r, y: run[0], height: run[1] - run[0] };
        const along = vertical ? src.width / c.r.width : src.height / c.r.height;
        return along >= 0.2 ? { ...c, src } : null;
      })
      .filter(Boolean)
      .map((c) => ({ ...c, s: score(c.src) }))
      .filter((c) => c.s > 0.5)
      // Most artwork first; among similar ones the largest sample.
      .sort((p, q) => Math.round((q.s - p.s) * 10) || q.src.width * q.src.height - p.src.width * p.src.height);
    const best = candidates[0];
    if (!best) continue;
    const snap = document.createElement("canvas");
    snap.width = Math.max(1, Math.round(best.src.width * pxPerMm));
    snap.height = Math.max(1, Math.round(best.src.height * pxPerMm));
    snap.getContext("2d").drawImage(canvas, Math.round(best.src.x * pxPerMm), Math.round(best.src.y * pxPerMm), snap.width, snap.height, 0, 0, snap.width, snap.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.width, b.height);
    ctx.clip();
    const vertical = best.side === "above" || best.side === "below";
    const len = vertical ? best.src.height : best.src.width;
    const total = vertical ? b.height : b.width;
    for (let k = 0, off = 0; off < total; k += 1, off += len) {
      // Mirror first (seamless at the shared edge), then alternate.
      const mirrored = k % 2 === 0;
      ctx.save();
      if (vertical) {
        const fromTop = best.side === "above";
        const y0 = fromTop ? b.y + off : b.y + b.height - off - len;
        ctx.translate(b.x, mirrored ? y0 + len : y0);
        ctx.scale(1, mirrored ? -1 : 1);
        ctx.drawImage(snap, 0, 0, b.width, len);
      } else {
        const fromLeft = best.side === "left";
        const x0 = fromLeft ? b.x + off : b.x + b.width - off - len;
        ctx.translate(mirrored ? x0 + len : x0, b.y);
        ctx.scale(mirrored ? -1 : 1, 1);
        ctx.drawImage(snap, 0, 0, len, b.height);
      }
      ctx.restore();
    }
    ctx.restore();
    filled.add(b);
  }
};

// Locked artwork that an AI background must never cover.
const PROTECTED_FROM_BACKGROUND = new Set([
  "CALENDAR_AREA",
  "CAKE_MOUNT",
  "SIDE_BOX_LEFT",
  "SIDE_BOX_RIGHT",
  "NAME_BANNER",
  "KEEP_OUT",
  "DECORATION",
]);

const byRole = (variant, role) => (variant.regions || []).filter((r) => r.role === role);
const byBinding = (variant, binding) => (variant.regions || []).filter((r) => r.binding === binding);

/**
 * Renders the layout + content onto `canvas` (sized to trim × pxPerMm).
 * images: { plate, overlay, original, frame, artwork, godImage, godImageBox, filledAreas, productImage, background, backgroundBox }
 *   (HTMLImageElement | canvas | null)
 *   background — AI background, drawn ONLY inside the mapped BACKGROUND_AREA;
 *             locked areas inside it are restored from the plate afterwards
 *   original — the untouched artwork; every slot the designer has not
 *             replaced shows its original (sample god, name, list, photo)
 *   plate   — artwork without sample text / sample pictures (bottom layer)
 *   overlay — everything the artwork paints above the god picture (frame,
 *             banner, boxes…), aligned to the trim; drawn over the god image
 *   plateBare / overlayBare — the same layers with the optional sections
 *             (business-name strip, side boxes) erased; transparent there
 * originals — false: slots without designer content stay empty instead of
 *             showing the layout's sample (used for AI output / print).
 * design — how this design looks (null = the layout exactly as designed):
 *   { theme, palette, boxStyle, fonts: { heading, body } | null,
 *     sections: { showBusinessName, showLeftBox, showRightBox, rightBoxMode } }
 *   Size, cutline, cake and calendar positions never depend on it.
 * Returns { fits: { regionId: { fittedPt, layoutPt } } } for warnings.
 */
export const drawLayoutPreview = (canvas, { variant, images, content, pxPerMm, showGuides, originals = true, design = null }) => {
  const { widthMm, heightMm } = variant.trim;
  canvas.width = Math.round(widthMm * pxPerMm);
  canvas.height = Math.round(heightMm * pxPerMm);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(pxPerMm, 0, 0, pxPerMm, 0, 0);
  ctx.clearRect(0, 0, widthMm, heightMm);
  const fits = {};
  // Where the God image is (or can be) placed: { area, rect } in mm.
  let godFrame = null;

  const cutline = variant.cutline?.path ? new Path2D(variant.cutline.path) : null;
  ctx.save();
  if (cutline) ctx.clip(cutline);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, widthMm, heightMm);

  // Design recipe: recoloured layers, optional sections, side-box style.
  const theme = design?.theme || "original";
  const palette = design?.palette || [];
  const sections = {
    showBusinessName: true,
    showLeftBox: true,
    showRightBox: true,
    showTextLine1: true,
    showTextLine2: true,
    rightBoxMode: "image",
    ...(design?.sections || {}),
  };
  // A complete AI artwork has no layout boxes: shown boxes are app-drawn.
  const fullArtwork = images.fullArtwork || null;
  // AI Mode editing of a Special Die-Cut without a god area (design.sketch):
  // a plain layout sketch with the customer's God image — NO template layer
  // is drawn (its flattened artwork holds the sample deity) — see
  // specialSketch.js. Normal Mode shows the real template instead.
  const sketch = Boolean(design?.sketch) && !fullArtwork && compositionMode(variant) === "FULL_ARTWORK";
  const noTemplate = Boolean(fullArtwork || sketch);
  const boxStyle = noTemplate && (!design?.boxStyle || design.boxStyle === "layout") ? "double" : design?.boxStyle;
  const styledBoxes = Boolean(noTemplate || (boxStyle && boxStyle !== "layout"));
  // A complete artwork (AI, or a saved AI layout) or a sketch replaces the
  // template: none of its layers is ever drawn, whoever passes them in.
  const layer = (img) => (noTemplate ? null : themedLayer(img, theme, palette));
  const plate = layer(images.plate);
  const plateBare = layer(images.plateBare);
  const overlay = layer(images.overlay);
  const overlayBare = layer(images.overlayBare);
  const leftRegions = byRole(variant, "SIDE_BOX_LEFT");
  const rightRegions = byRole(variant, "SIDE_BOX_RIGHT");
  // Left box as a picture (Customise → Left side → Image) instead of text.
  const leftShowsImage = sections.showLeftBox && (design?.sections?.leftBoxMode || content.leftBoxMode) === "image";
  // Designer typography chosen before generating ("" = automatic).
  const chosenFonts = fontPairForStyle(content.fontStyle);
  const chosenColour = /^#[0-9a-f]{6}$/i.test(content.textColour || "") ? content.textColour : null;
  const sizeScale = (region) => textScaleFor(content.textSizes, region);
  // Areas edited after AI generation (content.areaEdits, AI designs only):
  // { name, left, right } → { text?, colour?, targetPt? } — the area's own
  // text, colour and exact point size (the size as generated × the chosen %).
  // Each is used ONLY for its own area: the business name, the left box text
  // or the right box text.
  const areaEdits = content.areaEdits || null;
  const areaOf = (region) =>
    region.binding === "businessName"
      ? "name"
      : ({ SIDE_BOX_LEFT: "left", SIDE_BOX_RIGHT: "right", TEXT_LINE_1: "line1", TEXT_LINE_2: "line2" })[region.role] || null;
  const editOf = (region) => (areaEdits && areaOf(region) ? areaEdits[areaOf(region)] || null : null);
  const editColour = (edit) => (/^#[0-9a-f]{6}$/i.test(edit?.colour || "") ? edit.colour : null);
  const editTargetMm = (edit) => (Number(edit?.targetPt) > 0 ? Number(edit.targetPt) * MM_PER_PT : null);
  const editText = (edit, value) => (typeof edit?.text === "string" && edit.text.trim() ? edit.text : value);
  const editFont = (edit) => (edit?.font?.family ? { style: "normal", ...edit.font } : null);
  // Areas whose layout artwork is removed: hidden sections, and side boxes
  // that get an app-drawn style instead of the layout's own box.
  const areas = sectionAreas(variant);
  // The drawn side box is often larger than its mapped region: grow each box
  // area to everything the bare layer erased around it.
  if (!noTemplate && images.plate && images.plateBare) {
    areas.left = growToErased(areas.left, images.plate, images.plateBare, widthMm, heightMm);
    areas.right = growToErased(areas.right, images.plate, images.plateBare, widthMm, heightMm);
  }
  const tag = (list, hidden, kind) => list.map((b) => ({ ...b, hidden, kind }));
  const removed = [
    ...(sections.showBusinessName ? [] : tag(areas.name, true, "band")),
    ...(!sections.showLeftBox ? tag(areas.left, true, "box") : styledBoxes ? tag(areas.left, false, "box") : []),
    ...(!sections.showRightBox ? tag(areas.right, true, "box") : styledBoxes ? tag(areas.right, false, "box") : []),
    ...(sections.showTextLine1 ? [] : tag(areas.line1, true, "band")),
    ...(sections.showTextLine2 ? [] : tag(areas.line2, true, "band")),
  ];
  // Side boxes still shown in the layout's own style: a removed text band
  // (an estimate, wider than its strip) must never cut into them.
  const shownBoxes = [
    ...(sections.showLeftBox && !styledBoxes ? areas.left : []),
    ...(sections.showRightBox && !styledBoxes ? areas.right : []),
  ];
  const removalMask = noTemplate || !removed.length ? null : buildRemovalMask(canvas, pxPerMm, removed, shownBoxes);

  // 0a. One complete AI artwork for the whole board (inside the cutline).
  if (fullArtwork) {
    const box = images.fullArtworkBox || { x: 0, y: 0, width: widthMm, height: heightMm };
    ctx.drawImage(fullArtwork, box.x, box.y, box.width, box.height);
  }

  // 0b. Layout sketch (Special, AI off): plain themed board + cutline border.
  if (sketch) drawSketchBackground(ctx, { widthMm, heightMm, cutline, palette });

  // 0. Replacement / upscaled artwork (the plate is transparent there).
  const artworkOverride = variant.assets?.artworkOverride;
  if (!noTemplate && images.artwork && artworkOverride) {
    const region = byRole(variant, artworkOverride.regionRole || "BACKGROUND_AREA")[0];
    if (region) ctx.drawImage(layer(images.artwork) || images.artwork, region.box.x, region.box.y, region.box.width, region.box.height);
  }

  // 1. Artwork plate (production artwork without sample text / pictures).
  if (plate) ctx.drawImage(plate, 0, 0, widthMm, heightMm);

  // 1a. Removed areas (free preview, AI off): continue the neighbouring
  //     artwork into the area — a mirrored copy of the strip beside it, over
  //     a blend of the colours around — so no empty strip or box is left;
  //     then the bare artwork (transparent where the section was) on top.
  //     A real AI design paints these areas as part of one complete artwork.
  if (removalMask) {
    drawMasked(ctx, removalMask, "inside", (g) => {
      for (const b of removed) {
        const above = bandColour(ctx, { x: b.x, y: Math.max(0, b.y - 3), width: b.width, height: 2 }, pxPerMm);
        const below = bandColour(ctx, { x: b.x, y: Math.min(heightMm - 2, b.y + b.height + 1), width: b.width, height: 2 }, pxPerMm);
        const grad = g.createLinearGradient(0, b.y, 0, b.y + b.height);
        grad.addColorStop(0, above || below || "#ffffff");
        grad.addColorStop(1, below || above || "#ffffff");
        g.fillStyle = grad;
        g.fillRect(b.x, b.y, b.width, b.height);
      }
      if (plateBare) g.drawImage(plateBare, 0, 0, widthMm, heightMm);
    });
  }

  // 1b. AI background, only inside the mapped background area. Locked
  //     parts of the artwork inside that area are put back from the plate,
  //     so the AI can never cover them.
  const backgroundRegions = byRole(variant, "BACKGROUND_AREA");
  if (!noTemplate && images.background && backgroundRegions.length) {
    for (const region of backgroundRegions) {
      ctx.save();
      ctx.clip(regionPath(region));
      // Special Die-Cut AI artwork was composed for an exact box (the trim);
      // other AI backgrounds cover their region.
      const box = images.backgroundBox;
      if (box) ctx.drawImage(images.background, box.x, box.y, box.width, box.height);
      else drawCover(ctx, images.background, region.box);
      ctx.restore();
    }
    if (images.plate) {
      for (const region of (variant.regions || []).filter((r) => PROTECTED_FROM_BACKGROUND.has(r.role))) {
        ctx.save();
        ctx.clip(regionPath(region));
        ctx.drawImage(images.plate, 0, 0, widthMm, heightMm);
        ctx.restore();
      }
    }
  }

  // Copies an area of the original artwork into place (unreplaced slots).
  // Never in a sketch or an AI artwork: the original holds old artwork.
  const original = originals && !noTemplate ? images.original : null;
  const fromOriginal = (box, clip) => {
    if (!original) return false;
    const sx = original.naturalWidth / widthMm;
    const sy = original.naturalHeight / heightMm;
    ctx.save();
    if (clip) ctx.clip(clip);
    ctx.drawImage(original, box.x * sx, box.y * sy, box.width * sx, box.height * sy, box.x, box.y, box.width, box.height);
    ctx.restore();
    return true;
  };
  const padded = (b, d) => ({ x: b.x - d, y: b.y - d, width: b.width + 2 * d, height: b.height + 2 * d });

  // 2a. Layout sketch: the customer's god image, large, in all the space not
  //     needed by the enabled text or the calendar pad. Nothing is drawn over
  //     it afterwards except that text. Preview only — the real composition
  //     is made by the AI, and Print Check blocks exporting a sketch.
  if (sketch && images.godImage) {
    const shownText = (variant.regions || []).filter((r) => {
      const key = sectionOf(r);
      return key && sections[key] !== false && r.role !== "SIDE_BOX_LEFT" && r.role !== "SIDE_BOX_RIGHT";
    });
    const blockers = [
      ...shownText.map((r) => r.textBox || r.box),
      ...(sections.showLeftBox ? leftRegions.map((r) => r.box) : []),
      ...(sections.showRightBox ? rightRegions.map((r) => r.box) : []),
      ...byRole(variant, "CAKE_MOUNT").map((r) => r.box),
    ];
    drawSketchGod(ctx, images.godImage, sketchGodArea({ widthMm, heightMm }, blockers), palette);
  }

  // 2. God image inside the god area (under the frame) — the designer's
  //    image, or the layout's original god picture when not replaced.
  for (const region of byRole(variant, "GOD_AREA")) {
    if (images.godImage) {
      ctx.save();
      ctx.clip(regionPath(region));
      // An AI god image was composed for an exact layout box (the frame
      // reference it saw), so it is placed on that box, not cropped to fit.
      const box = images.godImageBox;
      if (box) ctx.drawImage(images.godImage, box.x, box.y, box.width, box.height);
      else {
        // The customer's own picture: the designer's size and position.
        const r = placedRect(images.godImage, region.box, content.godPlacement, "cover");
        ctx.drawImage(images.godImage, r.x, r.y, r.width, r.height);
        if (!godFrame) godFrame = { area: region.box, rect: r };
      }
      ctx.restore();
    } else if (images.layoutGod) {
      // Normal Mode: the layout's own God picture, unchanged — inside removed
      // sections the version without them (the picture continues where a
      // strip or box lay over it; the strip itself never comes back).
      const paint = (layerImg) => (g) => {
        g.save();
        g.clip(regionPath(region));
        g.drawImage(layerImg, 0, 0, widthMm, heightMm);
        g.restore();
      };
      if (removalMask) {
        drawMasked(ctx, removalMask, "outside", paint(images.layoutGod));
        if (images.layoutGodBare) drawMasked(ctx, removalMask, "inside", paint(images.layoutGodBare));
      } else {
        paint(images.layoutGod)(ctx);
      }
    } else {
      fromOriginal(region.box, regionPath(region));
    }
  }
  // 2b. Areas freed by removed sections that the AI picture was painted for:
  //     the same picture continues there, so no empty strip remains.
  if (images.godImage && images.godImageBox && images.filledAreas?.length) {
    const box = images.godImageBox;
    for (const area of images.filledAreas) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.x, area.y, area.width, area.height);
      ctx.clip();
      ctx.drawImage(images.godImage, box.x, box.y, box.width, box.height);
      ctx.restore();
    }
  }

  // 3. Locked artwork above the god picture, in its original stacking order
  //    (bare version inside removed areas).
  if (overlay && removalMask) {
    drawMasked(ctx, removalMask, "outside", (g) => g.drawImage(overlay, 0, 0, widthMm, heightMm));
    if (overlayBare) drawMasked(ctx, removalMask, "inside", (g) => g.drawImage(overlayBare, 0, 0, widthMm, heightMm));
  } else if (overlay) {
    ctx.drawImage(overlay, 0, 0, widthMm, heightMm);
  } else if (images.frame && !noTemplate) {
    // Older layouts without an overlay: the frame PNG in its region,
    // keeping its proportions (never stretched).
    for (const region of byRole(variant, "FRAME")) {
      const { box } = region;
      const s = Math.min(box.width / images.frame.naturalWidth, box.height / images.frame.naturalHeight);
      const w = images.frame.naturalWidth * s;
      const h = images.frame.naturalHeight * s;
      ctx.drawImage(images.frame, box.x + (box.width - w) / 2, box.y + (box.height - h) / 2, w, h);
    }
  }

  // 3-God. Special Die-Cut template (Normal Mode): the customer's God image
  //    over the artwork, where the designer places it.
  if (!noTemplate && !images.godImageBox && compositionMode(variant) === "FULL_ARTWORK") {
    const shownText = (variant.regions || []).filter((r) => {
      const key = sectionOf(r);
      return key && sections[key] !== false && r.role !== "SIDE_BOX_LEFT" && r.role !== "SIDE_BOX_RIGHT";
    });
    // The full board width (the cutline shapes it) from the top down to just
    // above the first text / the calendar pad: where the layout's deity is.
    const free = sketchGodArea({ widthMm, heightMm }, [
      ...shownText.map((r) => r.textBox || r.box),
      ...byRole(variant, "CAKE_MOUNT").map((r) => r.box),
    ]);
    const area = { x: 0, y: 0, width: widthMm, height: free.y + free.height };
    if (images.godImage) {
      // Covers the layout's own deity area (crown at the top), soft edges.
      const r = placedRect(images.godImage, area, content.godPlacement, "cover", "top");
      drawFeathered(ctx, images.godImage, r, area, pxPerMm);
      godFrame = { area, rect: r };
    } else {
      godFrame = { area, rect: null };
    }
  }

  // 3a. Free preview (AI off): cover each removed area with the artwork
  //     next to it, mirrored, so no empty strip, box or leftover border
  //     remains. A real AI design paints these areas as one artwork.
  if (!noTemplate && removed.length) {
    const avoid = [
      ...byRole(variant, "GOD_AREA").map((r) => r.box),
      ...byRole(variant, "CAKE_MOUNT").map((r) => r.box),
    ];
    // Removed areas that are not shown (hidden sections).
    const hidden = removed.filter((b) => b.hidden !== false);
    // Smooth fill of exactly the erased artwork; the mirrored-strip fill is
    // only a fallback when the bare layers are missing.
    // Normal Mode: the layout's God picture (without removed sections) is
    // content too — only what is still empty is filled, and the god area
    // itself is not protected (its strip part was removed).
    const layoutGodShown = Boolean(images.layoutGod && images.layoutGodBare);
    const filled = fillEmptyRemoved(ctx, {
      removalMask,
      bareLayers: [images.plateBare, images.overlayBare, ...(layoutGodShown ? [images.layoutGodBare] : [])],
      protect: layoutGodShown ? [] : byRole(variant, "GOD_AREA").map((r) => r.box),
      // Colours come from the layout's mapped background area when it has one.
      sources: byRole(variant, "BACKGROUND_AREA").map((r) => r.box),
      // Sections still shown (name banner, boxes, text lines) are not
      // background: never sampled for the fill.
      noSource: [
        ...(sections.showBusinessName ? areas.name : []),
        ...(sections.showLeftBox ? areas.left : []),
        ...(sections.showRightBox ? areas.right : []),
        ...(sections.showTextLine1 ? areas.line1 : []),
        ...(sections.showTextLine2 ? areas.line2 : []),
      ],
      widthMm,
      heightMm,
    });
    // Layouts without bare layers: mirrored strips from beside the area.
    if (!filled && !images.plateBare) fillFromNeighbours(ctx, hidden, avoid, pxPerMm, widthMm, heightMm);
  }

  // 3b. App-drawn side-box styles (shown boxes only); content goes inside.
  const boxInner = {};
  const boxTextColour = {};
  if (styledBoxes) {
    const icon = iconForProducts(`${content.productList || ""} ${content.rightBoxText || ""} ${content.businessName || ""}`);
    for (const region of [...(sections.showLeftBox ? leftRegions : []), ...(sections.showRightBox ? rightRegions : [])]) {
      const isText = region.role === "SIDE_BOX_LEFT" ? !leftShowsImage : sections.rightBoxMode === "text";
      // AI Mode: a right image box without a photo shows the AI-painted
      // product picture — only the frame is drawn over it.
      const aiProduct = Boolean(fullArtwork) && region.role === "SIDE_BOX_RIGHT" && !isText && !images.productImage;
      const drawn = drawBoxStyle(ctx, boxStyle, region.box, palette, { icon: isText ? icon : null, hollow: aiProduct });
      boxInner[region.id] = drawn.inner;
      boxTextColour[region.id] = drawn.textColour;
    }
  }
  const leftTemplate = leftRegions.find((r) => r.textStyle) || null;

  // 4. Product image inside its box, keeping the box border (or the
  //    layout's original product photo when not replaced). With the right
  //    box set to text, its text is drawn with the other text slots.
  const rightShowsImage = sections.showRightBox && sections.rightBoxMode !== "text";
  if (rightShowsImage && !images.productImage && !styledBoxes) {
    for (const region of byBinding(variant, "productImage")) fromOriginal(padded(region.box, 0.5));
  }
  if (rightShowsImage && images.productImage && styledBoxes) {
    for (const region of rightRegions) {
      const inner = boxInner[region.id] || region.box;
      ctx.save();
      ctx.beginPath();
      ctx.rect(inner.x, inner.y, inner.width, inner.height);
      ctx.clip();
      drawCover(ctx, images.productImage, inner);
      ctx.restore();
    }
  } else if (rightShowsImage && images.productImage) {
    for (const region of byBinding(variant, "productImage")) {
      const sw = region.boxStyle?.strokeWidthMm || 0;
      ctx.save();
      ctx.beginPath();
      const inner = inset(region.box, sw / 2);
      ctx.rect(inner.x, inner.y, inner.width, inner.height);
      ctx.clip();
      drawCover(ctx, images.productImage, inner);
      ctx.restore();
      if (sw && region.boxStyle?.strokeColor) {
        ctx.strokeStyle = region.boxStyle.strokeColor;
        ctx.lineWidth = sw;
        const edge = inset(region.box, sw / 2);
        ctx.strokeRect(edge.x, edge.y, edge.width, edge.height);
      }
    }
  }

  // 4b. Left box picture (inside the box, keeping its border / style).
  if (leftShowsImage && images.leftBoxImage) {
    for (const region of leftRegions) {
      const sw = styledBoxes ? 0 : region.boxStyle?.strokeWidthMm || 0;
      const inner = boxInner[region.id] || inset(region.box, sw / 2);
      ctx.save();
      ctx.beginPath();
      ctx.rect(inner.x, inner.y, inner.width, inner.height);
      ctx.clip();
      drawCover(ctx, images.leftBoxImage, inner);
      ctx.restore();
      if (!styledBoxes && sw && region.boxStyle?.strokeColor) {
        ctx.strokeStyle = region.boxStyle.strokeColor;
        ctx.lineWidth = sw;
        const edge = inset(region.box, sw / 2);
        ctx.strokeRect(edge.x, edge.y, edge.width, edge.height);
      }
    }
  }

  // Empty picture slots without an original to show: a light placeholder on
  // screen (never in output).
  if (showGuides && !original && !noTemplate) {
    const empty = [
      ...(images.godImage ? [] : byRole(variant, "GOD_AREA").map((r) => [r, "God image"])),
      ...(images.productImage || !rightShowsImage ? [] : byBinding(variant, "productImage").map((r) => [r, "Product image"])),
      ...(leftShowsImage && !images.leftBoxImage ? leftRegions.map((r) => [r, "Left box image"]) : []),
    ];
    for (const [region, label] of empty) {
      const b = region.box;
      ctx.save();
      ctx.fillStyle = "rgba(176,141,53,0.08)";
      ctx.fillRect(b.x, b.y, b.width, b.height);
      ctx.fillStyle = "rgba(122,114,102,0.75)";
      ctx.font = `600 ${Math.min(b.width / 8, 10)}px Poppins, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, b.x + b.width / 2, b.y + b.height / 2);
      ctx.restore();
    }
  }

  // 5. Text slots (typeset by the app, exactly as entered — never rewritten).
  const fonts = design?.fonts || null;
  // Text colour: the layout's own for its own colours; otherwise whatever
  // reads best on the recoloured artwork under the text.
  const textColourFor = (region, area) => {
    if (boxTextColour[region.id]) return boxTextColour[region.id];
    // AI Mode artwork: the AI painted a plaque under the text — light text
    // on a dark plaque, dark text on a light one (AI designs only).
    if (design?.aiText && fullArtwork) return areaLuminance(ctx, area, pxPerMm) < 0.5 ? "#FFF1C9" : "#3B1408";
    if (theme === "original" || !palette.length) return null;
    return areaLuminance(ctx, area, pxPerMm) < 0.5 ? palette[3] || "#ffffff" : palette[0] || "#000000";
  };
  // A removed section's text is not printed.
  const hidden = (region) => {
    const key = sectionOf(region);
    return Boolean(key && sections[key] === false);
  };
  for (const region of variant.regions || []) {
    if (!region.binding || region.binding === "productImage" || !region.textStyle) continue;
    if (hidden(region)) continue;
    if (leftShowsImage && region.role === "SIDE_BOX_LEFT") continue;
    const edit = editOf(region);
    const value = editText(edit, content[region.binding]);
    const inner = boxInner[region.id];
    const target = inner ? { ...region, box: inner, textBox: null } : region;
    const pair = chosenFonts || fonts;
    const font = pair ? (region.binding === "businessName" ? pair.heading : pair.body) : null;
    if (value && String(value).trim()) {
      fits[region.id] = drawRegionText(ctx, target, value, {
        font: editFont(edit) || font,
        color: editColour(edit) || chosenColour || textColourFor(region, textArea(target)),
        scale: sizeScale(region),
        ...(editTargetMm(edit) ? { targetMm: editTargetMm(edit) } : {}),
        // Name and text lines are single-line slots: never wrapped (wrapping
        // would shrink the text to fit two lines into one line's height).
        wrap: region.binding !== "businessName" && region.role !== "TEXT_LINE_1" && region.role !== "TEXT_LINE_2",
        // Name and text lines: as large as their area allows; a long text
        // line may use two lines within its own area.
        fill: region.binding === "businessName" || ["TEXT_LINE_1", "TEXT_LINE_2", "SIDE_BOX_LEFT"].includes(region.role),
        twoLines: region.role === "TEXT_LINE_1" || region.role === "TEXT_LINE_2" || region.textStyle?.maxLines === 2,
        // Layout setting: a single-line slot shown on two lines (e.g. the name).
        forceTwoLines: region.textStyle?.maxLines === 2,
        // The file had no live text here (letters drawn as shapes), or the
        // text sits straight on a complete AI artwork: a contrasting edge
        // keeps it readable on any background.
        outline: !inner && (!region.textBox || noTemplate),
      });
    } else if (!inner && fromOriginal(padded(region.textBox || region.box, 1))) {
      // Not replaced: the layout's original text, exactly as designed.
    } else if (showGuides && region.sampleText) {
      const sample = [...new Set(region.sampleText.split("\n").map((l) => l.trim()))].join("\n");
      drawRegionText(ctx, region, sample, { alpha: 0.3 });
    }
  }
  // 5b. Right box as text: same style as the left box's text.
  const rightEdit = areaEdits?.right || null;
  const rightText = editText(rightEdit, content.rightBoxText);
  if (sections.showRightBox && sections.rightBoxMode === "text" && String(rightText || "").trim()) {
    for (const region of rightRegions) {
      const inner = boxInner[region.id] || inset(region.box, Math.min(region.box.width, region.box.height) * 0.08);
      const target = {
        ...region,
        box: inner,
        textBox: null,
        textStyle: { ...(leftTemplate?.textStyle || {}), align: "center", shadow: null },
        sampleText: "",
      };
      fits[region.id] = drawRegionText(ctx, target, rightText, {
        font: editFont(rightEdit) || (chosenFonts || fonts)?.body || null,
        scale: sizeScale(region),
        ...(editTargetMm(rightEdit) ? { targetMm: editTargetMm(rightEdit) } : {}),
        // The left box's colour was made for the left box's fill: on the
        // right box's own background, use what reads best there.
        color:
          editColour(rightEdit) ||
          chosenColour ||
          boxTextColour[region.id] ||
          (areaLuminance(ctx, inner, pxPerMm) < 0.5 ? "#ffffff" : "#2A2620"),
        wrap: true,
      });
    }
  }
  ctx.restore();

  // 6. Guides for fixed production areas (screen only, never printed).
  if (showGuides) {
    const px = 1 / pxPerMm;
    ctx.save();
    ctx.setLineDash([6 * px, 4 * px]);
    if (cutline) {
      ctx.strokeStyle = "#e53935";
      ctx.lineWidth = 2 * px;
      ctx.stroke(cutline);
    }
    const cake = byRole(variant, "CAKE_MOUNT")[0];
    if (cake) {
      ctx.strokeStyle = "#c0392b";
      ctx.lineWidth = 2 * px;
      ctx.strokeRect(cake.box.x, cake.box.y, cake.box.width, cake.box.height);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(192,57,43,0.85)";
      ctx.font = `600 ${12 * px}px Poppins, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Cake mount · fixed", cake.box.x + cake.box.width / 2, cake.box.y + cake.box.height / 2);
    }
    ctx.restore();
  }
  if (!godFrame) {
    const god = byRole(variant, "GOD_AREA")[0];
    if (god) godFrame = { area: god.box, rect: null };
  }
  return { fits, godFrame };
};
