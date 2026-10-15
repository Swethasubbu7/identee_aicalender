// Special Die-Cut admin workflow, end to end, with generated PDFs and
// in-memory models: upload (design + laser) → analyse → suggested mapping →
// size correction (confirm / undo) → artwork quality (replacement vs
// upscaled preview) → validation → mock AI (2 designs) → print + laser PDF.
// Also: CDR uploads. No database, no network, no real AI.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

global.fetch = async () => {
  throw new Error("Network is blocked in tests");
};

const CalendarFormat = require("../src/models/CalendarFormat");
const LayoutFamily = require("../src/models/LayoutFamily");
const LayoutVariant = require("../src/models/LayoutVariant");
const ProductionProfile = require("../src/models/ProductionProfile");
const ctrl = require("../src/controllers/productionLayout.controller");
const { validateLayoutVariant } = require("../src/services/layout/layoutValidator");
const { proposeCorrection, applyCorrection } = require("../src/services/layout/geometryCorrection");
const { extractPdfLayout, extractRasterAt } = require("../src/services/layout/pdfImporter");
const { isCdr, convertCdrToPdf } = require("../src/services/layout/cdrConverter");
const { buildPrintPdf, buildCutlinePdf, PAGE_MARGIN_MM } = require("../src/services/export/calendarPdf");
const { runPrintCheck } = require("../src/services/export/printCheck");
const { shapeDistanceMm } = require("../src/services/layout/pathGeometry");
const { buildArtworkGuide } = require("../src/services/ai/layoutReference");
const { specialArtworkPrompt } = require("../src/services/ai/calendarPrompts");
const { CALENDAR_FORMATS } = require("../src/constants/calendar");

const MM = 72 / 25.4;
// A designer's file that is slightly undersized (like SPL-001): 302.5 × 456.3 mm.
const W = 302.5;
const H = 456.3;
const CAKE = { x: (W - 127) / 2, y: H - 101.6, width: 127, height: 101.6 }; // flush with the bottom
const OUTLINE = `M 30 0 L ${W - 30} 0 C ${W - 10} 0 ${W} 10 ${W} 30 L ${W} ${H - 20} C ${W} ${H - 5} ${W - 5} ${H} ${W - 20} ${H} L 20 ${H} C 5 ${H} 0 ${H - 5} 0 ${H - 20} L 0 30 C 0 10 10 0 30 0 Z`;
const FORMAT = { _id: "6acf00000000000000000001", ...CALENDAR_FORMATS.find((f) => f.cutType === "special-die-cut" && f.sizeCode === "12x18") };
const PRODUCTION_DIR = path.join(__dirname, "..", "src", "uploads", "production");
const written = [];
const near = (a, b, tol = 0.1) => Math.abs(a - b) <= tol;

// ---- in-memory models ----------------------------------------------------------
const lean = (v) => ({ lean: async () => v, then: (ok, no) => Promise.resolve(v).then(ok, no) });
CalendarFormat.findOne = () => lean(FORMAT);
CalendarFormat.findById = () => lean(FORMAT);
// No production profile confirmed (artwork changes re-run validation).
ProductionProfile.findOne = () => lean(null);
ProductionProfile.findById = () => lean(null);
LayoutFamily.findOne = async () => null;
LayoutFamily.create = async (doc) => ({ _id: "6acf00000000000000000002", ...doc });
let stored = null;
LayoutVariant.findOne = async () => null;
LayoutVariant.findById = async () => stored;
LayoutVariant.prototype.save = async function save() {
  stored = this;
  return this;
};

