// How the god image is composed into a layout.
//   GOD_AREA     — the deity goes into the mapped god opening (Normal, Die-Cut,
//                  and Special layouts that map one), the layout's own frame
//                  and content boxes stay.
//   FULL_ARTWORK — one AI picture per design repaints the whole artwork —
//                  deity, frame, background — inside the approved cutline;
//                  the app keeps the cutline, cake, calendar and typesets the
//                  text. Used for:
//                    - Special Die-Cut without a god area (always), and
//                    - ANY cut type when an optional section (business
//                      name, left / right box, text lines) is switched off
//                      OR left empty: the freed space must become artwork,
//                      never an empty box or strip (business decision
//                      2026-10-14).
//                  With AI off the template artwork is shown (app preview).
// Mirrored in frontend/src/utils/composition.js.

// Optional sections and the regions they own.
const OPTIONAL_SECTIONS = [
  { key: "showBusinessName", roles: ["NAME_TEXT", "NAME_BANNER"] },
  { key: "showLeftBox", roles: ["SIDE_BOX_LEFT"] },
  { key: "showRightBox", roles: ["SIDE_BOX_RIGHT"] },
  { key: "showTextLine1", roles: ["TEXT_LINE_1"] },
  { key: "showTextLine2", roles: ["TEXT_LINE_2"] },
];

/** The layout's own mode (without customer choices). */
const compositionMode = (variant) =>
  variant?.cutType === "special-die-cut" && !(variant.regions || []).some((r) => r.role === "GOD_AREA")
    ? "FULL_ARTWORK"
    : "GOD_AREA";

/** Optional sections this layout has. */
const sectionsOf = (variant) =>
  OPTIONAL_SECTIONS.filter((s) => (variant?.regions || []).some((r) => s.roles.includes(r.role)));

/** Sections the customer switched off (only ones the layout has). */
const disabledSections = (variant, options = {}) => sectionsOf(variant).filter((s) => options[s.key] === false).map((s) => s.key);

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
 * The sections actually shown: switched on AND given content. A section the
 * designer left empty is treated exactly like one switched off — its space
 * becomes artwork, never an empty box, panel or banner.
 */
const effectiveOptions = (variant, options = {}, content = {}, mode = {}) => {
  const out = { ...options };
  for (const section of sectionsOf(variant)) {
    if (out[section.key] === false) continue;
    const regions = (variant.regions || []).filter((r) => section.roles.includes(r.role));
    out[section.key] = regions.some((r) => hasContent(r, options, content, mode));
  }
  return out;
};

/** AI mode: the right box shows an AI-painted product picture (no photo uploaded). */
const aiPaintsProductImage = (options = {}, content = {}) =>
  options.showRightBox !== false && options.rightBoxMode !== "text" && !content.productImage;

/** The mode used to GENERATE a design with these customer options. */
const generationMode = (variant, options = {}) =>
  compositionMode(variant) === "FULL_ARTWORK" || disabledSections(variant, options).length ? "FULL_ARTWORK" : "GOD_AREA";

module.exports = {
  compositionMode,
  generationMode,
  disabledSections,
  effectiveOptions,
  aiPaintsProductImage,
  sectionsOf,
  OPTIONAL_SECTIONS,
};
