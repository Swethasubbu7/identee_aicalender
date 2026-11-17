// Business name editing after AI generation, and layout downloads.
// Mocks only: no database, no AI, no network.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SRC = path.join(__dirname, "..", "src");
const UPLOADS = path.join(SRC, "uploads");

const fakeRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    headersSent: false,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      this.headersSent = true;
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(buf) {
      this.body = buf;
      this.headersSent = true;
      return this;
    },
  };
  return res;
};
const quiet = async (fn) => {
  const { error } = console;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = error;
  }
};

// ---- business name style ------------------------------------------------------
test("name style: size kept as chosen (70–150 %), colour #RRGGBB, empty = as generated", () => {
  const { nameStyleOf } = require(path.join(SRC, "constants/typography"));
  assert.deepEqual(nameStyleOf({ size: 120, colour: "#7a1f1f" }), { size: 120, colour: "#7A1F1F" });
  assert.deepEqual(nameStyleOf({ size: 100 }), { size: 100 }); // 100 % replaces a Customise size
  assert.deepEqual(nameStyleOf({ size: 400 }), { size: 150 });
  assert.deepEqual(nameStyleOf({ size: 10 }), { size: 70 });
  assert.equal(nameStyleOf({ colour: "red; background:url(x)" }), null);
  assert.equal(nameStyleOf({}), null);
  assert.equal(nameStyleOf(null), null);
});

const REGIONS = [
  { id: "n", role: "NAME_TEXT", binding: "businessName" },
  { id: "l", role: "SIDE_BOX_LEFT", binding: "productList" },
  { id: "r", role: "SIDE_BOX_RIGHT", binding: "productImage" },
];
const loadController = (job, regions = REGIONS) => {
  for (const id of Object.keys(require.cache)) if (id.startsWith(SRC)) delete require.cache[id];
  const mongoose = require("mongoose");
  for (const n of mongoose.modelNames()) mongoose.deleteModel(n);
  const AiCalendarJob = require(path.join(SRC, "models/AiCalendarJob"));
  const LayoutVariant = require(path.join(SRC, "models/LayoutVariant"));
  const updates = [];
  const inits = [];
  AiCalendarJob.findById = async () => job;
  AiCalendarJob.updateOne = async (q, upd) => {
    inits.push({ q, upd });
    return {};
  };
  AiCalendarJob.findOneAndUpdate = async (q, upd) => {
    updates.push({ q, upd });
    const edits = {};
    for (const [k, v] of Object.entries(upd.$set)) if (k.startsWith("variations.0.edits.")) edits[k.split(".").pop()] = v;
    return { ...job, variations: job.variations.map((v, i) => (i === 0 ? { ...v, edits } : v)) };
  };
  LayoutVariant.findById = () => ({ populate: async () => ({ _id: "v1", regions }) });
  LayoutVariant.find = () => ({ populate: async () => [] });
  return { ctrl: require(path.join(SRC, "controllers/aiCalendar.controller")), updates, inits };
};
const job = (mode, status = "DONE", options = {}) => ({
  _id: "j1",
  userId: "u1",
  mode,
  content: { businessName: "MAKALIAMMAN TRADERS", productList: "TSHIRTS, DENIMS", rightBoxText: "Since 1998" },
  options: { leftBoxMode: "text", rightBoxMode: "text", ...options },
  variations: [{ index: 0, status, variantId: "v1", background: "/uploads/ai-calendars/j1/a.png", exportPdf: "/x.pdf" }],
});
const req = (body) => ({ params: { id: "j1", index: "0" }, body, user: { userId: "u1" } });

