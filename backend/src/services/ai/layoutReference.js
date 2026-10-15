// Shows the AI what the selected production layout looks like, so the god
// image is COMPOSED for that layout's frame instead of being cropped into a
// rectangle.
//
// God reference = the layout around the god area, rendered from the
// layout's own assets (plate under, frame overlay on top) with the god opening
// filled flat grey. The AI paints the deity into that opening; its output
// maps 1:1 back onto the same crop box (mm). The app then keeps only the
// pixels inside the god region and draws the REAL frame on top, so the frame
// and all production geometry stay exactly as stored.
const sharp = require("sharp");
const { SUPPORTED_RATIOS } = require("./imageAi");
const { resolveUpload } = require("./uploadPaths");

const OPENING_GREY = "#808080";
const MAX_REFERENCE_PX = 1536;
const CONTEXT_MARGIN = 0.12; // share of the god box added around it

const ratioValue = (r) => {
  const [w, h] = r.split(":").map(Number);
  return w / h;
};

/**
 * Grows `box` by `margin` on every side, then grows ONE dimension so the box
 * has exactly a supported aspect ratio (centred). Never shrinks the context.
 * @returns {{ box: {x,y,width,height}, aspectRatio: string }}
 */
const fitBoxToRatio = (box, margin = CONTEXT_MARGIN, ratios = SUPPORTED_RATIOS) => {
  const w = box.width * (1 + 2 * margin);
  const h = box.height * (1 + 2 * margin);
  const target = Math.log(w / h);
  const aspectRatio = ratios.reduce((best, r) =>
    Math.abs(Math.log(ratioValue(r)) - target) < Math.abs(Math.log(ratioValue(best)) - target) ? r : best,
  );
  const ratio = ratioValue(aspectRatio);
  const width = Math.max(w, h * ratio);
  const height = width / ratio;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return {
    box: { x: cx - width / 2, y: cy - height / 2, width, height },
    aspectRatio,
  };
};

// Part of a full-trim layer image that falls inside the crop (pixels).
const layerPart = async (file, crop) => {
  const meta = await sharp(file).metadata();
  const left = Math.max(0, crop.left);
  const top = Math.max(0, crop.top);
  const right = Math.min(meta.width, crop.left + crop.width);
  const bottom = Math.min(meta.height, crop.top + crop.height);
  if (right <= left || bottom <= top) return null;
  const input = await sharp(file)
    .extract({ left, top, width: right - left, height: bottom - top })
    .png()
    .toBuffer();
  return { input, left: left - crop.left, top: top - crop.top };
};

const regionSvg = (region, cropMm, widthPx, heightPx, fill) => {
  const shape =
    region.shape === "path" && region.path
      ? `<path d="${region.path}" fill="${fill}"/>`
      : `<rect x="${region.box.x}" y="${region.box.y}" width="${region.box.width}" height="${region.box.height}" fill="${fill}"/>`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" ` +
      `viewBox="${cropMm.x} ${cropMm.y} ${cropMm.width} ${cropMm.height}" preserveAspectRatio="none">${shape}</svg>`,
  );
};

/**
 * @returns {Promise<{ buffer: Buffer, mimeType: "image/png", box, aspectRatio } | null>}
 *   box = crop in trim mm that the AI output maps onto.
 */
const unionOf = (boxes) => {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};

