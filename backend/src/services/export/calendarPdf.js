// Printable files of a finished calendar design:
//
//   print PDF  — the artwork at the exact physical size of the calendar
//   laser PDF  — same size: the locked vector cutline and the cake mount
//                rectangle, as in the laser files the business uses
//
// Printer / laser values come from the ProductionProfile. While they are
// still pending (bleed, DPI, CMYK, cutline spot colour, stroke) the export is
// made with clearly flagged working values and lists them in `pending`.
const { PDFDocument, rgb, cmyk } = require("pdf-lib");
const config = require("../../config");
const ProductionProfile = require("../../models/ProductionProfile");

const PT_PER_MM = 72 / 25.4;
const NEEDS_CONFIRMATION = "Needs designer/printer confirmation";

const findProfile = async (variant) =>
  (variant.productionProfileId && (await ProductionProfile.findById(variant.productionProfileId))) ||
  (await ProductionProfile.findOne({ isDefault: true, $or: [{ cutTypes: { $size: 0 } }, { cutTypes: variant.cutType }] })) ||
  null;

/** Export settings for a layout + the list of values still pending. */
const exportSettings = async (variant) => {
  const profile = await findProfile(variant);
  const print = profile?.print || {};
  const laser = profile?.laser || {};
  const pending = [];
  if (!print.minDpi) pending.push(`Print resolution: using ${config.EXPORT_FALLBACK_DPI} DPI working value`);
  if (print.bleedMm == null) pending.push("Bleed: none added");
  if (!print.colorMode) pending.push("Colour mode: exported as RGB (CMYK conversion pending)");
  if (!laser.cutlineSpotName) pending.push("Cutline spot colour name");
  if (!laser.cutlineStrokeWidthMm) pending.push("Cutline stroke width: 0.1 mm hairline working value");
  return {
    dpi: print.minDpi || config.EXPORT_FALLBACK_DPI,
    dpiConfirmed: Boolean(print.minDpi),
    cutlineStrokeMm: laser.cutlineStrokeWidthMm || 0.1,
    cutlineSpotName: laser.cutlineSpotName || null,
    cutlineColor: laser.cutlineColor || null,
    bleedMm: print.bleedMm ?? null,
    safeMarginMm: print.safeMarginMm ?? null,
    colorMode: print.colorMode || null,
    pending: pending.map((p) => `${p} — ${NEEDS_CONFIRMATION}`),
  };
};

const pdfColour = (hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  // Working cutline colour while none is confirmed: 100% magenta.
  if (!m) return cmyk(0, 1, 0, 0);
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
};

const setMeta = (doc, variant, meta, role, pending) => {
  doc.setTitle(meta.title || "Calendar design");
  doc.setSubject(
    `${role} · ${variant.cutType} ${variant.sizeCode} · layout ${meta.familyCode || ""} · cake ${meta.cakeLabel || ""}`.trim(),
  );
  doc.setKeywords([role, ...pending]);
  doc.setCreator("IDENTEE AI Calendar Designer");
  doc.setProducer("IDENTEE AI Calendar Designer");
};

// White margin around the calendar on both files. Without it, cutline parts
// lying exactly on the trim edge (straight sides, bottom edge) sit on the page
// border and viewers / laser software clip them away. Both files use the same
// page geometry so they register 1:1; the TrimBox marks the real calendar.
const PAGE_MARGIN_MM = 10;

const pageGeometry = (variant) => {
  const margin = PAGE_MARGIN_MM * PT_PER_MM;
  const trimW = variant.trim.widthMm * PT_PER_MM;
  const trimH = variant.trim.heightMm * PT_PER_MM;
  return { margin, trimW, trimH, pageW: trimW + 2 * margin, pageH: trimH + 2 * margin };
};

/**
 * Print file: the composed artwork at the exact physical size of the
 * calendar, centred on the page; TrimBox = the calendar (no bleed until the
 * printer confirms one).
 * @param artwork  { buffer, mimeType } composed design at print resolution
 * @param meta     { title, familyCode, cakeLabel }
 */
const buildPrintPdf = async ({ variant, artwork, settings, meta = {} }) => {
  const doc = await PDFDocument.create();
  const { margin, trimW, trimH, pageW, pageH } = pageGeometry(variant);
  const image =
    artwork.mimeType === "image/png" ? await doc.embedPng(artwork.buffer) : await doc.embedJpg(artwork.buffer);
  const page = doc.addPage([pageW, pageH]);
  page.setTrimBox(margin, margin, trimW, trimH);
  page.drawImage(image, { x: margin, y: margin, width: trimW, height: trimH });
  setMeta(doc, variant, meta, "Print artwork", settings.pending);
  return doc.save();
};

/**
 * Laser file: same page geometry, the locked vector cutline and the cake
 * mount rectangle only (as in the laser files the business uses).
 */
const buildCutlinePdf = async ({ variant, settings, meta = {} }) => {
  const doc = await PDFDocument.create();
  const { margin, trimW, trimH, pageW, pageH } = pageGeometry(variant);
  const page = doc.addPage([pageW, pageH]);
  page.setTrimBox(margin, margin, trimW, trimH);
  const stroke = {
    x: margin,
    y: margin + trimH, // paths are stored in mm from the trim top-left
    scale: PT_PER_MM,
    borderColor: pdfColour(settings.cutlineColor),
    borderWidth: settings.cutlineStrokeMm, // scaled with the path → mm
  };
  if (variant.cutline?.path) page.drawSvgPath(variant.cutline.path, stroke);
  const cake = (variant.regions || []).find((r) => r.role === "CAKE_MOUNT");
  if (cake) {
    const { x, y, width, height } = cake.box;
    page.drawSvgPath(`M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`, stroke);
  }
  setMeta(doc, variant, meta, "Laser cutline + cake mount", settings.pending);
  return doc.save();
};

module.exports = { exportSettings, buildPrintPdf, buildCutlinePdf, NEEDS_CONFIRMATION, PAGE_MARGIN_MM };
