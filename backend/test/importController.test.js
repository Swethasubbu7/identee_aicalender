// Import → mapping through the real controllers (Layouts page flow), with
// in-memory stand-ins for the database models. Generated PDFs only; files
// written by the controllers are removed afterwards. No AI, no network.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { PDFDocument, rgb } = require("pdf-lib");

const CalendarFormat = require("../src/models/CalendarFormat");
const LayoutFamily = require("../src/models/LayoutFamily");
const LayoutVariant = require("../src/models/LayoutVariant");
const { importProductionPdf, saveMapping, uploadLaserPdf, IMPORT_DIR } = require("../src/controllers/productionLayout.controller");
const { validateLayoutVariant } = require("../src/services/layout/layoutValidator");
const { CALENDAR_FORMATS } = require("../src/constants/calendar");

const MM = 72 / 25.4;
const W = 304.8;
const H = 457.2;
const CAKE = { x: (W - 127) / 2, y: H - 111.6, width: 127, height: 101.6 };
const FORMAT = { _id: "6ace00000000000000000001", ...CALENDAR_FORMATS.find((f) => f.cutType === "die-cut" && f.sizeCode === "12x18") };
const PRODUCTION_DIR = path.join(__dirname, "..", "src", "uploads", "production");
const written = [];

// ---- in-memory models -----------------------------------------------------------
const lean = (v) => ({ lean: async () => v, then: (ok, no) => Promise.resolve(v).then(ok, no) });
CalendarFormat.findOne = () => lean(FORMAT);
CalendarFormat.findById = () => lean(FORMAT);
LayoutFamily.findOne = async () => null;
LayoutFamily.create = async (doc) => ({ _id: "6ace00000000000000000002", ...doc });
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
  const p = path.join(PRODUCTION_DIR, `${Date.now()}-${name}`);
  fs.writeFileSync(p, buf);
  written.push(p, path.join(IMPORT_DIR, `${path.basename(p)}.objects.json`));
  return p;
};

test.after(() => {
  for (const f of written) fs.rmSync(f, { force: true });
});

const flattenedPdf = async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([330 * MM, 480 * MM]);
  const png = await sharp({ create: { width: 900, height: 1350, channels: 3, background: "#3a7" } }).png().toBuffer();
  page.drawImage(await doc.embedPng(png), { x: 12 * MM, y: (480 - 11 - H) * MM, width: W * MM, height: H * MM });
  return Buffer.from(await doc.save());
};
const laserPdf = async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([340 * MM, 500 * MM]);
  page.drawRectangle({ x: 10 * MM, y: (500 - 10 - H) * MM, width: W * MM, height: H * MM, borderColor: rgb(1, 0, 1), borderWidth: 0.5 });
  page.drawRectangle({
    x: (10 + CAKE.x) * MM,
    y: (500 - 10 - CAKE.y - CAKE.height) * MM,
    width: CAKE.width * MM,
    height: CAKE.height * MM,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.5,
  });
  return Buffer.from(await doc.save());
};

test("flattened design + laser PDF: imported as a DRAFT with findings, then mapped from the laser file", async () => {
  const design = putFile("productionPdf.pdf", await flattenedPdf());
  const laser = putFile("laserPdf.pdf", await laserPdf());
  const imported = await call(importProductionPdf, {
    files: { productionPdf: [{ path: design }], laserPdf: [{ path: laser }] },
    body: { familyCode: "TEST-FLAT", cutType: "die-cut", sizeCode: "12x18" },
    user: { userId: "6ace00000000000000000003" },
  });
  assert.equal(imported.status, 201, JSON.stringify(imported.body));
  assert.equal(stored.status, "DRAFT");
  const summary = stored.importSummary;
  const a = summary.pages[0].analysis;
  assert.equal(a.content, "flattened");
  assert.equal(a.detected.cutline, "MISSING");
  assert.equal(summary.laser.analysis.cutlineSizeOk, true);
  assert.equal(summary.laser.comparison.suggestedAlignment.method, "artwork-bounds");
  assert.equal(summary.verdict.level, "MANUAL");
  assert.match(stored.assets.laserFile, /^\/uploads\/production\/.+laserPdf\.pdf$/);

  // Mapping: cutline and cake from the laser PDF, placed on the artwork bounds.
  const image = JSON.parse(fs.readFileSync(path.join(IMPORT_DIR, stored.assets.importDataFile), "utf8")).pages[0].objects.find((o) => o.type === "image");
  const laserCake = summary.laser.analysis.cake.id;
  const mapped = await call(saveMapping, {
    params: { id: "x" },
    body: {
      pageIndex: 0,
      cutlineSource: "laser",
      laserCutlineObjectIds: [summary.laser.analysis.cutline.id],
      laserAlignment: { method: "artwork-bounds", designObjectIds: [image.id] },
      regions: [
        { role: "BACKGROUND_AREA", objectIds: [image.id] },
        { role: "CAKE_MOUNT", objectIds: [laserCake], source: "laser" },
      ],
    },
  });
  assert.equal(mapped.status, 200, JSON.stringify(mapped.body));
  assert.equal(stored.mapping.cutlineSource, "laser");
  assert.deepEqual(stored.mapping.trimOriginMm, { x: 12, y: 11 });
  assert.equal(stored.laserCheck.cutlineDeviationMm, 0);
  assert.ok(Math.abs(stored.laserCheck.cakeOffsetMm.x) < 0.1);
  const cake = stored.regions.find((r) => r.role === "CAKE_MOUNT");
  assert.equal(cake.source, "laser");
  assert.ok(Math.abs(cake.box.y - CAKE.y) < 0.1);

  const r = validateLayoutVariant(stored.toObject(), { format: FORMAT, profile: null, toleranceMm: 2 });
  const code = (c) => r.results.find((x) => x.code === c);
  assert.equal(code("LASER_MATCH").status, "PASS");
  assert.equal(code("LASER_CAKE").status, "PASS");
  assert.equal(code("CUTLINE_ALIGNMENT").status, "FAIL"); // until an admin confirms the overlay
  assert.equal(code("ARTWORK_RESOLUTION").status, "FAIL"); // 900 px over 12 in = 75 DPI
  assert.equal(r.status, "FAIL");
});

test("adding a laser PDF later sends the layout back to DRAFT for re-checking", async () => {
  const laser = putFile("laserPdf.pdf", await laserPdf());
  stored.status = "VALIDATED";
  const res = await call(uploadLaserPdf, { params: { id: "x" }, file: { path: laser } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(stored.status, "DRAFT");
  assert.equal(stored.laserCheck, null);
  assert.ok(stored.importSummary.laser.analysis.cutline);
});

test("an unreadable upload is refused with its reason and leaves no files behind", async () => {
  const bad = putFile("productionPdf.pdf", Buffer.from("PK\u0003\u0004 CorelDRAW zip, not a PDF"));
  const res = await call(importProductionPdf, {
    files: { productionPdf: [{ path: bad }] },
    body: { familyCode: "TEST-BAD", cutType: "die-cut", sizeCode: "12x18" },
    user: { userId: "6ace00000000000000000003" },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "PDF_INVALID");
  assert.match(res.body.message, /not a valid PDF/);
  // removeQuietly is asynchronous; give it a moment.
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(fs.existsSync(bad), false);
});
