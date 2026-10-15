// Normal Mode / AI Mode separation and reusable layouts, through the real
// controllers with in-memory stand-ins for the database models.
// No AI request is ever made: the provider below only counts calls.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const AiCalendarJob = require("../src/models/AiCalendarJob");
const LayoutVariant = require("../src/models/LayoutVariant");
const LayoutFamily = require("../src/models/LayoutFamily");
const CalendarFormat = require("../src/models/CalendarFormat");
const ProductionProfile = require("../src/models/ProductionProfile");
const AiUsageRecord = require("../src/models/AiUsageRecord");
const { registerImageAi } = require("../src/services/ai/imageAi");
const { createJob, getLayoutPlan, saveAsLayout } = require("../src/controllers/aiCalendar.controller");
const { canUseLayout } = require("../src/services/layout/layoutAccess");
const { normalRecipes, NORMAL_BOX_RECIPES } = require("../src/constants/designRecipes");
const { effectiveOptions } = require("../src/services/layout/composition");
const { validateLayoutVariant } = require("../src/services/layout/layoutValidator");
const { runPrintCheck } = require("../src/services/export/printCheck");
const { CALENDAR_FORMATS } = require("../src/constants/calendar");

// ---- the AI provider: counts every call, never sends anything ---------------
let aiCalls = 0;
let aiOn = false;
registerImageAi({
  name: "none", // the configured provider (AI_IMAGE_PROVIDER=none)
  isConfigured: () => aiOn,
  editImage: async () => {
    aiCalls += 1;
    throw new Error("no AI in tests");
  },
});

// ---- in-memory models ------------------------------------------------------
const USER = "6acd00000000000000000u01".replace("u", "0");
const OTHER = "6acd0000000000000000ff02";
const FORMAT = { _id: "6ace00000000000000000001", ...CALENDAR_FORMATS.find((f) => f.cutType === "normal" && f.sizeCode === "12x18") };
const variantDoc = (over = {}) => {
  const v = new LayoutVariant({
    _id: "6ace000000000000000000a1",
    familyId: "6ace000000000000000000f1",
    formatId: FORMAT._id,
    cutType: "normal",
    sizeCode: "12x18",
    status: "ACTIVE",
    version: 3,
    trim: { widthMm: 304.8, heightMm: 457.2 },
    cutline: { path: "M0 0 H304.8 V457.2 H0 Z" },
    assets: { productionFile: "/uploads/production/x.pdf", plate: "/uploads/production/plate.png" },
    mapping: { pageIndex: 0, trimOriginMm: { x: 10, y: 10 } },
    regions: [
      { id: "god", role: "GOD_AREA", policy: "AI", box: { x: 5, y: 0, width: 295, height: 295 } },
      { id: "name", role: "NAME_TEXT", policy: "EDITABLE", binding: "businessName", box: { x: 11, y: 299, width: 282, height: 30 }, textStyle: { fontFamily: "Arial" } },
      { id: "left", role: "SIDE_BOX_LEFT", policy: "EDITABLE", binding: "productList", box: { x: 13, y: 345, width: 68, height: 98 }, textStyle: { fontFamily: "Arial" } },
      { id: "right", role: "SIDE_BOX_RIGHT", policy: "EDITABLE", binding: "productImage", box: { x: 224, y: 345, width: 68, height: 98 } },
      { id: "cake", role: "CAKE_MOUNT", policy: "LOCKED", box: { x: 88.9, y: 346.9, width: 127, height: 101.6 } },
      { id: "cal", role: "CALENDAR_AREA", policy: "LOCKED", box: { x: 88.9, y: 346.9, width: 127, height: 101.6 } },
    ],
    ...over,
  });
  return v;
};
let selected = variantDoc();
const populated = (v) => {
  const p = Promise.resolve(v);
  p.populate = () => populated(v);
  return p;
};
LayoutVariant.findById = () => populated(selected);
LayoutVariant.find = () => ({ populate: async () => [selected] });
let savedVariant = null;
LayoutVariant.prototype.save = async function save() {
  savedVariant = this;
  return this;
};
let savedFamily = null;
LayoutFamily.create = async (doc) => (savedFamily = { _id: "6ace000000000000000000f9", ...doc });
CalendarFormat.findById = () => ({ lean: async () => FORMAT });
CalendarFormat.findOne = () => ({ lean: async () => FORMAT });
ProductionProfile.findOne = () => ({ lean: async () => null });
ProductionProfile.findById = () => ({ lean: async () => null });

