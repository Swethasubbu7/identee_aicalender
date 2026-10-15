const test = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument } = require("pdf-lib");

const { pickLayoutsForVariations } = require("../src/services/ai/pickLayouts");
const { DESIGN_RECIPES, recipeFor } = require("../src/constants/designRecipes");
const { nearestAspectRatio, getImageAi } = require("../src/services/ai/imageAi");
const { buildPrintPdf, buildCutlinePdf, PAGE_MARGIN_MM } = require("../src/services/export/calendarPdf");
const { runPrintCheck, effectiveDpi } = require("../src/services/export/printCheck");
const { fitBoxToRatio } = require("../src/services/ai/layoutReference");
const { describeError } = require("../src/services/ai/imageAi/geminiProvider");
const { fitGodPrompt } = require("../src/services/ai/calendarPrompts");
const { imageSize } = require("../src/lib/imageSize");

const layout = (id, cutType = "die-cut", sizeCode = "12x18") => ({ _id: id, cutType, sizeCode });

test("2 designs, both of the SAME selected layout", () => {
  const selected = layout("dc-03");
  const picks = pickLayoutsForVariations(selected);
  assert.equal(picks.length, 2);
  assert.ok(picks.every((p) => p.variant === selected));
  assert.deepEqual(picks.map((p) => p.themeIndex), [0, 1]);
});

test("design recipes: 5 different colours, fonts and side-box styles", () => {
  assert.equal(DESIGN_RECIPES.length, 5);
  for (const key of ["id", "theme", "boxStyle"]) {
    assert.equal(new Set(DESIGN_RECIPES.map((r) => r[key])).size, 5, key);
  }
  for (const lang of ["english", "tamil"]) {
    assert.equal(new Set(DESIGN_RECIPES.map((r) => r.fonts[lang])).size, 5, lang);
  }
  assert.equal(recipeFor(0).theme, "original"); // design 1 keeps the layout's own look
  assert.equal(recipeFor(5).id, recipeFor(0).id);
});

test("nearest supported aspect ratio", () => {
  assert.equal(nearestAspectRatio(200, 300), "2:3");
  assert.equal(nearestAspectRatio(300, 400), "3:4");
  assert.equal(nearestAspectRatio(100, 100), "1:1");
  assert.equal(nearestAspectRatio(160, 90), "16:9");
});

test("prompts forbid text and keep the deity unchanged", () => {
  const god = fitGodPrompt({ aspectRatio: "3:4", shaped: true, theme: null, prompt: "golden" });
  assert.match(god, /Do not add any text/);
  assert.match(god, /must not change/);
  assert.match(god, /golden/);
});

test("AI provider is reported as not configured without an API key", () => {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  assert.equal(getImageAi("gemini").isConfigured(), false);
  assert.equal(getImageAi("none").isConfigured(), false);
  if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
});

// 1×1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("imageSize reads buffers", () => {
  assert.deepEqual(imageSize(PNG), { width: 1, height: 1, type: "png" });
});

const VARIANT_12x18 = {
  status: "ACTIVE",
  cutType: "die-cut",
  sizeCode: "12x18",
  trim: { widthMm: 304.8, heightMm: 457.2 },
  cutline: { path: "M 0 0 L 304.8 0 L 304.8 457.2 L 0 457.2 Z" },
  regions: [
    { id: "cake", role: "CAKE_MOUNT", box: { x: 88.9, y: 300, width: 127, height: 101.6 } },
    { id: "cal", role: "CALENDAR_AREA", box: { x: 80, y: 290, width: 145, height: 120 } },
    { id: "god", role: "GOD_AREA", box: { x: 50, y: 30, width: 200, height: 220 } },
    { id: "name", role: "NAME_TEXT", binding: "businessName", box: { x: 20, y: 260, width: 260, height: 25 } },
  ],
};
const FORMAT_12x18 = { widthIn: 12, heightIn: 18, cake: { label: "4×5", heightIn: 4, widthIn: 5 } };
const SETTINGS = { dpi: 300, dpiConfirmed: false, cutlineStrokeMm: 0.1, cutlineColor: null, bleedMm: null, safeMarginMm: null, colorMode: null, pending: ["Bleed — Needs designer/printer confirmation"] };

test("PDF: print file and laser file at the exact trim size", async () => {
  const meta = { familyCode: "dc-01", cakeLabel: "4×5" };
  const print = await PDFDocument.load(await buildPrintPdf({ variant: VARIANT_12x18, artwork: { buffer: PNG, mimeType: "image/png" }, settings: SETTINGS, meta }));
  const laser = await PDFDocument.load(await buildCutlinePdf({ variant: VARIANT_12x18, settings: SETTINGS, meta }));
  const margin = (PAGE_MARGIN_MM * 72) / 25.4;
  for (const doc of [print, laser]) {
    assert.equal(doc.getPageCount(), 1);
    const page = doc.getPage(0);
    // The calendar itself (TrimBox) is exactly 12 × 18 in, inside a margin so
    // cutline parts on the trim edge are not clipped by the page border.
    const trim = page.getTrimBox();
    assert.ok(Math.abs(trim.width - 864) < 0.01); // 12 in × 72
    assert.ok(Math.abs(trim.height - 1296) < 0.01); // 18 in × 72
    assert.ok(Math.abs(trim.x - margin) < 0.01 && Math.abs(trim.y - margin) < 0.01);
    const { width, height } = page.getSize();
    assert.ok(Math.abs(width - (864 + 2 * margin)) < 0.01);
    assert.ok(Math.abs(height - (1296 + 2 * margin)) < 0.01);
    assert.match(doc.getKeywords(), /Needs designer\/printer confirmation/);
  }
  assert.match(print.getSubject(), /^Print artwork/);
  assert.match(laser.getSubject(), /^Laser cutline/);
});

