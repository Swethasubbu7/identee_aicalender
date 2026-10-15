// Flexible import of designer PDFs: generated test files with vector paths,
// raster images, live text, flattened artwork, nested forms, rotated pages,
// cutlines in pieces, different page sizes and matching / mismatching laser
// PDFs. Uses the real importer, analysis, mapping builder and validator.
// No database, no network, no AI.
const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");

const { extractPdfLayout, PdfReadError } = require("../src/services/layout/pdfImporter");
const {
  analysePage,
  analyseLaserPage,
  compareDesignLaser,
  laserCheckFor,
  importVerdict,
  pairLaserPage,
} = require("../src/services/layout/pdfAnalysis");
const { buildVariantGeometry, MappingError } = require("../src/services/layout/mappingBuilder");
const { joinPaths, shapeDistanceMm } = require("../src/services/layout/pathGeometry");
const { validateLayoutVariant } = require("../src/services/layout/layoutValidator");
const { CALENDAR_FORMATS } = require("../src/constants/calendar");

const MM = 72 / 25.4;
const FORMAT = CALENDAR_FORMATS.find((f) => f.cutType === "die-cut" && f.sizeCode === "12x18");
const W = 304.8;
const H = 457.2;
// A die-cut outline (rounded corners, curved top) in mm from its top-left.
const CUTLINE =
  `M 30 0 L ${W - 30} 0 C ${W - 10} 0 ${W} 10 ${W} 30 L ${W} ${H - 20} C ${W} ${H - 5} ${W - 5} ${H} ${W - 20} ${H} ` +
  `L 20 ${H} C 5 ${H} 0 ${H - 5} 0 ${H - 20} L 0 30 C 0 10 10 0 30 0 Z`;
const CAKE = { x: (W - 127) / 2, y: H - 101.6 - 10, width: 127, height: 101.6 };
const near = (a, b, tol = 0.1) => Math.abs(a - b) <= tol;

// Draw helpers (mm, top-left page origin).
const drawOutline = (page, pageH, d, ox, oy, extra = {}) =>
  page.drawSvgPath(d, { x: ox * MM, y: (pageH - oy) * MM, scale: MM, borderColor: rgb(1, 0, 1), borderWidth: 0.25, ...extra });
const drawRect = (page, pageH, b, ox, oy) =>
  page.drawRectangle({
    x: (ox + b.x) * MM,
    y: (pageH - oy - b.y - b.height) * MM,
    width: b.width * MM,
    height: b.height * MM,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.5,
  });
const png = (w, h, colour = "#c96") => sharp({ create: { width: w, height: h, channels: 3, background: colour } }).png().toBuffer();

const makeLaser = async ({ pageW = 340, pageH = 500, ox = 10, oy = 10, scale = 1, cake = true } = {}) => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([pageW * MM, pageH * MM]);
  drawOutline(page, pageH, CUTLINE, ox, oy, { scale: MM * scale });
  if (cake) drawRect(page, pageH, CAKE, ox, oy);
  return Buffer.from(await doc.save());
};

const firstPage = async (buf) => (await extractPdfLayout(buf)).pages[0];
const structure = (variant) => validateLayoutVariant(variant, { format: FORMAT, profile: null, toleranceMm: 2 });
const result = (r, code) => r.results.find((x) => x.code === code);
const variantOf = (geometry, mapping, laserCheck) => ({ cutType: "die-cut", sizeCode: "12x18", ...geometry, mapping, laserCheck, assets: {} });

