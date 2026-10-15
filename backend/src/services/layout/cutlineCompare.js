// Compares two drawings of the same cutline (e.g. production PDF vs laser
// PDF): the paths' points, each relative to its own bounding box, one by one.
// Returns the largest point distance in mm, or null when the two paths are
// not the same drawing (different point lists).
const pathPoints = (d) => (String(d || "").match(/-?\d+(\.\d+)?/g) || []).map(Number);

const cutlineDeviationMm = (a, b) => {
  const pa = pathPoints(a.path);
  const pb = pathPoints(b.path);
  if (!pa.length || pa.length !== pb.length) return null;
  let max = 0;
  for (let i = 0; i < pa.length; i += 2) {
    const dx = pa[i] - a.bbox.x - (pb[i] - b.bbox.x);
    const dy = pa[i + 1] - a.bbox.y - (pb[i + 1] - b.bbox.y);
    max = Math.max(max, Math.hypot(dx, dy));
  }
  return max;
};

/** The laser file's cutline: its largest closed path. */
const laserCutline = (laserPage) =>
  (laserPage?.objects || [])
    .filter((o) => o.type === "path" && o.closed && o.path)
    .sort((a, b) => b.bbox.width * b.bbox.height - a.bbox.width * a.bbox.height)[0] || null;

module.exports = { cutlineDeviationMm, laserCutline };
