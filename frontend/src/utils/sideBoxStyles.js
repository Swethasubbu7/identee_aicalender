// The app-drawn side-box styles of the design recipes (no AI). Each style
// draws a decorative panel INSIDE the fixed side-box region and returns the
// inner area where the box content (text or image) goes. Units are mm (the
// drawing context is already scaled).
//   "layout"    — the layout's own box (nothing drawn here)
//   "rounded"   — rounded decorative panel with an inner dotted line
//   "arched"    — panel with an arched top
//   "scalloped" — scalloped border
//   "double"    — double ornamental border with corner diamonds
//   "ribbon"    — ribbon header band with the product icon
import { PRODUCT_ICONS } from "./productIcons";

export const BOX_STYLES = ["layout", "rounded", "arched", "scalloped", "double", "ribbon"];

const roundedPath = (b, r) => {
  const p = new Path2D();
  p.moveTo(b.x + r, b.y);
  p.arcTo(b.x + b.width, b.y, b.x + b.width, b.y + b.height, r);
  p.arcTo(b.x + b.width, b.y + b.height, b.x, b.y + b.height, r);
  p.arcTo(b.x, b.y + b.height, b.x, b.y, r);
  p.arcTo(b.x, b.y, b.x + b.width, b.y, r);
  p.closePath();
  return p;
};

const inset = (b, d) => ({ x: b.x + d, y: b.y + d, width: b.width - 2 * d, height: b.height - 2 * d });

const drawIcon = (ctx, key, cx, cy, size, colour) => {
  const icon = PRODUCT_ICONS[key] || PRODUCT_ICONS.shop;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = colour;
  for (const d of icon.paths) ctx.fill(new Path2D(d));
  ctx.restore();
};

const archedPath = (b) => {
  const r = Math.min(b.width / 2, b.height * 0.25);
  const p = new Path2D();
  p.moveTo(b.x, b.y + b.height);
  p.lineTo(b.x, b.y + r);
  p.quadraticCurveTo(b.x, b.y, b.x + r, b.y);
  p.lineTo(b.x + b.width - r, b.y);
  p.quadraticCurveTo(b.x + b.width, b.y, b.x + b.width, b.y + r);
  p.lineTo(b.x + b.width, b.y + b.height);
  p.closePath();
  // Pointed arch crown on top.
  const crown = new Path2D();
  crown.moveTo(b.x + b.width * 0.35, b.y);
  crown.quadraticCurveTo(b.x + b.width / 2, b.y - r * 0.6, b.x + b.width * 0.65, b.y);
  crown.closePath();
  return { body: p, crown };
};

const scallopedPath = (b, r) => {
  const p = new Path2D();
  const nx = Math.max(3, Math.round(b.width / (r * 2)));
  const ny = Math.max(3, Math.round(b.height / (r * 2)));
  const sx = b.width / nx;
  const sy = b.height / ny;
  p.moveTo(b.x, b.y);
  for (let i = 0; i < nx; i += 1) p.arc(b.x + sx * (i + 0.5), b.y, sx / 2, Math.PI, 0);
  for (let i = 0; i < ny; i += 1) p.arc(b.x + b.width, b.y + sy * (i + 0.5), sy / 2, -Math.PI / 2, Math.PI / 2);
  for (let i = nx - 1; i >= 0; i -= 1) p.arc(b.x + sx * (i + 0.5), b.y + b.height, sx / 2, 0, Math.PI);
  for (let i = ny - 1; i >= 0; i -= 1) p.arc(b.x, b.y + sy * (i + 0.5), sy / 2, Math.PI / 2, -Math.PI / 2);
  p.closePath();
  return p;
};

/**
 * Draws the style and returns { inner, textColour } — the content area (mm)
 * and the text colour that reads well on the panel.
 * @param box      side-box region box (mm)
 * @param palette  recipe palette [dark, mid, accent, light]
 * @param options  { icon: product icon key | null,
 *                   hollow: frame only — the picture inside (an AI-painted
 *                           product picture) stays visible }
 */
