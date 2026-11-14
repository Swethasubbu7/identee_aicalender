// Swappable God (Special Die-Cut, Normal Mode): the cleaned patch is only
// used while it belongs to the layout's current artwork, and is served with
// a public URL.
const test = require("node:test");
const assert = require("node:assert/strict");
const { godSwapOf, withPublicUrls } = require("../src/controllers/layoutVariant.controller");

const ART = "/uploads/production/1-artwork.jpg";
const swap = (extra = {}) => ({
  patch: "/uploads/production/2-god-swap-patch.png",
  patchBox: { x: 70, y: 40, width: 150, height: 180 },
  box: { x: 75, y: 47, width: 145, height: 170 },
  forArtwork: ART,
  ...extra,
});
const variant = (godSwap, artworkPath = ART) => ({
  assets: { artworkOverride: { path: artworkPath, widthPx: 100, heightPx: 100 }, godSwap },
  regions: [],
});

test("god swap is used only for the artwork it was cleaned from", () => {
  assert.ok(godSwapOf(variant(swap())));
  assert.equal(godSwapOf(variant(swap(), "/uploads/production/3-new-artwork.jpg")), null);
  assert.equal(godSwapOf(variant(swap({ forArtwork: null }))), null);
  assert.equal(godSwapOf(variant(null)), null);
});

test("god swap patch gets a public URL; an outdated one is hidden", () => {
  const ok = withPublicUrls(variant(swap()), { user: { userId: "u" } });
  assert.match(ok.assets.godSwap.patchUrl, /2-god-swap-patch\.png$/);
  const stale = withPublicUrls(variant(swap(), "/uploads/production/3-new-artwork.jpg"), { user: { userId: "u" } });
  assert.equal(stale.assets.godSwap, null);
});

test("print check: a swappable-God design exports with the customer's God (no AI needed)", () => {
  const { runPrintCheck } = require("../src/services/export/printCheck");
  const { CALENDAR_FORMATS } = require("../src/constants/calendar");
  const SPECIAL = CALENDAR_FORMATS.find((f) => f.cutType === "special-die-cut" && f.sizeCode === "12x18");
  const v = {
    cutType: "special-die-cut",
    sizeCode: "12x18",
    trim: { widthMm: 294.64, heightMm: 466.17 },
    cutline: { path: "M0 0 L294.64 0 L294.64 466.17 L0 466.17 Z" },
    regions: [{ id: "bg", role: "BACKGROUND_AREA", box: { x: 0, y: 0, width: 294.64, height: 466.17 } }],
    assets: {},
  };
  const settings = { dpi: 300, dpiConfirmed: false, cutlineStrokeMm: 0.1, cutlineColor: null, pending: [] };
  const run = (images) =>
    runPrintCheck({ variant: v, format: SPECIAL, settings, images, content: { businessName: "X" }, options: {} }).checks;
  const god = { size: { width: 736, height: 1309 }, box: { x: 75, y: 47, width: 145, height: 166 } };
  const ok = run({ godSwap: true, god, layoutRasters: [] });
  assert.equal(ok.find((c) => c.id === "god").status, "PASS");
  assert.ok(ok.find((c) => c.id === "godRes"));
  assert.equal(run({ godSwap: true, god: null, layoutRasters: [] }).find((c) => c.id === "god").status, "FAIL");
  // Without the swap the old rule stands: the template's sample deity would print.
  assert.equal(run({}).find((c) => c.id === "god").status, "FAIL");
});

test("print check: an optional picture (PICTURE_AREA) gets its own resolution check", () => {
  const { runPrintCheck } = require("../src/services/export/printCheck");
  const { CALENDAR_FORMATS } = require("../src/constants/calendar");
  const SPECIAL = CALENDAR_FORMATS.find((f) => f.cutType === "special-die-cut" && f.sizeCode === "12x18");
  const v = { cutType: "special-die-cut", sizeCode: "12x18", trim: { widthMm: 294.64, heightMm: 466.17 }, cutline: { path: "M0 0 L1 0 L1 1 Z" }, regions: [], assets: {} };
  const settings = { dpi: 300, dpiConfirmed: false, cutlineStrokeMm: 0.1, cutlineColor: null, pending: [] };
  const checks = runPrintCheck({
    variant: v, format: SPECIAL, settings, content: { businessName: "X" }, options: {},
    images: { picture: { size: { width: 2508, height: 1149 }, box: { x: 0, y: 0, width: 83, height: 38 } } },
  }).checks;
  assert.equal(checks.find((c) => c.id === "picture").status, "PASS");
});
