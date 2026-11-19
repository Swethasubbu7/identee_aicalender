const test = require("node:test");
const assert = require("node:assert/strict");
const { fontStyleOf, textColourOf, FONT_STYLE_KEYS, TEXT_COLOUR_KEYS } = require("../src/constants/typography");

test("typography: only listed font styles and text colours are kept ('' = automatic)", () => {
  assert.equal(fontStyleOf("bebas-opensans"), "bebas-opensans");
  assert.equal(fontStyleOf("comic-sans"), "");
  assert.equal(fontStyleOf(undefined), "");
  assert.equal(textColourOf("#FFD966"), "#FFD966");
  assert.equal(textColourOf("red; background:url(x)"), "");
  assert.ok(FONT_STYLE_KEYS.length >= 20);
  assert.ok(TEXT_COLOUR_KEYS.every((c) => /^#[0-9A-F]{6}$/.test(c)));
});

test("typography: text sizes keep known slots only, 70–150 %, 100 (automatic) left out", () => {
  const { textSizesOf } = require("../src/constants/typography");
  assert.deepEqual(textSizesOf({ businessName: 130, textLine1: 200, textLine2: 40, leftBox: 100, rightBox: "95", hack: 120 }), {
    businessName: 130,
    textLine1: 150,
    textLine2: 70,
    rightBox: 95,
  });
  assert.deepEqual(textSizesOf('{"textLine2":110.4}'), { textLine2: 110 });
  assert.deepEqual(textSizesOf("not json"), {});
  assert.deepEqual(textSizesOf(undefined), {});
  assert.deepEqual(textSizesOf({ businessName: "abc" }), {});
});

test("typography: font styles and text-size slots match the frontend lists", () => {
  const fs = require("fs");
  const path = require("path");
  const { TEXT_SIZE_KEYS, TEXT_SIZE_MIN, TEXT_SIZE_MAX } = require("../src/constants/typography");
  const front = path.join(__dirname, "..", "..", "frontend", "src", "utils");
  const fontSets = fs.readFileSync(path.join(front, "fontSets.js"), "utf8");
  // The style list (BASE_FONT_STYLES, grouped into FONT_STYLES below it).
  const start = fontSets.indexOf("const BASE_FONT_STYLES");
  const styles = fontSets.slice(start >= 0 ? start : fontSets.indexOf("export const FONT_STYLES"), fontSets.indexOf("export const TEXT_COLOURS"));
  const keys = [...styles.matchAll(/\{ key: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...keys].sort(), [...FONT_STYLE_KEYS].sort());
  assert.equal(new Set(keys).size, keys.length);
  // Every style has its font pair.
  for (const key of keys) assert.ok(fontSets.includes(`"${key}": { heading:`), key);
  const sizes = fs.readFileSync(path.join(front, "textSizes.js"), "utf8");
  assert.deepEqual([...sizes.matchAll(/\{ key: "([^"]+)", label/g)].map((m) => m[1]), TEXT_SIZE_KEYS);
  assert.match(sizes, new RegExp(`TEXT_SIZE_MIN = ${TEXT_SIZE_MIN};`));
  assert.match(sizes, new RegExp(`TEXT_SIZE_MAX = ${TEXT_SIZE_MAX};`));
});
