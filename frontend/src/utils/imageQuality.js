// Print quality of an uploaded content image: the resolution it would have at
// the size it is printed in its slot (filling the area). A picture made by
// the AI from the God image (Special Die-Cut) is printed large, about 70% of
// the board's width and 55% of its height.
export const GOOD_DPI = 150; // below this, prints look soft
export const POOR_DPI = 100; // below this, visibly blurry / pixelated

const slotArea = (slot, variant) => {
  const boxes = (slot?.regions || []).map((r) => r.box).filter(Boolean);
  if (boxes.length) {
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    return {
      width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
      height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
    };
  }
  const trim = variant?.trim;
  return trim ? { width: trim.widthMm * 0.7, height: trim.heightMm * 0.55 } : null;
};

/** { dpi, level: "ok" | "low" | "poor" } or null when the size is unknown. */
export const imageQuality = (slot, value, variant) => {
  const area = slotArea(slot, variant);
  if (!area || !value?.widthPx || !value?.heightPx || !area.width || !area.height) return null;
  const dpi = Math.round(25.4 * Math.min(value.widthPx / area.width, value.heightPx / area.height));
  return { dpi, level: dpi >= GOOD_DPI ? "ok" : dpi >= POOR_DPI ? "low" : "poor" };
};
