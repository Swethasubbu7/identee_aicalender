// Checks a production PDF + its laser PDF BEFORE import, with the same code
// the Layouts page uses (importer, mapping builder, validator). Nothing is
// saved, uploaded or activated; no AI provider is used.
//
//   node scripts/checkProductionFiles.js <design.pdf> <laser.pdf> <mapping.json>
//
// mapping.json: { "cutType", "sizeCode", "pageIndex", "cutlineObjectId",
//   "registration": { "artObjectId", "cutlineObjectId" },
//   "regions": [{ "role", "objectIds": [...], "binding"? }] }
const fs = require("fs");
const config = require("../src/config");
const { SIZES } = require("../src/constants/calendar");
const { extractPdfLayout } = require("../src/services/layout/pdfImporter");
const { buildVariantGeometry } = require("../src/services/layout/mappingBuilder");
const { validateLayoutVariant } = require("../src/services/layout/layoutValidator");
const { cutlineDeviationMm, laserCutline } = require("../src/services/layout/cutlineCompare");

const MM_PER_IN = 25.4;
const TOL = config.GEOMETRY_MATCH_TOLERANCE_MM;
const r1 = (v) => Math.round(v * 10) / 10;
const near = (a, b, tol = TOL) => Math.abs(a - b) <= tol;
const GUIDE_LABEL = /\b\d+(\.\d+)?\s*X\s*\d+(\.\d+)?\s*INCH/i;

const results = [];
const add = (label, status, detail) => results.push({ label, status, detail });