// `extraOpenings` (trim mm): areas freed by removed sections — shown grey
// too, so the one picture also fills them (no extra request).
const buildGodReference = async (variant, { extraOpenings = [] } = {}) => {
  const god = (variant.regions || []).find((r) => r.role === "GOD_AREA");
  const plateFile = resolveUpload(variant.assets?.plate);
  if (!god || !plateFile || !variant.trim?.widthMm) return null;
  // With removed sections the frame layer without them is shown (the name
  // strip / boxes must not appear in the reference).
  const overlayFile = resolveUpload(
    extraOpenings.length && variant.assets?.overlayBare ? variant.assets.overlayBare : variant.assets?.overlay,
  );

  const { box, aspectRatio } = fitBoxToRatio(unionOf([god.box, ...extraOpenings]));
  const { width: plateW } = await sharp(plateFile).metadata();
  const pxPerMm = plateW / variant.trim.widthMm;
  const crop = {
    left: Math.round(box.x * pxPerMm),
    top: Math.round(box.y * pxPerMm),
    width: Math.round(box.width * pxPerMm),
    height: Math.round(box.height * pxPerMm),
  };

  const layers = [];
  const plate = await layerPart(plateFile, crop);
  if (plate) layers.push(plate);
  layers.push({ input: regionSvg(god, box, crop.width, crop.height, OPENING_GREY), left: 0, top: 0 });
  for (const extra of extraOpenings) {
    layers.push({ input: regionSvg({ box: extra }, box, crop.width, crop.height, OPENING_GREY), left: 0, top: 0 });
  }
  const overlay = overlayFile ? await layerPart(overlayFile, crop) : null;
  if (overlay) layers.push(overlay);

  const scale = Math.min(1, MAX_REFERENCE_PX / Math.max(crop.width, crop.height));
  const composed = await sharp({
    create: { width: crop.width, height: crop.height, channels: 4, background: OPENING_GREY },
  })
    .composite(layers)
    .png()
    .toBuffer();
  const buffer = await sharp(composed)
    .resize(Math.round(crop.width * scale), Math.round(crop.height * scale))
    .png()
    .toBuffer();
  return { buffer, mimeType: "image/png", box, aspectRatio };
};

