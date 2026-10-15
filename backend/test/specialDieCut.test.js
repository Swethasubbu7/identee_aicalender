// Special Die-Cut: mapping of the supplied 12×18 production geometry,
// validation, the AI "full artwork" workflow (with a MOCK provider), print
// check and print / laser exports. No database, no network, no real AI.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");

const realFetch = global.fetch;
let networkCalls = 0;
global.fetch = async () => {
  networkCalls += 1;
  throw new Error("Network is blocked in tests");
};
test.after(() => {
  global.fetch = realFetch;
});

const { buildVariantGeometry } = require("../src/services/layout/mappingBuilder");
const { validateLayoutVariant } = require("../src/services/layout/layoutValidator");
const { compositionMode, effectiveOptions, generationMode } = require("../src/services/layout/composition");
const { cutlineDeviationMm, laserCutline } = require("../src/services/layout/cutlineCompare");
const { buildArtworkGuide, buildTemplateReference, GUIDE } = require("../src/services/ai/layoutReference");
const { specialArtworkPrompt, fitGodPrompt } = require("../src/services/ai/calendarPrompts");
const { runPrintCheck } = require("../src/services/export/printCheck");
const { buildPrintPdf, buildCutlinePdf, PAGE_MARGIN_MM } = require("../src/services/export/calendarPdf");
const { extractPdfLayout } = require("../src/services/layout/pdfImporter");
const { CALENDAR_FORMATS } = require("../src/constants/calendar");

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "special-12x18.geometry.json"), "utf8"));
const MAPPING = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "reports", "special-12x18-mapping.json"), "utf8"));
const FORMAT = CALENDAR_FORMATS.find((f) => f.cutType === "special-die-cut" && f.sizeCode === "12x18");
const SETTINGS = { dpi: 300, dpiConfirmed: false, cutlineStrokeMm: 0.1, cutlineColor: null, pending: [] };
const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

const specialVariant = (overrides = {}) => {
  const geometry = buildVariantGeometry(FIXTURE.design, MAPPING);
  return {
    _id: "6acd00000000000000000001",
    cutType: "special-die-cut",
    sizeCode: "12x18",
    ...geometry,
    mapping: { ...MAPPING, trimOriginMm: geometry.trimOriginMm, excludedBoxes: geometry.excludedBoxes },
    assets: {},
    ...overrides,
  };
};
const role = (v, r) => v.regions.find((x) => x.role === r);

// ---- mapping ----------------------------------------------------------------
test("Special 12×18: cutline, trim and registration come from the production file", () => {
  const v = specialVariant();
  assert.ok(near(v.trim.widthMm, 304.79) && near(v.trim.heightMm, 457.19));
  assert.deepEqual(v.registrationOffsetMm, { x: 753.96, y: 0 });
  assert.match(v.cutline.path, /^M/);
  assert.equal((v.cutline.path.match(/C/g) || []).length > 250, true); // the real die-cut shape, not a rectangle
});

test("Special 12×18: cake 4 H × 5 W in, centred, flush with the bottom; calendar area = cake", () => {
  const v = specialVariant();
  const cake = role(v, "CAKE_MOUNT").box;
  assert.ok(near(cake.width, 127) && near(cake.height, 101.6));
  assert.ok(near(cake.x + cake.width / 2, v.trim.widthMm / 2, 0.1));
  assert.ok(near(cake.y + cake.height, v.trim.heightMm, 0.1));
  assert.deepEqual(role(v, "CALENDAR_AREA").box, cake);
});

test("Special 12×18: name and two text lines are optional text sections; label excluded", () => {
  const v = specialVariant();
  assert.equal(role(v, "NAME_TEXT").binding, "businessName");
  assert.equal(role(v, "NAME_TEXT").textStyle.fontFamily, "ArialRoundedMTBold");
  assert.equal(role(v, "TEXT_LINE_1").binding, "productList");
  assert.equal(role(v, "TEXT_LINE_2").binding, "address");
  assert.equal(role(v, "GOD_AREA"), undefined);
  assert.equal(v.excludedBoxes.length, 1);
  const label = v.excludedBoxes[0];
  assert.ok(label.y + label.height < role(v, "CAKE_MOUNT").box.y); // the "4X5 INCHES" label above the cake
});

test("Special 12×18: artwork raster measured at 85 DPI", () => {
  const v = specialVariant();
  assert.equal(v.artworkRasters.length, 1);
  assert.equal(v.artworkRasters[0].widthPx, 1024);
  assert.equal(v.artworkRasters[0].dpi, 85);
});

