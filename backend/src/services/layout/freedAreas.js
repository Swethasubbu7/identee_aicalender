// Areas freed when the customer switches optional sections off (trim mm).
// Mirrors the section areas of the live preview (frontend/src/utils/
// sectionAreas.js): a removed business name frees a full-width band around
// the name (never reaching into the calendar / cake area); a removed side box
// frees its box. The AI picture is painted into these areas too, so the
// design fills them instead of leaving an empty strip.
const BAND_EXTRA = 1.0;
const BOX_PAD_MM = 1.5;

const regionsOf = (variant, roles) => (variant.regions || []).filter((r) => roles.includes(r.role));

const freedAreas = (variant, options = {}) => {
  const w = variant.trim?.widthMm || 0;
  const fixed = regionsOf(variant, ["CALENDAR_AREA", "CAKE_MOUNT"]).map((r) => r.box);
  const fixedTop = fixed.length ? Math.min(...fixed.map((b) => b.y)) : Infinity;
  const out = [];
  if (options.showBusinessName === false) {
    for (const r of regionsOf(variant, ["NAME_TEXT", "NAME_BANNER"])) {
      const extra = r.box.height * BAND_EXTRA * 0.5;
      const y = Math.max(0, r.box.y - extra);
      const bottom = Math.min(r.box.y + r.box.height + extra, fixedTop - 1);
      if (bottom > y) out.push({ section: "showBusinessName", box: { x: 0, y, width: w, height: bottom - y } });
    }
  }
  const boxes = [
    ["showLeftBox", "SIDE_BOX_LEFT"],
    ["showRightBox", "SIDE_BOX_RIGHT"],
    ["showTextLine1", "TEXT_LINE_1"],
    ["showTextLine2", "TEXT_LINE_2"],
  ];
  for (const [key, role] of boxes) {
    if (options[key] !== false) continue;
    for (const r of regionsOf(variant, [role])) {
      out.push({
        section: key,
        box: { x: r.box.x - BOX_PAD_MM, y: r.box.y - BOX_PAD_MM, width: r.box.width + 2 * BOX_PAD_MM, height: r.box.height + 2 * BOX_PAD_MM },
      });
    }
  }
  return out;
};

module.exports = { freedAreas };
