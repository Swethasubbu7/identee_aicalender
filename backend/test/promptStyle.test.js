// Every AI image prompt asks for one consistent theme and never a cartoon look.
const test = require("node:test");
const assert = require("node:assert/strict");
const { fitGodPrompt, specialArtworkPrompt, STYLE_RULE } = require("../src/services/ai/calendarPrompts");

test("prompts: one theme top to bottom, no cartoon styles, before the designer's own words", () => {
  for (const p of [
    fitGodPrompt({ theme: null, prompt: "make it cartoon style" }),
    specialArtworkPrompt({ theme: null, prompt: "make it cartoon style", cutType: "die-cut" }),
  ]) {
    assert.ok(p.includes(STYLE_RULE));
    assert.match(p, /one consistent theme from top to bottom/);
    assert.match(p, /Never cartoon/);
    assert.ok(p.indexOf(STYLE_RULE) < p.indexOf("make it cartoon style"));
  }
});

test("AI Mode: the bottom section is designed (varied per design) and the pad marker is never painted as a block", () => {
  const { artDirectionFor, BOTTOMS } = require("../src/services/ai/artDirection");
  const a = artDirectionFor("job:0");
  assert.ok(BOTTOMS.includes(a.parts.bottom));
  assert.match(a.text, /bottom section .*same colours and style as the top/);
  assert.equal(artDirectionFor("job:0").parts.bottom, a.parts.bottom); // same on regenerate
  const bottoms = new Set(Array.from({ length: 20 }, (_, i) => artDirectionFor(`job:${i}`).parts.bottom));
  assert.ok(bottoms.size > 3, "different designs get different bottoms");
  const p = specialArtworkPrompt({ artDirection: a.text, cakeOverlapsArtwork: false });
  assert.match(p, /ONLY a position marker: never paint a flat, solid or blue box/);
  assert.match(p, /never a plain or empty lower half/);
});