(async () => {
  const [designFile, laserFile, mappingFile] = process.argv.slice(2);
  if (!designFile || !laserFile || !mappingFile) {
    console.error("Usage: node scripts/checkProductionFiles.js <design.pdf> <laser.pdf> <mapping.json>");
    process.exit(2);
  }
  const mapping = JSON.parse(fs.readFileSync(mappingFile, "utf8"));
  const size = SIZES[mapping.sizeCode];
  const format = { cutType: mapping.cutType, sizeCode: mapping.sizeCode, widthIn: size.widthIn, heightIn: size.heightIn, cake: size.cake };

  const design = await extractPdfLayout(fs.readFileSync(designFile));
  const laser = await extractPdfLayout(fs.readFileSync(laserFile));
  const page = design.pages[mapping.pageIndex || 0];
  const byId = new Map(page.objects.map((o) => [o.id, o]));

  // Pages
  add("Design file pages", design.pageCount === 1 ? "PASS" : "WARN", `${design.pageCount} page(s); page ${r1(page.widthMm)}×${r1(page.heightMm)} mm`);
  add("Laser file pages", laser.pageCount === 1 ? "PASS" : "WARN", `${laser.pageCount} page(s); page ${r1(laser.pages[0].widthMm)}×${r1(laser.pages[0].heightMm)} mm`);
  if (page.truncated) add("Import object limit", "WARN", `${page.objectCount} objects; only the first are kept for mapping (small shapes, e.g. text converted to curves)`);

  // Geometry with the real mapping builder (registration, re-basing).
  let geometry;
  try {
    geometry = buildVariantGeometry(page, mapping);
  } catch (err) {
    add("Mapping", "FAIL", err.message);
    return report();
  }
  const variant = { cutType: mapping.cutType, sizeCode: mapping.sizeCode, ...geometry };
  add(
    "Calendar size (cutline)",
    near(geometry.trim.widthMm, size.widthIn * MM_PER_IN) && near(geometry.trim.heightMm, size.heightIn * MM_PER_IN) ? "PASS" : "FAIL",
    `${r1(geometry.trim.widthMm)}×${r1(geometry.trim.heightMm)} mm vs ${size.widthIn}×${size.heightIn} in`,
  );
  add("Registration", "PASS", `cutline drawn ${geometry.registrationOffsetMm.x}, ${geometry.registrationOffsetMm.y} mm away; aligned by the twin mark`);
  add(
    "Artwork on the page",
    geometry.trimOriginMm.x >= 0 && geometry.trimOriginMm.y >= 0 && geometry.trimOriginMm.x + geometry.trim.widthMm <= page.widthMm ? "PASS" : "FAIL",
    `calendar at (${geometry.trimOriginMm.x}, ${geometry.trimOriginMm.y}) mm on a ${r1(page.widthMm)}×${r1(page.heightMm)} mm page`,
  );

  // Design cutline vs laser cutline
  const cut = byId.get(mapping.cutlineObjectId);
  const laserCut = laserCutline(laser.pages[0]);
  if (!laserCut) add("Laser cutline", "FAIL", "no closed path in the laser file");
  else {
    const dev = cutlineDeviationMm(cut, laserCut);
    add(
      "Laser cutline = design cutline",
      dev != null && dev <= 0.5 && near(cut.bbox.width, laserCut.bbox.width, 0.5) && near(cut.bbox.height, laserCut.bbox.height, 0.5) ? "PASS" : "FAIL",
      `laser ${r1(laserCut.bbox.width)}×${r1(laserCut.bbox.height)} mm, ${laserCut.segments} vs ${cut.segments} segments, max point deviation ${dev == null ? "n/a (different drawing)" : `${dev.toFixed(2)} mm`}`,
    );
  }

  // Cake
  const cake = geometry.regions.find((r) => r.role === "CAKE_MOUNT");
  if (cake) {
    const b = cake.box;
    const hIn = b.height / MM_PER_IN;
    const wIn = b.width / MM_PER_IN;
    add(
      "Cake size (H × W)",
      near(b.height, size.cake.heightIn * MM_PER_IN) && near(b.width, size.cake.widthIn * MM_PER_IN) ? "PASS" : "FAIL",
      `${r1(hIn * 10) / 10}×${r1(wIn * 10) / 10} in drawn vs catalogue ${size.cake.heightIn}×${size.cake.widthIn} in`,
    );
    const off = b.x + b.width / 2 - geometry.trim.widthMm / 2;
    add("Cake centred horizontally", Math.abs(off) <= TOL ? "PASS" : "FAIL", `${r1(off)} mm from centre`);
    add("Cake position", "INFO", `top at ${r1(b.y)} mm, ${r1(geometry.trim.heightMm - b.y - b.height)} mm above the bottom edge`);
    const god = geometry.regions.find((r) => r.role === "GOD_AREA");
    const art = geometry.regions.filter((r) => ["FRAME", "BACKGROUND_AREA"].includes(r.role));
    const overlapsArt = art.some((r) => r.box.y + r.box.height > b.y);
    add(
      "Cake arrangement",
      "INFO",
      overlapsArt ? "cake OVERLAPS the lower artwork (no separate cake space)" : "separate cake space",
    );
    if (god) add("Cake vs God area", god.box.y + god.box.height > b.y ? "WARN" : "PASS", god.box.y + god.box.height > b.y ? "God area reaches under the cake" : "God area ends above the cake");
    const laserCake = laser.pages[0].objects.find((o) => o.type === "path" && near(o.bbox.width, b.width, 0.5) && near(o.bbox.height, b.height, 0.5));
    if (laserCake && laserCut) {
      const dx = laserCake.bbox.x - laserCut.bbox.x - b.x;
      const dy = laserCake.bbox.y - laserCut.bbox.y - b.y;
      add("Laser cake = design cake", Math.hypot(dx, dy) <= 0.5 ? "PASS" : "FAIL", `offset ${r1(dx)}, ${r1(dy)} mm`);
    }
  }

  // Text: live text or curves; guide labels
  for (const role of ["NAME_TEXT", "TEXT_LINE_1", "TEXT_LINE_2"]) {
    const m = (mapping.regions || []).find((r) => r.role === role);
    if (!m) continue;
    const objs = m.objectIds.map((id) => byId.get(id)).filter(Boolean);
    const texts = objs.filter((o) => o.type === "text");
    add(
      `${role} is live text`,
      texts.length ? "PASS" : "WARN",
      texts.length ? texts.map((t) => `"${t.text.split("\n")[0].slice(0, 40)}" ${t.fontName} ${r1(t.fontSizePt)} pt`).join("; ") : "no text object — converted to curves (the app draws its own text there)",
    );
  }
  const excludedIds = new Set(mapping.excludedObjectIds || []);
  const labels = page.objects.filter((o) => o.type === "text" && GUIDE_LABEL.test(o.text));
  const unexcluded = labels.filter((l) => !excludedIds.has(l.id));
  add(
    "Guide labels in the design file",
    unexcluded.length ? "FAIL" : "PASS",
    labels.length
      ? labels.map((l) => `"${l.text}" (${l.id}) ${excludedIds.has(l.id) ? "excluded from print" : "NOT excluded — would print"}`).join(", ")
      : "none",
  );
  const laserLabels = laser.pages[0].objects.filter((o) => o.type === "text");
  add(
    "Text in the supplied laser file",
    laserLabels.length ? "WARN" : "PASS",
    laserLabels.length
      ? `${laserLabels.map((l) => `"${l.text}"`).join(", ")} — not used: the app makes its own laser file from the cutline + cake`
      : "none",
  );

  // Raster artwork resolution
  const images = page.objects.filter((o) => o.type === "image" && o.imageWidthPx);
  for (const im of images) {
    const dpi = Math.round(Math.min(im.imageWidthPx / (im.bbox.width / MM_PER_IN), im.imageHeightPx / (im.bbox.height / MM_PER_IN)));
    const fullBoard = im.bbox.width >= geometry.trim.widthMm * 0.9 && im.bbox.height >= geometry.trim.heightMm * 0.9;
    add(
      `Raster ${im.id}${fullBoard ? " (whole artwork flattened in one image)" : ""}`,
      dpi >= config.EXPORT_FALLBACK_DPI * 0.95 ? "PASS" : dpi >= 150 ? "WARN" : "FAIL",
      `${im.imageWidthPx}×${im.imageHeightPx} px over ${r1(im.bbox.width)}×${r1(im.bbox.height)} mm = ${dpi} DPI (target ${config.EXPORT_FALLBACK_DPI})`,
    );
  }

  // Validator (same rules as the Layouts page)
  // Font choice and frame PNG export are steps of the Layouts page, not file
  // defects: reported as TODO. Everything else is a real failure.
  const SETUP_STEPS = ["TEXT_STYLE", "FRAME_ASSET"];
  const validation = validateLayoutVariant(variant, { format, profile: null, toleranceMm: TOL });
  const failing = validation.results.filter((x) => x.stage === "STRUCTURE" && x.status !== "PASS");
  for (const r of failing) add(`Validator ${r.code}`, SETUP_STEPS.includes(r.code) ? "TODO" : r.status, r.message);
  const fileFails = failing.filter((r) => r.status === "FAIL" && !SETUP_STEPS.includes(r.code));
  add("Validator structure result", fileFails.length ? "FAIL" : "PASS", fileFails.length ? "cannot be activated" : "passes once the Layouts-page steps (TODO) are done");
  report();
})().catch((err) => {
  console.error("Check failed:", err);
  process.exit(1);
});

function report() {
  for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.label} — ${r.detail}`);
  const fails = results.filter((r) => r.status === "FAIL").length;
  const warns = results.filter((r) => r.status === "WARN" || r.status === "TODO").length;
  console.log(`\n${fails} fail, ${warns} warn → ${fails ? "NOT READY — do not activate" : warns ? "importable as draft; review warnings" : "ready to import"}`);
}