test("layout reference box: keeps the god box inside and has a supported ratio", () => {
  const god = { x: 50, y: 30, width: 200, height: 220 };
  const { box, aspectRatio } = fitBoxToRatio(god);
  const [w, h] = aspectRatio.split(":").map(Number);
  assert.ok(Math.abs(box.width / box.height - w / h) < 1e-9);
  assert.ok(box.x <= god.x && box.y <= god.y);
  assert.ok(box.x + box.width >= god.x + god.width && box.y + box.height >= god.y + god.height);
  // centred on the god box
  assert.ok(Math.abs(box.x + box.width / 2 - (god.x + god.width / 2)) < 1e-9);
});

test("effective DPI of an image stretched over a box", () => {
  assert.equal(effectiveDpi({ width: 1200, height: 1500 }, { width: 101.6, height: 127 }), 300);
  assert.equal(effectiveDpi(null, { width: 10, height: 10 }), null);
});

test("print check: passes geometry, warns low resolution, pending printer values", () => {
  const result = runPrintCheck({
    variant: VARIANT_12x18,
    format: FORMAT_12x18,
    settings: SETTINGS,
    images: { god: { size: { width: 1024, height: 1024 }, box: VARIANT_12x18.regions[2].box } },
    content: { businessName: "INFRYX SOFTWARESS" },
  });
  const by = Object.fromEntries(result.checks.map((c) => [c.id, c.status]));
  assert.equal(by.size, "PASS");
  assert.equal(by.cutline, "PASS");
  assert.equal(by.cake, "PASS");
  assert.equal(by.calendar, "PASS");
  assert.equal(by.name, "PASS");
  assert.equal(by.god, "WARN"); // ~118 DPI
  assert.equal(by.bleed, "PENDING");
  assert.equal(by.dpi, "PENDING");
  assert.equal(result.status, "WARN");
});

test("print check: wrong size or missing business name fails", () => {
  const result = runPrintCheck({
    variant: { ...VARIANT_12x18, trim: { widthMm: 381, heightMm: 609.6 } },
    format: FORMAT_12x18,
    settings: SETTINGS,
    images: {},
    content: { businessName: "  " },
  });
  const by = Object.fromEntries(result.checks.map((c) => [c.id, c.status]));
  assert.equal(by.size, "FAIL");
  assert.equal(by.name, "FAIL");
  assert.equal(result.status, "FAIL");
});

test("print check: heavily shrunk text is a warning", () => {
  const result = runPrintCheck({
    variant: VARIANT_12x18,
    format: FORMAT_12x18,
    settings: { ...SETTINGS, dpiConfirmed: true },
    images: { god: { size: { width: 4000, height: 4000 }, box: VARIANT_12x18.regions[2].box } },
    content: { businessName: "A VERY LONG BUSINESS NAME" },
    textFits: { name: { fittedPt: 10, layoutPt: 40 } },
  });
  assert.equal(result.checks.find((c) => c.id === "textFit").status, "WARN");
});

test("AI errors: free-tier quota gives a clear, non-retryable message", () => {
  const quota = describeError({ status: 429, message: "Quota exceeded for metric: generate_content_free_tier_input_token_count, limit: 0" });
  assert.equal(quota.kind, "QUOTA");
  assert.equal(quota.retryable, false);
  assert.match(quota.message, /billing/);
  const busy = describeError({ status: 429, message: "Resource exhausted" });
  assert.equal(busy.kind, "RATE_LIMIT");
  assert.equal(busy.retryable, true);
  assert.equal(describeError({ status: 503, message: "unavailable" }).retryable, true);
  const credits = describeError({ status: 402, message: "Your prepayment credits are depleted." });
  assert.equal(credits.kind, "QUOTA");
  assert.match(credits.message, /credit is used up/);
  // status only inside the API body
  assert.equal(describeError({ message: '{"error":{"code":503,"status":"UNAVAILABLE"}}' }).retryable, true);
});

const { themeFor, promptColours } = require("../src/services/ai/themes");

test("themes: no colours in the prompt → red, blue and green with gold", () => {
  const names = [0, 1, 2].map((i) => themeFor("Make it beautiful", i).name);
  assert.deepEqual(names, ["Red and gold festive", "Blue and gold premium", "Green and gold traditional"]);
});

test("themes: colours named in the prompt are kept in every design, treatment changes", () => {
  const prompt = "Create a premium red and gold Vinayagar calendar with a festive temple-inspired background.";
  assert.deepEqual(promptColours(prompt), ["red", "gold"]);
  const themes = [0, 1, 2].map((i) => themeFor(prompt, i));
  assert.equal(new Set(themes.map((t) => t.name)).size, 3);
  for (const t of themes) {
    assert.match(t.name, /^Red & Gold · /);
    assert.match(t.background, /red and gold/i);
  }
});

test("god prompt includes the clean-up of low-quality images (one picture per design)", () => {
  const p = fitGodPrompt({ theme: themeFor("", 0), prompt: "", hasStyleReference: true });
  assert.match(p, /blurry, low resolution/);
  assert.match(p, /sketch/);
  assert.match(p, /grey area is the OPENING/);
});

test("print check: business name switched off is fine; right-box text mode without text warns", () => {
  const result = runPrintCheck({
    variant: VARIANT_12x18,
    format: FORMAT_12x18,
    settings: SETTINGS,
    images: {},
    content: { businessName: "", rightBoxText: "" },
    options: { showBusinessName: false, showRightBox: true, rightBoxMode: "text" },
  });
  const by = Object.fromEntries(result.checks.map((c) => [c.id, c]));
  assert.equal(by.name.status, "PASS");
  assert.match(by.name.detail, /Not included/);
  assert.equal(by.rightText.status, "WARN");
});