// ---- 1. vector design (CorelDRAW-like) + matching laser ----------------------
test("vector design on an A2 page with live text + image: cutline, cake and text detected; laser matches", async () => {
  const pageW = 420;
  const pageH = 594;
  const ox = 50;
  const oy = 60;
  const doc = await PDFDocument.create();
  const page = doc.addPage([pageW * MM, pageH * MM]);
  const img = await doc.embedPng(await png(600, 900));
  page.drawImage(img, { x: ox * MM, y: (pageH - oy - H) * MM, width: W * MM, height: H * MM });
  drawOutline(page, pageH, CUTLINE, ox, oy);
  drawRect(page, pageH, CAKE, ox, oy);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText("BUSINESS NAME", { x: (ox + 60) * MM, y: (pageH - oy - 300) * MM, size: 40, font });
  const design = await firstPage(Buffer.from(await doc.save()));
  const laser = await firstPage(await makeLaser());

  const a = analysePage(design, FORMAT);
  assert.equal(a.sizeMm.width, 420);
  assert.equal(a.content, "mixed");
  assert.equal(a.artworkFlattened, true); // one image + live text on top
  assert.deepEqual(a.detected, { cutline: "AUTO", cake: "AUTO", text: "AUTO", artwork: "AUTO", godArea: "MANUAL" });
  assert.equal(a.text.live[0].text, "BUSINESS NAME");
  assert.ok(a.rasters[0].dpi >= 49 && a.rasters[0].dpi <= 51); // 600 px over 12 in

  const l = analyseLaserPage(laser, FORMAT);
  const cmp = compareDesignLaser(design, a, l);
  assert.ok(cmp.cutlineDeviationMm <= 0.05);
  assert.equal(cmp.suggestedAlignment.method, "cake");
  assert.equal(importVerdict(a, l, cmp).level, "AUTO");

  const mapping = {
    cutlineObjectId: a.cutline.candidates[0],
    regions: [{ role: "CAKE_MOUNT", objectIds: [a.cake.onArtwork[0]] }],
  };
  const g = buildVariantGeometry(design, mapping);
  assert.ok(near(g.trim.widthMm, W) && near(g.trim.heightMm, H));
  const cake = g.regions[0].box;
  assert.ok(near(cake.x, CAKE.x, 0.3) && near(cake.y, CAKE.y, 0.3));
  const check = laserCheckFor(g, l);
  assert.ok(check.cutlineDeviationMm <= 0.05);
  assert.ok(Math.abs(check.cakeOffsetMm.x) <= 0.3 && Math.abs(check.cakeOffsetMm.y) <= 0.3);
  const r = structure(variantOf(g, { cutlineSource: "design" }, check));
  assert.equal(result(r, "LASER_MATCH").status, "PASS");
  assert.equal(result(r, "LASER_CAKE").status, "PASS");
});

// ---- 2. flattened raster design + laser --------------------------------------
const flattenedDesign = async ({ pageW = 330, pageH = 480, ox = 12.5, oy = 11.4 } = {}) => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([pageW * MM, pageH * MM]);
  const img = await doc.embedPng(await png(1200, 1800, "#7a3"));
  page.drawImage(img, { x: ox * MM, y: (pageH - oy - H) * MM, width: W * MM, height: H * MM });
  return { page: await firstPage(Buffer.from(await doc.save())), ox, oy };
};

