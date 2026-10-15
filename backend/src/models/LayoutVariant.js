const mongoose = require("mongoose");
const {
  CUT_TYPES,
  LAYOUT_STATUSES,
  REGION_ROLES,
  REGION_POLICIES,
  CONTENT_BINDINGS,
} = require("../constants/calendar");

// All geometry is in MILLIMETRES from the top-left of the trimmed sheet and
// must come from the designer's production export — never typed in or guessed.
const boxSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { _id: false },
);

const textStyleSchema = new mongoose.Schema(
  {
    fontFamily: String,
    fontFile: String, // relative upload path
    minPt: Number,
    maxPt: Number,
    color: String,
    strokeColor: String,
    strokeWidthPt: Number,
    align: { type: String, enum: ["left", "center", "right"], default: "center" },
    textCase: { type: String, enum: ["as-entered", "upper"], default: "as-entered" },
    maxLines: Number,
    // Horizontal stretch from the source artwork (1 = none).
    horizontalScale: { type: Number, default: 1 },
    // Drop shadow / second copy found in the source artwork, if any.
    shadow: {
      type: new mongoose.Schema(
        { color: String, dxMm: Number, dyMm: Number },
        { _id: false },
      ),
      default: null,
    },
  },
  { _id: false },
);

const regionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    role: { type: String, enum: REGION_ROLES, required: true },
    // "laser" when the region was taken from the laser PDF (e.g. the cake of a
    // flattened design); otherwise drawn in the production PDF.
    source: { type: String, default: null },
    policy: { type: String, enum: REGION_POLICIES, required: true },
    shape: {
      type: String,
      enum: ["rect", "ellipse", "path"],
      default: "rect",
    },
    box: { type: boxSchema, required: true }, // bounding box
    path: { type: String, default: null }, // SVG path in mm (shape === "path")
    z: { type: Number, default: 0 },
    binding: { type: String, enum: [...CONTENT_BINDINGS, null], default: null },
    fit: { type: String, enum: ["cover", "contain", null], default: null },
    textStyle: { type: textStyleSchema, default: null },
    // Where the sample text sat inside the region (mm, trim coordinates).
    textBox: { type: boxSchema, default: null },
    // Box drawing taken from the source path (side boxes).
    boxStyle: {
      type: new mongoose.Schema(
        { fillColor: String, strokeColor: String, strokeWidthMm: Number },
        { _id: false },
      ),
      default: null,
    },
    // Reference content such as "CLUTCH CREATION": previews only, never printed.
    sampleText: { type: String, default: null },
    sourceLayer: { type: String, default: null }, // Corel layer it came from
    // Extracted PDF objects this region was measured from (traceability).
    sourceObjectIds: { type: [String], default: [] },
    // Sample text found inside the selected box (when only the box was picked).
    textSourceIds: { type: [String], default: [] },
    // Box outline found around the selection (when only its contents were picked).
    boxSourceId: { type: String, default: null },
  },
  { _id: false },
);

const validationResultSchema = new mongoose.Schema(
  {
    code: String,
    stage: { type: String, enum: ["STRUCTURE", "PRODUCTION"] },
    status: { type: String, enum: ["PASS", "FAIL", "PENDING", "WARN"] },
    message: String,
    regionId: String,
  },
  { _id: false },
);

