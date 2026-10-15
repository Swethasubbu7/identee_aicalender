// Deterministic layout validation. No AI involved.
//
// STRUCTURE checks decide whether a layout variant may become ACTIVE.
// PRODUCTION checks depend on printer/laser values (ProductionProfile); while
// those values are not confirmed they report PENDING. PENDING production
// checks do not block activation, but they do block production export.

const {
  STRUCTURE_RULES,
  EXPECTED_BINDINGS,
  CAKE_STATUS,
  ROLE_POLICY,
  TEXT_ROLES,
} = require("../../constants/calendar");
const { inToMm, effectiveDpi } = require("../../lib/units");
const config = require("../../config");
const { compositionMode } = require("./composition");

// Artwork that is allowed to run past the trim edge (bleed).
const MAY_EXCEED_TRIM = ["FRAME", "BACKGROUND_AREA", "GOD_AREA", "DECORATION"];

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

const isClosedPath = (path) =>
  typeof path === "string" && /[zZ]\s*$/.test(path.trim());

const boxesOverlap = (a, b) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const boxInside = (inner, outer, tol = 0) =>
  inner.x >= outer.x - tol &&
  inner.y >= outer.y - tol &&
  inner.x + inner.width <= outer.x + outer.width + tol &&
  inner.y + inner.height <= outer.y + outer.height + tol;

const createCollector = () => {
  const results = [];
  const add = (stage, code, status, message, regionId) =>
    results.push({ stage, code, status, message, ...(regionId && { regionId }) });
  return { results, add };
};

