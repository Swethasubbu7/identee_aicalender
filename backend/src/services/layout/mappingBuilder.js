// Turns an admin's mapping ("object p1-38 is the cutline, objects p1-40 and
// p1-41 are the name text", ...) into layout geometry. Every coordinate is
// taken from the extracted PDF objects — the client only sends object ids —
// and re-based so (0, 0) is the top-left of the cutline's bounding box.

const {
  REGION_ROLES,
  CONTENT_BINDINGS,
  ROLE_POLICY,
  TEXT_ROLES,
  EXPECTED_BINDINGS,
} = require("../../constants/calendar");
const { MM_PER_INCH } = require("../../lib/units");
const { joinPaths, PathJoinError } = require("./pathGeometry");

// Roles whose real outline (not just its bounding box) matters.
const SHAPED_ROLES = new Set(["GOD_AREA", "CALENDAR_AREA", "BACKGROUND_AREA", "KEEP_OUT"]);
const DEFAULT_FIT = { GOD_AREA: "cover", SIDE_BOX_RIGHT: "cover", FRAME: "contain" };
const STYLE_OVERRIDE_KEYS = [
  "fontFamily", "minPt", "maxPt", "color", "strokeColor", "strokeWidthPt",
  "align", "textCase", "maxLines", "horizontalScale",
];

class MappingError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const round2 = (v) => Math.round(v * 100) / 100;

// Two copies of the same registration mark must be the same size.
const REGISTRATION_SIZE_TOLERANCE_MM = 0.2;

// Shifts every coordinate pair in an SVG path produced by pdfImporter
// (commands M, L, C, Q, Z with absolute coordinates).
const translatePath = (path, dx, dy) => {
  if (!path) return null;
  let axis = 0;
  return path.replace(/[MLCQZ]|-?\d+(?:\.\d+)?(?:e-?\d+)?/gi, (token) => {
    if (/^[MLCQZ]$/i.test(token)) {
      axis = 0;
      return token;
    }
    const value = Number(token) + (axis === 0 ? dx : dy);
    axis = 1 - axis;
    return String(round2(value));
  });
};

const unionBox = (boxes) => {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};

const offsetBox = (b, ox, oy) => ({
  x: round2(b.x - ox),
  y: round2(b.y - oy),
  width: round2(b.width),
  height: round2(b.height),
});

const pickStyleOverrides = (style = {}) =>
  Object.fromEntries(
    STYLE_OVERRIDE_KEYS.filter((k) => style[k] !== undefined && style[k] !== "" && style[k] !== null)
      .map((k) => [k, ["fontFamily", "color", "strokeColor", "align", "textCase"].includes(k) ? String(style[k]) : Number(style[k])]),
  );

// One cutline object from one or more selected paths: a single closed path
// as drawn, or open pieces joined (in order, ends meeting) into one outline.
const cutlineFrom = (byId, ids, where) => {
  const objects = ids.map((id) => {
    const o = byId.get(id);
    if (!o) throw new MappingError(`Cutline object ${id} is not in the ${where}.`);
    if (o.type !== "path" || !o.path) throw new MappingError("The cutline must be made of vector paths from the PDF.");
    return o;
  });
  if (objects.length === 1) {
    if (!objects[0].closed) throw new MappingError("The selected cutline path is not closed. Select all its pieces to join them.");
    return objects[0];
  }
  let path;
  try {
    path = joinPaths(objects.map((o) => o.path));
  } catch (err) {
    if (err instanceof PathJoinError) throw new MappingError(`The selected pieces cannot be joined into a cutline: ${err.message}`);
    throw err;
  }
  return {
    id: ids.join("+"),
    type: "path",
    closed: true,
    path,
    bbox: unionBox(objects.map((o) => o.bbox)),
    layer: objects.find((o) => o.layer)?.layer || null,
  };
};

const ALIGNMENT_METHODS = ["cake", "artwork-bounds", "manual"];

/**
 * Where the cutline comes from (mapping.cutlineSource):
 *   "design" (default) — drawn in the production PDF (one path or joined
 *                        pieces), optionally beside the artwork (registration)
 *   "laser"            — taken from the laser PDF and placed on the artwork:
 *                        "cake"  = the cake rectangle drawn in both files
 *                                  (exact), "artwork-bounds" = laser outline
 *                                  on the artwork's bounds, "manual" = an
 *                                  offset entered by the admin. The last two
 *                                  are NOT verified until an admin confirms.
 *   "none"             — draft only: no cutline yet; the trim is the
 *                        artwork's bounds (the validator blocks activation)
 * @returns { cut, shiftX, shiftY, source, alignment }
 *   shift = (where the cutline is drawn) − (where it belongs on the artwork)
 */
