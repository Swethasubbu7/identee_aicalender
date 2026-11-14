// AI designs take their default colour theme from the God image (no AI call).
const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { imagePalette } = require("../src/services/ai/imagePalette");
const { themeFor } = require("../src/services/ai/themes");
const { specialArtworkPrompt } = require("../src/services/ai/calendarPrompts");

const picture = () =>
  sharp({ create: { width: 60, height: 60, channels: 3, background: "#ffffff" } })
    .composite([
      { input: { create: { width: 40, height: 30, channels: 3, background: "#0F6B4A" } }, left: 10, top: 5 },
      { input: { create: { width: 40, height: 15, channels: 3, background: "#C9A227" } }, left: 10, top: 40 },
    ])
    .png()
    .toBuffer();

test("image palette: main colours of the God picture, white background ignored", async () => {
  const p = await imagePalette(await picture());
  assert.match(p[0].name, /emerald/);
  assert.match(p[1].name, /gold|yellow/);
  assert.ok(p.every((c) => /^#[0-9A-F]{6}$/.test(c.hex)));
  assert.ok(!p.some((c) => c.name === "ivory"));
  assert.deepEqual(await imagePalette(Buffer.from("not an image")), []);
});

test("theme: no colours in the prompt → the God image's colours; prompt colours still win", async () => {
  const colours = await imagePalette(await picture());
  const t = themeFor("Make it beautiful", 1, colours);
  assert.equal(t.fromImage, true);
  assert.match(t.name, /^Matches the God image · /);
  assert.match(t.background, /emerald/);
  assert.notEqual(themeFor("Make it beautiful", 0, colours).name, t.name); // treatment changes
  assert.match(themeFor("royal maroon and gold", 0, colours).name, /^Maroon & Gold · /);
  assert.equal(themeFor("Make it beautiful", 0, []).name, "Red and gold festive");
});

test("prompt: an image theme asks for the whole calendar in the God picture's colours", async () => {
  const theme = themeFor("", 0, await imagePalette(await picture()));
  const p = specialArtworkPrompt({ theme, namePlate: true, hasTemplateReference: true });
  assert.match(p, /Design the ENTIRE calendar from image 1: take the colour scheme from the God picture itself \(deep emerald/);
  assert.match(p, /background, the frame and arch, the flowers and ornaments, the name plate, the ribbons and the side boxes/);
  assert.match(specialArtworkPrompt({ theme: themeFor("red", 0) }), /Match the lighting, mood and style of image 1/);
});

test("prompt: keeping the God image's own background keeps the whole picture and decorates around it", () => {
  const keep = specialArtworkPrompt({ keepGodBackground: true, namePlate: true });
  assert.match(keep, /WITH its own background/);
  assert.match(keep, /never removed, replaced or repainted/);
  assert.match(keep, /Paint the new frame, ornaments and decoration only AROUND that picture/);
  assert.doesNotMatch(keep, /original background removed/);
  assert.match(specialArtworkPrompt({}), /with its original background removed and replaced by your composition/);
});
