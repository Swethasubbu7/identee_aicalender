// Print / laser export regression for every approved (VALIDATED or ACTIVE) production layout.
// READ-ONLY on the database and on disk; never calls an AI provider.
//
//   npm run check:exports
//
// For each layout it builds the print PDF (with a test artwork at the exact
// pixel size the browser export renders) and the laser PDF with the real
// export code, reads them back and checks:
//   - page size = trim + 10 mm margin, TrimBox = the calendar size
//   - cutline in the laser file: closed, same size and position as the layout
//   - cake rectangle: catalogue size (H × W), position, centred horizontally
//   - print raster DPI actually embedded in the PDF
//   - DPI of the raster artwork INSIDE the production file (the real limit:
//     a vector re-render cannot add detail to an embedded low-DPI image)
//   - layout validation (structure + production) and the print check
require("dotenv").config();
const fs = require("fs");
const mongoose = require("mongoose");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");

const config = require("../src/config");
const LayoutVariant = require("../src/models/LayoutVariant");
const CalendarFormat = require("../src/models/CalendarFormat");
const ProductionProfile = require("../src/models/ProductionProfile");
require("../src/models/LayoutFamily");
const { exportSettings, buildPrintPdf, buildCutlinePdf, PAGE_MARGIN_MM } = require("../src/services/export/calendarPdf");
const { runPrintCheck } = require("../src/services/export/printCheck");
const { validateLayoutVariant } = require("../src/services/layout/layoutValidator");
const { extractPdfLayout } = require("../src/services/layout/pdfImporter");
const path = require("path");
// Same folder as controllers/productionLayout.controller.js (not served publicly).
const IMPORTS_DIR = path.join(__dirname, "..", "src", "storage", "imports");

const MM_PER_IN = 25.4;
const PT_PER_MM = 72 / MM_PER_IN;
// Same cap as the browser export (frontend/src/utils/aiCalendarCompose.js).
const MAX_PRINT_PIXELS = 35_000_000;
const TOL = config.GEOMETRY_MATCH_TOLERANCE_MM;

const near = (a, b, tol = TOL) => Math.abs(a - b) <= tol;
const r1 = (v) => Math.round(v * 10) / 10;

const exportPxPerMm = (variant, dpi) => {
  const area = variant.trim.widthMm * variant.trim.heightMm;
  let pxPerMm = dpi / MM_PER_IN;
  if (area * pxPerMm * pxPerMm > MAX_PRINT_PIXELS) pxPerMm = Math.sqrt(MAX_PRINT_PIXELS / area);
  return pxPerMm;
};

