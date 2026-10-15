const test = require("node:test");
const assert = require("node:assert/strict");
const { pickProfileFields } = require("../src/controllers/productionProfile.controller");
const {
  getUpscaler,
  registerUpscaler,
  requiredScale,
} = require("../src/services/ai/upscaler");

test("production profile: only known fields are copied; blanks reset to pending", () => {
  const update = pickProfileFields({
    print: { bleedMm: "3", safeMarginMm: "", unknownField: 1 },
    laser: { cutlineSpotName: "", registrationMarksRequired: true },
    hacker: true,
  });
  assert.deepEqual(update, {
    "print.bleedMm": 3,
    "print.safeMarginMm": null,
    "laser.cutlineSpotName": null,
    "laser.registrationMarksRequired": true,
  });
});

test("production profile: negative or non-numeric values are rejected", () => {
  assert.throws(() => pickProfileFields({ print: { minDpi: -1 } }), /non-negative/);
  assert.throws(() => pickProfileFields({ laser: { kerfMm: "abc" } }), /non-negative/);
});

test("upscaler: default provider is 'none' and refuses to fake an upscale", async () => {
  const none = getUpscaler("none");
  assert.equal(none.isConfigured(), false);
  await assert.rejects(none.upscale({}), (err) => err.code === "UPSCALER_NOT_CONFIGURED");
});

test("upscaler: providers are pluggable without changing call sites", async () => {
  registerUpscaler({
    name: "test-double",
    isConfigured: () => true,
    upscale: async ({ targetWidthPx, targetHeightPx }) => ({
      buffer: Buffer.alloc(0),
      mimeType: "image/png",
      widthPx: targetWidthPx,
      heightPx: targetHeightPx,
    }),
  });
  const out = await getUpscaler("test-double").upscale({ targetWidthPx: 10, targetHeightPx: 20 });
  assert.equal(out.widthPx, 10);
  assert.throws(() => getUpscaler("does-not-exist"), /Unknown upscaler/);
  assert.throws(() => registerUpscaler({ name: "broken" }), /upscale\(\) function/);
});

test("requiredScale is unknown until a target resolution exists", () => {
  assert.equal(requiredScale(1000, null), null);
  assert.equal(requiredScale(1000, 3000), 3);
  assert.equal(requiredScale(4000, 3000), 1);
});