test("edits: each area is saved on its own — nothing else of the design changes", async () => {
  for (const area of ["name", "left", "right"]) {
    const { ctrl, updates, inits } = loadController(job("ai"));
    const res = fakeRes();
    await ctrl.setAreaEdit(req({ area, text: "  NEW TEXT  ", size: 120, colour: "#fff4d6" }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    // An empty edits object is created atomically only when there is none.
    assert.equal(inits[0].q["variations.0.edits"], null);
    const { q, upd } = updates[0];
    assert.equal(q["variations.0.status"], "DONE");
    // Exactly: this area's edit (+ the name's old style field for the name), and the old PDFs' links.
    const expected = [`variations.0.edits.${area}`, "variations.0.exportCutlinePdf", "variations.0.exportPdf"];
    if (area === "name") expected.push("variations.0.nameStyle");
    assert.deepEqual(Object.keys(upd.$set).sort(), expected.sort());
    assert.deepEqual(upd.$set[`variations.0.edits.${area}`], { size: 120, colour: "#FFF4D6", text: "NEW TEXT" });
    assert.equal(res.body.job.variations[0].edits[area].text, "NEW TEXT");
  }
});

test("edits: an empty edit resets the area to as generated", async () => {
  const { ctrl, updates } = loadController(job("ai"));
  const res = fakeRes();
  await ctrl.setAreaEdit(req({ area: "left" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(updates[0].upd.$set["variations.0.edits.left"], null);
});

test("edits: the first version's name-style address still saves the business name", async () => {
  const { ctrl, updates } = loadController(job("ai"));
  const res = fakeRes();
  await ctrl.setNameStyle(req({ size: 130, colour: "#FFF4D6" }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(updates[0].upd.$set["variations.0.edits.name"], { size: 130, colour: "#FFF4D6" });
});

test("edits: refused for Normal Mode, unfinished designs, picture boxes, missing areas and unknown areas", async () => {
  const refused = async (j, body, status, regions) => {
    const { ctrl, updates } = loadController(j, regions);
    const res = fakeRes();
    await ctrl.setAreaEdit(req(body), res);
    assert.equal(res.statusCode, status, JSON.stringify({ body, got: res.body }));
    assert.equal(updates.length, 0);
  };
  await refused(job("normal"), { area: "name", size: 130 }, 409);
  await refused(job("ai", "RUNNING"), { area: "name", size: 130 }, 400);
  await refused(job("ai", "DONE", { leftBoxMode: "image" }), { area: "left", text: "x" }, 409);
  await refused(job("ai", "DONE", { rightBoxMode: "image" }), { area: "right", text: "x" }, 409); // photo / AI-painted picture
  await refused(job("ai", "DONE", { showRightBox: false }), { area: "right", text: "x" }, 409);
  await refused(job("ai"), { area: "left", text: "x" }, 409, [REGIONS[0]]); // layout without side boxes
  await refused(job("ai"), { area: "godImage", text: "x" }, 400);
});

test("edits: text is cleaned (line breaks kept, controls removed, 300 characters max)", () => {
  const { areaEditOf } = require(path.join(SRC, "constants/typography"));
  assert.deepEqual(areaEditOf({ text: "  TSHIRTS\r\nDENIMS\u0007  " }), { text: "TSHIRTS\nDENIMS" });
  assert.equal(areaEditOf({ text: "x".repeat(500) }).text.length, 300);
  assert.equal(areaEditOf({ text: "   " }), null);
});

// ---- layout downloads -----------------------------------------------------------
const writeTestUpload = (name, bytes) => {
  const dir = path.join(UPLOADS, "production");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), bytes);
  return `/uploads/production/${name}`;
};

test("layout download: the original production file and laser PDF, byte-for-byte, nothing changed", async () => {
  const tag = `test-dl-${Date.now()}`;
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), crypto.randomBytes(5000)]);
  const laser = Buffer.concat([Buffer.from("%PDF-1.4\n"), crypto.randomBytes(800)]);
  const files = [writeTestUpload(`${tag}-production.pdf`, pdf), writeTestUpload(`${tag}-laser.pdf`, laser)];
  try {
    for (const id of Object.keys(require.cache)) if (id.startsWith(SRC)) delete require.cache[id];
    const mongoose = require("mongoose");
    for (const n of mongoose.modelNames()) mongoose.deleteModel(n);
    const LayoutVariant = require(path.join(SRC, "models/LayoutVariant"));
    const variant = {
      _id: "v1",
      status: "ACTIVE",
      sizeCode: "12x18",
      familyId: { code: "DIE-CUT03" },
      assets: { productionFile: files[0], laserFile: files[1] },
    };
    let saves = 0;
    variant.save = async () => (saves += 1);
    LayoutVariant.findById = () => ({ populate: async () => variant });
    const { downloadVariantFile } = require(path.join(SRC, "controllers/layoutVariant.controller"));
    const user = { userId: "u1" };

    const res = fakeRes();
    await downloadVariantFile({ params: { id: "v1", kind: "production" }, user }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(Buffer.compare(res.body, pdf) === 0, "identical bytes");
    assert.equal(res.headers["content-type"], "application/pdf");
    assert.match(res.headers["content-disposition"], /attachment; filename="DIE-CUT03-12x18-production\.pdf"/);

    const resLaser = fakeRes();
    await downloadVariantFile({ params: { id: "v1", kind: "laser" }, user }, resLaser);
    assert.ok(Buffer.compare(resLaser.body, laser) === 0);

    const bad = fakeRes();
    await downloadVariantFile({ params: { id: "v1", kind: "plate" }, user }, bad);
    assert.equal(bad.statusCode, 404);

    // The originals are untouched and the layout was not saved.
    assert.ok(Buffer.compare(fs.readFileSync(path.join(UPLOADS, files[0].slice("/uploads/".length))), pdf) === 0);
    assert.equal(saves, 0);
  } finally {
    // Only the files this test created.
    for (const f of files) fs.rmSync(path.join(UPLOADS, f.slice("/uploads/".length)), { force: true });
  }
});

test("layout download: a CorelDRAW upload is downloaded as the original .cdr; missing files give 404", async () => {
  const tag = `test-dl-${Date.now()}`;
  const cdr = crypto.randomBytes(3000);
  const file = writeTestUpload(`${tag}-source.cdr`, cdr);
  try {
    for (const id of Object.keys(require.cache)) if (id.startsWith(SRC)) delete require.cache[id];
    const mongoose = require("mongoose");
    for (const n of mongoose.modelNames()) mongoose.deleteModel(n);
    const LayoutVariant = require(path.join(SRC, "models/LayoutVariant"));
    const variant = {
      _id: "v2",
      status: "ACTIVE",
      sizeCode: "8x12",
      familyId: { code: "CC01" },
      assets: { sourceFile: file, productionFile: "/uploads/production/converted.pdf", laserFile: null },
    };
    LayoutVariant.findById = () => ({ populate: async () => variant });
    const { downloadVariantFile } = require(path.join(SRC, "controllers/layoutVariant.controller"));
    const res = fakeRes();
    await downloadVariantFile({ params: { id: "v2", kind: "production" }, user: { userId: "u1" } }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(Buffer.compare(res.body, cdr) === 0);
    assert.match(res.headers["content-disposition"], /CC01-8x12-production\.cdr/);
    const noLaser = fakeRes();
    await quiet(() => downloadVariantFile({ params: { id: "v2", kind: "laser" }, user: { userId: "u1" } }, noLaser));
    assert.equal(noLaser.statusCode, 404);
  } finally {
    fs.rmSync(path.join(UPLOADS, file.slice("/uploads/".length)), { force: true });
  }
});

test("layout download: preview-only layout gives its uploaded file, unchanged", async () => {
  const tag = `test-dl-${Date.now()}`;
  const dir = path.join(UPLOADS, "layouts");
  fs.mkdirSync(dir, { recursive: true });
  const bytes = crypto.randomBytes(2000);
  const name = `${tag}-layoutFile.png`;
  fs.writeFileSync(path.join(dir, name), bytes);
  try {
    for (const id of Object.keys(require.cache)) if (id.startsWith(SRC)) delete require.cache[id];
    const mongoose = require("mongoose");
    for (const n of mongoose.modelNames()) mongoose.deleteModel(n);
    const Layout = require(path.join(SRC, "models/Layout"));
    Layout.findById = async () => ({ _id: "l1", name: "Grand Ganesha", size: "12x18", layoutFile: `/uploads/layouts/${name}`, previewImage: "" });
    const { downloadLayoutFile } = require(path.join(SRC, "controllers/layout.controller"));
    const res = fakeRes();
    await downloadLayoutFile({ params: { id: "l1" }, user: { userId: "u1" } }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(Buffer.compare(res.body, bytes) === 0);
    assert.equal(res.headers["content-type"], "image/png");
    assert.match(res.headers["content-disposition"], /Grand-Ganesha-12x18\.png/);
  } finally {
    fs.rmSync(path.join(dir, name), { force: true });
  }
});