const resolveCutline = (page, byId, mapping, laserPage) => {
  const source = mapping?.cutlineSource || "design";
  if (source === "none") {
    const ids = mapping.artworkObjectIds || [];
    const objects = ids.map((id) => byId.get(id)).filter(Boolean);
    if (!objects.length) throw new MappingError("Select the artwork (e.g. the placed image) to use as the draft trim.");
    const box = unionBox(objects.map((o) => o.bbox));
    return { cut: { id: null, bbox: box, path: null, layer: null }, shiftX: 0, shiftY: 0, source, alignment: null };
  }
  if (source === "laser") {
    if (!laserPage?.objects) throw new MappingError("Upload the laser PDF to use its cutline.");
    const laserById = new Map(laserPage.objects.map((o) => [o.id, o]));
    const ids = mapping.laserCutlineObjectIds || (mapping.laserCutlineObjectId ? [mapping.laserCutlineObjectId] : []);
    if (!ids.length) throw new MappingError("Select the cutline in the laser PDF.");
    const cut = cutlineFrom(laserById, ids, "laser PDF");
    const a = mapping.laserAlignment || {};
    if (!ALIGNMENT_METHODS.includes(a.method)) {
      throw new MappingError("Choose how the laser cutline is placed on the artwork (cake, artwork bounds or manual offset).");
    }
    let target; // top-left of the laser cutline on the design page
    if (a.method === "cake") {
      const designMark = byId.get(a.designObjectId);
      const laserMark = laserById.get(a.laserObjectId);
      if (!designMark || !laserMark) throw new MappingError("Select the cake rectangle in both files.");
      if (
        Math.abs(designMark.bbox.width - laserMark.bbox.width) > REGISTRATION_SIZE_TOLERANCE_MM ||
        Math.abs(designMark.bbox.height - laserMark.bbox.height) > REGISTRATION_SIZE_TOLERANCE_MM
      ) {
        throw new MappingError("The cake rectangles in the two files are not the same size, so they cannot align the cutline.");
      }
      target = { x: cut.bbox.x - (laserMark.bbox.x - designMark.bbox.x), y: cut.bbox.y - (laserMark.bbox.y - designMark.bbox.y) };
    } else if (a.method === "artwork-bounds") {
      const objects = (a.designObjectIds || []).map((id) => byId.get(id)).filter(Boolean);
      if (!objects.length) throw new MappingError("Select the artwork whose outer bounds match the cutline.");
      const box = unionBox(objects.map((o) => o.bbox));
      if (Math.abs(box.width - cut.bbox.width) > 2 || Math.abs(box.height - cut.bbox.height) > 2) {
        throw new MappingError(
          `The artwork bounds (${round2(box.width)} × ${round2(box.height)} mm) do not match the laser cutline ` +
            `(${round2(cut.bbox.width)} × ${round2(cut.bbox.height)} mm): use the cake or a manual offset.`,
        );
      }
      target = { x: box.x + (box.width - cut.bbox.width) / 2, y: box.y + (box.height - cut.bbox.height) / 2 };
    } else {
      const o = a.offsetMm || {};
      if (!Number.isFinite(Number(o.x)) || !Number.isFinite(Number(o.y))) throw new MappingError("Enter the offset (x, y in mm).");
      target = { x: Number(o.x), y: Number(o.y) };
    }
    return {
      cut,
      shiftX: cut.bbox.x - target.x,
      shiftY: cut.bbox.y - target.y,
      source,
      alignment: {
        method: a.method,
        exact: a.method === "cake",
        confirmed: a.method === "cake" || a.confirmed === true,
        confirmedAt: a.method !== "cake" && a.confirmed === true ? a.confirmedAt || new Date().toISOString() : null,
      },
    };
  }
  const ids = mapping?.cutlineObjectIds?.length ? mapping.cutlineObjectIds : mapping?.cutlineObjectId ? [mapping.cutlineObjectId] : [];
  if (!ids.length) throw new MappingError("Select the cutline object.");
  const cut = cutlineFrom(byId, ids, "production PDF page");
  let shiftX = 0;
  let shiftY = 0;
  if (mapping.registration) {
    const artMark = byId.get(mapping.registration.artObjectId);
    const cutMark = byId.get(mapping.registration.cutlineObjectId);
    if (!artMark || !cutMark) throw new MappingError("Select both registration marks.");
    if (artMark.id === cutMark.id) {
      throw new MappingError("The two registration marks must be different objects.");
    }
    if (
      Math.abs(artMark.bbox.width - cutMark.bbox.width) > REGISTRATION_SIZE_TOLERANCE_MM ||
      Math.abs(artMark.bbox.height - cutMark.bbox.height) > REGISTRATION_SIZE_TOLERANCE_MM
    ) {
      throw new MappingError("The registration marks are not the same size, so they cannot align the cutline.");
    }
    shiftX = cutMark.bbox.x - artMark.bbox.x;
    shiftY = cutMark.bbox.y - artMark.bbox.y;
  }
  return { cut, shiftX, shiftY, source: "design", alignment: null };
};

