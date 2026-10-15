// Prompts for AI calendar generation. The AI only ever paints pictures for
// AI regions (god area, background area) and may enhance the product photo.
// It never writes text: the business name and product details are typeset
// by the app with the layout's own fonts, so they are always exactly what the
// designer typed. The frame, cutline, cake and calendar area come from the
// production layout and are drawn by the app on top of / around AI output.

const NO_TEXT =
  "Do not add any text, letters, numbers, logos, watermarks, signatures or calendar grids anywhere in the image.";

// The designer's prompt guides the creative treatment; it can never override the rules.
const designerNote = (prompt) =>
  prompt?.trim()
    ? `Designer's instructions for colours, style, decoration and mood (follow them unless they conflict with the rules above): ${prompt.trim()}`
    : "";

const CUT_TYPE_WORDS = {
  normal: "a rectangular printed wall calendar",
  "die-cut": "a die-cut (shaped) printed wall calendar",
  "special-die-cut": "a special die-cut (shaped) printed wall calendar",
};

const themeLine = (theme) =>
  theme
    ? `Visual theme "${theme.name}" (${theme.mood}). Colour palette: ${(theme.palette || []).join(", ")}.`
    : "";

/**
 * Per design (one picture): restore the customer's god image AND compose it
 * for this layout's frame.
 * Images: 1 = customer's god image, 2 = layout crop with the grey opening,
 * 3 (optional) = the whole calendar for colour / style context.
 */
const fitGodPrompt = ({ theme, prompt, hasStyleReference }) =>
  [
    "You are designing the main picture of a printed Indian devotional calendar.",
    "Image 1 is the deity picture supplied by the customer. It may be blurry, low resolution, cropped, old,",
    "a phone photo of a printed picture, a scan, or a pencil/line sketch: show the SAME deity as clean,",
    "sharp, richly detailed, high-quality artwork (render a sketch as a finished full-colour traditional",
    "devotional painting, complete cropped parts naturally, remove glare, creases, borders and any text).",
    "Image 2 is a crop of the calendar layout: the flat grey area is the OPENING where the deity picture goes;",
    "everything else in image 2 is the calendar's existing frame and decoration.",
    hasStyleReference ? "Image 3 shows the whole calendar, for colour and style context only." : "",
    "Create ONE image with exactly the same size and framing as image 2, where every frame element stays in the",
    "same position, and fill the grey opening with a new composition of the deity designed specifically for",
    "this frame: place and scale the deity so it sits naturally inside the opening's shape, with its head and",
    "crown comfortably below the top edge of the opening and nothing important hidden behind the frame; paint",
    "suitable surroundings (halo, aura, sky, temple elements, light, depth) that fill the whole opening edge",
    "to edge with no grey left, and match the lighting and colours to the frame.",
    "Keep the deity exactly the same: identity, face, pose, hand gestures (mudras), weapons and attributes,",
    "vahana, clothing and ornaments must not change, and no figures may be added or removed.",
    "Do not move, resize or restyle the frame or decorations outside the opening -",
    "they will be replaced by the original calendar artwork.",
    theme ? `${themeLine(theme)} Surroundings: ${theme.godSetting}` : "",
    NO_TEXT,
    designerNote(prompt),
  ]
    .filter(Boolean)
    .join(" ");

/**
 * Special Die-Cut without a fixed god area: ONE picture per design that is
 * the whole calendar artwork — deity, decorative frame and background —
 * composed for the approved die-cut shape.
 * Images: 1 = customer's god image, 2 = layout guide (white = outside the
 * cutline, grey = artwork, cream bands = calm text panels, blue box = where
 * the calendar pad is attached), 3 (optional) = the production template for
 * the general look only.
 */
// Five distinct compositions for one Special Die-Cut Generate (2026-10-14).
// All keep the production guide (cut shape, calendar pad, text panels).
const SPECIAL_COMPOSITIONS = [
  {
    id: "grand-deity",
    name: "Grand deity",
    brief:
      "COMPOSITION: make the deity large and majestic, filling most of the board above the calendar pad, with a light, " +
      "elegant frame that does not compete with the deity.",
  },
  {
    id: "cake-focused",
    name: "Calendar focus",
    brief:
      "COMPOSITION: a calm, simple design that draws the eye to the calendar pad: a smaller deity in the upper part, " +
      "uncluttered surroundings and a clean decorative border, generous calm space around the pad.",
  },
  {
    id: "ornate-frame",
    name: "Ornate frame",
    brief:
      "COMPOSITION: a medium-sized deity inside a rich ornamental frame — gold filigree, jewelled arches and fine " +
      "repeating ornaments following the die-cut outline.",
  },
  {
    id: "floral",
    name: "Floral garden",
    brief:
      "COMPOSITION: the deity surrounded by abundant fresh flowers, garlands and leaves (lotus, jasmine, marigold, " +
      "hibiscus), cascading along the die-cut edges.",
  },
  {
    id: "temple",
    name: "Temple scene",
    brief:
      "COMPOSITION: the deity in a temple setting with gopuram / pillars and soft depth behind, warm divine light and " +
      "a decorative border.",
  },
];
// Two-design cut types use two clearly different compositions.
const compositionFor = (i, total = SPECIAL_COMPOSITIONS.length) =>
  total === 2 ? SPECIAL_COMPOSITIONS[[0, 3][i % 2]] : SPECIAL_COMPOSITIONS[i % SPECIAL_COMPOSITIONS.length];

