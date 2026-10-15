// The areas (trim mm) of the optional sections a designer can remove, shared
// by the bare-layer generator (layoutAssets.js) and the renderer
// (layoutPreview.js) so both always agree.
//
// Business name / text lines: the layouts map only the TEXT; a decorative
// strip around it is wider and taller. Such a section is therefore a band
// across the full width, extended above and below the text — objects lying
// entirely inside it (the strip, its ornaments, the text) form the section;
// larger shapes (frame pillars, backgrounds) run beyond it and are kept.
// Bands never reach past the halfway point to a neighbouring section, so
// closely stacked sections (Special Die-Cut: name + 2 text lines) never
// remove each other.
const BAND_EXTRA = 1.0; // text height added above and below (strips are ~2× the text)
const BOX_PAD_MM = 1.5;

// Which optional section a region belongs to (null = always printed).
// Normal / Die-Cut: business name, left box, right box.
// Special Die-Cut: business name, text line 1, text line 2 (no side boxes).
export const SECTION_LABELS = {
  showBusinessName: "Business name",
  showLeftBox: "Left box",
  showRightBox: "Right box",
  showTextLine1: "Text line 1",
  showTextLine2: "Text line 2",
};

export const sectionOf = (region) => {
  if (!region) return null;
  if (region.role === "SIDE_BOX_LEFT") return "showLeftBox";
  if (region.role === "SIDE_BOX_RIGHT") return "showRightBox";
  if (region.role === "TEXT_LINE_1") return "showTextLine1";
  if (region.role === "TEXT_LINE_2") return "showTextLine2";
  if (region.binding === "businessName") return "showBusinessName";
  return null;
};

/** The optional sections this layout has, in display order. */
export const layoutSections = (variant) => {
  const present = new Set((variant?.regions || []).map(sectionOf).filter(Boolean));
  return Object.keys(SECTION_LABELS).filter((key) => present.has(key));
};

const overlapsX = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width;

/** Full-width band around a text section, stopped halfway to neighbours. */
export const textBandArea = (variant, region, neighbours = []) => {
  const extra = region.box.height * BAND_EXTRA;
  let top = region.box.y - extra;
  let bottom = region.box.y + region.box.height + extra;
  for (const other of neighbours) {
    if (other === region || !overlapsX(region.box, other.box)) continue;
    const otherBottom = other.box.y + other.box.height;
    if (otherBottom <= region.box.y) top = Math.max(top, (otherBottom + region.box.y) / 2);
    else if (other.box.y >= region.box.y + region.box.height) {
      bottom = Math.min(bottom, (region.box.y + region.box.height + other.box.y) / 2);
    }
  }
  return { x: -2, y: top, width: (variant.trim?.widthMm || region.box.x + region.box.width) + 4, height: bottom - top };
};

export const boxSectionArea = (region) => ({
  x: region.box.x - BOX_PAD_MM,
  y: region.box.y - BOX_PAD_MM,
  width: region.box.width + 2 * BOX_PAD_MM,
  height: region.box.height + 2 * BOX_PAD_MM,
});

/** { name, left, right, line1, line2: [areas] } for a layout. */
export const sectionAreas = (variant) => {
  const regions = variant.regions || [];
  // Bands only stop at other text sections (side boxes are handled as boxes).
  const textSections = regions.filter((r) => ["showBusinessName", "showTextLine1", "showTextLine2"].includes(sectionOf(r)));
  const band = (r) => textBandArea(variant, r, textSections);
  return {
    name: regions.filter((r) => sectionOf(r) === "showBusinessName").map(band),
    left: regions.filter((r) => r.role === "SIDE_BOX_LEFT").map(boxSectionArea),
    right: regions.filter((r) => r.role === "SIDE_BOX_RIGHT").map(boxSectionArea),
    line1: regions.filter((r) => r.role === "TEXT_LINE_1").map(band),
    line2: regions.filter((r) => r.role === "TEXT_LINE_2").map(band),
  };
};