// Raster images inside the production file that fall on the calendar.
const sourceRasterDpi = (variant) => {
  const name = variant.assets?.importDataFile;
  const file = name && path.join(IMPORTS_DIR, path.basename(name));
  if (!file || !fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const page = data.pages?.[variant.mapping?.pageIndex || 0];
  const images = (page?.objects || []).filter((o) => o.type === "image" && o.imageWidthPx && o.bbox?.width > 20);
  return images.map((o) => ({
    sizeMm: `${r1(o.bbox.width)}×${r1(o.bbox.height)}`,
    px: `${o.imageWidthPx}×${o.imageHeightPx}`,
    dpi: Math.round(Math.min(o.imageWidthPx / (o.bbox.width / MM_PER_IN), o.imageHeightPx / (o.bbox.height / MM_PER_IN))),
  }));
};

const checkLayout = async (variant) => {
  const out = { code: variant.familyId?.code, cutType: variant.cutType, size: variant.sizeCode, checks: [] };
  const add = (label, ok, detail, warnOnly = false) =>
    out.checks.push({ label, status: ok ? "PASS" : warnOnly ? "WARN" : "FAIL", detail });

  const format = await CalendarFormat.findById(variant.formatId).lean();
  const settings = await exportSettings(variant);
  const profile = variant.productionProfileId ? await ProductionProfile.findById(variant.productionProfileId).lean() : null;

  // Layout validation, as on the Layouts page.
  const validation = validateLayoutVariant(variant, { format, profile, toleranceMm: TOL });
  const failed = validation.results.filter((r) => r.status === "FAIL").map((r) => r.message || r.rule);
  add("Layout validation (structure)", validation.status === "PASS", failed.join("; ") || "all structure rules pass");

  // Size vs catalogue.
  const wMm = format.widthIn * MM_PER_IN;
  const hMm = format.heightIn * MM_PER_IN;
  add(
    "Trim = catalogue size",
    near(variant.trim.widthMm, wMm) && near(variant.trim.heightMm, hMm),
    `${r1(variant.trim.widthMm)}×${r1(variant.trim.heightMm)} mm vs ${r1(wMm)}×${r1(hMm)} mm`,
  );

  // Print PDF with a test artwork at the browser's export resolution.
  const pxPerMm = exportPxPerMm(variant, settings.dpi);
  const pxW = Math.round(variant.trim.widthMm * pxPerMm);
  const pxH = Math.round(variant.trim.heightMm * pxPerMm);
  const artwork = await sharp({ create: { width: pxW, height: pxH, channels: 3, background: "#ffffff" } }).jpeg({ quality: 60 }).toBuffer();
  const printBytes = await buildPrintPdf({ variant, artwork: { buffer: artwork, mimeType: "image/jpeg" }, settings });
  const printDoc = await PDFDocument.load(printBytes);
  const pp = printDoc.getPage(0);
  const { width: pw, height: ph } = pp.getSize();
  const tb = pp.getTrimBox();
  add(
    "Print PDF page = trim + margin",
    near(pw / PT_PER_MM, variant.trim.widthMm + 2 * PAGE_MARGIN_MM, 0.1) && near(ph / PT_PER_MM, variant.trim.heightMm + 2 * PAGE_MARGIN_MM, 0.1),
    `${r1(pw / PT_PER_MM)}×${r1(ph / PT_PER_MM)} mm`,
  );
  add(
    "Print PDF TrimBox = calendar",
    near(tb.width / PT_PER_MM, variant.trim.widthMm, 0.1) && near(tb.height / PT_PER_MM, variant.trim.heightMm, 0.1),
    `${r1(tb.width / PT_PER_MM)}×${r1(tb.height / PT_PER_MM)} mm at ${r1(tb.x / PT_PER_MM)} mm margin`,
  );
  const exportDpi = Math.round(pxW / (variant.trim.widthMm / MM_PER_IN));
  add(
    `Print raster ≥ ${settings.dpi} DPI${settings.dpiConfirmed ? "" : " (working value)"}`,
    exportDpi >= settings.dpi - 1,
    `${pxW}×${pxH} px embedded = ${exportDpi} DPI`,
    true,
  );
  const source = sourceRasterDpi(variant);
  if (source === null) add("Production-file artwork DPI", false, "import data missing — cannot measure", true);
  else if (!source.length) add("Production-file artwork DPI", true, "no embedded raster artwork (vector only)");
  else {
    const low = Math.min(...source.map((s) => s.dpi));
    add(
      `Production-file artwork ≥ ${settings.dpi} DPI`,
      low >= settings.dpi * 0.95,
      source.map((s) => `${s.px} px over ${s.sizeMm} mm = ${s.dpi} DPI`).join("; "),
      true,
    );
  }

  // Laser PDF read back with the importer.
  const laserBytes = await buildCutlinePdf({ variant, settings });
  const laser = await extractPdfLayout(Buffer.from(laserBytes));
  const lp = laser.pages[0];
  const strokes = lp.objects.filter((o) => o.type === "path" && o.paint !== "clip");
  const cut = strokes.find((o) => near(o.bbox.width, variant.trim.widthMm, 1) && near(o.bbox.height, variant.trim.heightMm, 1));
  add(
    "Laser cutline closed, trim size, at margin",
    Boolean(cut && cut.closed && near(cut.bbox.x, PAGE_MARGIN_MM, 0.5) && near(cut.bbox.y, PAGE_MARGIN_MM, 0.5)),
    cut ? `${r1(cut.bbox.width)}×${r1(cut.bbox.height)} mm at (${r1(cut.bbox.x)}, ${r1(cut.bbox.y)}), ${cut.segments} segments` : "cutline not found",
  );
  add(
    "Laser page = print page",
    near(lp.widthMm, pw / PT_PER_MM, 0.1) && near(lp.heightMm, ph / PT_PER_MM, 0.1),
    `${r1(lp.widthMm)}×${r1(lp.heightMm)} mm`,
  );

  // Cake: catalogue size H × W, laser position = layout position, centred.
  const cakeRegion = (variant.regions || []).find((r) => r.role === "CAKE_MOUNT");
  const cake = format.cake || {};
  if (!cakeRegion) add("Cake mount mapped", false, "no CAKE_MOUNT region");
  else {
    const b = cakeRegion.box;
    add(
      "Cake = catalogue size (H × W)",
      near(b.height, cake.heightIn * MM_PER_IN) && near(b.width, cake.widthIn * MM_PER_IN),
      `${r1(b.height / MM_PER_IN * 100) / 100}×${r1(b.width / MM_PER_IN * 100) / 100} in drawn vs ${cake.heightIn}×${cake.widthIn} in (${cake.status})`,
    );
    const centreOff = b.x + b.width / 2 - variant.trim.widthMm / 2;
    add("Cake centred horizontally", Math.abs(centreOff) <= TOL, `${r1(centreOff)} mm from centre`);
    add("Cake inside the calendar", b.y >= 0 && b.y + b.height <= variant.trim.heightMm + 0.5, `${r1(variant.trim.heightMm - b.y - b.height)} mm above the bottom edge`);
    const lc = strokes.find((o) => o !== cut && near(o.bbox.width, b.width, 0.5) && near(o.bbox.height, b.height, 0.5));
    add(
      "Laser cake = layout cake position",
      Boolean(lc && near(lc.bbox.x - PAGE_MARGIN_MM, b.x, 0.5) && near(lc.bbox.y - PAGE_MARGIN_MM, b.y, 0.5)),
      lc ? `(${r1(lc.bbox.x - PAGE_MARGIN_MM)}, ${r1(lc.bbox.y - PAGE_MARGIN_MM)}) mm` : "not found",
    );
  }

  // Print check (what the designer sees). Test god picture sized for 300 DPI
  // in the God area; real uploads are checked with their own pixel size.
  const godBox = (variant.regions || []).find((r) => r.role === "GOD_AREA")?.box;
  const godTest = godBox && {
    size: { width: Math.round((godBox.width / MM_PER_IN) * 300), height: Math.round((godBox.height / MM_PER_IN) * 300) },
    box: godBox,
  };
  const check = runPrintCheck({
    variant,
    format,
    settings,
    images: godTest ? { god: godTest } : {},
    content: { businessName: "சோதனை வணிகம்", productList: "பட்டு சேலைகள்", rightBoxText: "" },
    options: {},
  });
  add(
    "Print Check runs",
    check.status !== "FAIL",
    `${check.status}: ${check.checks.filter((c) => c.status !== "PASS").map((c) => `${c.label} ${c.status}`).join("; ") || "all pass"}`,
    true,
  );
  return out;
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const variants = await LayoutVariant.find({ status: { $in: ["VALIDATED", "ACTIVE"] } }).populate("familyId", "code").sort({ cutType: 1, sizeCode: 1 });
  console.log(`Approved production layouts (VALIDATED/ACTIVE): ${variants.length}  (AI provider: ${config.AI_IMAGE_PROVIDER})\n`);
  const counts = { PASS: 0, WARN: 0, FAIL: 0 };
  for (const v of variants) {
    const res = await checkLayout(v);
    console.log(`■ ${res.code}  ${res.cutType} ${res.size}`);
    for (const c of res.checks) {
      counts[c.status] += 1;
      console.log(`   ${c.status.padEnd(4)} ${c.label} — ${c.detail}`);
    }
    console.log("");
  }
  console.log(`Totals: ${counts.PASS} pass, ${counts.WARN} warn, ${counts.FAIL} fail`);
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error("Export regression failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