test("flattened single-image PDF: imports; cutline and cake come from the laser PDF", async () => {
  const { page: design, ox, oy } = await flattenedDesign();
  const laser = await firstPage(await makeLaser());
  const a = analysePage(design, FORMAT);
  assert.equal(a.content, "flattened");
  assert.equal(a.detected.cutline, "MISSING");
  assert.equal(a.detected.text, "MANUAL");
  assert.equal(a.lowestDpi, 100);
  const l = analyseLaserPage(laser, FORMAT);
  const cmp = compareDesignLaser(design, a, l);
  assert.equal(cmp.suggestedAlignment.method, "artwork-bounds");
  assert.equal(cmp.suggestedAlignment.exact, false);
  assert.equal(cmp.cakeFromLaser, true);
  const v = importVerdict(a, l, cmp);
  assert.equal(v.level, "MANUAL");
  assert.equal(a.detectedWithLaser.cutline, "LASER");
  assert.equal(a.detectedWithLaser.cake, "LASER");

  const image = design.objects.find((o) => o.type === "image");
  const mapping = {
    cutlineSource: "laser",
    laserCutlineObjectIds: [l.cutline.id],
    laserAlignment: { method: "artwork-bounds", designObjectIds: [image.id] },
    regions: [
      { role: "BACKGROUND_AREA", objectIds: [image.id] },
      { role: "CAKE_MOUNT", objectIds: [l.cake.id], source: "laser" },
    ],
  };
  const g = buildVariantGeometry(design, mapping, laser);
  assert.ok(near(g.trim.widthMm, W) && near(g.trim.heightMm, H));
  assert.deepEqual(g.trimOriginMm, { x: ox, y: oy }); // laser outline sits on the artwork
  assert.equal(shapeDistanceMm(g.cutline.path, CUTLINE) <= 0.05, true); // the approved outline, unchanged
  const cake = g.regions.find((r) => r.role === "CAKE_MOUNT");
  assert.equal(cake.source, "laser");
  assert.ok(near(cake.box.x, CAKE.x, 0.3) && near(cake.box.y, CAKE.y, 0.3));
  assert.equal(g.artworkRasters[0].dpi, 100);

  // Not verified until an admin confirms the overlay …
  let r = structure(variantOf(g, { cutlineSource: "laser", cutlineAlignment: g.cutlineAlignment }, laserCheckFor(g, l)));
  assert.equal(result(r, "CUTLINE_ALIGNMENT").status, "FAIL");
  assert.equal(result(r, "LASER_MATCH").status, "PASS");
  // … then it is.
  const confirmed = buildVariantGeometry(design, { ...mapping, laserAlignment: { ...mapping.laserAlignment, confirmed: true } }, laser);
  r = structure(variantOf(confirmed, { cutlineSource: "laser", cutlineAlignment: confirmed.cutlineAlignment }, laserCheckFor(confirmed, l)));
  assert.equal(result(r, "CUTLINE_ALIGNMENT").status, "PASS");
});

test("laser placement by a manual offset, and refused when the artwork bounds do not fit", async () => {
  const { page: design } = await flattenedDesign();
  const laser = await firstPage(await makeLaser());
  const l = analyseLaserPage(laser, FORMAT);
  const g = buildVariantGeometry(
    design,
    { cutlineSource: "laser", laserCutlineObjectIds: [l.cutline.id], laserAlignment: { method: "manual", offsetMm: { x: 12.5, y: 11.4 } }, regions: [] },
    laser,
  );
  assert.deepEqual(g.trimOriginMm, { x: 12.5, y: 11.4 });
  assert.equal(g.cutlineAlignment.exact, false);
  // A small artwork (e.g. a logo) cannot place the cutline.
  const doc = await PDFDocument.create();
  const page = doc.addPage([300 * MM, 300 * MM]);
  page.drawImage(await doc.embedPng(await png(100, 100)), { x: 10, y: 10, width: 100, height: 100 });
  const small = await firstPage(Buffer.from(await doc.save()));
  assert.throws(
    () =>
      buildVariantGeometry(
        small,
        { cutlineSource: "laser", laserCutlineObjectIds: [l.cutline.id], laserAlignment: { method: "artwork-bounds", designObjectIds: [small.objects[0].id] }, regions: [] },
        laser,
      ),
    MappingError,
  );
});

test("flattened PDF without any cutline: draft from the artwork bounds, blocked from activation", async () => {
  const { page: design, ox, oy } = await flattenedDesign();
  const image = design.objects.find((o) => o.type === "image");
  const g = buildVariantGeometry(design, { cutlineSource: "none", artworkObjectIds: [image.id], regions: [] });
  assert.equal(g.cutline.path, null);
  assert.deepEqual(g.trimOriginMm, { x: ox, y: oy });
  const r = structure(variantOf(g, { cutlineSource: "none" }, null));
  assert.equal(result(r, "CUTLINE_PRESENT").status, "FAIL");
  assert.match(result(r, "CUTLINE_PRESENT").message, /Draft without a cutline/);
  assert.equal(r.status, "FAIL");
});

