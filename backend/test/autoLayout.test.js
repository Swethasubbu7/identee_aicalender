// Automatic layout analysis on the real 12x18 die-cut files (DIE-CUT03):
// size / cut type from the laser PDF, and the detected areas match the
// mapping that was checked by hand. Skipped where the files are not present.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { detectFormat, isRectangular } = require("../src/services/layout/autoFormat");
const { analysePage } = require("../src/services/layout/pdfAnalysis");
const { suggestMapping } = require("../src/services/layout/mappingSuggestions");

const IMPORTS = path.join(__dirname, "..", "src", "storage", "imports");
const DESIGN = path.join(IMPORTS, "1794650953819-productionPdf.pdf.objects.json");
const LASER = path.join(IMPORTS, "1794650953921-laserPdf.pdf.objects.json");
const present = fs.existsSync(DESIGN) && fs.existsSync(LASER);
const FORMATS = [
  { cutType: "normal", sizeCode: "12x18", widthIn: 12, heightIn: 18 },
  { cutType: "die-cut", sizeCode: "12x18", widthIn: 12, heightIn: 18 },
  { cutType: "special-die-cut", sizeCode: "12x18", widthIn: 12, heightIn: 18 },
  { cutType: "die-cut", sizeCode: "13x19", widthIn: 13, heightIn: 19 },
];

test("size and cut type come from the laser cutline; die-cut vs special is left to the designer", { skip: !present }, () => {
  const laser = JSON.parse(fs.readFileSync(LASER, "utf8"));
  const found = detectFormat(laser, FORMATS);
  assert.equal(found.sizeCode, "12x18");
  assert.equal(found.cutType, "die-cut");
  assert.equal(found.rectangular, false);
  assert.equal(found.confident, false, "die-cut and special die-cut both offer 12x18");
});

test("a rectangular cutline is a Normal cut; an unknown size asks the designer", () => {
  const page = (w, h) => ({ pages: [{ index: 0, objects: [{ type: "path", paint: "stroke", closed: true, bbox: { x: 0, y: 0, width: w, height: h }, path: `M0 0 L${w} 0 L${w} ${h} L0 ${h} Z` }] }] });
  const rect = detectFormat(page(304.8, 457.2), FORMATS);
  assert.equal(rect.cutType, "normal");
  assert.equal(rect.confident, true);
  assert.ok(isRectangular(page(10, 20).pages[0].objects[0]));
  const odd = detectFormat(page(200, 200), FORMATS);
  assert.equal(odd.sizeCode, null);
  assert.match(odd.reason, /not a catalogue size/);
  assert.equal(detectFormat({ pages: [] }, FORMATS).cutType, null);
});

test("detected areas on DIE-CUT03 match the hand-checked mapping (name is not the grey pattern)", { skip: !present }, () => {
  const design = JSON.parse(fs.readFileSync(DESIGN, "utf8"));
  const format = { widthIn: 12, heightIn: 18, cutType: "die-cut", cake: { widthIn: 5, heightIn: 4 } };
  const s = suggestMapping(design.pages[0], analysePage(design.pages[0], format), "die-cut");
  const ids = (role) => (s.regions.find((r) => r.role === role)?.objectIds || []).slice().sort();
  assert.deepEqual(ids("NAME_TEXT"), ["p1-652"]);
  assert.deepEqual(ids("FRAME"), ["p1-6"]);
  assert.deepEqual(ids("GOD_AREA"), ["p1-1", "p1-3"]);
  assert.deepEqual(ids("SIDE_BOX_LEFT"), ["p1-645", "p1-651"]);
  assert.deepEqual(ids("SIDE_BOX_RIGHT"), ["p1-648", "p1-649"]);
  assert.deepEqual(ids("CAKE_MOUNT"), ["p1-650"]);
  assert.ok(s.excludedObjectIds.includes("p1-653"), "the 5x4 guide label never prints");
  // Uncertain areas are marked for the designer to check.
  assert.equal(s.regions.find((r) => r.role === "GOD_AREA").confidence, "MEDIUM");
});

const SPECIAL_DESIGN = path.join(IMPORTS, "1794808166531-productionPdf.pdf.objects.json");
const SPECIAL_LASER = path.join(IMPORTS, "1794808166580-laserPdf.pdf.objects.json");
const { refineCutType } = require("../src/services/layout/autoFormat");

test("cut type is decided from the design: frame + God picture = Die-Cut, one artwork = Special", { skip: !present || !fs.existsSync(SPECIAL_DESIGN) }, () => {
  const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
  const F = FORMATS.map((f) => ({ ...f, cake: { widthIn: 5, heightIn: 4 } }));
  const dieCut = refineCutType(detectFormat(read(LASER), F), read(DESIGN), F);
  assert.equal(dieCut.cutType, "die-cut");
  assert.equal(dieCut.confident, true);
  const special = refineCutType(detectFormat(read(SPECIAL_LASER), F), read(SPECIAL_DESIGN), F);
  assert.equal(special.cutType, "special-die-cut");
  assert.equal(special.confident, true);
  // Special Die-Cut text lines are found too.
  const s = suggestMapping(read(SPECIAL_DESIGN).pages[0], analysePage(read(SPECIAL_DESIGN).pages[0], F[2]), "special-die-cut");
  for (const role of ["NAME_TEXT", "TEXT_LINE_1", "TEXT_LINE_2", "BACKGROUND_AREA", "CAKE_MOUNT"]) {
    assert.ok(s.regions.some((r) => r.role === role), role);
  }
});

test("God image position is kept within limits", () => {
  const { godPlacementOf } = require("../src/constants/typography");
  assert.deepEqual(godPlacementOf({ dx: 0.25, dy: -3, scale: 9 }), { dx: 0.25, dy: -1, scale: 3 });
  assert.deepEqual(godPlacementOf("x"), { dx: 0, dy: 0, scale: 1 });
  assert.deepEqual(godPlacementOf({ dx: "a", scale: 0.1 }), { dx: 0, dy: 0, scale: 0.3 });
});
