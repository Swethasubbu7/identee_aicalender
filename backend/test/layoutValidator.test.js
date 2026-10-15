const test = require("node:test");
const assert = require("node:assert/strict");
const { validateLayoutVariant, isClosedPath } = require("../src/services/layout/layoutValidator");
const { CALENDAR_FORMATS } = require("../src/constants/calendar");

// SYNTHETIC test geometry only — round numbers chosen to exercise the rules.
// Real layouts come exclusively from production exports.
const format = (cutType, sizeCode) => ({
  ...CALENDAR_FORMATS.find((f) => f.cutType === cutType && f.sizeCode === sizeCode),
});

const region = (id, role, policy, box, extra = {}) => ({ id, role, policy, box, ...extra });
const text = (fontFamily = "Test Sans") => ({ textStyle: { fontFamily } });

const specialVariant = () => ({
  cutType: "special-die-cut",
  sizeCode: "12x18",
  trim: { widthMm: 304.8, heightMm: 457.2 },
  cutline: { path: "M 0 0 L 304.8 0 L 304.8 457.2 L 0 457.2 Z" },
  assets: { frame: "/uploads/test/frame.png", frameWidthPx: 3700 }, // ~304 DPI over 308.8 mm
  regions: [
    region("frame", "FRAME", "LOCKED", { x: -2, y: -2, width: 308.8, height: 461.2 }),
    region("god", "GOD_AREA", "AI", { x: 50, y: 20, width: 200, height: 200 }),
    region("name", "NAME_TEXT", "APP_TEXT", { x: 20, y: 230, width: 260, height: 30 }, {
      binding: "businessName", ...text(),
    }),
    region("l1", "TEXT_LINE_1", "APP_TEXT", { x: 40, y: 265, width: 220, height: 10 }, {
      binding: "productList", ...text(),
    }),
    region("l2", "TEXT_LINE_2", "APP_TEXT", { x: 40, y: 278, width: 220, height: 10 }, {
      binding: "address", ...text(),
    }),
    region("cal", "CALENDAR_AREA", "APP_CALENDAR", { x: 60, y: 295, width: 180, height: 150 }),
    // 12×18 cake "4×5" (H×W) = 101.6 mm tall × 127 mm wide.
    region("cake", "CAKE_MOUNT", "LOCKED", { x: 90, y: 300, width: 127, height: 101.6 }),
  ],
});

const run = (variant, fmt = format(variant.cutType, variant.sizeCode), profile = null) =>
  validateLayoutVariant(variant, { format: fmt, profile, toleranceMm: 0.5 });

const codes = (r, status) => r.results.filter((x) => x.status === status).map((x) => x.code);

test("a complete Special Die-Cut variant passes structure; production stays PENDING", () => {
  const r = run(specialVariant());
  assert.equal(r.status, "PASS", JSON.stringify(codes(r, "FAIL")));
  assert.equal(r.productionStatus, "PENDING");
  for (const code of ["BLEED", "SAFE_AREA", "FRAME_DPI", "CUTLINE_SPOT", "LASER_TOLERANCES", "COLOR_PROFILE"]) {
    assert.ok(codes(r, "PENDING").includes(code), `${code} should be PENDING`);
  }
});

test("Special Die-Cut must not have side boxes", () => {
  const v = specialVariant();
  v.regions.push(region("side", "SIDE_BOX_LEFT", "APP_TEXT", { x: 10, y: 300, width: 40, height: 80 }, {
    binding: "productList", ...text(),
  }));
  const r = run(v);
  assert.equal(r.status, "FAIL");
  assert.ok(codes(r, "FAIL").includes("FORBIDDEN_REGION"));
});

test("Normal and Die-Cut require both side boxes and forbid text lines", () => {
  for (const cutType of ["normal", "die-cut"]) {
    const v = { ...specialVariant(), cutType };
    const r = run(v);
    assert.equal(r.status, "FAIL");
    const fails = r.results.filter((x) => x.status === "FAIL").map((x) => x.message).join(" | ");
    assert.match(fails, /Missing SIDE_BOX_LEFT/);
    assert.match(fails, /Missing SIDE_BOX_RIGHT/);
    assert.match(fails, /TEXT_LINE_1 is not allowed/);
  }
});

test("cake mount must equal the catalogue cake size (H×W, not rotated)", () => {
  const v = specialVariant();
  // Rotated: 127 mm tall × 101.6 mm wide would be a 5×4 (H×W) cake.
  v.regions.find((x) => x.role === "CAKE_MOUNT").box = { x: 100, y: 300, width: 101.6, height: 127 };
  const r = run(v);
  assert.equal(r.status, "FAIL");
  assert.ok(codes(r, "FAIL").includes("CAKE_MOUNT_SIZE"));
});

