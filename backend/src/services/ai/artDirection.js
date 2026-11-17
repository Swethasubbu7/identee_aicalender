// AI Mode only: an "art direction" for each design, so every generation is
// its own creative design (not the same template each time). One option is
// picked from each list by a seed (the job id + design number), so a design
// keeps its direction when regenerated and two designs of one job differ.
// The designer's own prompt (colours, mood) always comes first; these only
// add design ideas a professional calendar designer would use.
const crypto = require("crypto");

const ARCHES = [
  "a carved gold temple gopuram arch with tiered spires and fine filigree",
  "a royal mandapam arch on slender carved pillars with hanging brass bells",
  "a scalloped Mughal-South Indian arch with jewelled kundan inlay",
  "a lotus-petal arch built from layered golden petals and pearl strings",
  "a peacock arch: two ornate peacocks facing each other above the deity, tails flowing down the sides",
  "a Tanjore-style gilded frame with raised gesso ornaments and gemstone accents",
  "a sun-burst prabhavali (radiant halo arch) with flame-like gold rays",
  "an elephant-and-yali carved stone arch finished in antique gold",
];
const FLOWERS = [
  "jasmine strings and red roses",
  "pink and white lotuses with lotus leaves",
  "marigold garlands in saffron and yellow",
  "white jasmine with tulsi leaves",
  "red hibiscus and jasmine",
  "pink lotus buds with mango-leaf thoranam",
  "rose petals and white chrysanthemums",
];
const ORNAMENTS = [
  "brass diyas with soft flames",
  "conch shells and a pair of kalasams",
  "hanging temple bells and pearl tassels",
  "kolam-inspired gold line ornaments",
  "small gold coins and kumkum bowls",
  "banana-leaf and mango-leaf festive accents",
];
const LIGHTING = [
  "warm golden temple light from above",
  "soft morning light with a gentle glow around the deity",
  "rich evening lamp-light with deep, elegant shadows",
  "radiant divine backlight with a soft vignette",
];
const BACKGROUNDS = [
  "a smooth gradient with a very subtle gold mandala pattern",
  "a fine damask pattern in tone-on-tone",
  "soft temple-silhouette motifs fading into the background",
  "a delicate kolam lattice in faint gold",
  "rich velvet texture with a faint paisley motif",
];

// The lower part of the board around the calendar pad: same theme as the
// top, but its own design each time (designer request 2026-11-16).
const BOTTOMS = [
  "a carved gold base ledge with a lotus-petal border running along the bottom edge, small brass diyas at both ends",
  "temple steps in polished stone and gold rising towards the deity, with flower offerings on the steps",
  "a large faint mandala medallion glowing behind the calendar pad, with a scalloped gold border along the bottom edge",
  "cascading flower garlands framing both sides of the calendar pad, gathered with gold clasps at the bottom",
  "a pair of ornate brass kuthuvilakku lamps standing on either side of the calendar pad, on a carved gold base",
  "a peacock-feather fan pattern radiating softly from behind the calendar pad, edged with a fine gold filigree border",
  "a row of golden lotus blossoms on water ripples along the bottom, with soft reflections",
  "an ornate jewelled gold border with hanging pearl strings and small bells along the bottom edge",
];

const pickBy = (list, seed, salt) => {
  const h = crypto.createHash("sha256").update(`${seed}:${salt}`).digest();
  return list[h.readUInt32BE(0) % list.length];
};

/** @returns { text, parts } — one art direction for this design. */
const artDirectionFor = (seed) => {
  const parts = {
    arch: pickBy(ARCHES, seed, "arch"),
    flowers: pickBy(FLOWERS, seed, "flowers"),
    ornaments: pickBy(ORNAMENTS, seed, "ornaments"),
    lighting: pickBy(LIGHTING, seed, "lighting"),
    background: pickBy(BACKGROUNDS, seed, "background"),
    bottom: pickBy(BOTTOMS, seed, "bottom"),
  };
  const text =
    `ART DIRECTION for this design: frame the deity with ${parts.arch}; ` +
    `decorate with ${parts.flowers}, and ${parts.ornaments}; ` +
    `lighting: ${parts.lighting}; lower background: ${parts.background}; ` +
    `bottom section (around and below the calendar pad, in the same colours and style as the top): ${parts.bottom}.`;
  return { text, parts };
};

module.exports = { artDirectionFor, ARCHES, FLOWERS, ORNAMENTS, LIGHTING, BACKGROUNDS, BOTTOMS };
