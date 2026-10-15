// Browser-side generation of the designer preview assets for a production
// layout, straight from its production PDF:
//   preview — artwork inside the cutline (layout card thumbnail)
//   plate   — the same artwork with all sample text removed (live preview base)
//   textStyles — colour (and shadow) of each text region's sample text
import { renderPageArea, canvasToPngBlob } from "./pdfRender";
import { uploadLayoutAssets } from "../services/layoutVariantService";
import { sectionAreas } from "./sectionAreas";

const PLATE_PX_PER_MM = 5; // ~127 DPI: plenty for an on-screen preview
const PLATE_MAX_PX = 3000;
// Bump when the bare-layer rendering changes: layouts with older bare
// layers are re-rendered once (geometry and production files untouched).
// 2: a removed side box takes its whole drawn box, not only the mapped area.
export const BARE_LAYER_VERSION = 2;
// plateGod (the artwork WITH the layout's own God picture, no sample text —
// Normal Mode) is generated with the same refresh; a layout with a god area
// but no plateGod is refreshed once by the next browser that opens it.

const inside = (run, box, pad = 1) =>
  run.xMm >= box.x - pad &&
  run.xMm <= box.x + box.width + pad &&
  run.yMm >= box.y - pad &&
  run.yMm <= box.y + box.height + pad;

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

// Main colour = the text drawn last (on top); a second colour drawn as a copy
// of the same text is a shadow, offset by the difference of the two copies.
export const textStylesFromRuns = (regions, runs) => {
  const styles = {};
  for (const region of regions) {
    if (!region.textStyle) continue;
    const mine = (mode) =>
      runs.filter(
        (r) => r.mode === mode && typeof r.color === "string" && r.text.trim() && inside(r, region.textBox || region.box),
      );
    // Filled text gives the colour; lettering drawn as an outline over a
    // gradient (no filled text) uses its outline colour instead.
    const fills = mine("fill");
    const own = fills.length ? fills : mine("stroke");
    if (own.length === 0) continue;
    const main = own[own.length - 1].color;
    const mainRuns = own.filter((r) => r.color === main);
    const others = own.filter((r) => r.color !== main);
    let shadow = null;
    if (others.length && Math.abs(others.length - mainRuns.length) <= Math.max(2, mainRuns.length * 0.2)) {
      const color = others[0].color;
      const shadowRuns = others.filter((r) => r.color === color);
      shadow = {
        color,
        dxMm: Math.round((mean(shadowRuns.map((r) => r.xMm)) - mean(mainRuns.map((r) => r.xMm))) * 100) / 100,
        dyMm: Math.round((mean(shadowRuns.map((r) => r.yMm)) - mean(mainRuns.map((r) => r.yMm))) * 100) / 100,
      };
    }
    styles[region.id] = { color: main, shadow };
  }
  return styles;
};

// Average colour of the canvas inside box (mm) — used for gradient lettering,
// whose fill is revealed by a "glyphs" render (see renderPageArea).
const averageColour = (canvas, box, pxPerMm) => {
  const x = Math.max(0, Math.floor(box.x * pxPerMm));
  const y = Math.max(0, Math.floor(box.y * pxPerMm));
  const w = Math.max(1, Math.min(canvas.width - x, Math.round(box.width * pxPerMm)));
  const h = Math.max(1, Math.min(canvas.height - y, Math.round(box.height * pxPerMm)));
  const data = canvas.getContext("2d").getImageData(x, y, w, h).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
  }
  if (!n) return null;
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
};

/**
 * How to render the locked layers of a layout from its production PDF:
 * the trim box on the page, the clean "plate" options (no sample text or
 * sample pictures) and the "overlay" options (everything above the god
 * picture). Shared by the preview assets and the print export.
 * variant must include mapping.pageIndex/trimOriginMm, trim, regions.
 */