/**
 * @param page      one page from pdfImporter output ({ objects: [...] })
 * @param mapping   see resolveCutline + { regions, excludedObjectIds }
 * @param laserPage the laser PDF's page (only for cutlineSource "laser")
 */
function buildVariantGeometry(page, mapping, laserPage = null) {
  if (!page?.objects) throw new MappingError("Page not found in the imported PDF.");
  const byId = new Map(page.objects.map((o) => [o.id, o]));
  const { cut, shiftX, shiftY, source, alignment } = resolveCutline(page, byId, mapping, laserPage);
  const laserById = new Map((laserPage?.objects || []).map((o) => [o.id, o]));

  // Cutline bounding box expressed in artwork coordinates.
  const ox = cut.bbox.x - shiftX;
  const oy = cut.bbox.y - shiftY;
  const trim = { widthMm: round2(cut.bbox.width), heightMm: round2(cut.bbox.height) };
  const cutline = {
    path: cut.path ? translatePath(cut.path, -cut.bbox.x, -cut.bbox.y) : null,
    sourceLayer: cut.layer || null,
  };

  const usedIds = new Map();
  let frameImagePx = null;
  const artworkRasters = [];
  const regions = (mapping.regions || []).map((spec, index) => {
    if (!REGION_ROLES.includes(spec.role)) {
      throw new MappingError(`Unknown role ${spec.role}.`);
    }
    const ids = [...new Set(spec.objectIds || [])];
    if (ids.length === 0) throw new MappingError(`${spec.role} has no objects selected.`);
    // A region drawn only in the laser PDF (e.g. the cake rectangle of a
    // flattened design) is placed with the same exact offset as the cutline.
    const fromLaser = spec.source === "laser";
    if (fromLaser && source !== "laser") {
      throw new MappingError(`${spec.role} can only be taken from the laser PDF when the cutline is too.`);
    }
    const objects = ids.map((id) => {
      const o = fromLaser ? laserById.get(id) : byId.get(id);
      if (!o) throw new MappingError(`Object ${id} is not ${fromLaser ? "in the laser PDF" : "on this page"}.`);
      return o;
    });

    const box = fromLaser
      ? offsetBox(unionBox(objects.map((o) => o.bbox)), cut.bbox.x, cut.bbox.y)
      : offsetBox(unionBox(objects.map((o) => o.bbox)), ox, oy);
    const single = objects.length === 1 ? objects[0] : null;
    const shaped = single?.type === "path" && single.closed && single.path && SHAPED_ROLES.has(spec.role);

    const count = (usedIds.get(spec.role) || 0) + 1;
    usedIds.set(spec.role, count);

    const region = {
      id: count === 1 ? spec.role.toLowerCase() : `${spec.role.toLowerCase()}_${count}`,
      role: spec.role,
      policy: ROLE_POLICY[spec.role],
      shape: shaped ? "path" : "rect",
      box,
      path: shaped ? translatePath(single.path, -ox, -oy) : null,
      z: index,
      binding: EXPECTED_BINDINGS[spec.role] || null,
      fit: spec.fit || DEFAULT_FIT[spec.role] || null,
      textStyle: null,
      sampleText: null,
      sourceLayer: objects.find((o) => o.layer)?.layer || null,
      sourceObjectIds: ids,
      ...(fromLaser && { source: "laser" }),
    };

    if (["TEXT_LINE_1", "TEXT_LINE_2"].includes(spec.role) && spec.binding) {
      if (!CONTENT_BINDINGS.includes(spec.binding)) {
        throw new MappingError(`Unknown content binding ${spec.binding}.`);
      }
      region.binding = spec.binding;
    }

    if (TEXT_ROLES.includes(spec.role)) {
      // Text style comes from the sample text. If only the box was selected,
      // use the text objects that sit inside it on the same page.
      let texts = objects.filter((o) => o.type === "text");
      if (texts.length === 0) {
        const area = unionBox(objects.map((o) => o.bbox));
        texts = page.objects.filter((o) => {
          if (o.type !== "text") return false;
          const cx = o.bbox.x + o.bbox.width / 2;
          const cy = o.bbox.y + o.bbox.height / 2;
          return cx >= area.x && cx <= area.x + area.width && cy >= area.y && cy <= area.y + area.height;
        });
        if (texts.length) region.textSourceIds = texts.map((t) => t.id);
      }
      const first = texts[0];
      const fromPdf = first
        ? {
            fontFamily: first.fontName || undefined,
            minPt: first.fontSizePt,
            maxPt: first.fontSizePt,
            horizontalScale: first.horizontalScale || 1,
          }
        : {};
      region.textStyle = { ...fromPdf, ...pickStyleOverrides(spec.textStyle) };
      // Duplicate copies (e.g. a shadow drawn as a second text object) count once.
      region.sampleText =
        [...new Set(texts.flatMap((t) => t.text.split("\n")).map((l) => l.trim()))].join("\n") || null;
      if (texts.length) region.textBox = offsetBox(unionBox(texts.map((t) => t.bbox)), ox, oy);
    }

    // Side boxes keep the look of their source rectangle (fill, border). If
    // only the photo/text was selected, use the box outline drawn around it.
    if (["SIDE_BOX_LEFT", "SIDE_BOX_RIGHT"].includes(spec.role)) {
      const isShape = (o) => o.type === "path" && o.paint !== "clip" && o.closed;
      let shape = objects.find(isShape);
      if (!shape) {
        const sel = unionBox(objects.map((o) => o.bbox));
        const near = (a, b) => Math.abs(a - b) <= 2; // mm
        shape = page.objects.find(
          (o) =>
            isShape(o) &&
            (o.strokeColor || o.fillColor) &&
            near(o.bbox.x, sel.x) &&
            near(o.bbox.y, sel.y) &&
            near(o.bbox.width, sel.width) &&
            near(o.bbox.height, sel.height),
        );
        if (shape) region.boxSourceId = shape.id;
      }
      if (shape) {
        region.boxStyle = {
          fillColor: shape.fillColor || null,
          strokeColor: shape.strokeColor || null,
          strokeWidthMm: shape.strokeWidthMm ?? null,
        };
      }
    }

    if (spec.role === "FRAME" && single?.type === "image") {
      frameImagePx = { width: single.imageWidthPx, height: single.imageHeightPx };
    }
    if (["FRAME", "BACKGROUND_AREA"].includes(spec.role)) {
      for (const o of objects.filter((x) => x.type === "image" && x.imageWidthPx && x.bbox.width > 0)) {
        artworkRasters.push({
          role: spec.role,
          objectId: o.id,
          widthPx: o.imageWidthPx,
          heightPx: o.imageHeightPx,
          widthMm: round2(o.bbox.width),
          heightMm: round2(o.bbox.height),
          dpi: Math.round(
            Math.min(o.imageWidthPx / (o.bbox.width / MM_PER_INCH), o.imageHeightPx / (o.bbox.height / MM_PER_INCH)),
          ),
        });
      }
    }
    return region;
  });

  // The main artwork must always be measured, however it was mapped: every
  // raster image covering at least a quarter of the calendar counts.
  // (Sample pictures the customer replaces — the god picture, the product
  // photo — are not artwork and are not measured.)
  const trimOnPage = { x: ox, y: oy, width: trim.widthMm, height: trim.heightMm };
  const replaced = regions
    .filter((r) => r.role === "GOD_AREA" || r.binding === "productImage")
    .map((r) => ({ x: r.box.x + ox, y: r.box.y + oy, width: r.box.width, height: r.box.height }));
  const inReplaced = (o) => {
    const cx = o.bbox.x + o.bbox.width / 2;
    const cy = o.bbox.y + o.bbox.height / 2;
    return replaced.some((b) => cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height);
  };
  for (const o of page.objects) {
    if (o.type !== "image" || !o.imageWidthPx || artworkRasters.some((r) => r.objectId === o.id) || inReplaced(o)) continue;
    const ix = Math.max(0, Math.min(o.bbox.x + o.bbox.width, trimOnPage.x + trimOnPage.width) - Math.max(o.bbox.x, trimOnPage.x));
    const iy = Math.max(0, Math.min(o.bbox.y + o.bbox.height, trimOnPage.y + trimOnPage.height) - Math.max(o.bbox.y, trimOnPage.y));
    if (ix * iy < 0.25 * trimOnPage.width * trimOnPage.height) continue;
    artworkRasters.push({
      role: "ARTWORK",
      objectId: o.id,
      widthPx: o.imageWidthPx,
      heightPx: o.imageHeightPx,
      widthMm: round2(o.bbox.width),
      heightMm: round2(o.bbox.height),
      dpi: Math.round(Math.min(o.imageWidthPx / (o.bbox.width / MM_PER_INCH), o.imageHeightPx / (o.bbox.height / MM_PER_INCH))),
    });
  }

  return {
    trim,
    cutline,
    regions,
    frameImagePx,
    artworkRasters,
    excludedBoxes: (mapping.excludedObjectIds || []).map((id) => {
      const o = byId.get(id);
      if (!o) throw new MappingError(`Excluded object ${id} is not on this page.`);
      return offsetBox(o.bbox, ox, oy);
    }),
    registrationOffsetMm: { x: round2(shiftX), y: round2(shiftY) },
    cutlineSource: source,
    // How a laser-PDF cutline was placed on the artwork (null otherwise).
    cutlineAlignment: alignment,
    // Top-left of the trim box on the PDF page (for rendering the artwork).
    trimOriginMm: { x: round2(ox), y: round2(oy) },
  };
}