// ---- 3. nested form XObject with its own matrix --------------------------------
test("artwork inside a form XObject with a /Matrix is placed where it is drawn", async () => {
  // Hand-written PDF: a 100 × 100 mm form, shifted by its /Matrix (+20 mm x),
  // drawn with an extra cm (+10 mm x, +5 mm y). pdf.js repairs the xref.
  const mm = (v) => (v * MM).toFixed(3);
  const content = `q 1 0 0 1 ${mm(10)} ${mm(5)} cm /F1 Do Q`;
  const form = `0 0 1 RG 1 w ${mm(5)} ${mm(5)} ${mm(50)} ${mm(30)} re S`;
  const pdf = [
    "%PDF-1.7",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    `2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj`,
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${mm(200)} ${mm(150)}] /Resources << /XObject << /F1 5 0 R >> >> /Contents 4 0 R >> endobj`,
    `4 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
    `5 0 obj << /Type /XObject /Subtype /Form /BBox [0 0 ${mm(100)} ${mm(100)}] /Matrix [1 0 0 1 ${mm(20)} 0] /Length ${form.length} >> stream\n${form}\nendstream endobj`,
    "trailer << /Root 1 0 R >>",
    "%%EOF",
  ].join("\n");
  const page = await firstPage(Buffer.from(pdf, "latin1"));
  const rect = page.objects.find((o) => o.type === "path");
  // x: 10 (cm) + 20 (Matrix) + 5 = 35 mm; top = 150 − (5 + 5 + 30) = 110 mm
  assert.ok(near(rect.bbox.x, 35, 0.2), JSON.stringify(rect.bbox));
  assert.ok(near(rect.bbox.y, 110, 0.2), JSON.stringify(rect.bbox));
  assert.ok(near(rect.bbox.width, 50, 0.2) && near(rect.bbox.height, 30, 0.2));
});

test("artwork placed through an embedded page (form) keeps its position", async () => {
  const src = await PDFDocument.create();
  const sp = src.addPage([360 * MM, 520 * MM]);
  drawOutline(sp, 520, CUTLINE, 20, 25);
  const doc = await PDFDocument.create();
  const [embedded] = await doc.embedPdf(await src.save());
  const page = doc.addPage([500 * MM, 700 * MM]);
  page.drawPage(embedded, { x: 40 * MM, y: 60 * MM });
  const design = await firstPage(Buffer.from(await doc.save()));
  const a = analysePage(design, FORMAT);
  assert.equal(a.detected.cutline, "AUTO");
  const cut = design.objects.find((o) => o.id === a.cutline.candidates[0]);
  // x: 40 + 20; top: 700 − 60 − 520 + 25
  assert.ok(near(cut.bbox.x, 60, 0.2) && near(cut.bbox.y, 145, 0.2), JSON.stringify(cut.bbox));
});

// ---- 4. rotated page ------------------------------------------------------------
test("a landscape page with /Rotate 90 is read as displayed (portrait calendar found)", async () => {
  // The calendar is drawn sideways on a landscape page; /Rotate 90 shows it upright.
  const doc = await PDFDocument.create();
  const pageW = 520;
  const pageH = 360;
  const page = doc.addPage([pageW * MM, pageH * MM]);
  // Rotated outline: swap axes of the cutline (x' = y, y' = W − x) so that a
  // 90° clockwise display rotation shows the normal upright outline.
  const sideways = CUTLINE.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, x, y) => `${Number(y)} ${(W - Number(x)).toFixed(3)}`);
  drawOutline(page, pageH, sideways, 30, 20);
  page.setRotation(degrees(90));
  const design = await firstPage(Buffer.from(await doc.save()));
  assert.equal(design.rotation, 90);
  assert.ok(near(design.widthMm, 360, 0.1) && near(design.heightMm, 520, 0.1));
  const a = analysePage(design, FORMAT);
  assert.equal(a.detected.cutline, "AUTO");
  const cut = design.objects.find((o) => o.id === a.cutline.candidates[0]);
  assert.ok(shapeDistanceMm(cut.path, CUTLINE) <= 0.1, "upright outline after rotation");
});

