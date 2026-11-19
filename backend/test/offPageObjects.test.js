// A production PDF with a copy of the cut outline and the cake placed BESIDE
// the page (on the designer's pasteboard), the artwork clipped to the die
// shape, and the cutline only in the laser PDF (spl cal -02, 2026-11-17).
// The off-page copies must not count as artwork / cake, so the laser cutline
// is placed exactly on the artwork by the cake.
const test = require("node:test");
const assert = require("node:assert/strict");
const { analysePage, analyseLaserPage, compareDesignLaser } = require("../src/services/layout/pdfAnalysis");
const { CALENDAR_FORMATS } = require("../src/constants/calendar");

const FORMAT = CALENDAR_FORMATS.find((f) => f.cutType === "special-die-cut" && f.sizeCode === "12x18");
const rect = (x, y, w, h) => `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`;
const path = (id, x, y, w, h, extra = {}) => ({
  id,
  type: "path",
  paint: "stroke",
  closed: true,
  path: rect(x, y, w, h),
  bbox: { x, y, width: w, height: h },
  strokeColor: "#2c2e35",
  strokeWidthMm: 0.2,
  ...extra,
});

const designPage = {
  index: 0,
  widthMm: 304.8,
  heightMm: 457.2,
  objects: [
    // Artwork clipped to the die shape (bleeds a little past the page).
    { id: "clip", type: "path", paint: "clip", closed: false, path: rect(5.1, -4.5, 294.6, 466.2), bbox: { x: 5.1, y: -4.5, width: 294.6, height: 466.2 } },
    { id: "art", type: "image", bbox: { x: 5, y: -4.7, width: 294.7, height: 466.5 }, imageWidthPx: 993, imageHeightPx: 1572 },
    // The cake on the artwork.
    path("cake", 88.9, 355.2, 127, 101.6),
    // Pasteboard copies beside the page: the outline and the cake.
    path("outline-copy", 521.3, -4.5, 294.6, 466.2),
    path("cake-copy", 605.2, 355.2, 127, 101.6),
    { id: "name", type: "text", text: "CLUTCH CREATION", bbox: { x: 80.7, y: 269, width: 140, height: 14.9 } },
  ],
};
const laserPage = {
  index: 0,
  widthMm: 314.64,
  heightMm: 486.17,
  objects: [path("cut", 10, 10, 294.6, 466.2, { strokeColor: "#fb3199" }), path("laser-cake", 93.8, 369.7, 127, 101.6, { strokeColor: "#fb3199" })],
};

test("off-page copies (pasteboard) are not artwork, not a cake and not an outline to pick", () => {
  const a = analysePage(designPage, FORMAT);
  assert.deepEqual(a.artworkBounds, { x: 5, y: -4.7, width: 294.7, height: 466.5 });
  assert.deepEqual(a.cake.onArtwork, ["cake"]);
  assert.equal(a.detected.cake, "AUTO");
  assert.deepEqual(a.cutline.nearMisses, []);
});

test("the laser cutline is then placed exactly on the artwork by the cake", () => {
  const a = analysePage(designPage, FORMAT);
  const cmp = compareDesignLaser(designPage, a, analyseLaserPage(laserPage, FORMAT));
  assert.equal(cmp.suggestedAlignment.method, "cake");
  assert.equal(cmp.suggestedAlignment.exact, true);
  // Exactly where the artwork's own die-shaped clip is.
  assert.deepEqual(cmp.suggestedAlignment.offsetMm, { x: 5.1, y: -4.5 });
});

test("objects that overlap the page edge still count (artwork bleeding past the page)", () => {
  const page = { ...designPage, objects: designPage.objects.filter((o) => !o.id.endsWith("-copy")) };
  const bleed = { ...page, objects: [...page.objects, path("edge", 290, 100, 30, 30)] };
  assert.ok(analysePage(bleed, FORMAT).artworkBounds.width > 300);
});

// ---- Special Die-Cut shapes of their own size (owner decision 2026-11-17) ----
const { specialShapeFits } = require("../src/constants/calendar");
const { validateLayoutVariant } = require("../src/services/layout/layoutValidator");
const { detectFormat, isRectangular } = require("../src/services/layout/autoFormat");

