// Free God-image tools and the God-image library helpers. No AI, no database.
const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { removeBackground, enhance } = require("../src/services/image/godImageTools");
const { cleanAliases, isLibraryPath, LIBRARY_PREFIX } = require("../src/controllers/godImage.controller");
const { hasContentForTest } = (() => {
  const { effectiveOptions } = require("../src/services/layout/composition");
  return { hasContentForTest: effectiveOptions };
})();

// A red disc on a plain white background (200 × 160 px).
const discOnWhite = () =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="160"><rect width="200" height="160" fill="#ffffff"/><circle cx="100" cy="80" r="50" fill="#c0392b"/></svg>`,
    ),
  )
    .png()
    .toBuffer();

const alphaAt = async (png, x, y) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * 4 + 3];
};

test("remove background: a plain background becomes transparent, the deity stays", async () => {
  const input = await discOnWhite();
  const out = await removeBackground(input);
  assert.equal(out.widthPx, 200);
  assert.equal(out.heightPx, 160);
  assert.equal(out.plainBackground, true);
  assert.equal(await alphaAt(out.buffer, 2, 2), 0); // corner: removed
  assert.equal(await alphaAt(out.buffer, 100, 80), 255); // centre of the disc: kept
  assert.ok(out.removedShare > 0.4 && out.removedShare < 0.8);
  // The original buffer is unchanged.
  assert.equal(await alphaAt(input, 2, 2), 255);
});

test("enhance: larger (at most ×2), same aspect ratio, never smaller", async () => {
  const input = await discOnWhite();
  const out = await enhance(input);
  assert.equal(out.widthPx, 400);
  assert.equal(out.heightPx, 320);
  const capped = await enhance(input, { targetLongPx: 250 });
  assert.equal(capped.widthPx, 250);
  assert.equal(capped.heightPx, 200);
  const notSmaller = await enhance(input, { targetLongPx: 100 });
  assert.equal(notSmaller.widthPx, 200);
});

test("god library: aliases are cleaned, deduplicated and never repeat the name", () => {
  assert.deepEqual(cleanAliases("Pillaiyar, Ganesha\nganesha;  Vinayagar , ", "Vinayagar"), ["Pillaiyar", "Ganesha"]);
  assert.deepEqual(cleanAliases(["  Murugan ", "Karthikeya"], "Murugan"), ["Karthikeya"]);
  assert.ok(isLibraryPath(`${LIBRARY_PREFIX}abc.png`));
  assert.ok(!isLibraryPath("/uploads/design-content/123-image.png"));
});

test("left box as a picture: shown only when a picture was given", () => {
  const variant = { regions: [{ role: "SIDE_BOX_LEFT", binding: "productList" }] };
  const on = hasContentForTest(variant, { showLeftBox: true, leftBoxMode: "image" }, { leftBoxImage: "/uploads/design-content/x.png" });
  const off = hasContentForTest(variant, { showLeftBox: true, leftBoxMode: "image" }, { productList: "Cakes" });
  const text = hasContentForTest(variant, { showLeftBox: true }, { productList: "Cakes" });
  assert.equal(on.showLeftBox, true);
  assert.equal(off.showLeftBox, false);
  assert.equal(text.showLeftBox, true);
});