// ---- 5. cutline in pieces --------------------------------------------------------
test("a cutline drawn as several open pieces is suggested and joined into one outline", async () => {
  const doc = await PDFDocument.create();
  const pageH = 500;
  const page = doc.addPage([340 * MM, pageH * MM]);
  // Two open halves (the second drawn backwards) of the outline.
  drawOutline(page, pageH, `M 30 0 L ${W - 30} 0 C ${W - 10} 0 ${W} 10 ${W} 30 L ${W} ${H - 20} C ${W} ${H - 5} ${W - 5} ${H} ${W - 20} ${H} L 20 ${H}`, 10, 10);
  drawOutline(page, pageH, `M 30 0 C 10 0 0 10 0 30 L 0 ${H - 20} C 0 ${H - 5} 5 ${H} 20 ${H}`, 10, 10);
  const design = await firstPage(Buffer.from(await doc.save()));
  const a = analysePage(design, FORMAT);
  assert.equal(a.detected.cutline, "CHOOSE");
  assert.equal(a.cutline.pieces.length, 2);
  const g = buildVariantGeometry(design, { cutlineObjectIds: a.cutline.pieces, regions: [] });
  assert.ok(near(g.trim.widthMm, W) && near(g.trim.heightMm, H));
  assert.ok(shapeDistanceMm(g.cutline.path, CUTLINE) <= 0.05);
  assert.match(g.cutline.path, /Z$/);
  // One piece alone is open and refused.
  assert.throws(() => buildVariantGeometry(design, { cutlineObjectIds: [a.cutline.pieces[0]], regions: [] }), /not closed/);
});

test("joinPaths: reorders and reverses pieces; refuses gaps", () => {
  const joined = joinPaths(["M 0 0 L 100 0", "M 0 50 L 0 0", "M 100 0 L 100 50 L 0 50"]);
  assert.equal(shapeDistanceMm(joined, "M 0 0 L 100 0 L 100 50 L 0 50 Z"), 0);
  assert.throws(() => joinPaths(["M 0 0 L 100 0", "M 0 60 L 100 60"]), /gap/);
});

// ---- 6. laser mismatches, page pairing, size differences -------------------------
test("a laser cutline 3% larger fails the laser match; a conflicting design outline is flagged", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([340 * MM, 500 * MM]);
  drawOutline(page, 500, CUTLINE, 10, 10);
  const design = await firstPage(Buffer.from(await doc.save()));
  const laser = await firstPage(await makeLaser({ scale: 1.03, pageW: 360, pageH: 520 }));
  const a = analysePage(design, FORMAT);
  const l = analyseLaserPage(laser, FORMAT);
  const cmp = compareDesignLaser(design, a, l);
  assert.ok(cmp.cutlineDeviationMm > 5);
  assert.equal(importVerdict(a, l, cmp).text.includes("differ"), true);
  assert.equal(a.detectedWithLaser.cutline, "CONFLICT");
  const g = buildVariantGeometry(design, { cutlineObjectId: a.cutline.candidates[0], regions: [] });
  const r = structure(variantOf(g, { cutlineSource: "design" }, laserCheckFor(g, l)));
  assert.equal(result(r, "LASER_MATCH").status, "FAIL");
});

test("laser pages are paired by size, not only by page number", async () => {
  const other = CALENDAR_FORMATS.find((f) => f.cutType === "die-cut" && f.sizeCode === "15x24");
  const doc = await PDFDocument.create();
  // Page 1: a 15×24 outline; page 2: the 12×18 outline.
  const p1 = doc.addPage([420 * MM, 650 * MM]);
  p1.drawRectangle({ x: 10 * MM, y: 10 * MM, width: 381 * MM, height: 609.6 * MM, borderColor: rgb(0, 0, 0), borderWidth: 0.5 });
  const p2 = doc.addPage([340 * MM, 500 * MM]);
  drawOutline(p2, 500, CUTLINE, 10, 10);
  const laser = await extractPdfLayout(Buffer.from(await doc.save()));
  assert.equal(pairLaserPage(laser, 0, FORMAT).index, 1); // 12×18 design ↔ laser page 2
  assert.equal(pairLaserPage(laser, 0, other).index, 0);
});

