// Controlled size correction of a production layout (admin-confirmed).
//
// A designer's cutline is sometimes a little off the nominal calendar size
// (e.g. SPL-001: 302.52 × 456.34 mm for 12×18 in = 304.8 × 457.2 mm). The
// admin can PREVIEW a proposed correction — a uniform-per-axis scale of the
// whole layout to the nominal size — and APPLY it explicitly. Nothing here
// runs on its own:
//   - the source PDF and its extracted objects are never modified; the
//     correction is stored as two factors and re-applied whenever the
//     geometry is rebuilt from the mapping, so UNDO = remove the factors;
//   - the cutline, artwork and every region move/scale together, so print
//     and laser outputs stay aligned; the physical cake keeps its exact
//     catalogue size (only its position follows the scale);
//   - only small, routine corrections are allowed (MAX_CORRECTION).
const MM_PER_IN = 25.4;
const MAX_CORRECTION = 0.02; // ±2 % per axis; larger differences need a new file
const FIXED_SIZE_ROLES = new Set(["CAKE_MOUNT", "CALENDAR_AREA"]);

const r2 = (v) => Math.round(v * 100) / 100;
const r5 = (v) => Math.round(v * 100000) / 100000;

/** Scales every coordinate pair of an absolute M/L/C/Q/Z path. */
const scalePath = (path, sx, sy) => {
  if (!path) return path;
  let axis = 0;
  return path.replace(/[MLCQZ]|-?\d+(?:\.\d+)?(?:e-?\d+)?/gi, (token) => {
    if (/^[MLCQZ]$/i.test(token)) {
      axis = 0;
      return token;
    }
    const value = Number(token) * (axis === 0 ? sx : sy);
    axis = 1 - axis;
    return String(r2(value));
  });
};

const scaleBox = (b, sx, sy) => b && { x: r2(b.x * sx), y: r2(b.y * sy), width: r2(b.width * sx), height: r2(b.height * sy) };
// Same size, centre moved with the scale.
const moveBox = (b, sx, sy) =>
  b && {
    x: r2((b.x + b.width / 2) * sx - b.width / 2),
    y: r2((b.y + b.height / 2) * sy - b.height / 2),
    width: b.width,
    height: b.height,
  };

/**
 * Proposed correction of `trim` to the nominal size of `format`.
 * @returns { sourceTrim, targetTrim, diffMm, scaleX, scaleY, percent, allowed, reason }
 */
const proposeCorrection = (trim, format) => {
  const target = { widthMm: r2(format.widthIn * MM_PER_IN), heightMm: r2(format.heightIn * MM_PER_IN) };
  const scaleX = r5(target.widthMm / trim.widthMm);
  const scaleY = r5(target.heightMm / trim.heightMm);
  const percent = { x: r2((scaleX - 1) * 100), y: r2((scaleY - 1) * 100) };
  const tooLarge = Math.abs(scaleX - 1) > MAX_CORRECTION || Math.abs(scaleY - 1) > MAX_CORRECTION;
  const none = Math.abs(target.widthMm - trim.widthMm) < 0.01 && Math.abs(target.heightMm - trim.heightMm) < 0.01;
  return {
    sourceTrim: { widthMm: trim.widthMm, heightMm: trim.heightMm },
    targetTrim: target,
    diffMm: { width: r2(target.widthMm - trim.widthMm), height: r2(target.heightMm - trim.heightMm) },
    scaleX,
    scaleY,
    percent,
    allowed: !tooLarge && !none,
    reason: none
      ? "The cutline already has the nominal size."
      : tooLarge
        ? `The difference is more than ${MAX_CORRECTION * 100}% — not a routine correction: the file needs to be checked.`
        : null,
  };
};

/**
 * Applies stored correction factors to a freshly built geometry
 * (buildVariantGeometry output). Returns a new geometry object.
 */
const applyCorrection = (geometry, correction) => {
  if (!correction?.scaleX || !correction?.scaleY) return geometry;
  const { scaleX: sx, scaleY: sy } = correction;
  return {
    ...geometry,
    trim: { widthMm: r2(geometry.trim.widthMm * sx), heightMm: r2(geometry.trim.heightMm * sy) },
    cutline: { ...geometry.cutline, path: scalePath(geometry.cutline.path, sx, sy) },
    regions: geometry.regions.map((r) => ({
      ...r,
      box: FIXED_SIZE_ROLES.has(r.role) ? moveBox(r.box, sx, sy) : scaleBox(r.box, sx, sy),
      ...(r.textBox && { textBox: scaleBox(r.textBox, sx, sy) }),
      ...(r.path && { path: scalePath(r.path, sx, sy) }),
    })),
    excludedBoxes: (geometry.excludedBoxes || []).map((b) => scaleBox(b, sx, sy)),
  };
};

module.exports = { proposeCorrection, applyCorrection, scalePath, MAX_CORRECTION };
