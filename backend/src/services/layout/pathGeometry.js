// Geometry of the SVG paths produced by pdfImporter (absolute M, L, C, Q, Z;
// millimetres). Used to join a cutline drawn as several pieces, and to
// compare two drawings of the same cutline (design PDF vs laser PDF) even
// when their point lists differ (other software, other export settings).
// Nothing is approximated into the stored geometry: joining only re-orders
// and concatenates the original segments.

const round2 = (v) => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** @returns [{ start:[x,y], segs:[{ type:"L"|"C"|"Q", pts:[[x,y]…] }], closed }] */
const parsePath = (d) => {
  const tokens = String(d || "").match(/[MLCQZ]|-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) || [];
  const subpaths = [];
  let cur = null;
  let i = 0;
  const num = () => Number(tokens[i++]);
  const point = () => [num(), num()];
  while (i < tokens.length) {
    const cmd = tokens[i++].toUpperCase();
    if (cmd === "M") {
      cur = { start: point(), segs: [], closed: false };
      subpaths.push(cur);
    } else if (cmd === "L" && cur) cur.segs.push({ type: "L", pts: [point()] });
    else if (cmd === "C" && cur) cur.segs.push({ type: "C", pts: [point(), point(), point()] });
    else if (cmd === "Q" && cur) cur.segs.push({ type: "Q", pts: [point(), point()] });
    else if (cmd === "Z" && cur) cur.closed = true;
    else break; // unexpected token: stop rather than misread
  }
  return subpaths.filter((s) => s.segs.length);
};

const endOf = (sp) => (sp.segs.length ? sp.segs[sp.segs.length - 1].pts.at(-1) : sp.start);

const reverseSubpath = (sp) => {
  const points = [sp.start, ...sp.segs.map((s) => s.pts.at(-1))];
  const segs = [];
  for (let k = sp.segs.length - 1; k >= 0; k -= 1) {
    const s = sp.segs[k];
    const to = points[k];
    if (s.type === "C") segs.push({ type: "C", pts: [s.pts[1], s.pts[0], to] });
    else if (s.type === "Q") segs.push({ type: "Q", pts: [s.pts[0], to] });
    else segs.push({ type: "L", pts: [to] });
  }
  return { start: endOf(sp), segs, closed: sp.closed };
};

const toSvg = (subpaths) =>
  subpaths
    .map(
      (sp) =>
        `M${round2(sp.start[0])} ${round2(sp.start[1])} ` +
        sp.segs.map((s) => `${s.type}${s.pts.map((p) => `${round2(p[0])} ${round2(p[1])}`).join(" ")}`).join(" ") +
        (sp.closed ? " Z" : ""),
    )
    .join(" ");

class PathJoinError extends Error {}

/**
 * Joins open path pieces (in any order and direction) into ONE closed path.
 * Every piece must be used and consecutive ends must meet within `toleranceMm`.
 * @returns {string} closed SVG path
 */
const joinPaths = (paths, toleranceMm = 0.5) => {
  const pieces = paths.flatMap(parsePath);
  if (!pieces.length) throw new PathJoinError("The selected objects contain no path data.");
  if (pieces.length === 1) {
    const only = pieces[0];
    if (only.closed || dist(only.start, endOf(only)) <= toleranceMm) return toSvg([{ ...only, closed: true }]);
    throw new PathJoinError("The selected path is open: its ends do not meet.");
  }
  if (pieces.some((p) => p.closed)) {
    throw new PathJoinError("Select either one closed cutline, or the open pieces of one cutline (not closed shapes).");
  }
  const chain = [pieces.shift()];
  while (pieces.length) {
    const end = endOf(chain.at(-1));
    let best = null;
    pieces.forEach((p, idx) => {
      const dStart = dist(end, p.start);
      const dEnd = dist(end, endOf(p));
      if (dStart <= toleranceMm && (!best || dStart < best.d)) best = { idx, d: dStart, reverse: false };
      if (dEnd <= toleranceMm && (!best || dEnd < best.d)) best = { idx, d: dEnd, reverse: true };
    });
    if (!best) {
      throw new PathJoinError(
        `The pieces do not form one outline: a gap larger than ${toleranceMm} mm remains (${pieces.length} piece(s) not connected).`,
      );
    }
    const [next] = pieces.splice(best.idx, 1);
    chain.push(best.reverse ? reverseSubpath(next) : next);
  }
  if (dist(endOf(chain.at(-1)), chain[0].start) > toleranceMm) {
    throw new PathJoinError("The joined pieces do not close: the outline has an open end.");
  }
  const merged = { start: chain[0].start, segs: chain.flatMap((sp) => sp.segs), closed: true };
  return toSvg([merged]);
};