test("a format with a pending cake size can never pass", () => {
  const pendingFormat = {
    ...format("special-die-cut", "12x18"),
    cake: { label: null, heightIn: null, widthIn: null, status: "PENDING" },
  };
  const r = run(specialVariant(), pendingFormat);
  assert.equal(r.status, "FAIL");
  assert.ok(codes(r, "FAIL").includes("CAKE_SIZE_CONFIRMED"));
});

test("trim size must match the fixed calendar size", () => {
  const v = specialVariant();
  v.trim = { widthMm: 300, heightMm: 457.2 };
  assert.ok(codes(run(v), "FAIL").includes("TRIM_SIZE"));
});

test("AI regions and locked regions are enforced by policy", () => {
  const v = specialVariant();
  v.regions.find((x) => x.role === "GOD_AREA").policy = "LOCKED";
  v.regions.find((x) => x.role === "CAKE_MOUNT").policy = "AI";
  const fails = run(v).results.filter((x) => x.code === "REGION_POLICY");
  assert.equal(fails.length, 2);
});

test("cutline must be present and closed", () => {
  assert.equal(isClosedPath("M0 0 L10 0 L10 10 Z"), true);
  assert.equal(isClosedPath("M0 0 L10 0 L10 10"), false);
  const v = specialVariant();
  v.cutline.path = "M0 0 L10 0";
  assert.ok(codes(run(v), "FAIL").includes("CUTLINE_PRESENT"));
  v.cutline.path = null;
  assert.ok(codes(run(v), "FAIL").includes("CUTLINE_PRESENT"));
});

test("text regions need a binding and a font", () => {
  const v = specialVariant();
  const name = v.regions.find((x) => x.role === "NAME_TEXT");
  name.binding = "address";
  name.textStyle = null;
  const failCodes = codes(run(v), "FAIL");
  assert.ok(failCodes.includes("REGION_BINDING"));
  assert.ok(failCodes.includes("TEXT_STYLE"));
});

test("bleed artwork may exceed the trim but must overlap it", () => {
  const v = specialVariant();
  v.regions.find((x) => x.role === "GOD_AREA").box = { x: -400, y: 20, width: 200, height: 200 };
  const fails = run(v).results.filter((x) => x.code === "REGION_INSIDE_TRIM" && x.status === "FAIL");
  assert.deepEqual(fails.map((x) => x.regionId), ["god"]);
  // The frame in the base fixture extends 2 mm past every edge — allowed.
  assert.equal(run(specialVariant()).status, "PASS");
});

test("regions outside the trim fail, except a hanging cake (warning)", () => {
  const v = specialVariant();
  v.regions.find((x) => x.role === "NAME_TEXT").box.x = -20;
  v.regions.find((x) => x.role === "CAKE_MOUNT").box.y = 370; // bottom at 471.6 > 457.2
  const r = run(v);
  const inside = r.results.filter((x) => x.code === "REGION_INSIDE_TRIM");
  assert.deepEqual(inside.map((x) => [x.regionId, x.status]).sort(), [["cake", "WARN"], ["name", "FAIL"]]);
});

test("production checks run once printer values are configured", () => {
  const profile = {
    print: { bleedMm: 3, safeMarginMm: 5, minDpi: 300, iccProfileName: "test" },
    laser: { cutlineSpotName: "TestCut", kerfMm: 0.1, minFeatureMm: 1 },
  };
  const ok = run(specialVariant(), undefined, profile);
  assert.ok(ok.results.some((x) => x.code === "FRAME_DPI" && x.status === "PASS"));
  assert.ok(!ok.results.some((x) => x.code === "SAFE_AREA" && x.status !== "PASS"));

  const v = specialVariant();
  v.assets.frameWidthPx = 1000; // ~82 DPI over ~309 mm
  v.regions.find((x) => x.role === "TEXT_LINE_1").box.x = 2; // inside trim, outside 5 mm safe area
  const bad = run(v, undefined, profile);
  assert.ok(bad.results.some((x) => x.code === "FRAME_DPI" && x.status === "FAIL"));
  assert.ok(bad.results.some((x) => x.code === "SAFE_AREA" && x.status === "FAIL" && x.regionId === "l1"));
  assert.equal(bad.productionStatus, "FAIL");
  assert.equal(bad.status, "PASS"); // production problems never alter the structural verdict
});
