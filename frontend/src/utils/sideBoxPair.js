// Left and right side boxes as ONE matching pair (Normal Mode, app-drawn
// boxes): many layouts map the two boxes at different sizes and distances
// (a product list on one side, a photo frame on the other), which looks
// unbalanced once both are drawn in the same style. The pair gets the same
// size, the same height and mirrored positions — each centred in the free
// space between the board edge and the fixed calendar block — never over
// the calendar, the name or the text lines above.

const role = (variant, r) => (variant?.regions || []).find((x) => x.role === r) || null;
const SIMILAR = 0.08; // boxes within 8% of each other already match
const ABOVE = ["NAME_TEXT", "TEXT_LINE_1", "TEXT_LINE_2", "GOD_AREA"];

/** { [regionId]: box } for both side boxes, or null when they already match. */
export const pairedSideBoxes = (variant) => {
  const left = role(variant, "SIDE_BOX_LEFT");
  const right = role(variant, "SIDE_BOX_RIGHT");
  const trim = variant?.trim;
  if (!left || !right || !trim?.widthMm) return null;
  const a = left.box;
  const b = right.box;
  const W = trim.widthMm;
  const size = Math.max(a.width, b.width, a.height, b.height);
  const mirrored = Math.abs(a.x - (W - b.x - b.width)) < 3;
  if (
    Math.abs(a.width - b.width) < size * SIMILAR &&
    Math.abs(a.height - b.height) < size * SIMILAR &&
    Math.abs(a.y - b.y) < 3 &&
    mirrored
  ) {
    return null;
  }
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  // The fixed block between the boxes (cake mount / calendar pad).
  const middle = (variant.regions || []).filter(
    (r) => ["CAKE_MOUNT", "CALENDAR_AREA"].includes(r.role) && r.box.y < bottom && r.box.y + r.box.height > top,
  );
  const innerLeft = middle.length ? Math.min(...middle.map((r) => r.box.x)) : (a.x + a.width + b.x) / 2;
  const innerRight = middle.length ? Math.max(...middle.map((r) => r.box.x + r.box.width)) : (a.x + a.width + b.x) / 2;
  const space = Math.min(innerLeft, W - innerRight);
  if (space < 20) return null;
  const margin = Math.max(5, space * 0.1);
  const width = Math.min(Math.max(a.width, b.width), space - 2 * margin);
  // Vertical room: below the name / text lines, above the bottom edge.
  const ceiling = Math.max(
    0,
    ...(variant.regions || [])
      .filter((r) => ABOVE.includes(r.role) && r.box.y + r.box.height <= top + 2)
      .map((r) => r.box.y + r.box.height + 3),
  );
  const floor = (trim.heightMm || bottom) - 6;
  const height = Math.min(Math.max(a.height, b.height), floor - ceiling);
  if (width < 15 || height < 15) return null;
  const centre = (a.y + a.height / 2 + b.y + b.height / 2) / 2;
  const y = Math.min(Math.max(centre - height / 2, ceiling), floor - height);
  const leftCentre = innerLeft / 2;
  const rightCentre = innerRight + (W - innerRight) / 2;
  return {
    [left.id]: { x: leftCentre - width / 2, y, width, height },
    [right.id]: { x: rightCentre - width / 2, y, width, height },
  };
};
