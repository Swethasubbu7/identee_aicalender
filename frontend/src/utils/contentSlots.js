// Designer-facing content slots, derived from a production layout's mapped
// regions. The regions fix WHERE content goes; slots say WHAT the designer
// can change. Nothing here alters production geometry.
// `section` ties a slot to an optional section the designer can remove; it
// and the label follow the region the content is printed in (a left box on
// Normal / Die-Cut, a text line on Special Die-Cut).
import { sectionOf } from "./sectionAreas";
import { compositionMode } from "./composition";

const ROLE_LABELS = {
  SIDE_BOX_LEFT: "Left Box",
  SIDE_BOX_RIGHT: "Right Box",
  TEXT_LINE_1: "Text Line 1",
  TEXT_LINE_2: "Text Line 2",
};

const SLOT_DEFS = [
  { key: "godImage", kind: "image", label: "God image", button: "Upload God Image", match: (r) => r.role === "GOD_AREA" },
  { key: "businessName", kind: "text", label: "Business Name", multiline: false, match: (r) => r.binding === "businessName" },
  { key: "productList", kind: "text", label: "Product Details", multiline: true, match: (r) => r.binding === "productList" },
  { key: "address", kind: "text", label: "Address", multiline: true, match: (r) => r.binding === "address" },
  { key: "productImage", kind: "image", label: "Product image", button: "Upload Product Image", match: (r) => r.binding === "productImage" },
  { key: "aiBackground", kind: "ai", label: "AI background", match: (r) => r.role === "BACKGROUND_AREA" },
];

// Special Die-Cut without a god area: the customer's god image is still
// needed — the AI composes it into the whole artwork (no fixed box).
const FULL_ARTWORK_GOD = { id: "god-composed", role: "GOD_COMPOSED", box: null, composed: true };

export const getContentSlots = (variant) =>
  SLOT_DEFS.map((def) => {
    let regions = (variant?.regions || []).filter(def.match);
    if (def.key === "godImage" && regions.length === 0 && variant && compositionMode(variant) === "FULL_ARTWORK") {
      regions = [FULL_ARTWORK_GOD];
    }
    if (regions.length === 0) return null;
    // Sample text as a hint; a PDF may hold the same line twice (e.g. a
    // gradient copy and an outline copy), so repeated lines are shown once.
    const raw = regions.find((r) => r.sampleText)?.sampleText || "";
    const sample = [...new Set(raw.split("\n").map((l) => l.trim()))].join("\n");
    const where = ROLE_LABELS[regions[0].role];
    return {
      ...def,
      regions,
      sample,
      section: sectionOf(regions[0]),
      label: where && def.key !== "businessName" ? `${where} · ${def.label}` : def.label,
    };
  }).filter(Boolean);

export const EMPTY_CONTENT = {
  businessName: "",
  productList: "",
  address: "",
  godImage: null, // { url, path }
  productImage: null,
  rightBoxText: "",
  // Customer's choices: language and optional sections.
  language: "english",
  showBusinessName: true,
  showLeftBox: true,
  showRightBox: true,
  showTextLine1: true, // Special Die-Cut
  showTextLine2: true,
  rightBoxMode: "image", // "image" | "text"
};

/** The designer options part of the content (sent with Generate). */
export const contentOptions = (c) => ({
  language: c.language === "tamil" ? "tamil" : "english",
  showBusinessName: c.showBusinessName !== false,
  showLeftBox: c.showLeftBox !== false,
  showRightBox: c.showRightBox !== false,
  showTextLine1: c.showTextLine1 !== false,
  showTextLine2: c.showTextLine2 !== false,
  rightBoxMode: c.rightBoxMode === "text" ? "text" : "image",
});
