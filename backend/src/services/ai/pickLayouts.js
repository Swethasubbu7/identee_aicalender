// Which production layout each design uses.
//
// Rules (confirmed by the business):
// - The selected layout is the source of truth and stays FIXED: every design
//   uses exactly that layout (cut type, size, cutline, cake and calendar
//   positions) and the same god image. (2026-10-10)
// - Generate makes 2 visually different but related designs of that one
//   layout (business decision 2026-10-12); the differences come from the
//   design recipes (constants/designRecipes.js). Never a different layout.

// - Every cut type, Special Die-Cut included: 2 designs per Generate, each
//   a different creative composition of the same layout (business decision
//   2026-10-14, replacing the earlier 5 for Special). One image request each.
const VARIATION_COUNT = 2;
const VARIATION_COUNT_BY_CUT_TYPE = {};
const variationCountFor = (cutType) => VARIATION_COUNT_BY_CUT_TYPE[cutType] || VARIATION_COUNT;

/** @returns [{ variant, themeIndex }] — the designs of the selected layout */
const pickLayoutsForVariations = (selected, count = variationCountFor(selected?.cutType)) =>
  Array.from({ length: count }, (_, themeIndex) => ({ variant: selected, themeIndex }));

module.exports = { pickLayoutsForVariations, variationCountFor, VARIATION_COUNT, VARIATION_COUNT_BY_CUT_TYPE };