function validateStructure(variant, format, toleranceMm, add) {
  const S = "STRUCTURE";
  const regions = variant.regions || [];
  const byRole = (role) => regions.filter((r) => r.role === role);

  if (!format) {
    add(S, "FORMAT_FOUND", "FAIL", "Calendar format not found.");
    return;
  }
  if (format.active === false) {
    add(S, "FORMAT_ACTIVE", "FAIL", `Format ${format.cutType} ${format.sizeCode} is inactive.`);
  }
  if (variant.cutType !== format.cutType || variant.sizeCode !== format.sizeCode) {
    add(S, "FORMAT_MATCH", "FAIL", "Variant cut type/size does not match its format.");
  } else {
    add(S, "FORMAT_MATCH", "PASS", `Format ${format.cutType} ${format.sizeCode}.`);
  }

  if (format.cake?.status !== CAKE_STATUS.CONFIRMED) {
    add(S, "CAKE_SIZE_CONFIRMED", "FAIL", `Cake size for ${format.sizeCode} is not confirmed yet.`);
  } else {
    add(S, "CAKE_SIZE_CONFIRMED", "PASS",
      `Cake ${format.cake.heightIn}×${format.cake.widthIn} in (H×W): ${format.cake.heightIn} in tall, ${format.cake.widthIn} in wide.`);
  }

  // Trim size must equal the fixed calendar size.
  const expectW = inToMm(format.widthIn);
  const expectH = inToMm(format.heightIn);
  const trim = variant.trim || {};
  if (
    isNum(trim.widthMm) && isNum(trim.heightMm) &&
    Math.abs(trim.widthMm - expectW) <= toleranceMm &&
    Math.abs(trim.heightMm - expectH) <= toleranceMm
  ) {
    add(S, "TRIM_SIZE", "PASS", `Trim ${trim.widthMm.toFixed(1)}×${trim.heightMm.toFixed(1)} mm.`);
  } else {
    add(S, "TRIM_SIZE", "FAIL",
      `Trim ${trim.widthMm}×${trim.heightMm} mm does not match ${expectW.toFixed(1)}×${expectH.toFixed(1)} mm.`);
  }

  if (!variant.cutline?.path) {
    add(S, "CUTLINE_PRESENT", "FAIL",
      variant.mapping?.cutlineSource === "none"
        ? "Draft without a cutline (trim taken from the artwork bounds): select / join the cutline or use the laser PDF."
        : "No cutline path.");
  } else if (!isClosedPath(variant.cutline.path)) {
    add(S, "CUTLINE_PRESENT", "FAIL", "Cutline path is not closed.");
  } else {
    add(S, "CUTLINE_PRESENT", "PASS", "Closed cutline path present.");
  }

  const correction = variant.geometryCorrection;
  if (correction?.active) {
    add(S, "GEOMETRY_CORRECTION", "PASS",
      `Size corrected by an admin from ${correction.sourceTrim.widthMm}×${correction.sourceTrim.heightMm} mm ` +
        `(×${correction.scaleX} / ×${correction.scaleY}); print and laser use the corrected outline, the source file is kept.`);
  }

  // A cutline taken from the laser PDF must sit exactly on the artwork:
  // placed by the cake drawn in both files, or confirmed by an admin.
  const alignment = variant.mapping?.cutlineAlignment;
  if (variant.mapping?.cutlineSource === "laser") {
    if (alignment?.exact) {
      add(S, "CUTLINE_ALIGNMENT", "PASS", "Laser cutline placed by the cake rectangle drawn in both files.");
    } else if (alignment?.confirmed) {
      add(S, "CUTLINE_ALIGNMENT", "PASS", `Laser cutline placed by ${alignment.method}; overlay confirmed by an admin.`);
    } else {
      add(S, "CUTLINE_ALIGNMENT", "FAIL",
        `Laser cutline placed by ${alignment?.method || "an unknown method"}: check the overlay on the artwork and confirm it.`);
    }
  }

  // The supplied laser PDF must match the layout (same outline and cake).
  const laser = variant.laserCheck;
  if (!laser) {
    add(S, "LASER_MATCH", "WARN", "No laser PDF supplied to cross-check the cutline and cake.");
  } else if (!laser.laserCutline) {
    add(S, "LASER_MATCH", "FAIL", "The laser PDF has no closed cutline.");
  } else if (laser.cutlineDeviationMm != null) {
    const ok = laser.cutlineDeviationMm <= toleranceMm;
    add(S, "LASER_MATCH", ok ? "PASS" : "FAIL",
      `Laser cutline ${ok ? "matches" : "differs from"} the ${correction?.active ? "source file's" : "layout"} cutline ` +
        `(max ${laser.cutlineDeviationMm} mm; tolerance ${toleranceMm} mm)${correction?.active && ok ? " — the exported laser file uses the corrected outline" : ""}.`);
  }
  if (laser?.cakeOffsetMm) {
    const off = Math.max(Math.abs(laser.cakeOffsetMm.x), Math.abs(laser.cakeOffsetMm.y), laser.cakeOffsetMm.size);
    add(S, "LASER_CAKE", off <= toleranceMm ? "PASS" : "FAIL",
      `Cake in the laser PDF ${off <= toleranceMm ? "matches" : "differs from"} the mapped cake (${off} mm).`);
  } else if (laser && !laser.laserHasCake) {
    add(S, "LASER_CAKE", "WARN", "The laser PDF has no cake rectangle to compare.");
  }

  // Required / forbidden / exactly-one regions per cut type.
  const rules = STRUCTURE_RULES[variant.cutType];
  if (!rules) {
    add(S, "CUT_TYPE", "FAIL", `Unknown cut type ${variant.cutType}.`);
    return;
  }
  for (const role of rules.required) {
    if (byRole(role).length === 0) add(S, "REQUIRED_REGION", "FAIL", `Missing ${role} region.`);
  }
  for (const role of rules.forbidden) {
    if (byRole(role).length > 0)
      add(S, "FORBIDDEN_REGION", "FAIL", `${role} is not allowed for ${variant.cutType}.`);
  }
  for (const roles of rules.requireAny || []) {
    if (!roles.some((role) => byRole(role).length > 0)) {
      add(S, "REQUIRED_REGION", "FAIL", `Missing artwork: map ${roles.join(" or ")}.`);
    }
  }
  for (const role of rules.exactlyOne) {
    const n = byRole(role).length;
    if (n > 1) add(S, "REGION_COUNT", "FAIL", `Expected exactly one ${role}, found ${n}.`);
  }
  // Special Die-Cut: the background / frame area is the whole artwork; a
  // small object (e.g. a label) mapped there is a mapping mistake.
  // A reusable layout saved from a complete AI artwork prints that artwork,
  // not the template: its own resolution is checked instead (below).
  const savedArtwork = variant.design?.artwork ? variant.design : null;
  if (variant.cutType === "special-die-cut" && trim.widthMm && trim.heightMm && !savedArtwork) {
    const art = regions.filter((r) => ["BACKGROUND_AREA", "FRAME"].includes(r.role) && r.box);
    const largest = art.reduce((a, r) => Math.max(a, r.box.width * r.box.height), 0);
    if (art.length && largest < 0.3 * trim.widthMm * trim.heightMm) {
      add(S, "ARTWORK_REGION", "FAIL", "The background artwork area is much smaller than the calendar — select the main artwork image as the background.");
    }
  }
  if (variant.cutType === "special-die-cut") {
    add(S, "GOD_COMPOSITION", "PASS",
      compositionMode(variant) === "FULL_ARTWORK"
        ? "No fixed god area: the AI composes the deity, frame and background inside the cutline."
        : "God area mapped: the deity is composed inside it.");
  }

  // Embedded layout artwork must be sharp enough to print. Measured when the
  // mapping is saved; older layouts without a measurement are flagged only.
  const rasters = variant.artworkRasters;
  const override = variant.assets?.artworkOverride;
  // Real resolution of a saved AI picture at its print size (never inflated
  // by resampling or by the PDF's raster setting).
  const savedDpi = (px, box) =>
    px?.widthPx && box?.width ? Math.round(Math.min(effectiveDpi(px.widthPx, box.width), effectiveDpi(px.heightPx, box.height))) : null;
  const dpiStatus = (dpi) => (dpi < config.MIN_ARTWORK_DPI ? "FAIL" : dpi < config.EXPORT_FALLBACK_DPI * 0.95 ? "WARN" : "PASS");
  if (variant.design?.godImage) {
    const dpi = savedDpi(variant.design.godImagePx, variant.design.godImageBox);
    if (dpi == null) add(S, "SAVED_GOD_RESOLUTION", "WARN", "Saved AI God image: resolution not measured.");
    else {
      add(S, "SAVED_GOD_RESOLUTION", dpiStatus(dpi),
        `Saved AI God image ${variant.design.godImagePx.widthPx}×${variant.design.godImagePx.heightPx} px = about ${dpi} DPI at print size ` +
          `(blocks below ${config.MIN_ARTWORK_DPI} DPI; print target ${config.EXPORT_FALLBACK_DPI} DPI).`);
    }
  }
  if (savedArtwork) {
    const dpi = savedDpi(savedArtwork.artworkPx, savedArtwork.artworkBox);
    if (dpi == null) add(S, "ARTWORK_RESOLUTION", "WARN", "Saved AI artwork: resolution not measured.");
    else {
      add(S, "ARTWORK_RESOLUTION", dpiStatus(dpi),
        `Saved AI artwork ${savedArtwork.artworkPx.widthPx}×${savedArtwork.artworkPx.heightPx} px over the ${trim.widthMm}×${trim.heightMm} mm board = ` +
          `about ${dpi} DPI at print size (blocks below ${config.MIN_ARTWORK_DPI} DPI; print target ${config.EXPORT_FALLBACK_DPI} DPI). ` +
          "Embedding it in a 300-DPI PDF does not add detail.");
    }
  } else if (override?.kind === "ai-enhanced") {
    const status = override.detailDpi < config.MIN_ARTWORK_DPI ? "FAIL" : override.detailDpi < config.EXPORT_FALLBACK_DPI * 0.95 ? "WARN" : "PASS";
    add(S, "ARTWORK_RESOLUTION", status,
      `AI-enhanced artwork: ${override.widthPx}×${override.heightPx} px for print; real detail about ${override.detailDpi} DPI ` +
        `(AI-reconstructed from ${override.sourcePx} px — check a printed proof). Blocks below ${config.MIN_ARTWORK_DPI} DPI.`);
  } else if (override?.kind === "replacement") {
    const status = override.dpi < config.MIN_ARTWORK_DPI ? "FAIL" : override.dpi < config.EXPORT_FALLBACK_DPI * 0.95 ? "WARN" : "PASS";
    add(S, "ARTWORK_RESOLUTION", status,
      `Replacement artwork ${override.widthPx}×${override.heightPx} px = ${override.dpi} DPI at print size ` +
        `(blocks below ${config.MIN_ARTWORK_DPI} DPI; print target ${config.EXPORT_FALLBACK_DPI} DPI).`);
  } else if (!Array.isArray(rasters)) {
    add(S, "ARTWORK_RESOLUTION", "WARN", "Artwork resolution not measured yet — save the mapping again to measure it.");
  } else if (rasters.length) {
    const low = rasters.reduce((a, r) => (r.dpi < a.dpi ? r : a));
    const detail = rasters.map((r) => `${r.widthPx}×${r.heightPx} px over ${r.widthMm}×${r.heightMm} mm = ${r.dpi} DPI`).join("; ");
    const status = low.dpi < config.MIN_ARTWORK_DPI ? "FAIL" : low.dpi < config.EXPORT_FALLBACK_DPI * 0.95 ? "WARN" : "PASS";
    add(S, "ARTWORK_RESOLUTION", status,
      `${detail} (blocks below ${config.MIN_ARTWORK_DPI} DPI; print target ${config.EXPORT_FALLBACK_DPI} DPI).` +
        (override?.kind === "upscaled"
          ? ` An upscaled preview (${override.widthPx}×${override.heightPx} px) exists — it is NOT genuine ${config.EXPORT_FALLBACK_DPI}-DPI detail and does not count.`
          : ""));
  }

  const trimBox = { x: 0, y: 0, width: trim.widthMm || 0, height: trim.heightMm || 0 };
  const ids = new Set();
  for (const r of regions) {
    if (ids.has(r.id)) add(S, "REGION_ID_UNIQUE", "FAIL", `Duplicate region id ${r.id}.`, r.id);
    ids.add(r.id);

    const wantPolicy = ROLE_POLICY[r.role];
    if (wantPolicy && r.policy !== wantPolicy) {
      add(S, "REGION_POLICY", "FAIL", `${r.role} must be ${wantPolicy}, is ${r.policy}.`, r.id);
    }

    const b = r.box;
    if (!b || ![b.x, b.y, b.width, b.height].every(isNum) || b.width <= 0 || b.height <= 0) {
      add(S, "REGION_BOX", "FAIL", `${r.role} has an invalid box.`, r.id);
      continue;
    }
    if (MAY_EXCEED_TRIM.includes(r.role)) {
      // Bleed artwork may run past the trim, but must sit on the board.
      if (!boxesOverlap(b, trimBox)) {
        add(S, "REGION_INSIDE_TRIM", "FAIL", `${r.role} does not overlap the cutline area.`, r.id);
      }
    } else if (!boxInside(b, trimBox, toleranceMm)) {
      // The cake pad may legitimately hang past the board; flag for review.
      const status = r.role === "CAKE_MOUNT" ? "WARN" : "FAIL";
      add(S, "REGION_INSIDE_TRIM", status, `${r.role} extends outside the trim.`, r.id);
    }

    const expectedBinding = EXPECTED_BINDINGS[r.role];
    if (expectedBinding && r.binding !== expectedBinding) {
      add(S, "REGION_BINDING", "FAIL", `${r.role} must be bound to ${expectedBinding}.`, r.id);
    }
    if (TEXT_ROLES.includes(r.role) && !r.textStyle?.fontFamily) {
      add(S, "TEXT_STYLE", "FAIL", `${r.role} has no text style/font.`, r.id);
    }
  }

  // Cake mount must be exactly the catalogue cake size: catalogue height
  // against the box height, catalogue width against the box width.
  const cake = byRole("CAKE_MOUNT")[0];
  if (cake?.box && format.cake?.status === CAKE_STATUS.CONFIRMED) {
    const cw = inToMm(format.cake.widthIn);
    const ch = inToMm(format.cake.heightIn);
    const okSize =
      Math.abs(cake.box.width - cw) <= toleranceMm &&
      Math.abs(cake.box.height - ch) <= toleranceMm;
    add(S, "CAKE_MOUNT_SIZE", okSize ? "PASS" : "FAIL",
      `Cake mount ${cake.box.height.toFixed(1)} mm tall × ${cake.box.width.toFixed(1)} mm wide; ` +
        `expected ${ch.toFixed(1)} mm tall × ${cw.toFixed(1)} mm wide (cake ${format.cake.heightIn}×${format.cake.widthIn} in, H×W).`,
      cake.id);

    const area = byRole("CALENDAR_AREA")[0];
    if (area?.box && !boxInside(cake.box, area.box, toleranceMm)) {
      add(S, "CAKE_IN_CALENDAR_AREA", "WARN",
        "Cake mount extends outside the calendar area — confirm against the reference.", cake.id);
    }
  }

  if (byRole("FRAME").length > 0 && !variant.assets?.frame) {
    add(S, "FRAME_ASSET", "FAIL", "FRAME region has no frame artwork file.");
  }
}