test("Special 12×18: laser cutline and cake match the design file", () => {
  const cut = FIXTURE.design.objects.find((o) => o.id === MAPPING.cutlineObjectId);
  const dev = cutlineDeviationMm(cut, laserCutline(FIXTURE.laser));
  assert.ok(dev !== null && dev <= 0.05, `deviation ${dev}`);
  const laserCake = FIXTURE.laser.objects.find((o) => near(o.bbox.width, 127, 0.5) && near(o.bbox.height, 101.6, 0.5));
  const lc = laserCutline(FIXTURE.laser);
  const v = specialVariant();
  assert.ok(near(laserCake.bbox.x - lc.bbox.x, role(v, "CAKE_MOUNT").box.x, 0.1));
  assert.ok(near(laserCake.bbox.y - lc.bbox.y, role(v, "CAKE_MOUNT").box.y, 0.1));
});

// ---- validation -------------------------------------------------------------
const structure = (v) => validateLayoutVariant(v, { format: FORMAT, profile: null, toleranceMm: 2 });
const failing = (r) => r.results.filter((x) => x.stage === "STRUCTURE" && x.status === "FAIL").map((x) => x.code);

test("validation: the supplied file fails ONLY on artwork resolution (stays DRAFT)", () => {
  const r = structure(specialVariant());
  assert.equal(r.status, "FAIL");
  assert.deepEqual(failing(r), ["ARTWORK_RESOLUTION"]);
  assert.ok(r.results.some((x) => x.code === "GOD_COMPOSITION" && x.status === "PASS"));
});

test("validation: the same geometry with 300 DPI artwork passes (no god area needed)", () => {
  const v = specialVariant();
  v.artworkRasters = [{ ...v.artworkRasters[0], widthPx: 3600, heightPx: 5400, dpi: 300 }];
  const r = structure(v);
  assert.deepEqual(failing(r), []);
  assert.equal(r.status, "PASS");
});

test("validation: 200 DPI artwork is a warning, missing measurement is a warning", () => {
  const v = specialVariant();
  v.artworkRasters = [{ ...v.artworkRasters[0], dpi: 200 }];
  assert.equal(structure(v).results.find((x) => x.code === "ARTWORK_RESOLUTION").status, "WARN");
  delete v.artworkRasters;
  assert.equal(structure(v).results.find((x) => x.code === "ARTWORK_RESOLUTION").status, "WARN");
});

test("validation: Special needs artwork, text lines, cake; at most one god area; no side boxes", () => {
  const base = specialVariant();
  base.artworkRasters = [];
  const without = (r) => ({ ...base, regions: base.regions.filter((x) => x.role !== r) });
  assert.ok(structure(without("BACKGROUND_AREA")).results.some((x) => /Missing artwork/.test(x.message)));
  assert.ok(failing(structure(without("TEXT_LINE_1"))).includes("REQUIRED_REGION"));
  assert.ok(failing(structure(without("CAKE_MOUNT"))).includes("REQUIRED_REGION"));
  const god = { id: "god_area", role: "GOD_AREA", policy: "AI", shape: "rect", box: { x: 40, y: 20, width: 200, height: 200 } };
  const twoGods = { ...base, regions: [...base.regions, god, { ...god, id: "god_area_2" }] };
  assert.ok(failing(structure(twoGods)).includes("REGION_COUNT"));
  const sideBox = { id: "side", role: "SIDE_BOX_LEFT", policy: "APP_TEXT", binding: "productList", shape: "rect", box: { x: 5, y: 300, width: 40, height: 40 }, textStyle: { fontFamily: "x" } };
  assert.ok(failing(structure({ ...base, regions: [...base.regions, sideBox] })).includes("FORBIDDEN_REGION"));
});

test("validation: a label mapped as background is caught, and the real artwork is still measured", () => {
  const mapping = { ...MAPPING, regions: MAPPING.regions.map((r) => (r.role === "BACKGROUND_AREA" ? { ...r, objectIds: ["p1-7166"] } : r)) };
  const geometry = buildVariantGeometry(FIXTURE.design, mapping);
  assert.equal(geometry.artworkRasters[0].role, "ARTWORK"); // the 1024×1536 image, measured anyway
  assert.equal(geometry.artworkRasters[0].dpi, 85);
  const r = structure({ _id: "x", cutType: "special-die-cut", sizeCode: "12x18", ...geometry, mapping, assets: {} });
  const fails = failing(r);
  assert.ok(fails.includes("ARTWORK_REGION"));
  assert.ok(fails.includes("ARTWORK_RESOLUTION"));
});

test("composition mode: Special without god area = FULL_ARTWORK; with one, or other cut types = GOD_AREA", () => {
  const v = specialVariant();
  assert.equal(compositionMode(v), "FULL_ARTWORK");
  assert.equal(compositionMode({ ...v, regions: [...v.regions, { role: "GOD_AREA" }] }), "GOD_AREA");
  assert.equal(compositionMode({ ...v, cutType: "die-cut" }), "GOD_AREA");
});

test("Special 15×24 cake is unresolved (PENDING) and blocks validation", () => {
  const f15 = CALENDAR_FORMATS.find((f) => f.cutType === "special-die-cut" && f.sizeCode === "15x24");
  assert.equal(f15.cake.status, "PENDING");
  const r = validateLayoutVariant({ ...specialVariant(), sizeCode: "15x24" }, { format: f15, profile: null, toleranceMm: 2 });
  assert.ok(r.results.some((x) => x.code === "CAKE_SIZE_CONFIRMED" && x.status === "FAIL"));
});