const layoutVariantSchema = new mongoose.Schema(
  {
    familyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LayoutFamily",
      required: true,
    },
    formatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CalendarFormat",
      required: true,
    },
    // Denormalised from the format for fast Generate All queries.
    cutType: { type: String, enum: CUT_TYPES, required: true },
    sizeCode: { type: String, required: true },

    status: { type: String, enum: LAYOUT_STATUSES, default: "DRAFT" },
    version: { type: Number, default: 1 },

    // Set from the mapped cutline's bounding box; null until mapped.
    trim: {
      widthMm: { type: Number, default: null },
      heightMm: { type: Number, default: null },
    },
    cutline: {
      path: { type: String, default: null }, // closed SVG path in mm
      sourceLayer: { type: String, default: null },
    },
    assets: {
      productionFile: { type: String, default: null },
      // The original upload when it was not a PDF (CorelDRAW): kept unchanged.
      sourceFile: { type: String, default: null },
      preview: { type: String, default: null },
      frame: { type: String, default: null }, // transparent PNG
      // Artwork inside the cutline with the sample text removed; the live
      // preview draws customer content on top of it.
      plate: { type: String, default: null },
      // Everything the artwork paints above the god picture (frame, banner,
      // boxes…), transparent elsewhere; drawn over the customer's god image.
      overlay: { type: String, default: null },
      // Same layers with the optional sections (business-name strip, side
      // boxes) erased, transparent where nothing remains: used when a
      // designer removes a section or the app restyles the side boxes.
      plateBare: { type: String, default: null },
      overlayBare: { type: String, default: null },
      // The untouched artwork (with its sample god, text and photos) at the
      // plate resolution: unreplaced slots show their original from here.
      original: { type: String, default: null },
      plateWidthPx: { type: Number, default: null },
      // Layout version the preview assets were rendered for: when the mapping
      // changes (version goes up) the assets are out of date.
      forVersion: { type: Number, default: null },
      // Renderer version of plateBare / overlayBare (see frontend layoutAssets.js).
      bareVersion: { type: Number, default: null },
      // Artwork with the layout's own God picture, no sample text (Normal Mode).
      plateGod: { type: String, default: null },
      plateGodBare: { type: String, default: null }, // …with the optional sections erased
      // Artwork used instead of the PDF's embedded raster:
      // { path, widthPx, heightPx, dpi, kind: "replacement" | "upscaled", … }.
      // "upscaled" is a labelled preview aid and never counts as print quality.
      artworkOverride: { type: mongoose.Schema.Types.Mixed, default: null },
      // Enhanced version awaiting comparison / approval, and a PNG copy of
      // the PDF's own artwork (for the side-by-side comparison).
      artworkCandidate: { type: mongoose.Schema.Types.Mixed, default: null },
      artworkSource: { type: String, default: null },
      plateHeightPx: { type: Number, default: null },
      frameWidthPx: { type: Number, default: null },
      frameHeightPx: { type: Number, default: null },
      fonts: { type: [String], default: [] },
      // Objects extracted from productionFile (JSON on disk, not in MongoDB).
      importDataFile: { type: String, default: null },
      // The designer's laser-cutting PDF (optional) and its extracted objects.
      laserFile: { type: String, default: null },
      laserImportDataFile: { type: String, default: null },
    },
    // Page sizes/object counts from the import, plus cutline suggestions.
    importSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    // Which extracted objects were assigned to which role (for re-editing).
    mapping: { type: mongoose.Schema.Types.Mixed, default: null },
    regions: { type: [regionSchema], default: [] },

    productionProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductionProfile",
      default: null,
    },

    // Embedded raster artwork (FRAME / BACKGROUND_AREA) and its effective
    // print DPI, measured from the production PDF when the mapping is saved.
    // Absent (not []) on layouts mapped before 2026-10-13.
    artworkRasters: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    // Admin-confirmed size correction { active, scaleX, scaleY, sourceTrim,
    // targetTrim, confirmedAt, confirmedBy } — re-applied whenever the
    // geometry is rebuilt; null = the cutline exactly as drawn in the file.
    geometryCorrection: { type: mongoose.Schema.Types.Mixed, default: null },
    // Mapped layout vs the laser PDF (cutline shape/size, cake position).
    laserCheck: { type: mongoose.Schema.Types.Mixed, default: null },

    // A reusable layout saved from a chosen design (Normal or AI mode). Its
    // production geometry is copied unchanged from the source layout; this
    // holds the look of the chosen design:
    //   { mode: "normal" | "ai", name, boxStyle, recipe, options,
    //     artwork, artworkBox            (AI complete artwork, trim mm)
    //     godImage, godImageBox, filledAreas (AI deity in the god opening)
    //     sourceJobId, variationIndex, savedAt }
    design: { type: mongoose.Schema.Types.Mixed, default: null },
    sourceVariantId: { type: mongoose.Schema.Types.ObjectId, ref: "LayoutVariant", default: null },
    sourceVersion: { type: Number, default: null },

    validation: {
      status: {
        type: String,
        enum: ["NOT_RUN", "PASS", "FAIL", "PENDING"],
        default: "NOT_RUN",
      },
      checkedAt: Date,
      results: { type: [validationResultSchema], default: [] },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
  },
  { timestamps: true },
);

layoutVariantSchema.index({ cutType: 1, sizeCode: 1, status: 1 });
layoutVariantSchema.index({ familyId: 1, formatId: 1 }, { unique: true });

module.exports = mongoose.model("LayoutVariant", layoutVariantSchema);