// Closed vector paths whose size matches the calendar size: likely cutlines.
// Most likely first: a cutline is drawn as a line (stroke), not a filled
// shape (a filled die shape is usually the artwork's backing); then the
// closest to the calendar size.
const CUT_PAINT_RANK = { stroke: 0, fillStroke: 1, fill: 2 };
function findCutlineCandidates(page, expectedWidthMm, expectedHeightMm, toleranceMm) {
  const sizeError = (o) => Math.abs(o.bbox.width - expectedWidthMm) + Math.abs(o.bbox.height - expectedHeightMm);
  return (page.objects || [])
    .filter(
      (o) =>
        o.type === "path" &&
        o.closed &&
        o.path &&
        o.paint !== "clip" &&
        Math.abs(o.bbox.width - expectedWidthMm) <= toleranceMm &&
        Math.abs(o.bbox.height - expectedHeightMm) <= toleranceMm,
    )
    .sort((a, b) => (CUT_PAINT_RANK[a.paint] ?? 3) - (CUT_PAINT_RANK[b.paint] ?? 3) || sizeError(a) - sizeError(b))
    .map((o) => o.id);
}

const boxesOverlap = (a, b) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

// When the cutline is drawn away from the artwork, look for a mark drawn
// twice at the same size: one copy inside the cutline, one outside it
// (CorelDRAW production files repeat the cake rectangle this way).
function findRegistrationPair(page, cutlineObjectId) {
  const objects = page.objects || [];
  const cut = objects.find((o) => o.id === cutlineObjectId);
  if (!cut) return null;
  const marks = objects.filter((o) => o.type === "path" && o.closed && o.paint !== "clip" && o.id !== cut.id);
  const inside = marks.filter((o) => boxesOverlap(o.bbox, cut.bbox));
  const outside = marks.filter((o) => !boxesOverlap(o.bbox, cut.bbox));
  // If the cutline already sits on the artwork there is nothing to align.
  if (outside.length === 0 || inside.length === 0) return null;
  for (const c of inside) {
    const twins = outside.filter(
      (a) =>
        Math.abs(a.bbox.width - c.bbox.width) <= REGISTRATION_SIZE_TOLERANCE_MM &&
        Math.abs(a.bbox.height - c.bbox.height) <= REGISTRATION_SIZE_TOLERANCE_MM,
    );
    if (twins.length === 1) return { artObjectId: twins[0].id, cutlineObjectId: c.id };
  }
  return null;
}

module.exports = {
  buildVariantGeometry,
  findCutlineCandidates,
  findRegistrationPair,
  translatePath,
  MappingError,
};