export const layerRenderOptions = (variant) => {
  const origin = variant.mapping?.trimOriginMm;
  if (!origin || !variant.trim?.widthMm) {
    throw new Error("Save the mapping (or refresh the import) before generating preview assets.");
  }
  const pageIndex = variant.mapping.pageIndex || 0;
  // A confirmed size correction scales the layout (trim, regions)
  // but never the source file: the original area of the PDF page is
  // rendered and stretched to the corrected trim, so artwork, cutline and
  // regions stay aligned.
  const corr = variant.geometryCorrection?.active ? variant.geometryCorrection : null;
  const sx = corr?.scaleX || 1;
  const sy = corr?.scaleY || 1;
  const box = { x: origin.x, y: origin.y, width: variant.trim.widthMm / sx, height: variant.trim.heightMm / sy };

  // Sample text areas (page mm). Artwork that only draws the sample text there
  // as shapes/images is removed from the plate; larger shapes (banners, boxes)
  // are not inside these areas and stay.
  const toPage = (b, pad) => ({
    x: origin.x + b.x / sx - pad,
    y: origin.y + b.y / sy - pad,
    width: b.width / sx + 2 * pad,
    height: b.height / sy + 2 * pad,
  });
  // Objects excluded in the mapping (guide labels such as "4X5 INCHES")
  // never print, whether they are text, shapes or images.
  const excluded = (variant.mapping?.excludedBoxes || []).map((b) => toPage(b, 0.5));
  const eraseBoxes = [
    ...(variant.regions || []).filter((r) => r.textStyle && (r.textBox || r.box)).map((r) => toPage(r.textBox || r.box, 1)),
    ...excluded,
  ];
  // Sample pictures are content, not template: the god picture and the
  // sample product photo are left out so customer images never show them
  // through transparent areas.
  const godRegion = (variant.regions || []).find((r) => r.role === "GOD_AREA");
  const eraseImageBoxes = [
    ...(variant.regions || []).filter((r) => r.role === "GOD_AREA" || r.binding === "productImage").map((r) => toPage(r.box, 1)),
    ...excluded,
  ];
  // Replacement / upscaled artwork: the PDF's own raster is left out of the
  // layers (transparent there) and the new artwork is drawn underneath.
  const artworkRegion = variant.assets?.artworkOverride
    ? (variant.regions || []).find((r) => r.role === (variant.assets.artworkOverride.regionRole || "BACKGROUND_AREA"))
    : null;
  const eraseArtworkBoxes = artworkRegion ? [toPage(artworkRegion.box, 1)] : [];
  const cleanOptions = {
    withoutText: true,
    eraseBoxes,
    eraseImageBoxes,
    eraseArtworkBoxes,
    ...(artworkRegion && { transparent: true }),
  };
  const overlayOptions = godRegion
    ? { ...cleanOptions, overlayAfter: toPage(godRegion.box, 1.5), transparent: true }
    : null;
  // "Bare" layers: also erase the optional sections (business-name strip,
  // side boxes) so a designer can remove them, or the app can restyle the
  // side boxes, without leaving the layout's box behind. Transparent where
  // nothing remains. Larger shapes (backgrounds) are not inside these boxes
  // and stay.
  const areas = sectionAreas(variant);
  const sectionBoxes = [...areas.name, ...areas.left, ...areas.right, ...areas.line1, ...areas.line2].map((b) => toPage(b, 0));
  // Side boxes: the whole drawn box goes, even when it is larger than the
  // mapped region (see eraseSections in pdfRender.js).
  const sideBoxes = [...areas.left, ...areas.right].map((b) => toPage(b, 0));
  const bareOptions = sectionBoxes.length
    ? {
        ...cleanOptions,
        eraseBoxes: [...eraseBoxes, ...sectionBoxes],
        eraseImageBoxes: [...eraseImageBoxes, ...sectionBoxes],
        eraseSections: sideBoxes,
        transparent: true,
      }
    : null;
  const overlayBareOptions = bareOptions && overlayOptions ? { ...bareOptions, overlayAfter: overlayOptions.overlayAfter } : null;
  // Normal Mode: the layout's own God picture — the artwork without sample
  // text, but WITH the sample God picture (and without guide labels).
  const godOptions = godRegion ? { withoutText: true, eraseBoxes, eraseImageBoxes: excluded, transparent: true } : null;
  // …and the same with the optional sections erased: inside a removed
  // section the God picture continues as it runs under the strip / box.
  const godBareOptions =
    godRegion && bareOptions ? { ...bareOptions, eraseImageBoxes: [...excluded, ...sectionBoxes], eraseArtworkBoxes: [] } : null;
  return { pageIndex, box, cleanOptions, overlayOptions, bareOptions, overlayBareOptions, godOptions, godBareOptions, scale: { x: sx, y: sy } };
};

