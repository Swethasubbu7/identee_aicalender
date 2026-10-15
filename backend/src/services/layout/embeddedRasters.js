// Pictures embedded in a layout's production PDF and their REAL resolution
// at print size — read from the import data saved with the production file.
// Used where the layout's own artwork prints unchanged (Normal Mode): a
// vector re-render at 300 DPI cannot add detail to a low-DPI embedded image.
const fs = require("fs");
const path = require("path");

const IMPORTS_DIR = path.join(__dirname, "..", "..", "storage", "imports");
const MM_PER_IN = 25.4;
const MIN_SIZE_MM = 20; // ignore small icons and marks
const r1 = (v) => Math.round(v * 10) / 10;

/** @returns [{ widthPx, heightPx, widthMm, heightMm, dpi }] or null when not measurable. */
const measureEmbeddedRasters = (variant) => {
  const name = variant?.assets?.importDataFile;
  const file = name && path.join(IMPORTS_DIR, path.basename(name));
  if (!file || !fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const page = data.pages?.[variant.mapping?.pageIndex || 0];
    return (page?.objects || [])
      .filter((o) => o.type === "image" && o.imageWidthPx && o.bbox?.width > MIN_SIZE_MM)
      .map((o) => ({
        widthPx: o.imageWidthPx,
        heightPx: o.imageHeightPx,
        widthMm: r1(o.bbox.width),
        heightMm: r1(o.bbox.height),
        dpi: Math.round(Math.min(o.imageWidthPx / (o.bbox.width / MM_PER_IN), o.imageHeightPx / (o.bbox.height / MM_PER_IN))),
      }));
  } catch {
    return null;
  }
};

module.exports = { measureEmbeddedRasters, IMPORTS_DIR };
