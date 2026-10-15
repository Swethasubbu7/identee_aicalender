const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pickContent } = require("../src/controllers/calendarDesign.controller");
const { imageSize } = require("../src/lib/imageSize");

test("design content: only known slots are stored, text is capped", () => {
  const update = pickContent({
    businessName: "SRI MURUGAN TEXTILES",
    productList: "A".repeat(5000),
    godImage: "/uploads/design-content/123-image.webp",
    productImage: null,
    hacker: "x",
  });
  assert.deepEqual(Object.keys(update).sort(), [
    "content.businessName",
    "content.godImage",
    "content.productImage",
    "content.productList",
  ]);
  assert.equal(update["content.productList"].length, 2000);
  assert.equal(update["content.productImage"], null);
});

test("design content: images must be files uploaded for designs", () => {
  assert.throws(() => pickContent({ godImage: "http://evil.example/x.png" }), /uploaded design image/);
  assert.throws(() => pickContent({ godImage: "/uploads/layouts/frame.png" }), /uploaded design image/);
  assert.throws(() => pickContent({ productImage: "/uploads/design-content/../production/x.pdf" }), /uploaded design image/);
  assert.deepEqual(pickContent(undefined), {});
});

test("imageSize reads WebP (VP8X / VP8 / VP8L) headers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "webp-"));
  const riff = (chunk, body) => Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.from(chunk), Buffer.alloc(4), body]);
  // VP8X: canvas width-1 at byte 24, height-1 at byte 27 (from file start)
  const fx = riff("VP8X", Buffer.alloc(14));
  fx.writeUIntLE(999, 24, 3); fx.writeUIntLE(1599, 27, 3);
  fs.writeFileSync(path.join(dir, "x.webp"), fx);
  assert.deepEqual(imageSize(path.join(dir, "x.webp")), { width: 1000, height: 1600, type: "webp" });

  const fl = riff("VP8L", Buffer.alloc(14));
  const bits = (1080 - 1) | ((720 - 1) << 14);
  fl.writeUInt32LE(bits >>> 0, 21);
  fs.writeFileSync(path.join(dir, "l.webp"), fl);
  assert.deepEqual(imageSize(path.join(dir, "l.webp")), { width: 1080, height: 720, type: "webp" });
  fs.rmSync(dir, { recursive: true, force: true });
});

test("section switches (incl. Special Die-Cut text lines) and right-box mode are saved safely", () => {
  const update = pickContent({
    showBusinessName: false,
    showLeftBox: "false",
    showRightBox: true,
    showTextLine1: false,
    showTextLine2: "yes",
    rightBoxMode: "text",
    rightBoxText: "உங்கள் கட்டுமானத் தேவைகள்",
  });
  assert.equal(update["content.showBusinessName"], false);
  assert.equal(update["content.showLeftBox"], false);
  assert.equal(update["content.showRightBox"], true);
  assert.equal(update["content.showTextLine1"], false);
  assert.equal(update["content.showTextLine2"], true);
  assert.equal(update["content.rightBoxMode"], "text");
  // Tamil text is stored exactly as typed.
  assert.equal(update["content.rightBoxText"], "உங்கள் கட்டுமானத் தேவைகள்");
  assert.equal(pickContent({ rightBoxMode: "video" })["content.rightBoxMode"], "image");
});
