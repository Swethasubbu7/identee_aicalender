// Calendar size and cut type read from the laser (cutting) PDF, so the
// designer only uploads the Production PDF and the Laser PDF.
//   Size: the outer cutline's measured size, matched to the catalogue
//         (CalendarFormat widthIn × heightIn, within a few mm).
//   Cut type: a rectangular cutline is a Normal cut; any other outline is a
//         Die-Cut, unless only Special Die-Cut offers that size. Die-Cut vs
//         Special Die-Cut cannot be told apart from the outline alone, so
//         that answer is marked "confirm" (the designer picks).
// Nothing is changed in either file: this only reads sizes.
const MM_PER_IN = 25.4;
const SIZE_TOLERANCE_MM = 5;
const { SPECIAL_SHAPE_TOLERANCE_MM } = require("../../constants/calendar");

const area = (b) => b.width * b.height;

// Area of a path's OUTER outline: the largest of its sub-paths. A die shape
// often has many small inner cuts (holes) after the outer outline; joining
// them all into one polygon made a shaped outline look rectangular
// (spl cal -02, 2026-11-17).
const polygonArea = (d) => {
  const nums = String(d || "").match(/-?\d*\.?\d+(?:e-?\d+)?/gi);
  if (!nums || nums.length < 6) return 0;
  return Math.max(0, ...String(d).split(/(?=M)/i).map(subpathArea));
};

// Shoelace area of one sub-path's points (curves approximated by their end points).
const subpathArea = (d) => {
  const pts = [];
  // Every command's last coordinate pair is an on-curve point.
  for (const seg of String(d).split(/(?=[MLCZ])/i)) {
    const n = seg.match(/-?\d*\.?\d+(?:e-?\d+)?/gi);
    if (n && n.length >= 2) pts.push([Number(n[n.length - 2]), Number(n[n.length - 1])]);
  }
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
};

/** True when the outline fills its bounding box (a plain rectangle, maybe with tiny rounded corners). */
const isRectangular = (o) => {
  if (!o?.path || !o.bbox) return false;
  return polygonArea(o.path) / area(o.bbox) >= 0.985;
};

/** The largest closed outline on any laser page (the outer cutline). */
const outerCutline = (laserData) => {
  let best = null;
  for (const page of laserData?.pages || []) {
    for (const o of page.objects || []) {
      if (o.type !== "path" || o.paint === "clip" || !o.closed || !o.path) continue;
      if (!best || area(o.bbox) > area(best.bbox)) best = { ...o, pageIndex: page.index };
    }
  }
  return best;
};

/**
 * @param laserData pdfImporter output of the laser PDF
 * @param formats   active CalendarFormat documents
 * @returns { cutType, sizeCode, confident, trimMm, rectangular, alternatives, reason }
 *          or { cutType: null, sizeCode: null, confident: false, reason }
 */