test("a near-size outline is offered (never resized) and the validator reports the real size", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([360 * MM, 520 * MM]);
  page.drawRectangle({ x: 10 * MM, y: 10 * MM, width: 296 * MM, height: 470 * MM, borderColor: rgb(0, 0, 0), borderWidth: 0.5 });
  const design = await firstPage(Buffer.from(await doc.save()));
  const a = analysePage(design, FORMAT);
  assert.equal(a.cutline.candidates.length, 0);
  assert.equal(a.cutline.nearMisses.length, 1);
  assert.equal(a.detected.cutline, "CHOOSE");
  const g = buildVariantGeometry(design, { cutlineObjectId: a.cutline.nearMisses[0].id, regions: [] });
  assert.ok(near(g.trim.widthMm, 296, 0.2)); // stored as drawn
  assert.equal(result(structure(variantOf(g, {}, null)), "TRIM_SIZE").status, "FAIL");
});

test("text converted to curves is reported as needing manual mapping", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([340 * MM, 500 * MM]);
  drawOutline(page, 500, CUTLINE, 10, 10);
  // "Lettering" drawn as filled shapes only.
  for (let i = 0; i < 6; i += 1) page.drawRectangle({ x: (60 + i * 12) * MM, y: 200 * MM, width: 8 * MM, height: 14 * MM, color: rgb(0.5, 0, 0) });
  const a = analysePage(await firstPage(Buffer.from(await doc.save())), FORMAT);
  assert.equal(a.detected.text, "MANUAL");
  assert.equal(a.content, "vector");
});

// ---- 7. files that genuinely cannot be processed -----------------------------------
test("a non-PDF file is refused with a clear reason; a CorelDRAW file renamed .pdf too", async () => {
  await assert.rejects(extractPdfLayout(Buffer.from("this is not a pdf")), (e) => e instanceof PdfReadError && e.code === "PDF_INVALID");
  const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]); // .cdr = zip container
  await assert.rejects(extractPdfLayout(zipHeader), (e) => e instanceof PdfReadError && /not a valid PDF/.test(e.message));
});

test("an empty page imports but is marked as having no artwork", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([300 * MM, 400 * MM]);
  const a = analysePage(await firstPage(Buffer.from(await doc.save())), FORMAT);
  assert.equal(a.content, "empty");
  assert.equal(importVerdict(a, null, null).level, "CANNOT");
});

// ---- 8. cutline beside the page + a filled die shape on the artwork --------------
test("stroked cutline drawn OFF the page + filled die shape on the art: the stroke is chosen automatically", async () => {
  const doc = await PDFDocument.create();
  const pageH = H; // page = exactly the calendar (as in CorelDRAW 12×18 exports)
  const page = doc.addPage([W * MM, pageH * MM]);
  // Filled die-shaped backing on the artwork (same outline).
  page.drawSvgPath(CUTLINE, { x: 0, y: pageH * MM, scale: MM, color: rgb(1, 1, 1) });
  // The real cutline, drawn 430 mm to the right — outside the page.
  drawOutline(page, pageH, CUTLINE, 430, 0);
  drawRect(page, pageH, CAKE, 0, 0); // cake on the artwork
  drawRect(page, pageH, CAKE, 430, 0); // its twin next to the cutline
  const design = await firstPage(Buffer.from(await doc.save()));
  const a = analysePage(design, FORMAT);
  assert.equal(a.cutline.candidates.length, 2);
  const first = design.objects.find((o) => o.id === a.cutline.candidates[0]);
  assert.equal(first.paint, "stroke");
  assert.ok(first.bbox.x > W); // off the page
  assert.equal(a.detected.cutline, "AUTO");
  assert.ok(a.registration, "cake twin aligns it");
  const g = buildVariantGeometry(design, { cutlineObjectId: first.id, registration: a.registration, regions: [] });
  assert.deepEqual(g.trimOriginMm, { x: 0, y: 0 }); // lands exactly on the artwork
});
