// Print check of one finished design, before the final PDF.
// Each check is PASS / WARN / FAIL / PENDING. FAIL blocks the export;
// PENDING marks printer values that are not confirmed yet (never invented).
const config = require("../../config");
const { NEEDS_CONFIRMATION } = require("./calendarPdf");
const { compositionMode } = require("../layout/composition");

const MM_PER_IN = 25.4;
const SHRUNK_TEXT_RATIO = 0.6; // text set below 60% of the layout size looks wrong

const check = (id, label, status, detail) => ({ id, label, status, detail });
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/** Effective print DPI of an image stretched over `box` (mm). */
const effectiveDpi = (size, box) =>
  size && box ? Math.round(Math.min(size.width / (box.width / MM_PER_IN), size.height / (box.height / MM_PER_IN))) : null;

const resolutionCheck = (id, label, size, box, settings) => {
  const dpi = effectiveDpi(size, box);
  if (dpi == null) return check(id, label, "WARN", "Image size could not be read.");
  const target = settings.dpi;
  const detail = `About ${dpi} DPI at print size (target ${target} DPI${settings.dpiConfirmed ? "" : `, ${NEEDS_CONFIRMATION}`}).`;
  return check(id, label, dpi >= target * 0.95 ? "PASS" : "WARN", dpi >= target * 0.95 ? detail : `${detail} It may print soft.`);
};

/**
 * @param variant   LayoutVariant (trim, cutline, regions, status, cutType, sizeCode)
 * @param format    CalendarFormat for the variant's cut type + size (or null)
 * @param settings  exportSettings() result + { bleedMm, safeMarginMm, colorMode }
 * @param images    { god: {size, box}, background: {size, box}|null, product: {size, box}|null }
 * @param content   { businessName, productList, rightBoxText }
 * @param options   { showBusinessName, showLeftBox, showRightBox, showTextLine1, showTextLine2, rightBoxMode, language }
 * @param textFits  { [regionId]: { fittedPt, layoutPt } } measured by the renderer
 */