const detectFormat = (laserData, formats) => {
  const cut = outerCutline(laserData);
  if (!cut) return { cutType: null, sizeCode: null, confident: false, reason: "No closed cutline was found in the laser PDF." };
  const trimMm = { width: Math.round(cut.bbox.width * 10) / 10, height: Math.round(cut.bbox.height * 10) / 10 };
  const near = (a, b) => Math.abs(a - b) <= SIZE_TOLERANCE_MM;
  let matches = formats.filter(
    (f) => near(f.widthIn * MM_PER_IN, cut.bbox.width) && near(f.heightIn * MM_PER_IN, cut.bbox.height),
  );
  // No exact catalogue size: a shaped outline may still be a Special Die-Cut
  // of its own size (within SPECIAL_SHAPE_TOLERANCE_MM per side) — offered,
  // never assumed (the designer confirms).
  const specialOnly = !matches.length && !isRectangular(cut);
  if (specialOnly) {
    matches = formats
      .filter(
        (f) =>
          f.cutType === "special-die-cut" &&
          Math.abs(f.widthIn * MM_PER_IN - cut.bbox.width) <= SPECIAL_SHAPE_TOLERANCE_MM &&
          Math.abs(f.heightIn * MM_PER_IN - cut.bbox.height) <= SPECIAL_SHAPE_TOLERANCE_MM,
      )
      .sort(
        (a, b) =>
          Math.abs(a.widthIn * MM_PER_IN - cut.bbox.width) + Math.abs(a.heightIn * MM_PER_IN - cut.bbox.height) -
          (Math.abs(b.widthIn * MM_PER_IN - cut.bbox.width) + Math.abs(b.heightIn * MM_PER_IN - cut.bbox.height)),
      );
  }
  const sizeLabel = `${(cut.bbox.width / MM_PER_IN).toFixed(1)}″ × ${(cut.bbox.height / MM_PER_IN).toFixed(1)}″`;
  if (!matches.length) {
    return {
      cutType: null,
      sizeCode: null,
      confident: false,
      trimMm,
      reason: `The cutline measures ${sizeLabel}, which is not a catalogue size. Choose the size.`,
    };
  }
  const rectangular = isRectangular(cut);
  if (specialOnly) {
    const pick = matches[0];
    return {
      cutType: pick.cutType,
      sizeCode: pick.sizeCode,
      confident: false,
      trimMm,
      rectangular,
      sizeLabel,
      alternatives: matches.slice(1).map((f) => ({ cutType: f.cutType, sizeCode: f.sizeCode })),
      reason: `Shaped cutline of ${sizeLabel}: a Special Die-Cut ${pick.sizeCode} of its own size? Confirm the size.`,
    };
  }
  const has = (type) => matches.find((f) => f.cutType === type);
  let pick;
  let confident;
  let reason;
  if (rectangular && has("normal")) {
    pick = has("normal");
    confident = true;
    reason = `Rectangular cutline of ${sizeLabel}.`;
  } else if (!rectangular && (has("die-cut") || has("special-die-cut"))) {
    pick = has("die-cut") || has("special-die-cut");
    // Both shaped cut types offer this size: the outline cannot tell them apart.
    confident = !(has("die-cut") && has("special-die-cut"));
    reason = `Shaped cutline of ${sizeLabel}.${confident ? "" : " Die-Cut or Special Die-Cut: confirm the cut type."}`;
  } else {
    pick = matches[0];
    confident = false;
    reason = `Cutline of ${sizeLabel}: confirm the cut type.`;
  }
  return {
    cutType: pick.cutType,
    sizeCode: pick.sizeCode,
    confident,
    trimMm,
    rectangular,
    sizeLabel,
    alternatives: matches.filter((f) => f !== pick).map((f) => ({ cutType: f.cutType, sizeCode: f.sizeCode })),
    reason,
  };
};

module.exports = { detectFormat, isRectangular, outerCutline };

/**
 * Die-Cut or Special Die-Cut, read from the production PDF when the laser
 * outline alone cannot tell:
 *   a separate frame picture + God picture  → Die-Cut (fixed God area)
 *   one flattened artwork over the board    → Special Die-Cut
 * @returns the detection with cutType / confident updated
 */
const refineCutType = (detection, designData, formats) => {
  if (!detection?.sizeCode || detection.rectangular) return detection;
  const offers = (type) => formats.find((f) => f.cutType === type && f.sizeCode === detection.sizeCode);
  if (!(offers("die-cut") && offers("special-die-cut"))) return detection;
  const { analysePage } = require("./pdfAnalysis");
  const { suggestMapping } = require("./mappingSuggestions");
  const format = offers("die-cut");
  let best = null;
  for (const page of designData?.pages || []) {
    const analysis = analysePage(page, format);
    const roles = new Set(suggestMapping(page, analysis, "die-cut").regions.map((r) => r.role));
    const score = analysis.cutline.candidates.length + (analysis.cake.onArtwork.length ? 1 : 0) + (analysis.content === "empty" ? -5 : 0);
    if (!best || score > best.score) best = { analysis, roles, score };
  }
  if (!best) return detection;
  if (best.roles.has("FRAME") && best.roles.has("GOD_AREA")) {
    return { ...detection, cutType: "die-cut", confident: true, reason: `Shaped cutline of ${detection.sizeLabel}. Frame and God picture found: Die-Cut.` };
  }
  if (best.analysis.artworkFlattened || best.analysis.content === "flattened" || !best.roles.has("GOD_AREA")) {
    return { ...detection, cutType: "special-die-cut", confident: true, reason: `Shaped cutline of ${detection.sizeLabel}. One complete artwork: Special Die-Cut.` };
  }
  return detection;
};

module.exports.refineCutType = refineCutType;