// Ways to use space freed by switched-off text sections (varied per design).
const FREED_SPACE = [
  "extend the deity's halo and surroundings into it",
  "fill it with flowers and garlands",
  "continue the ornamental frame and patterns through it",
  "use it for soft background texture and light",
  "extend the temple / background scene into it",
];

const SHAPE_WORDS = {
  normal: "rectangular",
  "die-cut": "die-cut (shaped)",
  "special-die-cut": "special die-cut (shaped)",
};

const specialArtworkPrompt = ({
  theme,
  prompt,
  hasTemplateReference,
  templateHasRemovedAreas = false,
  cakeOverlapsArtwork,
  composition = null,
  freedSpace = false,
  freedSpaceIndex = 0,
  products = "",
  cutType = "special-die-cut",
  noPanels = false,
  productArea = false,
}) =>
  [
    `You are designing the complete artwork of a ${SHAPE_WORDS[cutType] || "shaped"} printed Indian devotional wall calendar.`,
    "Image 1 is the deity picture supplied by the customer. It may be blurry, low resolution, cropped, old, a phone",
    "photo of a printed picture, a scan or a sketch: show the SAME deity as clean, sharp, richly detailed artwork,",
    "with its original background removed and replaced by your composition.",
    "Image 2 is the exact production guide of this calendar, at exactly the size and framing of the image you create:",
    "pure white = OUTSIDE the die-cut shape (it is cut away: leave it plain white, paint nothing there);",
    "grey = the calendar board, which your artwork must fill completely, edge to edge, following the outline exactly;",
    noPanels
      ? "there are no text panels: the whole board is artwork;"
      : "cream areas = panels where the app prints the customer's text or places a product box: keep them calm, plain and light, with no figures, ornaments or strong patterns inside them, and give them a simple decorative border;",
    productArea
      ? "green box = the right-side product picture: paint a clear, attractive illustration of the business's products there, in a simple decorative frame, with no text;"
      : "",
    // Follows the selected layout: some keep a separate cake space, in others
    // the lower artwork runs under the calendar pad.
    cakeOverlapsArtwork
      ? "blue box = where the printed calendar pad is attached on top: in this layout the decorative background may continue underneath it, but keep it calm there — no part of the deity, no faces, figures or important details inside it."
      : "blue box = where the printed calendar pad is attached: keep that area reserved — only a plain, calm continuation of the background colour; no part of the deity, no flowers, ornaments or figures inside it.",
    hasTemplateReference
      ? `Image 3 is the business's selected layout for this calendar: use it only as a guide to the style, colours and kind of decoration; do not copy its deity.${templateHasRemovedAreas ? " Flat grey patches in image 3 are sections the customer removed: they are artwork space — never reproduce them as boxes, panels or banners." : ""}`
      : "",
    "Compose the deity from image 1 naturally within the board: choose a suitable scale and position yourself",
    "(it does not have to sit in a circle, oval or rectangle), keep the head and crown well inside the outline,",
    "and surround it with a new decorative frame, ornaments, flowers and background that suit the die-cut outline.",
    "Paint completely new artwork — do not copy or recolour the template.",
    composition ? composition.brief : "",
    freedSpace
      ? [
          "The customer left some text / content sections out (business name, side boxes or text lines): their space is part of the grey board and must become artwork.",
          "Use it creatively — do not leave the deity confined to the top section with plain space below: show the deity larger or compose it more prominently where it suits the layout, and extend the background and the decorative frame naturally into that space with flowers, ornaments, textures and colours,",
          `so the whole calendar is one complete, professionally designed composition — ${FREED_SPACE[freedSpaceIndex % FREED_SPACE.length]}.`,
          "Never draw empty boxes, blank panels, banners, placeholder rectangles or borders, and never invent a business name, product text or address.",
        ].join(" ")
      : "",
    noPanels
      ? "With no text on the board, make the deity more prominent and fill the whole board with a rich, balanced composition of decorative background, flowers, ornaments and textures."
      : "",
    String(products || "").trim()
      ? `The business is about: ${String(products).trim().slice(0, 200)}. Use suitable related visual elements in the decoration${productArea ? " and in the product picture" : ""} (for example, for clothing or textile shops: draped fabrics, sarees, folded garments) — never as words.`
      : "",
    "Keep the deity exactly the same: identity, face, pose, hand gestures (mudras), weapons and attributes, vahana,",
    "clothing and ornaments must not change, and no figures may be added or removed.",
    theme ? `${themeLine(theme)} Surroundings: ${theme.godSetting}` : "",
    NO_TEXT,
    designerNote(prompt),
  ]
    .filter(Boolean)
    .join(" ");

/**
 * Die-Cut / Normal with removed sections: the god picture is painted into
 * the god opening AND the freed areas (all flat grey in image 2), so the
 * design fills the space instead of leaving an empty strip.
 */
const freedSpaceLine = (i = 0) =>
  `Parts of the grey opening are areas where the customer removed text or boxes: fill them as part of the same artwork — ${FREED_SPACE[i % FREED_SPACE.length]} — never leave a blank band.`;

module.exports = { fitGodPrompt, specialArtworkPrompt, SPECIAL_COMPOSITIONS, compositionFor, freedSpaceLine };