function validateProduction(variant, profile, add) {
  const P = "PRODUCTION";
  const print = profile?.print || {};
  const regions = variant.regions || [];

  if (!isNum(print.bleedMm)) {
    add(P, "BLEED", "PENDING", "Bleed not confirmed by the printing team.");
  } else {
    add(P, "BLEED", "PENDING", "Bleed contour check runs at render time.");
  }

  if (!isNum(print.safeMarginMm)) {
    add(P, "SAFE_AREA", "PENDING", "Safe margin not confirmed by the printing team.");
  } else {
    const m = print.safeMarginMm;
    const safe = {
      x: m, y: m,
      width: (variant.trim?.widthMm || 0) - 2 * m,
      height: (variant.trim?.heightMm || 0) - 2 * m,
    };
    for (const r of regions.filter((x) => [...TEXT_ROLES, "SIDE_BOX_RIGHT"].includes(x.role))) {
      add(P, "SAFE_AREA", r.box && boxInside(r.box, safe) ? "PASS" : "FAIL",
        `${r.role} ${r.box && boxInside(r.box, safe) ? "inside" : "outside"} the safe area.`, r.id);
    }
  }

  const frame = regions.find((r) => r.role === "FRAME");
  if (frame) {
    if (!isNum(print.minDpi)) {
      add(P, "FRAME_DPI", "PENDING", "Minimum DPI not confirmed by the printing team.");
    } else if (!isNum(variant.assets?.frameWidthPx)) {
      add(P, "FRAME_DPI", "FAIL", "Frame pixel size unknown.");
    } else {
      const dpi = effectiveDpi(variant.assets.frameWidthPx, frame.box.width);
      add(P, "FRAME_DPI", dpi >= print.minDpi ? "PASS" : "FAIL",
        `Frame ≈ ${Math.round(dpi)} DPI (minimum ${print.minDpi}).`, frame.id);
    }
  }

  const laser = profile?.laser || {};
  if (!laser.cutlineSpotName) {
    add(P, "CUTLINE_SPOT", "PENDING", "Cutline spot colour name not confirmed.");
  }
  if (!isNum(laser.kerfMm) || !isNum(laser.minFeatureMm)) {
    add(P, "LASER_TOLERANCES", "PENDING", "Laser kerf / minimum feature size not confirmed.");
  }
  if (!print.iccProfileName) {
    add(P, "COLOR_PROFILE", "PENDING", "Final colour profile not confirmed.");
  }
}

function summarise(results, stage) {
  const own = results.filter((r) => r.stage === stage);
  if (own.some((r) => r.status === "FAIL")) return "FAIL";
  if (own.some((r) => r.status === "PENDING")) return "PENDING";
  return "PASS";
}

/**
 * @returns {{ status: "PASS"|"FAIL", productionStatus: "PASS"|"FAIL"|"PENDING", results: object[] }}
 */
function validateLayoutVariant(variant, { format, profile, toleranceMm }) {
  const { results, add } = createCollector();
  validateStructure(variant, format, toleranceMm, add);
  validateProduction(variant, profile, add);
  return {
    status: summarise(results, "STRUCTURE") === "FAIL" ? "FAIL" : "PASS",
    productionStatus: summarise(results, "PRODUCTION"),
    results,
  };
}

module.exports = { validateLayoutVariant, isClosedPath, boxInside };
