const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CALENDAR_FORMATS,
  SIZES_BY_CUT_TYPE,
} = require("../src/constants/calendar");
const units = require("../src/lib/units");
const { toPublicUrl, uploadPath } = require("../src/lib/assetUrl");

const find = (cutType, sizeCode) =>
  CALENDAR_FORMATS.find((f) => f.cutType === cutType && f.sizeCode === sizeCode);

test("catalogue has the 13 confirmed cut type × size combinations", () => {
  assert.equal(CALENDAR_FORMATS.length, 13);
  assert.deepEqual(SIZES_BY_CUT_TYPE.normal, ["10x15", "12x18", "15x24", "20x30", "30x40"]);
  assert.deepEqual(SIZES_BY_CUT_TYPE["die-cut"], ["12x18", "15x24", "20x30", "30x40"]);
  assert.deepEqual(SIZES_BY_CUT_TYPE["special-die-cut"], ["12x18", "15x24", "20x30", "30x40"]);
  assert.equal(find("die-cut", "10x15"), undefined);
  assert.equal(find("special-die-cut", "10x15"), undefined);
});

// Cake convention is HEIGHT × WIDTH: "4×5" = 4 in tall, 5 in wide.
const hw = (f) => [f.cake.heightIn, f.cake.widthIn];

test("cake sizes match the confirmed table (H×W)", () => {
  for (const cutType of ["normal", "die-cut", "special-die-cut"]) {
    assert.deepEqual(hw(find(cutType, "12x18")), [4, 5]);
    assert.equal(find(cutType, "12x18").cake.label, "4×5");
    if (cutType !== "special-die-cut") assert.deepEqual(hw(find(cutType, "15x24")), [5, 7]); // confirmed 2026-10-07: 5 tall × 7 wide
    assert.deepEqual(hw(find(cutType, "20x30")), [7, 7]);
    // Confirmed 2026-10-07: 30×40 cake = 8×6.5 (H×W) = 8 in tall, 6.5 in wide.
    assert.deepEqual(hw(find(cutType, "30x40")), [8, 6.5]);
    assert.equal(find(cutType, "30x40").cake.label, "8×6.5");
    assert.equal(find(cutType, "30x40").cake.status, "CONFIRMED");
  }
  // Special 15×24 is unresolved (7×5 in the Special spec vs 5×7 drawn): PENDING
  // until the business confirms it, so no Special 15×24 layout can validate.
  assert.equal(find("special-die-cut", "15x24").cake.status, "PENDING");
  assert.deepEqual(hw(find("special-die-cut", "15x24")), [null, null]);
  assert.deepEqual(hw(find("normal", "10x15")), [3.5, 4]);
  assert.equal(find("normal", "10x15").cake.label, "3.5×4");
});

test("catalogue rows do not share cake objects", () => {
  find("normal", "12x18").cake.widthIn = 999;
  assert.equal(find("die-cut", "12x18").cake.widthIn, 5);
  find("normal", "12x18").cake.widthIn = 5;
});

test("unit conversions", () => {
  assert.ok(Math.abs(units.inToMm(12) - 304.8) < 1e-9);
  assert.equal(units.coreUnitsToMm(7620000), 762); // 30 in page from the CDR metadata
  assert.ok(Math.abs(units.ptToMm(72) - 25.4) < 1e-9);
  assert.equal(units.mmToPx(25.4, 300), 300);
  assert.equal(units.effectiveDpi(600, 50.8), 300);
  assert.equal(units.effectiveDpi(600, 0), 0);
});

test("asset URLs: relative paths get the public origin, absolute ones pass through", () => {
  assert.equal(uploadPath("layouts", "a.png"), "/uploads/layouts/a.png");
  assert.match(toPublicUrl("/uploads/layouts/a.png"), /^https?:\/\/[^/]+\/uploads\/layouts\/a\.png$/);
  assert.equal(toPublicUrl("http://old-host:5000/uploads/x.png"), "http://old-host:5000/uploads/x.png");
  assert.equal(toPublicUrl(""), "");
  assert.equal(toPublicUrl(null), null);
});