export const drawBoxStyle = (ctx, style, box, palette, { icon = null, hollow = false } = {}) => {
  const [dark, mid, accent, light] = palette?.length ? palette : ["#3B1E08", "#7A1F1F", "#C9A227", "#FFF8E7"];
  const unit = Math.min(box.width, box.height);
  const line = Math.max(0.6, unit * 0.012);
  const textColour = dark;
  ctx.save();
  if (hollow) {
    // Panel fills are skipped: only the frame lines are drawn.
    const fill = ctx.fill.bind(ctx);
    const fillRect = ctx.fillRect.bind(ctx);
    ctx.fillStyle = light; // the canvas' own spelling of the panel colour
    const panel = ctx.fillStyle;
    ctx.fill = (...args) => (ctx.fillStyle === panel ? undefined : fill(...args));
    ctx.fillRect = (...args) => (ctx.fillStyle === panel ? undefined : fillRect(...args));
    try {
      return drawBoxStyle(ctx, style, box, palette, { icon: null, hollow: false });
    } finally {
      ctx.restore();
      delete ctx.fill;
      delete ctx.fillRect;
    }
  }
  if (style === "rounded") {
    const b = inset(box, line);
    const r = Math.min(b.width, b.height) * 0.16;
    const path = roundedPath(b, r);
    ctx.fillStyle = light;
    ctx.fill(path);
    ctx.strokeStyle = accent;
    ctx.lineWidth = line * 2;
    ctx.stroke(path);
    const i = inset(b, line * 3.5);
    ctx.strokeStyle = mid;
    ctx.lineWidth = line * 0.6;
    ctx.setLineDash([line * 0.6, line * 1.6]);
    ctx.lineCap = "round";
    ctx.stroke(roundedPath(i, Math.max(0.5, r - line * 3.5)));
    ctx.setLineDash([]);
    if (icon) drawIcon(ctx, icon, b.x + b.width / 2, i.y + unit * 0.11, unit * 0.14, mid);
    ctx.restore();
    const top = icon ? unit * 0.2 : 0;
    return { inner: { x: i.x + line * 3, y: i.y + top + line * 3, width: i.width - line * 6, height: i.height - top - line * 6 }, textColour };
  }
  if (style === "arched") {
    const b = inset(box, line);
    const { body, crown } = archedPath(b);
    ctx.fillStyle = light;
    ctx.fill(body);
    ctx.fillStyle = accent;
    ctx.fill(crown);
    ctx.strokeStyle = accent;
    ctx.lineWidth = line * 2;
    ctx.stroke(body);
    ctx.strokeStyle = mid;
    ctx.lineWidth = line * 0.6;
    ctx.stroke(archedPath(inset(b, line * 3)).body);
    if (icon) drawIcon(ctx, icon, b.x + b.width / 2, b.y + unit * 0.16, unit * 0.16, mid);
    ctx.restore();
    const top = icon ? unit * 0.28 : unit * 0.18;
    return { inner: { x: b.x + line * 5, y: b.y + top, width: b.width - line * 10, height: b.height - top - line * 5 }, textColour };
  }
  if (style === "scalloped") {
    const r = Math.max(2, unit * 0.05);
    const b = inset(box, r);
    const path = scallopedPath(b, r);
    ctx.fillStyle = light;
    ctx.fill(path);
    ctx.strokeStyle = accent;
    ctx.lineWidth = line * 1.6;
    ctx.stroke(path);
    ctx.strokeStyle = mid;
    ctx.lineWidth = line * 0.5;
    ctx.setLineDash([line * 2, line * 2]);
    const i = inset(b, r * 1.2);
    ctx.strokeRect(i.x, i.y, i.width, i.height);
    ctx.setLineDash([]);
    if (icon) drawIcon(ctx, icon, b.x + b.width / 2, i.y + unit * 0.1, unit * 0.14, accent);
    ctx.restore();
    const top = icon ? unit * 0.2 : 0;
    return { inner: { x: i.x + line * 2, y: i.y + top + line * 2, width: i.width - line * 4, height: i.height - top - line * 4 }, textColour };
  }
  if (style === "double") {
    const b = inset(box, line);
    ctx.fillStyle = light;
    ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.strokeStyle = accent;
    ctx.lineWidth = line * 2;
    ctx.strokeRect(b.x, b.y, b.width, b.height);
    const i = inset(b, line * 4);
    ctx.strokeStyle = mid;
    ctx.lineWidth = line * 0.8;
    ctx.strokeRect(i.x, i.y, i.width, i.height);
    const d = unit * 0.05;
    ctx.fillStyle = accent;
    for (const [cx, cy] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy - d);
      ctx.lineTo(cx + d, cy);
      ctx.lineTo(cx, cy + d);
      ctx.lineTo(cx - d, cy);
      ctx.closePath();
      ctx.fill();
    }
    if (icon) drawIcon(ctx, icon, b.x + b.width / 2, i.y + unit * 0.11, unit * 0.14, mid);
    ctx.restore();
    const top = icon ? unit * 0.2 : 0;
    return { inner: { x: i.x + line * 2, y: i.y + top + line * 2, width: i.width - line * 4, height: i.height - top - line * 4 }, textColour };
  }
  if (style === "ribbon") {
    const b = inset(box, line);
    const head = Math.min(b.height * 0.22, unit * 0.24);
    ctx.fillStyle = light;
    ctx.fillRect(b.x, b.y + head * 0.5, b.width, b.height - head * 0.5);
    ctx.strokeStyle = accent;
    ctx.lineWidth = line * 1.4;
    ctx.strokeRect(b.x, b.y + head * 0.5, b.width, b.height - head * 0.5);
    // Ribbon band with folded ends.
    const fold = head * 0.35;
    ctx.fillStyle = mid;
    ctx.beginPath();
    ctx.moveTo(b.x - fold * 0.2, b.y);
    ctx.lineTo(b.x + b.width + fold * 0.2, b.y);
    ctx.lineTo(b.x + b.width + fold * 0.2 - fold, b.y + head / 2);
    ctx.lineTo(b.x + b.width + fold * 0.2, b.y + head);
    ctx.lineTo(b.x - fold * 0.2, b.y + head);
    ctx.lineTo(b.x - fold * 0.2 + fold, b.y + head / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = line;
    ctx.stroke();
    if (icon) drawIcon(ctx, icon, b.x + b.width / 2, b.y + head / 2, head * 0.7, light);
    ctx.restore();
    return { inner: { x: b.x + line * 4, y: b.y + head + line * 3, width: b.width - line * 8, height: b.height - head - line * 6 }, textColour };
  }
  ctx.restore();
  return { inner: box, textColour: null };
};
