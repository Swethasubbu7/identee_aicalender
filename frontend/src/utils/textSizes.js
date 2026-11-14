// Designer's text-size adjustment per text slot, in percent of the size the
// app chooses automatically (100 = automatic). Kept in step with backend
// constants/typography.js (TEXT_SIZE_KEYS, TEXT_SIZE_MIN / MAX).
//   Text never grows out of its panel: a larger size stops at the largest
//   size that still fits (the preview reports it).
export const TEXT_SIZE_MIN = 70;
export const TEXT_SIZE_MAX = 150;
export const TEXT_SIZE_STEP = 5;

export const TEXT_SIZE_SLOTS = [
  { key: "businessName", label: "Business name" },
  { key: "textLine1", label: "Text line 1" },
  { key: "textLine2", label: "Text line 2" },
  { key: "textLine3", label: "Text line 3" },
  { key: "leftBox", label: "Left box" },
  { key: "rightBox", label: "Right box" },
];
const KEYS = TEXT_SIZE_SLOTS.map((s) => s.key);

/** Only known slots, whole percents within range; 100 (automatic) is left out. */
export const normaliseTextSizes = (sizes) => {
  const out = {};
  for (const key of KEYS) {
    const v = Math.round(Number(sizes?.[key]));
    if (Number.isFinite(v) && v !== 100) out[key] = Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, v));
  }
  return out;
};

/** The size slot of a layout region (null = not adjustable). */
export const textSizeSlotOf = (region) => {
  if (region.binding === "businessName" || region.role === "NAME_TEXT") return "businessName";
  if (region.role === "TEXT_LINE_1") return "textLine1";
  if (region.role === "TEXT_LINE_2") return "textLine2";
  if (region.role === "TEXT_LINE_3") return "textLine3";
  if (region.role === "SIDE_BOX_LEFT") return "leftBox";
  if (region.role === "SIDE_BOX_RIGHT") return "rightBox";
  return null;
};

/** The multiplier for a region (1 = automatic). */
export const textScaleFor = (sizes, region) => {
  const key = textSizeSlotOf(region);
  const v = key ? normaliseTextSizes(sizes)[key] : undefined;
  return v ? v / 100 : 1;
};

// Smallest printed size that still reads clearly (pt), per content field.
const READABLE_PT = { businessName: 10, productList: 7, address: 7, rightBoxText: 6 };
export const readablePt = (contentKey) => READABLE_PT[contentKey] ?? 6;