let createdJob = null;
AiCalendarJob.create = async (doc) => (createdJob = new AiCalendarJob({ _id: "6acf000000000000000000j1", ...doc }));
AiCalendarJob.countDocuments = async () => 0;
AiCalendarJob.findById = async () => createdJob;
// Empty usage ledger (no request has ever been made).
AiUsageRecord.find = () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) });

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
const designer = { userId: USER, role: "USER" };
const TAMIL = { businessName: "ஸ்ரீ முருகன் டெக்ஸ்டைல்ஸ்", productList: "பட்டு சேலைகள்" };

test.beforeEach(() => {
  aiCalls = 0;
  aiOn = false;
  createdJob = null;
  selected = variantDoc();
});

// ---- Normal Mode ------------------------------------------------------------

test("Normal Mode: 5 box-style designs at once, no AI request, no God image", async () => {
  const r = await call(createJob, {
    user: designer,
    body: { mode: "normal", variantId: selected._id, ...TAMIL, language: "tamil", godImage: "/uploads/design-content/g.png" },
  });
  assert.equal(r.status, 202);
  assert.equal(createdJob.mode, "normal");
  assert.equal(createdJob.status, "DONE");
  assert.equal(createdJob.content.godImage, null, "no God image is taken in Normal Mode");
  assert.equal(createdJob.content.businessName, TAMIL.businessName, "Tamil text stored exactly");
  assert.deepEqual(createdJob.variations.map((v) => v.recipe.boxStyle), ["layout", "rounded", "arched", "scalloped", "double"]);
  assert.ok(createdJob.variations.every((v) => v.status === "DONE" && v.recipe.theme === "original"));
  assert.equal(aiCalls, 0);
});

test("Normal Mode never calls AI even when AI is switched on", async () => {
  aiOn = true;
  const r = await call(createJob, { user: designer, body: { mode: "normal", variantId: selected._id, ...TAMIL } });
  assert.equal(r.status, 202);
  assert.equal(createdJob.mode, "normal");
  assert.equal(createdJob.status, "DONE");
  assert.equal(aiCalls, 0);
});

test("Normal Mode on Special Die-Cut: one design, no side boxes", async () => {
  selected = variantDoc({ cutType: "special-die-cut" });
  await call(createJob, { user: designer, body: { mode: "normal", variantId: selected._id, ...TAMIL } });
  assert.equal(createdJob.variations.length, 1);
  assert.equal(createdJob.variations[0].recipe.boxStyle, "layout");
});

test("Normal Mode: empty or switched-off sections are removed", async () => {
  await call(createJob, { user: designer, body: { mode: "normal", variantId: selected._id, businessName: "", productList: "Silk", showRightBox: false } });
  assert.equal(createdJob.options.showBusinessName, false, "empty name = removed");
  assert.equal(createdJob.options.showLeftBox, true);
  assert.equal(createdJob.options.showRightBox, false);
});

// ---- AI Mode -----------------------------------------------------------------