test("Special Die-Cut: a shape within 15 mm of the catalogue size is accepted (WARN); Die-Cut stays strict (FAIL)", () => {
  const trim = { widthMm: 294.64, heightMm: 466.17 };
  assert.equal(specialShapeFits("special-die-cut", trim, FORMAT), true);
  assert.equal(specialShapeFits("die-cut", trim, FORMAT), false);
  assert.equal(specialShapeFits("special-die-cut", { widthMm: 280, heightMm: 466 }, FORMAT), false); // 24.8 mm off
  const trimCheck = (cutType) =>
    validateLayoutVariant(
      { cutType, sizeCode: "12x18", trim, cutline: { path: rect(0, 0, 294.64, 466.17) }, regions: [], assets: {} },
      { format: FORMAT, profile: null, toleranceMm: 1 },
    ).results.find((r) => r.code === "TRIM_SIZE");
  assert.equal(trimCheck("special-die-cut").status, "WARN");
  assert.match(trimCheck("special-die-cut").message, /printed and cut at its own size/);
  assert.equal(trimCheck("die-cut").status, "FAIL");
});

test("a die shape with many inner cuts is not mistaken for a rectangle; upload offers Special of its own size", () => {
  // Outer arch-like outline + 30 tiny inner holes (as in the laser PDF).
  const outer = "M0 100 C0 0 294.6 0 294.6 100 L294.6 466.2 C200 500 94.6 500 0 466.2 Z";
  const holes = Array.from({ length: 30 }, (_, i) => rect(50 + i * 5, 200, 2, 2)).join(" ");
  const cut = { id: "cut", type: "path", paint: "stroke", closed: true, path: `${outer} ${holes}`, bbox: { x: 0, y: 0, width: 294.6, height: 466.2 } };
  assert.equal(isRectangular(cut), false);
  assert.equal(isRectangular({ ...cut, path: rect(0, 0, 294.6, 466.2) }), true); // a real rectangle still is one
  const detection = detectFormat({ pages: [{ index: 0, objects: [cut] }] }, [FORMAT, { ...FORMAT, cutType: "die-cut" }]);
  assert.equal(detection.cutType, "special-die-cut");
  assert.equal(detection.sizeCode, "12x18");
  assert.equal(detection.confident, false); // the designer confirms
});

// ---- Text areas of their own size (owner request 2026-11-17, SPL-CAL-02) ----
const { buildVariantGeometry } = require("../src/services/layout/mappingBuilder");

test("a text area can be given its own size on the calendar (kept on save); outside the calendar is refused", () => {
  const page = {
    index: 0,
    widthMm: 304.8,
    heightMm: 457.2,
    objects: [
      path("cut", 5, 0, 294.6, 457, { strokeColor: "#000000" }),
      { id: "line1", type: "text", text: "SHOP NO. 503", fontName: "FranklinGothic-Heavy", fontSizePt: 12, bbox: { x: 80, y: 290, width: 130, height: 3.8 } },
    ],
  };
  const mapping = (areaMm) => ({
    pageIndex: 0,
    cutlineObjectId: "cut",
    regions: [{ role: "TEXT_LINE_1", objectIds: ["line1"], binding: "productList", ...(areaMm && { areaMm }) }],
  });
  const plain = buildVariantGeometry(page, mapping(null)).regions[0];
  assert.equal(plain.box.height, 3.8); // the sample text's own area
  const area = { x: 68, y: 291.5, width: 155.6, height: 9.1 };
  const wide = buildVariantGeometry(page, mapping(area)).regions[0];
  assert.deepEqual(wide.box, area);
  assert.deepEqual(wide.textBox, area);
  assert.equal(wide.textStyle.fontFamily, "FranklinGothic-Heavy"); // font still from the sample text
  assert.throws(() => buildVariantGeometry(page, mapping({ x: 280, y: 291, width: 80, height: 9 })), /must lie on the calendar/);
});