const bezier = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
};

/** Points along the outline, at most `stepMm` apart (curves sampled). */
const samplePath = (d, stepMm = 1) => {
  const out = [];
  for (const sp of parsePath(d)) {
    let cur = sp.start;
    out.push(cur);
    const segs = sp.closed ? [...sp.segs, { type: "L", pts: [sp.start] }] : sp.segs;
    for (const s of segs) {
      if (s.type === "L") {
        const to = s.pts[0];
        const n = Math.max(1, Math.ceil(dist(cur, to) / stepMm));
        for (let k = 1; k <= n; k += 1) out.push([cur[0] + ((to[0] - cur[0]) * k) / n, cur[1] + ((to[1] - cur[1]) * k) / n]);
        cur = to;
      } else {
        const [c1, c2, to] = s.type === "C" ? s.pts : [s.pts[0], s.pts[0], s.pts[1]];
        const approx = dist(cur, c1) + dist(c1, c2) + dist(c2, to);
        const n = Math.max(4, Math.ceil(approx / stepMm));
        for (let k = 1; k <= n; k += 1) out.push(bezier(cur, c1, c2, to, k / n));
        cur = to;
      }
    }
  }
  return out;
};

const boundsOf = (pts) => {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
};

const segDist = (p, a, b) => {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
};

// Largest distance from any point of `from` to the polyline `to` (exact
// point-to-segment distances; grid buckets keep it fast).
const directedDistance = (from, to, cell) => {
  const grid = new Map();
  const put = (key, seg) => {
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(seg);
  };
  for (let k = 1; k < to.length; k += 1) {
    const a = to[k - 1];
    const b = to[k];
    const keys = new Set([
      `${Math.floor(a[0] / cell)},${Math.floor(a[1] / cell)}`,
      `${Math.floor(b[0] / cell)},${Math.floor(b[1] / cell)}`,
    ]);
    for (const key of keys) put(key, [a, b]);
  }
  let worst = 0;
  for (const p of from) {
    const cx = Math.floor(p[0] / cell);
    const cy = Math.floor(p[1] / cell);
    let best = Infinity;
    // Search rings until a segment is found, then one more ring for safety.
    for (let r = 0, extra = -1; r < 200 && extra < 1; r += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        for (let dy = -r; dy <= r; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          for (const [a, b] of grid.get(`${cx + dx},${cy + dy}`) || []) best = Math.min(best, segDist(p, a, b));
        }
      }
      if (best !== Infinity) extra += 1;
    }
    worst = Math.max(worst, best);
  }
  return worst;
};

/**
 * Largest distance (mm) between two outlines after aligning their bounding
 * boxes' top-left corners (symmetric). Independent of how each file drew the
 * path. 0 = identical shape and size.
 */
const shapeDistanceMm = (pathA, pathB, stepMm = 1) => {
  const a = samplePath(pathA, stepMm);
  const b = samplePath(pathB, stepMm);
  if (a.length < 2 || b.length < 2) return null;
  const ba = boundsOf(a);
  const bb = boundsOf(b);
  const A = a.map((p) => [p[0] - ba.x, p[1] - ba.y]);
  const B = b.map((p) => [p[0] - bb.x, p[1] - bb.y]);
  const cell = Math.max(2, stepMm * 4);
  return round2(Math.max(directedDistance(A, B, cell), directedDistance(B, A, cell)));
};

module.exports = { parsePath, joinPaths, samplePath, shapeDistanceMm, reverseSubpath, PathJoinError };