// ---- AI guide + prompt -----------------------------------------------------
test("AI layout guide: 2:3, white outside the cutline, grey board, cream text panels, blue cake", async () => {
  const v = specialVariant();
  const guide = await buildArtworkGuide(v);
  assert.equal(guide.aspectRatio, "2:3");
  assert.equal(guide.cakeOverlapsArtwork, true);
  const { data, info } = await sharp(guide.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (xMm, yMm) => {
    const x = Math.round(((xMm - guide.box.x) / guide.box.width) * (info.width - 1));
    const y = Math.round(((yMm - guide.box.y) / guide.box.height) * (info.height - 1));
    const i = (y * info.width + x) * 3;
    return `#${[data[i], data[i + 1], data[i + 2]].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  };
  assert.equal(at(2, 2), GUIDE.outside); // top-left corner is cut away
  assert.equal(at(v.trim.widthMm / 2, 60), GUIDE.board); // upper board (the deity's space)
  const name = role(v, "NAME_TEXT").box;
  assert.equal(at(name.x + name.width / 2, name.y + name.height / 2), GUIDE.text);
  const cake = role(v, "CAKE_MOUNT").box;
  assert.notEqual(at(cake.x + cake.width / 2, cake.y + cake.height / 2), GUIDE.board); // cake marked
});

test("AI prompt: free deity composition inside the cutline, text panels kept plain, no text", () => {
  const p = specialArtworkPrompt({ theme: null, prompt: "royal maroon, lotus", hasTemplateReference: true, cakeOverlapsArtwork: true });
  assert.match(p, /does not have to sit in a circle, oval or rectangle/);
  assert.match(p, /pure white = OUTSIDE the die-cut shape/);
  assert.match(p, /cream areas = panels/);
  // The cake rule follows the layout (separate cake space or artwork under the pad).
  assert.match(p, /blue box = where the printed calendar pad is attached/);
  assert.match(p, /no part of the deity/);
  assert.match(specialArtworkPrompt({ cakeOverlapsArtwork: false }), /keep that area reserved/);
  assert.match(specialArtworkPrompt({ cakeOverlapsArtwork: true }), /may continue underneath it/);
  assert.match(p, /Do not add any text/);
  assert.match(p, /identity, face, pose/);
  assert.match(p, /royal maroon, lotus/);
  assert.match(fitGodPrompt({ theme: null, prompt: "" }), /grey area is the OPENING/); // Normal / Die-Cut unchanged
});

// ---- print check -----------------------------------------------------------
test("print check: Special preview (AI off) cannot export — sample deity would print", () => {
  const r = runPrintCheck({ variant: specialVariant(), format: FORMAT, settings: SETTINGS, images: {}, content: { businessName: "X" }, options: {} });
  const god = r.checks.find((c) => c.id === "god");
  assert.equal(god.status, "FAIL");
  assert.match(god.detail, /sample deity/);
  assert.equal(r.status, "FAIL");
});

test("print check: Special AI artwork passes composition and reports its real DPI", () => {
  const v = specialVariant();
  const box = { x: 0, y: 0, width: v.trim.widthMm, height: v.trim.heightMm };
  const r = runPrintCheck({
    variant: v,
    format: FORMAT,
    settings: SETTINGS,
    images: { background: { size: { width: 1792, height: 2688 }, box } },
    content: { businessName: "" },
    options: { showBusinessName: false, showTextLine1: false, showTextLine2: false },
  });
  assert.equal(r.checks.find((c) => c.id === "god").status, "PASS");
  const res = r.checks.find((c) => c.id === "background");
  assert.match(res.detail, /About 149 DPI/); // 2K AI artwork is NOT 300 DPI at 12×18
  assert.equal(r.checks.find((c) => c.id === "name").status, "PASS"); // name switched off
});

// ---- exports -----------------------------------------------------------------
test("exports: print PDF and laser PDF keep the exact Special geometry", async () => {
  const v = specialVariant();
  const art = await sharp({ create: { width: 3600, height: 5400, channels: 3, background: "#fff" } }).jpeg({ quality: 50 }).toBuffer();
  const print = await PDFDocument.load(await buildPrintPdf({ variant: v, artwork: { buffer: art, mimeType: "image/jpeg" }, settings: SETTINGS }));
  const tb = print.getPage(0).getTrimBox();
  assert.ok(near((tb.width * 25.4) / 72, v.trim.widthMm, 0.05) && near((tb.height * 25.4) / 72, v.trim.heightMm, 0.05));
  const laser = await extractPdfLayout(Buffer.from(await buildCutlinePdf({ variant: v, settings: SETTINGS })));
  const paths = laser.pages[0].objects.filter((o) => o.type === "path");
  const cut = laserCutline(laser.pages[0]);
  assert.ok(near(cut.bbox.width, v.trim.widthMm, 0.1) && near(cut.bbox.height, v.trim.heightMm, 0.1));
  assert.ok(near(cut.bbox.x, PAGE_MARGIN_MM, 0.1) && near(cut.bbox.y, PAGE_MARGIN_MM, 0.1));
  const original = FIXTURE.design.objects.find((o) => o.id === MAPPING.cutlineObjectId);
  assert.ok(cutlineDeviationMm(cut, original) <= 0.05, "exported cutline = approved cutline");
  const cake = role(v, "CAKE_MOUNT").box;
  const lc = paths.find((o) => o !== cut && near(o.bbox.width, cake.width, 0.2));
  assert.ok(near(lc.bbox.x - PAGE_MARGIN_MM, cake.x, 0.1) && near(lc.bbox.y - PAGE_MARGIN_MM, cake.y, 0.1));
  assert.equal(laser.pages[0].objects.filter((o) => o.type === "text").length, 0); // no "4X5 INCHES"
});

// ---- AI workflow with a MOCK provider ---------------------------------------
const SRC = path.join(__dirname, "..", "src");
const UPLOADS = path.join(SRC, "uploads");
const TMP = path.join(UPLOADS, "test-special-tmp");

const loadRunner = () => {
  for (const id of Object.keys(require.cache)) if (id.startsWith(SRC)) delete require.cache[id];
  const mongoose = require("mongoose");
  for (const n of ["AiUsageRecord", "AiCalendarJob", "LayoutVariant"]) if (mongoose.models[n]) mongoose.deleteModel(n);
  const AiCalendarJob = require(path.join(SRC, "models/AiCalendarJob"));
  const LayoutVariant = require(path.join(SRC, "models/LayoutVariant"));
  const AiUsageRecord = require(path.join(SRC, "models/AiUsageRecord"));
  const imageAi = require(path.join(SRC, "services/ai/imageAi"));

  const usage = [];
  AiUsageRecord.create = async (r) => usage.push(r);
  AiUsageRecord.find = () => ({ lean: async () => usage, sort: () => ({ limit: () => ({ lean: async () => [] }) }) });
  AiUsageRecord.aggregate = async () => [];
  AiUsageRecord.countDocuments = async () => usage.filter((r) => r.needsReconciliation).length;

  const state = { job: null };
  const setPath = (obj, dotted, value) => {
    const keys = dotted.split(".");
    let o = obj;
    for (const k of keys.slice(0, -1)) o = o[k];
    o[keys[keys.length - 1]] = value;
  };
  AiCalendarJob.findById = async () => (state.job ? JSON.parse(JSON.stringify(state.job)) : null);
  AiCalendarJob.updateOne = async (_q, upd) => {
    for (const [k, v] of Object.entries(upd.$set || {})) setPath(state.job, k, v);
    for (const [k, v] of Object.entries(upd.$inc || {})) setPath(state.job, k, (state.job[k] || 0) + v);
  };
  const variant = specialVariant();
  LayoutVariant.find = () => ({ populate: async () => [variant] });

  const calls = [];
  const provider = { behaviour: null };
  imageAi.getImageAi = () => ({
    name: "mock",
    isConfigured: () => true,
    editImage: async (req) => {
      calls.push(req);
      return provider.behaviour(req, calls.length);
    },
  });
  const runner = require(path.join(SRC, "services/ai/calendarJobRunner"));
  return { runner, state, calls, usage, provider, variant };
};

const quiet = async (fn) => {
  const { log, warn, error } = console;
  console.log = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, warn, error });
  }
};

const runJob = async (ctx) => {
  ctx.runner.enqueueJob(ctx.state.job._id);
  for (let i = 0; i < 400 && !["DONE", "PARTIAL", "FAILED"].includes(ctx.state.job.status); i += 1) {
    await new Promise((r) => setTimeout(r, 10));
  }
};

const newJob = async (variant, count = 2, options = {}) => {
  fs.mkdirSync(TMP, { recursive: true });
  await sharp({ create: { width: 400, height: 600, channels: 3, background: "#c96" } }).png().toFile(path.join(TMP, "god.png"));
  return {
    _id: "6acd0000000000000000aa01",
    userId: "6acd0000000000000000bb01",
    status: "QUEUED",
    mode: "ai",
    prompt: "royal maroon",
    aiCalls: 0,
    content: { godImage: "/uploads/test-special-tmp/god.png", businessName: "Name" },
    options,
    variations: Array.from({ length: count }, (_, i) => ({ index: i, variantId: variant._id, status: "PENDING" })),
  };
};

test.after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.rmSync(path.join(UPLOADS, "ai-calendars", "6acd0000000000000000aa01"), { recursive: true, force: true });
});

const artworkPng = () => sharp({ create: { width: 64, height: 96, channels: 3, background: "#800" } }).png().toBuffer();
const USAGE = {
  promptTokenCount: 1500,
  promptTokensDetails: [{ modality: "IMAGE", tokenCount: 1300 }],
  candidatesTokenCount: 1300,
  candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }],
  thoughtsTokenCount: 200,
};

test("mock AI: Special Generate = exactly 2 requests, each a full artwork on the production guide", async () => {
  const ctx = loadRunner();
  ctx.state.job = await newJob(ctx.variant);
  const png = await artworkPng();
  ctx.provider.behaviour = async () => ({ images: [{ buffer: png, mimeType: "image/png" }], usage: USAGE, model: "gemini-3.1-flash-image" });
  await quiet(() => runJob(ctx));

  assert.equal(ctx.calls.length, 2);
  for (const req of ctx.calls) {
    assert.equal(req.images.length, 2); // customer god image + production guide (no template asset yet)
    assert.equal(req.aspectRatio, "2:3");
    assert.match(req.prompt, /special die-cut/);
  }
  assert.equal(ctx.state.job.status, "DONE");
  for (const v of ctx.state.job.variations) {
    assert.equal(v.composition, "FULL_ARTWORK");
    assert.match(v.background, /^\/uploads\/ai-calendars\/.+v\d-artwork-/);
    assert.ok(near(v.backgroundBox.width, ctx.variant.trim.widthMm, 0.5));
    assert.equal(v.godImage, undefined); // no separate god picture for Special
  }
  assert.equal(ctx.usage.length, 2);
  assert.ok(ctx.usage.every((r) => r.purpose === "design-artwork" && r.status === "SUCCESS" && r.costStatus !== "UNKNOWN"));
});

test("mock AI: a timeout on design 2 is recorded as UNKNOWN cost, not retried", async () => {
  const ctx = loadRunner();
  ctx.state.job = await newJob(ctx.variant);
  const png = await artworkPng();
  ctx.provider.behaviour = async (_req, n) => {
    if (n === 2) throw Object.assign(new Error("slow"), { code: "AI_PROVIDER_ERROR", kind: "TIMEOUT" });
    return { images: [{ buffer: png, mimeType: "image/png" }], usage: USAGE };
  };
  await quiet(() => runJob(ctx));
  assert.equal(ctx.calls.length, 2);
  assert.equal(ctx.state.job.status, "PARTIAL");
  assert.equal(ctx.usage[1].status, "TIMEOUT");
  assert.equal(ctx.usage[1].costStatus, "UNKNOWN");
  assert.equal(ctx.usage[1].needsReconciliation, true);
});

test("mock AI: a quota error stops the job before the second paid request", async () => {
  const ctx = loadRunner();
  ctx.state.job = await newJob(ctx.variant);
  ctx.provider.behaviour = async () => {
    throw Object.assign(new Error("credit"), { code: "AI_PROVIDER_ERROR", kind: "QUOTA" });
  };
  await quiet(() => runJob(ctx));
  assert.equal(ctx.calls.length, 1);
  assert.equal(ctx.state.job.status, "FAILED");
});

test("mock AI: extra images returned are all kept", async () => {
  const ctx = loadRunner();
  ctx.state.job = await newJob(ctx.variant);
  const png = await artworkPng();
  ctx.provider.behaviour = async () => ({ images: [1, 2, 3].map(() => ({ buffer: png, mimeType: "image/png" })), usage: USAGE });
  await quiet(() => runJob(ctx));
  assert.equal(ctx.state.job.variations[0].extraImages.length, 2);
  assert.equal(ctx.usage[0].imagesReturned, 3);
});

test("every cut type, Special included, plans 2 designs per Generate", () => {
  const { variationCountFor, pickLayoutsForVariations } = require("../src/services/ai/pickLayouts");
  assert.equal(variationCountFor("special-die-cut"), 2);
  assert.equal(variationCountFor("die-cut"), 2);
  assert.equal(variationCountFor("normal"), 2);
  assert.equal(pickLayoutsForVariations({ cutType: "special-die-cut" }).length, 2);
});

test("mock AI: 2 Special designs = 2 requests with 2 different compositions; name off → freed space", async () => {
  const ctx = loadRunner();
  ctx.state.job = await newJob(ctx.variant, 2, { showBusinessName: false, showTextLine1: true, showTextLine2: true });
  ctx.state.job.content.productList = "Silk sarees, dhotis";
  const png = await artworkPng();
  ctx.provider.behaviour = async () => ({ images: [{ buffer: png, mimeType: "image/png" }], usage: USAGE });
  await quiet(() => runJob(ctx));
  assert.equal(ctx.calls.length, 2);
  const briefs = ctx.calls.map((c) => /COMPOSITION: ([^.]+)/.exec(c.prompt)?.[1]);
  assert.equal(new Set(briefs).size, 2, "two distinct compositions");
  assert.ok(ctx.calls.some((c) => /deity large and majestic/.test(c.prompt))); // prominent deity
  assert.ok(ctx.calls.every((c) => /left some text \/ content sections out/.test(c.prompt) && /Never draw empty boxes/.test(c.prompt)), "freed name space is painted");
  assert.ok(ctx.calls.every((c) => /Silk sarees/.test(c.prompt) && /never as words/.test(c.prompt)));
  assert.ok(ctx.calls.every((c) => /do not copy or recolour the template/.test(c.prompt)));
  assert.deepEqual(ctx.state.job.variations.map((v) => v.compositionStyle), ["Grand deity", "Floral garden"]);
  assert.equal(ctx.usage.length, 2);
});

test("AI guide: a switched-off business name is not a text panel (its space becomes artwork)", async () => {
  const v = specialVariant();
  const on = await buildArtworkGuide(v, {});
  const off = await buildArtworkGuide(v, { showBusinessName: false });
  assert.equal(on.freedSpace, false);
  assert.equal(off.freedSpace, true);
  const colourAt = async (guide, region) => {
    const { data, info } = await sharp(guide.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const c = { x: region.box.x + region.box.width / 2, y: region.box.y + region.box.height / 2 };
    const x = Math.round(((c.x - guide.box.x) / guide.box.width) * (info.width - 1));
    const y = Math.round(((c.y - guide.box.y) / guide.box.height) * (info.height - 1));
    const i = (y * info.width + x) * 3;
    return `#${[data[i], data[i + 1], data[i + 2]].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  };
  const name = role(v, "NAME_TEXT");
  assert.equal(await colourAt(on, name), GUIDE.text);
  assert.equal(await colourAt(off, name), GUIDE.board);
});

test("Die-Cut freed areas: a removed name frees a full-width band that never reaches the calendar", () => {
  const { freedAreas } = require("../src/services/layout/freedAreas");
  const v = {
    trim: { widthMm: 304.8, heightMm: 457.2 },
    regions: [
      { role: "NAME_TEXT", box: { x: 11, y: 306, width: 282, height: 16 } },
      { role: "SIDE_BOX_LEFT", box: { x: 13, y: 345, width: 68, height: 98 } },
      { role: "CALENDAR_AREA", box: { x: 88.9, y: 330, width: 127, height: 101.6 } },
    ],
  };
  assert.deepEqual(freedAreas(v, {}), []);
  const [name] = freedAreas(v, { showBusinessName: false });
  assert.equal(name.box.x, 0);
  assert.equal(name.box.width, 304.8);
  assert.ok(name.box.y + name.box.height <= 330 - 1 + 1e-9);
  const left = freedAreas(v, { showLeftBox: false })[0];
  assert.equal(left.section, "showLeftBox");
  assert.ok(left.box.width > 68);
});

test("full artwork: any cut type with a section switched off is generated as one complete artwork", () => {
  const { generationMode, disabledSections } = require("../src/services/layout/composition");
  const dieCut = {
    cutType: "die-cut",
    regions: [
      { role: "GOD_AREA" },
      { role: "NAME_TEXT", binding: "businessName" },
      { role: "SIDE_BOX_LEFT" },
      { role: "SIDE_BOX_RIGHT" },
      { role: "CAKE_MOUNT" },
    ],
  };
  assert.equal(generationMode(dieCut, {}), "GOD_AREA"); // all sections on: the layout's own frame + boxes
  assert.equal(generationMode(dieCut, { showRightBox: false }), "FULL_ARTWORK");
  assert.deepEqual(disabledSections(dieCut, { showBusinessName: false, showLeftBox: false, showRightBox: false }), [
    "showBusinessName",
    "showLeftBox",
    "showRightBox",
  ]);
  // A switch for a section the layout does not have changes nothing.
  assert.equal(generationMode(dieCut, { showTextLine1: false }), "GOD_AREA");
  assert.equal(generationMode({ ...dieCut, cutType: "normal" }, { showBusinessName: false }), "FULL_ARTWORK");
});

test("AI guide: every section off → no panels at all; side boxes are panels only while enabled", async () => {
  const v = {
    cutType: "die-cut",
    trim: { widthMm: 304.8, heightMm: 457.2 },
    cutline: { path: "M0 0 L304.8 0 L304.8 457.2 L0 457.2 Z" },
    regions: [
      { role: "NAME_TEXT", box: { x: 11, y: 306, width: 282, height: 16 } },
      { role: "SIDE_BOX_LEFT", box: { x: 13, y: 345, width: 68, height: 98 } },
      { role: "SIDE_BOX_RIGHT", box: { x: 224, y: 345, width: 68, height: 98 } },
      { role: "CAKE_MOUNT", box: { x: 88.9, y: 348, width: 127, height: 101.6 } },
    ],
  };
  assert.equal((await buildArtworkGuide(v, {})).panelCount, 3);
  const off = await buildArtworkGuide(v, { showBusinessName: false, showLeftBox: false, showRightBox: false });
  assert.equal(off.panelCount, 0);
  assert.equal(off.freedSpace, true);
});

test("mock AI: Die-Cut with every section off = 2 complete artworks, prominent deity, no template, no panels", async () => {
  const ctx = loadRunner();
  ctx.variant.cutType = "die-cut";
  ctx.variant.regions = [
    ...ctx.variant.regions.filter((r) => ["CAKE_MOUNT", "CALENDAR_AREA", "BACKGROUND_AREA"].includes(r.role)),
    { id: "god_area", role: "GOD_AREA", policy: "AI", shape: "rect", box: { x: 40, y: 30, width: 220, height: 220 } },
    { id: "name_text", role: "NAME_TEXT", binding: "businessName", box: { x: 11, y: 260, width: 280, height: 16 }, textStyle: { fontFamily: "Arial" } },
    { id: "side_box_left", role: "SIDE_BOX_LEFT", binding: "productList", box: { x: 10, y: 300, width: 60, height: 90 }, textStyle: { fontFamily: "Arial" } },
    { id: "side_box_right", role: "SIDE_BOX_RIGHT", binding: "productImage", box: { x: 235, y: 300, width: 60, height: 90 } },
  ];
  ctx.state.job = await newJob(ctx.variant, 2, { showBusinessName: false, showLeftBox: false, showRightBox: false });
  const png = await artworkPng();
  ctx.provider.behaviour = async () => ({ images: [{ buffer: png, mimeType: "image/png" }], usage: USAGE });
  await quiet(() => runJob(ctx));
  assert.equal(ctx.calls.length, 2);
  for (const c of ctx.calls) {
    assert.equal(c.images.length, 2); // god + guide only (no template showing the removed boxes)
    assert.match(c.prompt, /die-cut \(shaped\)/);
    assert.match(c.prompt, /there are no text panels/);
    assert.match(c.prompt, /make the deity more prominent/);
    assert.match(c.prompt, /Never draw empty boxes, blank panels, banners, placeholder rectangles or borders/);
    assert.match(c.prompt, /never invent a business name/);
    assert.match(c.prompt, /show the deity larger/);
    assert.match(c.prompt, /Do not add any text/);
  }
  assert.notEqual(/COMPOSITION: ([^.]+)/.exec(ctx.calls[0].prompt)[1], /COMPOSITION: ([^.]+)/.exec(ctx.calls[1].prompt)[1]);
  assert.ok(ctx.state.job.variations.every((v) => v.composition === "FULL_ARTWORK" && v.background));
});

test("print check: a Die-Cut AI full artwork counts as the composed god picture", () => {
  const v = { cutType: "die-cut", trim: { widthMm: 304.8, heightMm: 457.2 }, regions: [{ role: "GOD_AREA", box: { x: 40, y: 30, width: 220, height: 220 } }] };
  const r = runPrintCheck({
    variant: v,
    format: { widthIn: 12, heightIn: 18, cake: {} },
    settings: SETTINGS,
    images: { composition: "FULL_ARTWORK", background: { size: { width: 1792, height: 2688 }, box: { x: 0, y: 0, width: 304.8, height: 457.2 } } },
    content: {},
    options: { showBusinessName: false },
  });
  assert.equal(r.checks.find((c) => c.id === "god").status, "PASS");
});

test("no network request was made", () => {
  assert.equal(networkCalls, 0);
});

// ---- Empty content = section off (business decision 2026-10-14) ----------

const boxesVariant = () => ({
  _id: "6acd0000000000000000cc01",
  cutType: "normal",
  trim: { widthMm: 300, heightMm: 450 },
  regions: [
    { id: "god_area", role: "GOD_AREA", box: { x: 0, y: 0, width: 300, height: 290 } },
    { id: "name_text", role: "NAME_TEXT", binding: "businessName", box: { x: 10, y: 300, width: 280, height: 30 } },
    { id: "side_box_left", role: "SIDE_BOX_LEFT", binding: "productList", box: { x: 10, y: 345, width: 70, height: 95 } },
    { id: "side_box_right", role: "SIDE_BOX_RIGHT", binding: "productImage", box: { x: 220, y: 345, width: 70, height: 95 } },
    { id: "cake", role: "CAKE_MOUNT", box: { x: 90, y: 345, width: 120, height: 100 } },
  ],
});
const ALL_ON = { showBusinessName: true, showLeftBox: true, showRightBox: true, showTextLine1: true, showTextLine2: true, rightBoxMode: "image" };

test("effective sections: a section left empty counts as switched off", () => {
  const v = boxesVariant();
  const none = effectiveOptions(v, ALL_ON, {});
  assert.equal(none.showBusinessName, false);
  assert.equal(none.showLeftBox, false);
  assert.equal(none.showRightBox, false);
  assert.equal(generationMode(v, none), "FULL_ARTWORK");

  const full = effectiveOptions(v, ALL_ON, { businessName: "ஸ்ரீ முருகன்", productList: "Silk", productImage: "/uploads/x.png" });
  assert.equal(full.showBusinessName && full.showLeftBox && full.showRightBox, true);
  assert.equal(generationMode(v, full), "GOD_AREA");

  // Whitespace is empty; the right box in text mode needs its text.
  const text = effectiveOptions(v, { ...ALL_ON, rightBoxMode: "text" }, { businessName: "  ", productImage: "/uploads/x.png", rightBoxText: "Sarees" });
  assert.equal(text.showBusinessName, false);
  assert.equal(text.showRightBox, true);
  // A switched-off section stays off even with content.
  assert.equal(effectiveOptions(v, { ...ALL_ON, showLeftBox: false }, { productList: "Silk" }).showLeftBox, false);
});

test("mock AI: switches on but content empty = complete artwork, no panels for the empty sections", async () => {
  const ctx = loadRunner();
  ctx.variant.cutType = "normal";
  ctx.variant.regions = [
    ...ctx.variant.regions.filter((r) => ["CAKE_MOUNT", "CALENDAR_AREA", "BACKGROUND_AREA"].includes(r.role)),
    { id: "god_area", role: "GOD_AREA", policy: "AI", shape: "rect", box: { x: 40, y: 30, width: 220, height: 220 } },
    { id: "name_text", role: "NAME_TEXT", binding: "businessName", box: { x: 11, y: 260, width: 280, height: 16 }, textStyle: { fontFamily: "Arial" } },
    { id: "side_box_left", role: "SIDE_BOX_LEFT", binding: "productList", box: { x: 10, y: 300, width: 60, height: 90 }, textStyle: { fontFamily: "Arial" } },
    { id: "side_box_right", role: "SIDE_BOX_RIGHT", binding: "productImage", box: { x: 235, y: 300, width: 60, height: 90 } },
  ];
  // Every switch ON; only the business name is given.
  ctx.state.job = await newJob(ctx.variant, 2, ALL_ON);
  const png = await artworkPng();
  ctx.provider.behaviour = async () => ({ images: [{ buffer: png, mimeType: "image/png" }], usage: USAGE });
  await quiet(() => runJob(ctx));
  assert.equal(ctx.calls.length, 2);
  for (const c of ctx.calls) {
    assert.match(c.prompt, /rectangular printed/);
    assert.match(c.prompt, /cream areas = panels/); // the name is printed
    assert.match(c.prompt, /left some text \/ content sections out/);
    // The guide shows ONE cream panel (the name), not the empty boxes.
    const { data, info } = await sharp(c.images[1].buffer).raw().toBuffer({ resolveWithObject: true });
    const px = (xMm, yMm) => {
      const x = Math.round((xMm / 304.8) * info.width);
      const y = Math.round((yMm / 457.2) * info.height);
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    assert.deepEqual(px(40, 345), [0x9a, 0x9a, 0x9a], "empty left box is board (artwork), not a panel");
    // Right box set to "image" with no photo: in AI mode the AI paints a
    // product picture there (green area), it is not an empty panel.
    assert.deepEqual(px(265, 345), [0x7b, 0xc9, 0x6f], "right image box without a photo = AI product picture");
    assert.match(c.prompt, /green box = the right-side product picture/);
  }
  assert.ok(ctx.state.job.variations.every((v) => v.composition === "FULL_ARTWORK"));
});

test("AI reference: removed sections are cut out of the layout picture", async () => {
  fs.mkdirSync(TMP, { recursive: true });
  // 300 × 450 mm layout at 1 px/mm: red side boxes on a green board.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#0a0"/>` +
    `<rect x="10" y="345" width="70" height="95" fill="#f00"/><rect x="220" y="345" width="70" height="95" fill="#f00"/>` +
    `<rect x="10" y="300" width="280" height="30" fill="#ff0"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(TMP, "plate.png"));
  const v = { ...boxesVariant(), assets: { plate: "/uploads/test-special-tmp/plate.png" } };
  const sample = async (ref, xMm, yMm) => {
    const { data, info } = await sharp(ref.buffer).raw().toBuffer({ resolveWithObject: true });
    const x = Math.round((xMm / 300) * info.width);
    const y = Math.round((yMm / 450) * info.height);
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const red = (c) => c[0] > 200 && c[1] < 80 && c[2] < 80;
  const yellow = (c) => c[0] > 200 && c[1] > 200 && c[2] < 80;
  const all = await buildTemplateReference(v, ALL_ON);
  assert.equal(all.removedSections, 0);
  assert.ok(red(await sample(all, 45, 390)));
  const off = await buildTemplateReference(v, { ...ALL_ON, showBusinessName: false, showLeftBox: false, showRightBox: false });
  assert.equal(off.removedSections, 3);
  for (const [x, y] of [[45, 390], [255, 390], [150, 315]]) {
    const c = await sample(off, x, y);
    assert.ok(!red(c) && !yellow(c), `removed section still visible at ${x},${y}: ${c}`);
  }
  // No plate layers + removed sections: no template at all (never the boxes).
  assert.equal(await buildTemplateReference({ ...v, assets: { original: "/uploads/test-special-tmp/plate.png" } }, { showLeftBox: false }), null);
});