const call = (handler, req) =>
  new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
        return this;
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
const putFile = (name, buf) => {
  fs.mkdirSync(PRODUCTION_DIR, { recursive: true });
  const p = path.join(PRODUCTION_DIR, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${name}`);
  fs.writeFileSync(p, buf);
  written.push(p, path.join(ctrl.IMPORT_DIR, `${path.basename(p)}.objects.json`));
  return p;
};
test.after(() => {
  for (const f of written) fs.rmSync(f, { force: true });
  if (stored?.assets?.artworkOverride?.path) fs.rmSync(path.join(__dirname, "..", "src", stored.assets.artworkOverride.path), { force: true });
});

// ---- the designer's files (CorelDRAW-like) ---------------------------------------
// Page = the calendar; the cutline and a copy of the cake are drawn beside
// it; the artwork is one flattened image; the business name is letter
// shapes; text line 1 is live text on a bar; text line 2 is letter shapes;
// a "4X5 INCHES" guide label sits above the cake.
const designPdf = async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([W * MM, H * MM]);
  const png = await sharp({ create: { width: 900, height: 1357, channels: 3, background: "#d9a441" } }).png().toBuffer();
  page.drawImage(await doc.embedPng(png), { x: 0, y: 0, width: W * MM, height: H * MM });
  const at = (x, y, w, h, opts) => page.drawRectangle({ x: x * MM, y: (H - y - h) * MM, width: w * MM, height: h * MM, ...opts });
  // Business name: 14 letter shapes (12 × 15 mm) in one row.
  for (let i = 0; i < 14; i += 1) at(40 + i * 16, 262, 12, 15, { color: rgb(0.1, 0.15, 0.3) });
  // Text line 1: a bar + live text.
  at(60, 312, 182, 7, { color: rgb(0.06, 0.2, 0.05) });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText("T-SHIRT, SHIRT, DENIM", { x: 70 * MM, y: (H - 318) * MM, size: 10, font, color: rgb(1, 1, 1) });
  // Text line 2: two rows of small letter shapes.
  for (let i = 0; i < 20; i += 1) at(90 + i * 6, 323, 4, 3, { color: rgb(0.17, 0.18, 0.2) });
  for (let i = 0; i < 8; i += 1) at(130 + i * 6, 329.5, 4, 3, { color: rgb(0.17, 0.18, 0.2) });
  // Guide label + cake on the artwork; cutline and cake twin beside the page.
  page.drawText("4X5 INCHES", { x: 130 * MM, y: (H - CAKE.y + 3) * MM, size: 18, font });
  at(CAKE.x, CAKE.y, CAKE.width, CAKE.height, { borderColor: rgb(0.17, 0.18, 0.2), borderWidth: 0.6 });
  const off = 440;
  page.drawSvgPath(OUTLINE, { x: off * MM, y: H * MM, scale: MM, borderColor: rgb(0.17, 0.18, 0.2), borderWidth: 0.6 });
  at(off + CAKE.x, CAKE.y, CAKE.width, CAKE.height, { borderColor: rgb(0.17, 0.18, 0.2), borderWidth: 0.6 });
  return Buffer.from(await doc.save());
};
const laserPdf = async () => {
  const doc = await PDFDocument.create();
  const pageH = 500;
  const page = doc.addPage([340 * MM, pageH * MM]);
  page.drawSvgPath(OUTLINE, { x: 10 * MM, y: (pageH - 10) * MM, scale: MM, borderColor: rgb(1, 0, 1), borderWidth: 0.5 });
  page.drawRectangle({ x: (10 + CAKE.x) * MM, y: (pageH - 10 - CAKE.y - CAKE.height) * MM, width: CAKE.width * MM, height: CAKE.height * MM, borderColor: rgb(0, 0, 0), borderWidth: 0.5 });
  return Buffer.from(await doc.save());
};

// ---- 1. upload → analysis → suggested mapping ----------------------------------------
let suggestion = null;
test("upload: design + laser imported as a DRAFT; cutline, cake, artwork, name, lines and label are suggested", async () => {
  const design = putFile("productionPdf.pdf", await designPdf());
  const laser = putFile("laserPdf.pdf", await laserPdf());
  const res = await call(ctrl.importProductionPdf, {
    files: { productionPdf: [{ path: design, originalname: "spl 12x18.pdf" }], laserPdf: [{ path: laser, originalname: "laser.pdf" }] },
    body: { familyCode: "TEST-SPL", cutType: "special-die-cut", sizeCode: "12x18" },
    user: { userId: "6acf00000000000000000003" },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(stored.status, "DRAFT");
  const page = stored.importSummary.pages[0];
  assert.equal(page.analysis.detected.cutline, "AUTO");
  assert.ok(page.analysis.registration, "cutline beside the page, aligned by the cake twin");
  suggestion = page.suggestedMapping;
  const role = (r) => suggestion.regions.find((x) => x.role === r);
  assert.ok(suggestion.cutlineObjectId);
  assert.equal(suggestion.excludedObjectIds.length, 1); // "4X5 INCHES"
  assert.equal(role("CAKE_MOUNT").confidence, "HIGH");
  assert.equal(role("BACKGROUND_AREA").confidence, "HIGH");
  assert.equal(role("NAME_TEXT").objectIds.length, 14); // the letter shapes
  assert.equal(role("TEXT_LINE_1").binding, "productList");
  assert.equal(role("TEXT_LINE_1").objectIds.length, 2); // text + bar
  assert.equal(role("TEXT_LINE_2").binding, "address");
  assert.equal(role("TEXT_LINE_2").objectIds.length, 28); // both rows of letter shapes
  assert.equal(role("NAME_TEXT").textStyle.fontFamily, "Helvetica-Bold"); // the file's font, flagged in notes
  assert.ok(suggestion.notes.length);
});

test("mapping: the suggestion saves; the size mismatch is reported, never silently fixed", async () => {
  const res = await call(ctrl.saveMapping, { params: { id: "x" }, body: { pageIndex: 0, ...suggestion } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(near(stored.trim.widthMm, W) && near(stored.trim.heightMm, H)); // as drawn
  assert.equal(stored.laserCheck.cutlineDeviationMm, 0);
  const r = validateLayoutVariant(stored.toObject(), { format: FORMAT, profile: null, toleranceMm: 2 });
  const fails = r.results.filter((x) => x.stage === "STRUCTURE" && x.status === "FAIL").map((x) => x.code);
  assert.deepEqual(fails.sort(), ["ARTWORK_RESOLUTION", "TRIM_SIZE"]);
});

// ---- 2. size correction -----------------------------------------------------------------
test("correction: proposal shows the difference; nothing changes until confirmed", async () => {
  const before = stored.cutline.path;
  const got = await call(ctrl.getCorrection, { params: { id: "x" } });
  assert.equal(got.status, 200);
  const p = got.body.proposal;
  assert.deepEqual(p.targetTrim, { widthMm: 304.8, heightMm: 457.2 });
  assert.ok(near(p.diffMm.width, 2.3) && near(p.diffMm.height, 0.9));
  assert.equal(p.allowed, true);
  const refused = await call(ctrl.applyGeometryCorrection, { params: { id: "x" }, body: {} });
  assert.equal(refused.status, 400);
  assert.equal(stored.cutline.path, before);
});

test("correction: applied on confirmation — cutline, artwork and text scale together, the cake keeps its size", async () => {
  const version = stored.version;
  const res = await call(ctrl.applyGeometryCorrection, { params: { id: "x" }, body: { confirm: true }, user: { userId: "admin" } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual({ ...stored.toObject().trim }, { widthMm: 304.8, heightMm: 457.2 });
  assert.equal(stored.version, version + 1);
  assert.equal(stored.status, "DRAFT");
  const cake = stored.regions.find((r) => r.role === "CAKE_MOUNT").box;
  assert.ok(near(cake.width, 127) && near(cake.height, 101.6)); // physical size unchanged
  assert.ok(near(cake.x + cake.width / 2, 304.8 / 2, 0.2)); // still centred
  assert.ok(near(cake.y + cake.height, 457.2, 0.5)); // still at the bottom
  // The outline is the drawn shape, scaled — not a new shape.
  const scaled = applyCorrection({ trim: { widthMm: W, heightMm: H }, cutline: { path: OUTLINE }, regions: [] }, stored.geometryCorrection);
  assert.ok(shapeDistanceMm(stored.cutline.path, scaled.cutline.path) <= 0.05);
  const r = validateLayoutVariant(stored.toObject(), { format: FORMAT, profile: null, toleranceMm: 2 });
  const code = (c) => r.results.find((x) => x.code === c);
  assert.equal(code("TRIM_SIZE").status, "PASS");
  assert.equal(code("GEOMETRY_CORRECTION").status, "PASS");
  assert.equal(code("LASER_MATCH").status, "PASS"); // the laser file matches the source as drawn
  assert.match(code("LASER_MATCH").message, /corrected outline/);
  assert.equal(code("CAKE_MOUNT_SIZE").status, "PASS");
});

test("correction: re-saving the mapping keeps it; undo restores the file as drawn", async () => {
  await call(ctrl.saveMapping, { params: { id: "x" }, body: { pageIndex: 0, ...suggestion } });
  assert.deepEqual({ ...stored.toObject().trim }, { widthMm: 304.8, heightMm: 457.2 });
  const res = await call(ctrl.undoGeometryCorrection, { params: { id: "x" } });
  assert.equal(res.status, 200);
  assert.ok(near(stored.trim.widthMm, W) && near(stored.trim.heightMm, H));
  assert.equal(stored.geometryCorrection, null);
  await call(ctrl.applyGeometryCorrection, { params: { id: "x" }, body: { confirm: true } });
});

test("correction: a large difference is not a routine correction", () => {
  const p = proposeCorrection({ widthMm: 290, heightMm: 457.2 }, FORMAT);
  assert.equal(p.allowed, false);
  assert.match(p.reason, /not a routine correction/);
});

// ---- 3. artwork quality -------------------------------------------------------------------
test("artwork: the embedded image is read exactly as embedded (for a labelled upscale)", async () => {
  const pdf = fs.readFileSync(path.join(__dirname, "..", "src", stored.assets.productionFile));
  const raster = stored.artworkRasters[0];
  const object = JSON.parse(fs.readFileSync(path.join(ctrl.IMPORT_DIR, stored.assets.importDataFile), "utf8")).pages[0].objects.find((o) => o.id === raster.objectId);
  const px = await extractRasterAt(pdf, 0, object.bbox);
  assert.deepEqual([px.width, px.height], [900, 1357]);
});

test("enhance: the plan shows source px, effective DPI, the 300-DPI target and what AI could reach", async () => {
  const res = await call(ctrl.getEnhancePlan, { params: { id: "x" } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const p = res.body.plan;
  assert.deepEqual([p.source.widthPx, p.source.heightPx], [900, 1357]);
  assert.ok(p.source.dpi < 80);
  assert.ok(p.target.widthPx >= 3560 && p.target.heightPx >= 5370);
  assert.equal(p.smooth.detailDpi, p.source.dpi); // smoothing adds no detail
  assert.equal(p.ai.available, false); // AI is off
  assert.ok(p.ai.detailDpi > p.source.dpi && p.ai.detailDpi < 300); // 4K output is not 300 DPI at 12×18
});

test("enhance: AI enhancement refuses while AI is off (no request)", async () => {
  const res = await call(ctrl.enhanceArtwork, { params: { id: "x" }, body: { method: "ai" } });
  assert.equal(res.status, 409);
  assert.match(res.body.message, /switched off/);
});

test("artwork: an upscaled preview is a candidate, compared, approved, and still does NOT pass", async () => {
  const res = await call(ctrl.enhanceArtwork, { params: { id: "x" }, body: { method: "smooth" } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(stored.assets.artworkOverride, null); // nothing used until approved
  assert.equal(stored.assets.artworkCandidate.kind, "upscaled");
  assert.ok(stored.assets.artworkSource, "original kept for comparison");
  written.push(path.join(__dirname, "..", "src", stored.assets.artworkSource));
  const ok = await call(ctrl.approveArtworkCandidate, { params: { id: "x" } });
  assert.equal(ok.status, 200);
  // The stored validation is refreshed at once — and still fails honestly.
  assert.equal(stored.validation.status, "FAIL");
  assert.match(ok.body.message, /adds no real detail/);
  assert.match(ok.body.message, /upload a high-resolution source/);
  const o = stored.assets.artworkOverride;
  assert.equal(o.kind, "upscaled");
  assert.ok(o.widthPx >= 3570 && o.heightPx >= 5380);
  const r = validateLayoutVariant(stored.toObject(), { format: FORMAT, profile: null, toleranceMm: 2 });
  const art = r.results.find((x) => x.code === "ARTWORK_RESOLUTION");
  assert.equal(art.status, "FAIL");
  assert.match(art.message, /NOT genuine 300-DPI detail/);
});

test("artwork: a replacement with different proportions is refused (never stretched against the cutline)", async () => {
  const geometry = JSON.stringify({ trim: stored.trim, cutline: stored.cutline, regions: stored.regions });
  const wrong = putFile("wrong.png", await sharp({ create: { width: 4000, height: 4000, channels: 3, background: "#c8963e" } }).png().toBuffer());
  const res = await call(ctrl.uploadArtwork, { params: { id: "x" }, file: { path: wrong } });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /proportions differ/);
  assert.equal(JSON.stringify({ trim: stored.trim, cutline: stored.cutline, regions: stored.regions }), geometry);
});

test("artwork: a genuine 300-DPI replacement passes, and the layout validates", async () => {
  const geometry = JSON.stringify({ trim: stored.trim, cutline: stored.cutline, regions: stored.regions });
  const hi = putFile("artwork.png", await sharp({ create: { width: 3580, height: 5390, channels: 3, background: "#c8963e" } }).png({ compressionLevel: 9 }).toBuffer());
  const res = await call(ctrl.uploadArtwork, { params: { id: "x" }, file: { path: hi } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(stored.assets.artworkOverride.kind, "replacement");
  assert.equal(stored.validation.status, "PASS", "validation refreshed after the upload");
  assert.match(res.body.message, /Validation: PASS/);
  assert.equal(JSON.stringify({ trim: stored.trim, cutline: stored.cutline, regions: stored.regions }), geometry, "geometry unchanged");
  const r = validateLayoutVariant(stored.toObject(), { format: FORMAT, profile: null, toleranceMm: 2 });
  assert.equal(r.results.find((x) => x.code === "ARTWORK_RESOLUTION").status, "PASS");
  assert.deepEqual(r.results.filter((x) => x.stage === "STRUCTURE" && x.status === "FAIL").map((x) => x.code), []);
  assert.equal(r.status, "PASS");
});

// ---- 4. generate (mock AI) → print check → print PDF + laser file --------------------------
test("generate: the AI guide uses the corrected cutline; 2 designs; print + laser files share one geometry", async () => {
  const variant = stored.toObject();
  const guide = await buildArtworkGuide(variant);
  assert.equal(guide.aspectRatio, "2:3");
  const prompt = specialArtworkPrompt({ theme: null, prompt: "", hasTemplateReference: false, cakeOverlapsArtwork: true });
  assert.match(prompt, /does not have to sit in a circle, oval or rectangle/);
  // Two mock AI designs (one picture each) at the 2K size the provider returns.
  const designs = [0, 1].map((i) => ({ composition: "FULL_ARTWORK", background: `mock-${i}`, size: { width: 1792, height: 2688 } }));
  assert.equal(designs.length, 2);
  for (const d of designs) {
    const check = runPrintCheck({
      variant,
      format: FORMAT,
      settings: { dpi: 300, dpiConfirmed: false, pending: [] },
      images: { background: { size: d.size, box: { x: 0, y: 0, width: 304.8, height: 457.2 } } },
      content: { businessName: "" },
      options: { showBusinessName: false, showTextLine1: false, showTextLine2: false }, // optional sections off
    });
    assert.equal(check.checks.find((c) => c.id === "god").status, "PASS");
    assert.equal(check.checks.find((c) => c.id === "name").status, "PASS");
  }
  const settings = { dpi: 300, cutlineStrokeMm: 0.1, cutlineColor: null, pending: [] };
  const art = await sharp({ create: { width: 3600, height: 5400, channels: 3, background: "#fff" } }).jpeg({ quality: 40 }).toBuffer();
  const print = await PDFDocument.load(await buildPrintPdf({ variant, artwork: { buffer: art, mimeType: "image/jpeg" }, settings }));
  const tb = print.getPage(0).getTrimBox();
  assert.ok(near(tb.width / MM, 304.8, 0.05) && near(tb.height / MM, 457.2, 0.05));
  const laser = await extractPdfLayout(Buffer.from(await buildCutlinePdf({ variant, settings })));
  const paths = laser.pages[0].objects.filter((o) => o.type === "path");
  const cut = paths.sort((a, b) => b.bbox.width * b.bbox.height - a.bbox.width * a.bbox.height)[0];
  assert.ok(near(cut.bbox.width, 304.8, 0.15) && near(cut.bbox.height, 457.2, 0.15));
  assert.ok(near(cut.bbox.x, PAGE_MARGIN_MM, 0.1));
  assert.ok(shapeDistanceMm(cut.path, variant.cutline.path) <= 0.05, "laser = the approved corrected outline");
  const cake = variant.regions.find((r) => r.role === "CAKE_MOUNT").box;
  const lc = paths.find((o) => near(o.bbox.width, 127, 0.3) && near(o.bbox.height, 101.6, 0.3));
  assert.ok(near(lc.bbox.x - PAGE_MARGIN_MM, cake.x, 0.15) && near(lc.bbox.y - PAGE_MARGIN_MM, cake.y, 0.15));
  assert.equal(laser.pages[0].objects.filter((o) => o.type === "text").length, 0); // no "4X5 INCHES"
});

// ---- 5. CorelDRAW uploads ------------------------------------------------------------------
const fakeCdr = () => {
  // A ZIP package with CorelDRAW's content/root.dat entry (stored, no compression).
  const name = Buffer.from("content/root.dat");
  const data = Buffer.from("RIFF....CDR");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const cdStart = 30 + name.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(46 + name.length, 12);
  eocd.writeUInt32LE(cdStart, 16);
  return Buffer.concat([local, name, data, central, name, eocd]);
};

test("CDR: recognised; without a converter the upload gets a clear message (no crash, no files left)", async () => {
  const buf = fakeCdr();
  assert.equal(isCdr(buf, "x.zip"), true);
  assert.equal(isCdr(fs.readFileSync(__filename), "a.js"), false);
  const saved = process.env.CDR_CONVERTER;
  delete process.env.CDR_CONVERTER;
  const cdr = putFile("productionPdf.cdr", buf);
  const res = await call(ctrl.importProductionPdf, {
    files: { productionPdf: [{ path: cdr, originalname: "spl 12x18.cdr" }] },
    body: { familyCode: "TEST-CDR", cutType: "special-die-cut", sizeCode: "12x18" },
    user: { userId: "u" },
  });
  if (saved !== undefined) process.env.CDR_CONVERTER = saved;
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "CDR_CONVERTER_MISSING");
  assert.match(res.body.message, /export a PDF from CorelDRAW/);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(fs.existsSync(cdr), false);
});

test("CDR: a converter that fails is reported clearly", async () => {
  const cdr = putFile("x.cdr", fakeCdr());
  process.env.CDR_CONVERTER = process.execPath; // node.exe: runs, but makes no PDF
  await assert.rejects(convertCdrToPdf(cdr), (e) => e.code === "CDR_CONVERT_FAILED");
  delete process.env.CDR_CONVERTER;
});