const runPrintCheck = ({ variant, format, settings, images = {}, content = {}, options = {}, textFits = {} }) => {
  const tol = config.GEOMETRY_MATCH_TOLERANCE_MM;
  const regions = variant.regions || [];
  const role = (r) => regions.find((x) => x.role === r);
  const checks = [];

  // Layout and physical size.
  checks.push(
    variant.status === "ACTIVE" && variant.validation?.status === "FAIL"
      ? check(
          "layout",
          "Approved layout",
          "WARN",
          `The layout is active, but its last validation failed: ${
            (variant.validation.results || []).find((r) => r.status === "FAIL")?.message || "see the Layouts page"
          }`,
        )
      : variant.status === "ACTIVE"
      ? check("layout", "Approved layout", "PASS", "The layout is active.")
      : variant.status === "VALIDATED"
        ? check("layout", "Approved layout", "WARN", "The layout is validated but not activated yet.")
        : check("layout", "Approved layout", "FAIL", `The layout is ${String(variant.status).toLowerCase()}.`),
  );
  if (format) {
    const wMm = format.widthIn * MM_PER_IN;
    const hMm = format.heightIn * MM_PER_IN;
    const ok = near(variant.trim.widthMm, wMm, tol) && near(variant.trim.heightMm, hMm, tol);
    checks.push(
      check(
        "size",
        "Physical size",
        ok ? "PASS" : "FAIL",
        `${(variant.trim.widthMm / MM_PER_IN).toFixed(2)} × ${(variant.trim.heightMm / MM_PER_IN).toFixed(2)} in ` +
          `(catalogue ${format.widthIn} × ${format.heightIn} in, tolerance ${tol} mm).`,
      ),
    );
  } else {
    checks.push(check("size", "Physical size", "FAIL", "No catalogue entry for this cut type and size."));
  }

  // Production geometry.
  checks.push(
    variant.cutline?.path
      ? check("cutline", "Cutline", "PASS", "Vector cutline from the approved layout (exported as the laser file).")
      : check("cutline", "Cutline", "FAIL", "The layout has no cutline."),
  );
  const cake = role("CAKE_MOUNT");
  const cakeH = format?.cake?.heightIn;
  const cakeW = format?.cake?.widthIn;
  if (!cake) {
    checks.push(check("cake", "Cake mount", "FAIL", "The layout has no cake mount."));
  } else if (!cakeH || !cakeW) {
    checks.push(check("cake", "Cake mount", "PENDING", `Cake size for this format is not confirmed — ${NEEDS_CONFIRMATION}.`));
  } else {
    const ok = near(cake.box.height, cakeH * MM_PER_IN, tol) && near(cake.box.width, cakeW * MM_PER_IN, tol);
    checks.push(
      check(
        "cake",
        "Cake mount",
        ok ? "PASS" : "FAIL",
        `${(cake.box.height / MM_PER_IN).toFixed(2)} H × ${(cake.box.width / MM_PER_IN).toFixed(2)} W in (catalogue ${format.cake.label} in, H × W).`,
      ),
    );
  }
  checks.push(
    role("CALENDAR_AREA")
      ? check(
          "calendar",
          "Calendar area",
          "PASS",
          images.composition === "FULL_ARTWORK" && images.background
            ? "Position fixed by the approved layout (the calendar pad is attached there); the AI artwork is asked to keep it plain."
            : "Printed from the approved layout artwork, unchanged.",
        )
      : check("calendar", "Calendar area", "FAIL", "The layout has no calendar area."),
  );
  checks.push(
    check(
      "protected",
      "Protected regions",
      "PASS",
      "Size, cutline, cake mount and calendar positions come from the approved layout; pictures, text and side boxes stay inside their fixed areas.",
    ),
  );

  // Pictures.
  if (images.layoutGod) {
    // Normal Mode: the layout's own artwork and God picture, unchanged. Its
    // embedded resolution is part of the layout's own validation.
    checks.push(
      check("god", "God image", "PASS", "Normal Mode: the layout's own God picture and artwork are kept unchanged (resolution: see the layout's validation)."),
    );
    // What really prints is the layout's embedded artwork: its measured
    // resolution at print size (never inflated by the PDF's raster setting).
    const rasters = Array.isArray(images.layoutRasters) ? images.layoutRasters.filter((r) => r.dpi) : null;
    if (!rasters) {
      checks.push(check("layoutArt", "Layout artwork resolution", "WARN", "Not measured for this layout yet — an admin can save its mapping again to measure it."));
    } else if (rasters.length) {
      const low = rasters.reduce((a, r) => (r.dpi < a.dpi ? r : a));
      const target = settings.dpi;
      checks.push(
        check(
          "layoutArt",
          "Layout artwork resolution",
          low.dpi >= target * 0.95 ? "PASS" : "WARN",
          `Lowest: ${low.widthPx}×${low.heightPx} px over ${low.widthMm}×${low.heightMm} mm = about ${low.dpi} DPI at print size (target ${target} DPI)` +
            (low.dpi >= target * 0.95 ? "." : low.dpi < 150 ? " — it will print visibly soft." : " — it may print soft."),
        ),
      );
    }
  } else if (compositionMode(variant) === "FULL_ARTWORK" || (images.composition === "FULL_ARTWORK" && images.background)) {
    // Special Die-Cut without a god area: the customer's deity exists only in
    // an AI-composed artwork. Without one the template's sample deity would
    // print, so the design cannot be exported.
    if (images.background) {
      checks.push(check("god", "God image composition", "PASS", "Deity composed into the artwork by AI."));
      checks.push(resolutionCheck("background", "AI artwork resolution", images.background.size, images.background.box, settings));
    } else {
      checks.push(
        check(
          "god",
          "God image composition",
          "FAIL",
          "Preview only: this Special Die-Cut layout shows the template's sample deity. The customer's God image is composed by AI, which is switched off.",
        ),
      );
    }
  } else {
    if (images.god) checks.push(resolutionCheck("god", "God image resolution", images.god.size, images.god.box, settings));
    else checks.push(check("god", "God image resolution", "FAIL", "No god image."));
    if (images.background) {
      checks.push(resolutionCheck("background", "AI background resolution", images.background.size, images.background.box, settings));
    }
  }
  if (images.product) {
    checks.push(resolutionCheck("product", "Product image resolution", images.product.size, images.product.box, settings));
  }

  // Text.
  if (options.showBusinessName === false) {
    checks.push(check("name", "Business name", "PASS", "Not included (the business-name section is removed)."));
  } else if (!String(content.businessName || "").trim()) {
    checks.push(check("name", "Business name", "FAIL", "The business name is empty."));
  } else {
    checks.push(check("name", "Business name", "PASS", "Typeset by the app exactly as entered."));
  }
  if (options.showRightBox !== false && options.rightBoxMode === "text" && !String(content.rightBoxText || "").trim()) {
    checks.push(check("rightText", "Right box text", "WARN", "The right box is set to text but no text was entered."));
  }
  const shrunk = regions.filter((r) => {
    const fit = textFits[r.id];
    return fit && fit.layoutPt && fit.fittedPt < fit.layoutPt * SHRUNK_TEXT_RATIO;
  });
  checks.push(
    shrunk.length
      ? check(
          "textFit",
          "Text fits its area",
          "WARN",
          `Text had to be reduced a lot to fit (${shrunk.map((r) => `${textFits[r.id].fittedPt.toFixed(1)} pt instead of ${textFits[r.id].layoutPt.toFixed(1)} pt`).join("; ")}). Consider shorter text.`,
        )
      : check("textFit", "Text fits its area", "PASS", "All text fits inside its region."),
  );

  // Printer specifications (only what is confirmed in the Production Profile).
  checks.push(
    settings.bleedMm != null
      ? check("bleed", "Bleed", "PENDING", `Profile bleed ${settings.bleedMm} mm is not added to the artwork yet.`)
      : check("bleed", "Bleed", "PENDING", `Not confirmed — ${NEEDS_CONFIRMATION}.`),
  );
  checks.push(
    settings.safeMarginMm != null
      ? check("safe", "Safe area", "PASS", `${settings.safeMarginMm} mm (layout regions are fixed by the approved layout).`)
      : check("safe", "Safe area", "PENDING", `Not confirmed — ${NEEDS_CONFIRMATION}.`),
  );
  checks.push(
    settings.colorMode
      ? check("colour", "Colour mode", "PENDING", `Printer wants ${settings.colorMode}; the PDF is RGB (conversion not built yet).`)
      : check("colour", "Colour mode", "PENDING", `Exported as RGB — ${NEEDS_CONFIRMATION}.`),
  );
  checks.push(
    settings.dpiConfirmed
      ? check("dpi", "Print resolution", "PASS", `${settings.dpi} DPI (printer confirmed).`)
      : check("dpi", "Print resolution", "PENDING", `${settings.dpi} DPI working value — ${NEEDS_CONFIRMATION}.`),
  );

  const status = checks.some((c) => c.status === "FAIL") ? "FAIL" : checks.some((c) => c.status === "WARN") ? "WARN" : "PASS";
  return { status, checks };
};

module.exports = { runPrintCheck, effectiveDpi };
