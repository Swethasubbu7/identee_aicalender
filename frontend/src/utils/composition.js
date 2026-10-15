// How the god image is composed into a layout (mirror of
// backend/src/services/layout/composition.js).
//   GOD_AREA     — the deity goes into the mapped god opening.
//   FULL_ARTWORK — one AI picture repaints the whole artwork (deity, frame,
//                  background) inside the approved cutline: Special Die-Cut
//                  without a god area, and ANY cut type when the customer
//                  switched an optional section off or left it empty. With AI off the app shows
//                  a free preview of the template.
const OPTIONAL_SECTIONS = [
  { key: "showBusinessName", roles: ["NAME_TEXT", "NAME_BANNER"] },
  { key: "showLeftBox", roles: ["SIDE_BOX_LEFT"] },
  { key: "showRightBox", roles: ["SIDE_BOX_RIGHT"] },
  { key: "showTextLine1", roles: ["TEXT_LINE_1"] },
  { key: "showTextLine2", roles: ["TEXT_LINE_2"] },
];

export const compositionMode = (variant) =>
  variant?.cutType === "special-die-cut" && !(variant.regions || []).some((r) => r.role === "GOD_AREA")
    ? "FULL_ARTWORK"
    : "GOD_AREA";

export const disabledSections = (variant, options = {}) =>
  OPTIONAL_SECTIONS.filter((s) => (variant?.regions || []).some((r) => s.roles.includes(r.role)) && options[s.key] === false).map(
    (s) => s.key,
  );

// Does the customer's content fill a region? Each optional region is bound
// to one content field; the right box shows the product photo or, in text
// mode, the right-box text. Regions without a binding count as filled.
// In AI mode a right box set to "image" without an uploaded photo is still
// wanted: the AI paints a picture of the business's products there.
const hasContent = (region, options = {}, content = {}, { aiPaintsProduct = false } = {}) => {
  const binding = region.binding;
  if (!binding) return true;
  if (region.role === "SIDE_BOX_RIGHT" || binding === "productImage") {
    if (options.rightBoxMode === "text") return Boolean(String(content.rightBoxText || "").trim());
    return Boolean(content.productImage) || aiPaintsProduct;
  }
  return Boolean(String(content[binding] || "").trim());
};

/**
 * The sections actually shown: switched on AND given content. A section left
 * empty is treated exactly like one switched off — its space becomes artwork,
 * never an empty box, panel or banner.
 */
export const effectiveOptions = (variant, options = {}, content = {}, mode = {}) => {
  const out = { ...options };
  for (const section of OPTIONAL_SECTIONS) {
    const regions = (variant?.regions || []).filter((r) => section.roles.includes(r.role));
    if (!regions.length || out[section.key] === false) continue;
    out[section.key] = regions.some((r) => hasContent(r, options, content, mode));
  }
  return out;
};

/** AI mode: the right box shows an AI-painted product picture (no photo uploaded). */
export const aiPaintsProductImage = (options = {}, content = {}) =>
  options.showRightBox !== false && options.rightBoxMode !== "text" && !content.productImage;

export const generationMode = (variant, options = {}) =>
  compositionMode(variant) === "FULL_ARTWORK" || disabledSections(variant, options).length ? "FULL_ARTWORK" : "GOD_AREA";

/** True when this design's artwork is one AI picture (no template layers). */
export const usesAiArtwork = (variation) => variation?.composition === "FULL_ARTWORK" && Boolean(variation.background);