/** Small picture of the whole layout, for colour / style context. */
const buildStyleReference = async (variant) => {
  const file = resolveUpload(variant.assets?.preview);
  if (!file) return null;
  const buffer = await sharp(file).resize({ width: 768, height: 768, fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
  return { buffer, mimeType: "image/jpeg" };
};

// Colours of the Special Die-Cut layout guide (explained in the prompt).
const GUIDE = { outside: "#ffffff", board: "#9a9a9a", text: "#f3ead2", cake: "#3b6fd8", product: "#7bc96f" };
const TEXT_PANEL_ROLES = ["NAME_TEXT", "TEXT_LINE_1", "TEXT_LINE_2"];

/**
 * Special Die-Cut (FULL_ARTWORK): the production geometry as a picture the
 * AI composes onto — cutline silhouette, text panels and the calendar pad.
 * Built only from the stored geometry (never redraws or alters the cutline).
 * @returns {{ buffer, mimeType, box, aspectRatio, cakeOverlapsArtwork }}
 *   box = area in trim mm that the AI output maps onto (the trim, grown to a
 *   supported aspect ratio, centred).
 */
const SECTION_OF_ROLE = {
  NAME_TEXT: "showBusinessName",
  TEXT_LINE_1: "showTextLine1",
  TEXT_LINE_2: "showTextLine2",
  SIDE_BOX_LEFT: "showLeftBox",
  SIDE_BOX_RIGHT: "showRightBox",
};
const PANEL_ROLES = [...TEXT_PANEL_ROLES, "SIDE_BOX_LEFT", "SIDE_BOX_RIGHT"];
const buildArtworkGuide = async (variant, options = {}) => {
  if (!variant?.trim?.widthMm || !variant.cutline?.path) return null;
  const trimBox = { x: 0, y: 0, width: variant.trim.widthMm, height: variant.trim.heightMm };
  const { box, aspectRatio } = fitBoxToRatio(trimBox, 0);
  const scale = MAX_REFERENCE_PX / Math.max(box.width, box.height);
  const widthPx = Math.round(box.width * scale);
  const heightPx = Math.round(box.height * scale);
  const regions = variant.regions || [];
  const rect = (b, fill, extra = "") =>
    `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${fill}" ${extra}/>`;
  // Switched-off sections are NOT panels: their space is artwork (grey).
  const enabled = (r) => options[SECTION_OF_ROLE[r.role]] !== false;
  // Name / text lines: the text itself; side boxes: the whole box.
  // The right box set to "image" without an uploaded photo: the AI paints a
  // product picture there (green); every other shown section is a panel.
  const productArea = (r) => r.role === "SIDE_BOX_RIGHT" && options.aiProductImage === true;
  const textPanels = regions
    .filter((r) => PANEL_ROLES.includes(r.role) && enabled(r) && !productArea(r))
    .map((r) => rect(TEXT_PANEL_ROLES.includes(r.role) ? r.textBox || r.box : r.box, GUIDE.text));
  const productAreas = regions.filter((r) => PANEL_ROLES.includes(r.role) && enabled(r) && productArea(r));
  textPanels.push(...productAreas.map((r) => rect(r.box, GUIDE.product)));
  const panelCount = textPanels.length - productAreas.length;
  const freedSpace = regions.some((r) => PANEL_ROLES.includes(r.role) && !enabled(r));
  const cake = regions.find((r) => r.role === "CAKE_MOUNT");
  const artwork = regions.filter((r) => ["FRAME", "BACKGROUND_AREA"].includes(r.role));
  const cakeOverlapsArtwork = Boolean(cake && artwork.some((r) => r.box.y + r.box.height > cake.box.y + 1));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" ` +
    `viewBox="${box.x} ${box.y} ${box.width} ${box.height}" preserveAspectRatio="none">` +
    `${rect(box, GUIDE.outside)}<path d="${variant.cutline.path}" fill="${GUIDE.board}"/>` +
    `<g clip-path="url(#cut)">${textPanels.join("")}` +
    (cake ? rect(cake.box, GUIDE.cake, `fill-opacity="0.85"`) : "") +
    `</g><defs><clipPath id="cut"><path d="${variant.cutline.path}"/></clipPath></defs></svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return { buffer, mimeType: "image/png", box, aspectRatio, cakeOverlapsArtwork, freedSpace, panelCount, productArea: productAreas.length > 0 };
};

/**
 * The selected layout as a style reference for a complete AI artwork.
 * Sections the customer switched off or left empty are CUT OUT: the bare
 * layers (without the optional boxes / banners) are used and every removed
 * section is covered flat grey, so the AI never sees — and never copies —
 * an empty box, banner or placeholder. Falls back to the stored template
 * picture only when no removed section needs hiding.
 */
const REMOVED_GREY = "#9a9a9a";
const removedAreas = (variant, options = {}) => {
  const widthMm = variant.trim.widthMm;
  return (variant.regions || [])
    .filter((r) => SECTION_OF_ROLE[r.role] && options[SECTION_OF_ROLE[r.role]] === false)
    .map((r) => {
      if (TEXT_PANEL_ROLES.includes(r.role)) {
        // A name / text line strip runs across the board around the text.
        const extra = r.box.height;
        return { x: -2, y: r.box.y - extra, width: widthMm + 4, height: r.box.height + 2 * extra };
      }
      const pad = 1.5;
      return { x: r.box.x - pad, y: r.box.y - pad, width: r.box.width + 2 * pad, height: r.box.height + 2 * pad };
    });
};

const buildTemplateReference = async (variant, options = {}) => {
  const removed = variant?.trim?.widthMm ? removedAreas(variant, options) : [];
  const bare = removed.length > 0;
  const plateFile = resolveUpload(bare && variant.assets?.plateBare ? variant.assets.plateBare : variant.assets?.plate);
  const overlayFile = resolveUpload(bare && variant.assets?.overlayBare ? variant.assets.overlayBare : variant.assets?.overlay);
  if (!plateFile) {
    if (bare) return null; // never send a template that still shows removed boxes
    const file = resolveUpload(variant.assets?.original || variant.assets?.preview);
    if (!file) return null;
    const buffer = await sharp(file).resize({ width: 1024, height: 1024, fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
    return { buffer, mimeType: "image/jpeg", removedSections: 0 };
  }
  const { width, height } = await sharp(plateFile).metadata();
  const layers = [{ input: await sharp(plateFile).png().toBuffer(), left: 0, top: 0 }];
  if (overlayFile) {
    layers.push({ input: await sharp(overlayFile).resize(width, height, { fit: "fill" }).png().toBuffer(), left: 0, top: 0 });
  }
  if (bare) {
    const t = variant.trim;
    const rects = removed.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${REMOVED_GREY}"/>`);
    layers.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${t.widthMm} ${t.heightMm}" preserveAspectRatio="none">${rects.join("")}</svg>`,
      ),
      left: 0,
      top: 0,
    });
  }
  const composed = await sharp({ create: { width, height, channels: 4, background: "#ffffff" } })
    .composite(layers)
    .png()
    .toBuffer();
  const buffer = await sharp(composed).resize({ width: 1024, height: 1024, fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
  return { buffer, mimeType: "image/jpeg", removedSections: removed.length };
};

module.exports = {
  fitBoxToRatio,
  buildGodReference,
  buildStyleReference,
  buildArtworkGuide,
  buildTemplateReference,
  OPENING_GREY,
  GUIDE,
};
