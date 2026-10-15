// What an imported production PDF (and its laser PDF) contains, and what can
// be taken from it automatically. Read-only: it only describes the extracted
// objects (pdfImporter) — the admin confirms or maps everything that is not
// certain. Nothing here changes geometry.
//
// Detection status per production property:
//   AUTO    — found exactly once, ready to use (still shown for review)
//   CHOOSE  — several candidates: the admin picks one
//   LASER   — not in the design file, available from the laser PDF
//   MANUAL  — not detectable: the admin maps it on the artwork
//   MISSING — not in the files at all (needs a corrected file or confirmation)
const { shapeDistanceMm } = require("./pathGeometry");
const { findCutlineCandidates, findRegistrationPair } = require("./mappingBuilder");

const MM_PER_IN = 25.4;
const GUIDE_LABEL = /\b\d+(\.\d+)?\s*[X×]\s*\d+(\.\d+)?\s*(INCH|INCHES|IN|CM|MM)\b|\b(CUT\s*LINE|CUTLINE|BLEED|TRIM|SAFE\s*AREA|DIE\s*LINE)\b/i;
const CUTLINE_TOLERANCE_MM = 5; // suggestion window; the validator uses the strict tolerance
const CAKE_TOLERANCE_MM = 2;

const r1 = (v) => Math.round(v * 10) / 10;
const area = (b) => b.width * b.height;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const unionBox = (boxes) => {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const isPaintedPath = (o) => o.type === "path" && o.paint !== "clip";

/** Rectangles of the catalogue cake size (H × W), either orientation flagged. */
const cakeCandidates = (objects, cake) => {
  if (!cake?.heightIn || !cake?.widthIn) return [];
  const h = cake.heightIn * MM_PER_IN;
  const w = cake.widthIn * MM_PER_IN;
  return objects
    .filter((o) => isPaintedPath(o) && o.closed)
    .map((o) => {
      if (near(o.bbox.width, w, CAKE_TOLERANCE_MM) && near(o.bbox.height, h, CAKE_TOLERANCE_MM)) return { id: o.id, orientation: "H×W" };
      if (near(o.bbox.width, h, CAKE_TOLERANCE_MM) && near(o.bbox.height, w, CAKE_TOLERANCE_MM)) return { id: o.id, orientation: "rotated" };
      return null;
    })
    .filter(Boolean);
};

/** Open stroked paths that together span the calendar size: a cutline drawn in pieces. */
const pieceCandidates = (objects, w, h) => {
  const open = objects.filter((o) => isPaintedPath(o) && !o.closed && o.path && (o.paint === "stroke" || o.paint === "fillStroke"));
  if (open.length < 2 || open.length > 200) return [];
  // Group by stroke colour + width (a cutline is drawn with one pen).
  const groups = new Map();
  for (const o of open) {
    const key = `${o.strokeColor}|${o.strokeWidthMm}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  for (const g of groups.values()) {
    const box = unionBox(g.map((o) => o.bbox));
    if (g.length >= 2 && near(box.width, w, CUTLINE_TOLERANCE_MM) && near(box.height, h, CUTLINE_TOLERANCE_MM)) {
      return g.map((o) => o.id);
    }
  }
  return [];
};

/**
 * @param page   one page of pdfImporter output
 * @param format { widthIn, heightIn, cake: { heightIn, widthIn, status } }
 */
const analysePage = (page, format) => {
  const objects = page.objects || [];
  const w = format.widthIn * MM_PER_IN;
  const h = format.heightIn * MM_PER_IN;
  const painted = objects.filter((o) => o.type !== "path" || o.paint !== "clip");
  const images = objects.filter((o) => o.type === "image");
  const texts = objects.filter((o) => o.type === "text");
  const vectors = objects.filter(isPaintedPath);

  const cutlineIds = findCutlineCandidates(page, w, h, CUTLINE_TOLERANCE_MM);
  // Closed outlines close to the calendar size but outside the suggestion
  // window: shown so the admin can pick one (the validator then reports the
  // real size difference — it is never adjusted).
  const nearMisses = cutlineIds.length
    ? []
    : objects
        .filter((o) => isPaintedPath(o) && o.closed && o.path && near(o.bbox.width, w, 30) && near(o.bbox.height, h, 30))
        .map((o) => ({ id: o.id, sizeMm: `${r1(o.bbox.width)}×${r1(o.bbox.height)}` }));
  const pieces = cutlineIds.length ? [] : pieceCandidates(objects, w, h);
  // A clipping outline of calendar size (artwork clipped to the die shape).
  const clipIds = objects
    .filter((o) => o.type === "path" && o.paint === "clip" && o.closed && o.path && near(o.bbox.width, w, CUTLINE_TOLERANCE_MM) && near(o.bbox.height, h, CUTLINE_TOLERANCE_MM))
    .map((o) => o.id);
  const registration = cutlineIds[0] ? findRegistrationPair(page, cutlineIds[0]) : null;

  // The artwork: everything painted that is not the cutline / its twin marks.
  const cutSet = new Set([...cutlineIds, ...(registration ? [registration.cutlineObjectId] : [])]);
  const artObjects = painted.filter((o) => !cutSet.has(o.id) && !(texts.includes(o) && GUIDE_LABEL.test(o.text)));
  const artworkBounds = unionBox(artObjects.map((o) => o.bbox));
  const bigImage = images.slice().sort((a, b) => area(b.bbox) - area(a.bbox))[0] || null;
  const coverage = bigImage && artworkBounds ? area(bigImage.bbox) / area(artworkBounds) : 0;
  const vectorArt = vectors.filter((o) => !cutSet.has(o.id) && (o.bbox.width > 5 || o.bbox.height > 5));
  const liveTextCount = texts.filter((t) => !GUIDE_LABEL.test(t.text)).length;
  // One raster carries (almost) the whole artwork.
  const artworkFlattened = Boolean(bigImage) && coverage >= 0.85 && vectorArt.length <= 25;
  const content = !bigImage
    ? vectors.length || texts.length
      ? "vector"
      : "empty"
    : artworkFlattened && liveTextCount === 0
      ? "flattened"
      : "mixed";

  const rasters = images
    .filter((o) => o.imageWidthPx && (o.bbox.width > 20 || o.bbox.height > 20))
    .map((o) => ({
      id: o.id,
      px: `${o.imageWidthPx}×${o.imageHeightPx}`,
      sizeMm: `${r1(o.bbox.width)}×${r1(o.bbox.height)}`,
      dpi: Math.round(Math.min(o.imageWidthPx / (o.bbox.width / MM_PER_IN), o.imageHeightPx / (o.bbox.height / MM_PER_IN))),
    }));

  const cakes = cakeCandidates(objects, format.cake);
  const cakesOnArt = artworkBounds ? cakes.filter((c) => overlaps(objects.find((o) => o.id === c.id).bbox, artworkBounds)) : cakes;
  const guideLabels = texts.filter((t) => GUIDE_LABEL.test(t.text)).map((t) => ({ id: t.id, text: t.text.slice(0, 40) }));
  const liveText = texts.filter((t) => !GUIDE_LABEL.test(t.text));

  // Several candidates still give one answer when exactly one is drawn as a
  // line (the others are filled shapes such as the die-shaped backing), or
  // when they are all the same outline (e.g. a copy beside the artwork).
  const byIdAll = new Map(objects.map((o) => [o.id, o]));
  const strokes = cutlineIds.filter((id) => ["stroke", "fillStroke"].includes(byIdAll.get(id).paint));
  const sameOutline =
    cutlineIds.length > 1 &&
    cutlineIds.slice(1).every((id) => (shapeDistanceMm(byIdAll.get(cutlineIds[0]).path, byIdAll.get(id).path, 2) ?? 99) <= 1);
  const cutlineClear = cutlineIds.length === 1 || (cutlineIds.length > 1 && (strokes.length === 1 || sameOutline));
  const detected = {
    cutline: cutlineClear
      ? "AUTO"
      : cutlineIds.length > 1 || pieces.length || nearMisses.length
        ? "CHOOSE"
        : "MISSING",
    cake: cakesOnArt.length === 1 ? "AUTO" : cakesOnArt.length > 1 ? "CHOOSE" : "MANUAL",
    text: liveText.length ? "AUTO" : "MANUAL",
    artwork: content === "empty" ? "MISSING" : "AUTO",
    godArea: "MANUAL",
  };
  return {
    pageIndex: page.index,
    sizeMm: { width: page.widthMm, height: page.heightMm },
    rotation: page.rotation || 0,
    counts: {
      vectorPaths: vectors.length,
      closedPaths: vectors.filter((o) => o.closed).length,
      clips: objects.length - painted.length,
      images: images.length,
      textBlocks: texts.length,
      total: page.objectCount ?? objects.length,
      truncated: Boolean(page.truncated),
    },
    content,
    artworkFlattened,
    artworkBounds: artworkBounds && {
      x: r1(artworkBounds.x),
      y: r1(artworkBounds.y),
      width: r1(artworkBounds.width),
      height: r1(artworkBounds.height),
    },
    rasters,
    lowestDpi: rasters.length ? Math.min(...rasters.map((r) => r.dpi)) : null,
    cutline: { candidates: cutlineIds, pieces, clipOutlines: clipIds, nearMisses },
    registration,
    cake: { candidates: cakes, onArtwork: cakesOnArt.map((c) => c.id) },
    text: {
      live: liveText.slice(0, 20).map((t) => ({ id: t.id, text: t.text.slice(0, 40), font: t.fontName, sizePt: t.fontSizePt })),
      fonts: [...new Set(liveText.map((t) => t.fontName).filter(Boolean))],
    },
    guideLabels,
    detected,
  };
};

/** The laser PDF: its cutline and cake (largest closed path / cake-size rectangle). */
const analyseLaserPage = (page, format) => {
  const w = format.widthIn * MM_PER_IN;
  const h = format.heightIn * MM_PER_IN;
  const closed = (page.objects || []).filter((o) => isPaintedPath(o) && o.closed && o.path);
  const sized = findCutlineCandidates(page, w, h, CUTLINE_TOLERANCE_MM);
  const cut = sized.length
    ? closed.find((o) => o.id === sized[0])
    : closed.sort((a, b) => area(b.bbox) - area(a.bbox))[0] || null;
  const pieces = cut ? [] : pieceCandidates(page.objects || [], w, h);
  const cakes = cakeCandidates(page.objects || [], format.cake);
  const texts = (page.objects || []).filter((o) => o.type === "text");
  return {
    pageIndex: page.index,
    sizeMm: { width: page.widthMm, height: page.heightMm },
    cutline: cut ? { id: cut.id, bbox: cut.bbox, path: cut.path, segments: cut.segments } : null,
    cutlinePieces: pieces,
    cutlineSizeOk: Boolean(cut && near(cut.bbox.width, w, CUTLINE_TOLERANCE_MM) && near(cut.bbox.height, h, CUTLINE_TOLERANCE_MM)),
    cake: cakes[0] ? { id: cakes[0].id, orientation: cakes[0].orientation, bbox: page.objects.find((o) => o.id === cakes[0].id).bbox } : null,
    text: texts.map((t) => t.text.slice(0, 40)),
  };
};

/**
 * Design ↔ laser: does the laser cutline match the design (when the design
 * has its own), and how could the laser cutline be placed on the artwork
 * (when it has not)? Alignment is only ever SUGGESTED; an exact match of a
 * mark drawn in both files (the cake) is "exact", anything else needs an
 * admin's confirmation.
 */
const compareDesignLaser = (designPage, design, laser) => {
  const byId = new Map((designPage.objects || []).map((o) => [o.id, o]));
  const out = { cutlineDeviationMm: null, sizeMatch: null, suggestedAlignment: null };
  if (!laser.cutline) return out;
  // With several candidate outlines, the laser cutline tells which is real.
  const scored = design.cutline.candidates
    .map((id) => ({ id, d: shapeDistanceMm(byId.get(id).path, laser.cutline.path) }))
    .filter((c) => c.d != null)
    .sort((a, b) => a.d - b.d);
  const best = scored[0] || null;
  if (best) {
    const designCut = byId.get(best.id);
    out.designCutlineId = best.id;
    out.cutlineDeviationMm = best.d;
    out.sizeMatch = near(designCut.bbox.width, laser.cutline.bbox.width, 1) && near(designCut.bbox.height, laser.cutline.bbox.height, 1);
    out.laserChoosesCutline = design.cutline.candidates.length > 1 && best.d <= 2 && (scored[1]?.d ?? Infinity) > 2;
  }
  // The cake can be taken from the laser PDF when the design does not draw it.
  out.cakeFromLaser = Boolean(laser.cake && design.cake.onArtwork.length === 0 && laser.cake.orientation === "H×W");
  // Placing the laser cutline on the artwork.
  const designCakeId = design.cake.onArtwork.length === 1 ? design.cake.onArtwork[0] : null;
  if (laser.cake && designCakeId) {
    const dc = byId.get(designCakeId).bbox;
    out.suggestedAlignment = {
      method: "cake",
      exact: true,
      designObjectId: designCakeId,
      laserObjectId: laser.cake.id,
      offsetMm: { x: r1(laser.cutline.bbox.x - (laser.cake.bbox.x - dc.x)), y: r1(laser.cutline.bbox.y - (laser.cake.bbox.y - dc.y)) },
    };
  } else if (design.artworkBounds) {
    const ab = design.artworkBounds;
    if (near(ab.width, laser.cutline.bbox.width, 2) && near(ab.height, laser.cutline.bbox.height, 2)) {
      out.suggestedAlignment = { method: "artwork-bounds", exact: false, offsetMm: { x: ab.x, y: ab.y } };
    }
  }
  return out;
};

/**
 * The mapped layout against the laser PDF: same cutline shape and size, and
 * the cake in the same place relative to the cutline.
 * @param geometry  buildVariantGeometry() result (trim mm)
 * @param laser     analyseLaserPage() result
 */
const laserCheckFor = (geometry, laser) => {
  if (!laser) return null;
  const check = {
    checkedAt: new Date().toISOString(),
    cutlineSource: geometry.cutlineSource || "design",
    laserCutline: Boolean(laser.cutline),
    cutlineDeviationMm: null,
    sizeDiffMm: null,
    cakeOffsetMm: null,
    laserHasCake: Boolean(laser.cake),
  };
  if (laser.cutline && geometry.cutline?.path) {
    check.cutlineDeviationMm = shapeDistanceMm(geometry.cutline.path, laser.cutline.path);
    check.sizeDiffMm = {
      width: Math.round((laser.cutline.bbox.width - geometry.trim.widthMm) * 100) / 100,
      height: Math.round((laser.cutline.bbox.height - geometry.trim.heightMm) * 100) / 100,
    };
  }
  const cake = (geometry.regions || []).find((r) => r.role === "CAKE_MOUNT");
  if (cake && laser.cake && laser.cutline) {
    const lx = laser.cake.bbox.x - laser.cutline.bbox.x;
    const ly = laser.cake.bbox.y - laser.cutline.bbox.y;
    check.cakeOffsetMm = {
      x: Math.round((lx - cake.box.x) * 100) / 100,
      y: Math.round((ly - cake.box.y) * 100) / 100,
      size: Math.round(Math.max(Math.abs(laser.cake.bbox.width - cake.box.width), Math.abs(laser.cake.bbox.height - cake.box.height)) * 100) / 100,
    };
  }
  return check;
};

/** One-line verdict per file for the import screen / reports. */
const importVerdict = (design, laser, comparison) => {
  // What the laser PDF resolves is shown as such ("LASER").
  const d = { ...design.detected };
  const conflict = comparison?.cutlineDeviationMm != null && comparison.cutlineDeviationMm > 2;
  if (comparison?.laserChoosesCutline) d.cutline = "AUTO";
  else if (conflict) d.cutline = "CONFLICT"; // design and laser outlines disagree: designer must check
  if (!["AUTO", "CONFLICT"].includes(d.cutline) && laser?.cutline && laser.cutlineSizeOk) d.cutline = "LASER";
  if (comparison?.cakeFromLaser) d.cake = "LASER";
  design.detectedWithLaser = d;
  const cutlineOk = d.cutline === "AUTO" || (laser?.cutline && laser.cutlineSizeOk);
  if (design.content === "empty") return { level: "CANNOT", text: "The page has no artwork." };
  if (d.cutline === "AUTO" && d.cake === "AUTO" && (!laser || (comparison?.cutlineDeviationMm ?? 99) <= 2)) {
    return { level: "AUTO", text: "Cutline and cake detected automatically; map the text and god areas." };
  }
  if (d.cutline === "CONFLICT") {
    return {
      level: "MANUAL",
      text: `The design and laser cutlines differ by ${comparison.cutlineDeviationMm} mm: check which file is correct (importable as a draft).`,
    };
  }
  if (cutlineOk) {
    const todo = Object.entries(d).filter(([k, v]) => v !== "AUTO" && k !== "godArea").map(([k, v]) => `${k} ${v}`);
    return { level: "MANUAL", text: `Importable: needs manual mapping / confirmation (${todo.join(", ") || "god area"}).` };
  }
  return { level: "DRAFT", text: "Importable as a draft: no cutline yet — upload the laser PDF or select / join the cutline." };
};

/**
 * The laser page that belongs to a design page: laser files often hold one
 * page per size, not always in the same order. Prefer the page whose cutline
 * has the calendar size (same index first), else the same index, else page 1.
 */
const pairLaserPage = (laserData, designIndex, format) => {
  const pages = laserData?.pages || [];
  if (!pages.length) return null;
  const fits = (p) => analyseLaserPage(p, format).cutlineSizeOk;
  if (pages[designIndex] && fits(pages[designIndex])) return pages[designIndex];
  return pages.find(fits) || pages[designIndex] || pages[0];
};

module.exports = {
  analysePage,
  analyseLaserPage,
  compareDesignLaser,
  laserCheckFor,
  importVerdict,
  pairLaserPage,
  GUIDE_LABEL,
};