test("AI Mode with AI switched off: refused, nothing created, no request", async () => {
  const r = await call(createJob, {
    user: designer,
    body: { mode: "ai", variantId: selected._id, godImage: "/uploads/design-content/g.png", ...TAMIL },
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.aiDisabled, true);
  assert.equal(createdJob, null);
  assert.equal(aiCalls, 0);
});

test("AI Mode: a right image box without a photo is painted by the AI (not removed)", () => {
  const opts = { showRightBox: true, rightBoxMode: "image" };
  assert.equal(effectiveOptions(selected, opts, {}).showRightBox, false, "Normal Mode: no photo = removed");
  assert.equal(effectiveOptions(selected, opts, {}, { aiPaintsProduct: true }).showRightBox, true, "AI Mode: AI paints it");
});

test("plan: Normal 5 designs free, AI exactly 2 designs with an estimate", async () => {
  const r = await call(getLayoutPlan, { user: designer, query: { variantId: selected._id, prompt: "" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.aiEnabled, false);
  assert.equal(r.body.normal.designCount, 5);
  assert.equal(r.body.ai.designCount, 2);
  assert.ok(r.body.ai.note.includes("AI is switched off"));
});

// ---- access -------------------------------------------------------------------

test("layout access: every signed-in designer has the same full access (no admin role)", () => {
  const req = (role, userId = USER) => ({ user: { role, userId } });
  for (const role of ["STAFF", "ADMIN", undefined]) {
    assert.equal(canUseLayout(req(role), { status: "ACTIVE" }), true);
    assert.equal(canUseLayout(req(role), { status: "VALIDATED" }), true);
    // saved designs are reusable by everyone, not only their creator
    assert.equal(canUseLayout(req(role, OTHER), { status: "DRAFT", design: { mode: "normal" }, createdBy: USER }), true);
    // a DRAFT production layout (fails validation) is never generated from
    assert.equal(canUseLayout(req(role), { status: "DRAFT" }), false);
    assert.equal(canUseLayout(req(role), { status: "ARCHIVED", design: {} }), false);
  }
  assert.equal(canUseLayout({}, { status: "VALIDATED" }), false); // not signed in
});

test("a saved layout's box style comes first in its Normal Mode designs", () => {
  assert.deepEqual(normalRecipes({ cutType: "die-cut", design: { boxStyle: "scalloped" } }).map((r) => r.boxStyle), [
    "scalloped",
    "layout",
    "rounded",
    "arched",
    "double",
  ]);
  assert.equal(NORMAL_BOX_RECIPES.length, 5);
});

// ---- save as reusable layout --------------------------------------------------

const UPLOADS = path.join(__dirname, "..", "src", "uploads");
const TMP = path.join(UPLOADS, "test-modes-tmp");
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

test("save a Normal Mode design: new DRAFT layout, geometry copied, source untouched", async () => {
  await call(createJob, { user: designer, body: { mode: "normal", variantId: selected._id, ...TAMIL } });
  const sourceBefore = JSON.stringify(selected.toObject());
  const r = await call(saveAsLayout, { user: designer, params: { id: createdJob._id, index: "3" }, body: { name: "Murugan scalloped" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(savedVariant.status, "DRAFT");
  assert.notEqual(String(savedVariant.familyId), String(selected.familyId), "a new family, never the source");
  assert.equal(String(savedVariant.sourceVariantId), String(selected._id));
  assert.equal(savedVariant.sourceVersion, 3);
  assert.deepEqual(savedVariant.trim.toObject ? savedVariant.trim.toObject() : savedVariant.trim, { widthMm: 304.8, heightMm: 457.2 });
  assert.equal(savedVariant.cutline.path, selected.cutline.path);
  assert.deepEqual(
    savedVariant.regions.map((g) => [g.role, g.box.x, g.box.y, g.box.width, g.box.height]),
    selected.regions.map((g) => [g.role, g.box.x, g.box.y, g.box.width, g.box.height]),
  );
  assert.equal(savedVariant.design.mode, "normal");
  assert.equal(savedVariant.design.boxStyle, "scalloped");
  assert.equal(savedFamily.name, "Murugan scalloped");
  assert.ok(["PASS", "FAIL", "PENDING"].includes(savedVariant.validation.status));
  assert.equal(JSON.stringify(selected.toObject()), sourceBefore, "source layout unchanged");
});

test("save an AI design: the AI artwork, its box and its real pixel size are stored", async () => {
  fs.mkdirSync(TMP, { recursive: true });
  await sharp({ create: { width: 1696, height: 2528, channels: 3, background: "#844" } }).png().toFile(path.join(TMP, "art.png"));
  createdJob = new AiCalendarJob({
    _id: "6acf000000000000000000j2",
    userId: USER,
    selectedVariantId: selected._id,
    cutType: "normal",
    sizeCode: "12x18",
    mode: "ai",
    status: "DONE",
    variations: [
      {
        index: 0,
        variantId: selected._id,
        status: "DONE",
        recipe: { id: "classic", boxStyle: "layout" },
        composition: "FULL_ARTWORK",
        background: "/uploads/test-modes-tmp/art.png",
        backgroundBox: { x: 0, y: 0, width: 304.8, height: 457.2 },
      },
    ],
  });
  const r = await call(saveAsLayout, { user: designer, params: { id: createdJob._id, index: "0" }, body: { name: "AI Ganesha" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(savedVariant.design.mode, "ai");
  assert.equal(savedVariant.design.artwork, "/uploads/test-modes-tmp/art.png");
  assert.deepEqual(savedVariant.design.artworkPx, { widthPx: 1696, heightPx: 2528 });
  // 2528 px over 18 in = 140 DPI: honestly below the print target, blocks activation.
  const res = savedVariant.validation.results.find((x) => x.code === "ARTWORK_RESOLUTION");
  assert.equal(res.status, "FAIL");
  assert.match(res.message, /about 14\d DPI/);
  assert.match(res.message, /does not add detail/);
});

test("validator: a 4K saved AI artwork is a WARN (about 228 DPI), not 300-DPI-ready", () => {
  const v = variantDoc({
    design: { artwork: "/x.png", artworkBox: { x: 0, y: 0, width: 304.8, height: 457.2 }, artworkPx: { widthPx: 2731, heightPx: 4096 } },
  }).toObject();
  const r = validateLayoutVariant(v, { format: FORMAT, profile: null, toleranceMm: 2 });
  const res = r.results.find((x) => x.code === "ARTWORK_RESOLUTION");
  assert.equal(res.status, "WARN");
  assert.match(res.message, /about 22\d DPI/);
});

// ---- print check -----------------------------------------------------------------

test("print check: Normal Mode keeps the layout's own God picture (no AI image needed)", () => {
  const r = runPrintCheck({
    variant: variantDoc().toObject(),
    format: FORMAT,
    settings: { dpi: 300, dpiConfirmed: false, cutlineStrokeMm: 0.1, cutlineColor: null, pending: [] },
    images: { layoutGod: true },
    content: TAMIL,
    options: { showBusinessName: true },
    textFits: {},
  });
  const god = r.checks.find((c) => c.id === "god");
  assert.equal(god.status, "PASS");
  assert.match(god.detail, /Normal Mode/);
});

test("print check: Normal Mode reports the layout artwork's real resolution (83 DPI = WARN, never 300-ready)", () => {
  const r = runPrintCheck({
    variant: variantDoc().toObject(),
    format: FORMAT,
    settings: { dpi: 300, dpiConfirmed: false, cutlineStrokeMm: 0.1, cutlineColor: null, pending: [] },
    images: { layoutGod: true, layoutRasters: [{ widthPx: 1005, heightPx: 1536, widthMm: 307, heightMm: 457.1, dpi: 83 }] },
    content: TAMIL,
    options: { showBusinessName: true },
    textFits: {},
  });
  const art = r.checks.find((c) => c.id === "layoutArt");
  assert.equal(art.status, "WARN");
  assert.match(art.detail, /about 83 DPI at print size/);
  assert.match(art.detail, /visibly soft/);
});

// ---- AI request counts (mock provider; nothing leaves the machine) ---------------

const config = require("../src/config");
const { createAdminTestImage } = require("../src/controllers/aiCalendar.controller");

const withAiOnAndLimits = async (fn) => {
  const saved = { b: config.AI_BUDGET_INR, d: config.AI_DAILY_LIMIT_INR, m: config.AI_MAX_COST_PER_GENERATE_INR };
  Object.assign(config, { AI_BUDGET_INR: 500, AI_DAILY_LIMIT_INR: 200, AI_MAX_COST_PER_GENERATE_INR: 100 });
  aiOn = true;
  try {
    return await fn();
  } finally {
    Object.assign(config, { AI_BUDGET_INR: saved.b, AI_DAILY_LIMIT_INR: saved.d, AI_MAX_COST_PER_GENERATE_INR: saved.m });
    aiOn = false;
  }
};
const ledger = [];
AiUsageRecord.create = async (doc) => ledger.push(doc);
AiUsageRecord.aggregate = async () => [];
AiUsageRecord.countDocuments = async () => 0;
AiUsageRecord.find = () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }), lean: async () => [] });
AiCalendarJob.exists = async () => null;
AiCalendarJob.updateOne = async () => ({});

const GOD = "/uploads/design-content/test-modes-god.png";
const aiBody = (extra = {}) => ({ mode: "ai", variantId: selected._id, godImage: GOD, prompt: "red and gold", ...TAMIL, ...extra });
const waitForCalls = async (n) => {
  for (let i = 0; i < 100 && aiCalls < n; i += 1) await new Promise((r) => setTimeout(r, 30));
  await new Promise((r) => setTimeout(r, 100)); // and no extra call after that
};
const aiVariant = () => variantDoc({ assets: {} }); // no template files on disk in tests

test.before(async () => {
  const dir = path.join(UPLOADS, "design-content");
  fs.mkdirSync(dir, { recursive: true });
  await sharp({ create: { width: 300, height: 400, channels: 3, background: "#c96" } }).png().toFile(path.join(dir, "test-modes-god.png"));
});
test.after(() => fs.rmSync(path.join(UPLOADS, "design-content", "test-modes-god.png"), { force: true }));

test("admin one-image test: exactly ONE provider request, same confirmation and ledger", async () => {
  await withAiOnAndLimits(async () => {
    selected = aiVariant();
    const admin = { userId: USER, role: "ADMIN" };
    // Without confirmation: refused with the estimate (1 request), nothing sent.
    const first = await call(createAdminTestImage, { user: admin, body: aiBody() });
    assert.equal(first.status, 409);
    assert.equal(first.body.needsConfirmation, true);
    assert.equal(first.body.estimate.requests, 1);
    assert.ok(first.body.estimate.totalUsd > 0 && first.body.estimate.totalGstInr > 0);
    assert.equal(aiCalls, 0);
    const r = await call(createAdminTestImage, {
      user: admin,
      body: aiBody({ confirmCost: true, confirmedEstimateInr: first.body.estimate.totalInr }),
    });
    assert.equal(r.status, 202, JSON.stringify(r.body));
    assert.equal(createdJob.adminTest, true);
    assert.equal(createdJob.variations.length, 1);
    await waitForCalls(1);
    assert.equal(aiCalls, 1, "exactly one image request");
    const rec = ledger.at(-1);
    assert.equal(rec.purpose, "admin-test-image");
    assert.equal(rec.imagesRequested, 1);
    assert.equal(rec.status, "FAILED"); // the mock provider fails; it is recorded, not retried
  });
});

test("one-image test is open to every designer and refused while AI is off", async () => {
  const off = await call(createAdminTestImage, { user: designer, body: aiBody() });
  assert.equal(off.status, 409);
  assert.equal(off.body.aiDisabled, true);
  assert.equal(aiCalls, 0);
});

test("regular AI Generate still makes exactly TWO requests (never one), after confirmation", async () => {
  await withAiOnAndLimits(async () => {
    selected = aiVariant();
    const est = await call(createJob, { user: designer, body: aiBody({ adminTest: true }) }); // a body flag cannot make it a test
    assert.equal(est.status, 409);
    assert.equal(est.body.estimate.requests, 2);
    const r = await call(createJob, { user: designer, body: aiBody({ adminTest: true, confirmCost: true, confirmedEstimateInr: est.body.estimate.totalInr }) });
    assert.equal(r.status, 202, JSON.stringify(r.body));
    assert.equal(createdJob.adminTest, false);
    assert.equal(createdJob.variations.length, 2);
    await waitForCalls(2);
    assert.equal(aiCalls, 2, "one request per design, no retries");
  });
});

test("per-Generate maximum and daily limit refuse an AI Generate before anything is sent", async () => {
  await withAiOnAndLimits(async () => {
    selected = aiVariant();
    config.AI_MAX_COST_PER_GENERATE_INR = 10; // below the 2-design estimate
    const r = await call(createJob, { user: designer, body: aiBody({ confirmCost: true, confirmedEstimateInr: 9999 }) });
    assert.equal(r.status, 409);
    assert.ok(r.body.reasons.some((x) => /maximum per Generate/.test(x)));
    config.AI_MAX_COST_PER_GENERATE_INR = 100;
    config.AI_DAILY_LIMIT_INR = 5;
    const d = await call(createJob, { user: designer, body: aiBody({ confirmCost: true, confirmedEstimateInr: 9999 }) });
    assert.equal(d.status, 409);
    assert.ok(d.body.reasons.some((x) => /Today's limit/.test(x)));
    assert.equal(aiCalls, 0);
  });
});

test("an unknown AI_IMAGE_PROVIDER value means AI OFF (never an error, never a request)", () => {
  const { getImageAi } = require("../src/services/ai/imageAi");
  const warn = console.warn;
  console.warn = () => {};
  try {
    const p = getImageAi("gemni"); // typo
    assert.equal(p.isConfigured(), false);
    assert.equal(p.name, "none");
  } finally {
    console.warn = warn;
  }
});