/** variant must include assets.productionFile, mapping.pageIndex/trimOriginMm, trim, regions. */
export const generateLayoutAssets = async (variant) => {
  const pdfUrl = variant.assets?.productionFile;
  if (!pdfUrl) throw new Error("Save the mapping (or refresh the import) before generating preview assets.");
  const { pageIndex, box, cleanOptions, overlayOptions, bareOptions, overlayBareOptions, godOptions, godBareOptions, scale } =
    layerRenderOptions(variant);

  const previewPx = 900 / box.height;
  const platePx = Math.min(PLATE_PX_PER_MM, PLATE_MAX_PX / Math.max(box.width, box.height));

  const [{ canvas: previewCanvas }, { canvas: plateCanvas }, { runs }, overlay, { canvas: originalCanvas }] = await Promise.all([
    renderPageArea(pdfUrl, pageIndex, box, previewPx),
    renderPageArea(pdfUrl, pageIndex, box, platePx, cleanOptions),
    renderPageArea(pdfUrl, pageIndex, box, 2, { recordText: true }),
    // Everything the artwork paints above the god picture (frame, banner,
    // boxes…), transparent elsewhere — keeps the original stacking order.
    overlayOptions ? renderPageArea(pdfUrl, pageIndex, box, platePx, overlayOptions) : Promise.resolve(null),
    // The untouched artwork: slots the designer does not replace keep this.
    renderPageArea(pdfUrl, pageIndex, box, platePx),
  ]);
  const [plateBare, overlayBare, plateGod, plateGodBare] = await Promise.all([
    bareOptions ? renderPageArea(pdfUrl, pageIndex, box, platePx, bareOptions) : null,
    overlayBareOptions ? renderPageArea(pdfUrl, pageIndex, box, platePx, overlayBareOptions) : null,
    godOptions ? renderPageArea(pdfUrl, pageIndex, box, platePx, godOptions) : null,
    godBareOptions ? renderPageArea(pdfUrl, pageIndex, box, platePx, godBareOptions) : null,
  ]);

  // Text runs are measured on the source page: bring them into the
  // (possibly size-corrected) layout coordinates of the regions.
  const textStyles = textStylesFromRuns(
    variant.regions || [],
    runs.map((r) => ({ ...r, xMm: r.xMm * scale.x, yMm: r.yMm * scale.y })),
  );
  // Text regions without a flat colour use gradient lettering: take the
  // average of the gradient that fills them in the artwork.
  const gradientRegions = (variant.regions || []).filter((r) => r.textStyle && !textStyles[r.id]);
  if (gradientRegions.length) {
    const { canvas: glyphless } = await renderPageArea(pdfUrl, pageIndex, box, 2, { withoutText: "glyphs" });
    for (const region of gradientRegions) {
      const colour = averageColour(glyphless, region.textBox || region.box, 2);
      if (colour) textStyles[region.id] = { color: colour, shadow: null };
    }
  }

  const fd = new FormData();
  fd.append("preview", await canvasToPngBlob(previewCanvas), "preview.png");
  fd.append("plate", await canvasToPngBlob(plateCanvas), "plate.png");
  if (overlay) fd.append("overlay", await canvasToPngBlob(overlay.canvas), "overlay.png");
  fd.append("original", await canvasToPngBlob(originalCanvas), "original.png");
  if (plateBare) fd.append("plateBare", await canvasToPngBlob(plateBare.canvas), "plate-bare.png");
  if (overlayBare) fd.append("overlayBare", await canvasToPngBlob(overlayBare.canvas), "overlay-bare.png");
  if (plateGod) fd.append("plateGod", await canvasToPngBlob(plateGod.canvas), "plate-god.png");
  if (plateGodBare) fd.append("plateGodBare", await canvasToPngBlob(plateGodBare.canvas), "plate-god-bare.png");
  if (plateBare) fd.append("bareVersion", String(BARE_LAYER_VERSION));
  fd.append("textStyles", JSON.stringify(textStyles));
  return uploadLayoutAssets(variant._id, fd);
};
