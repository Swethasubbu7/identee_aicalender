const mongoose = require("mongoose");

// One Generate: the designer's content (+ prompt) for a selected production
// layout, producing 2 design variations of that SAME layout (2026-10-12).
// mode "preview": no AI — the app renders each design from its recipe
//                 (colours, fonts, side-box style) at no cost.
// mode "ai":      AI pictures for AI regions (only when AI is switched on).
// Every variation keeps the layout's fixed geometry.
const JOB_STATUSES = ["QUEUED", "RUNNING", "DONE", "PARTIAL", "FAILED"];
const VARIATION_STATUSES = ["PENDING", "RUNNING", "DONE", "FAILED"];

const themeSchema = new mongoose.Schema(
  {
    name: String,
    mood: String,
    palette: [String],
    background: String,
    godSetting: String,
  },
  { _id: false },
);

const boxSchema = new mongoose.Schema(
  { x: Number, y: Number, width: Number, height: Number },
  { _id: false },
);

const recipeSchema = new mongoose.Schema(
  {
    id: String,
    name: String,
    theme: String,
    palette: [String],
    fonts: { english: String, tamil: String },
    boxStyle: String,
  },
  { _id: false },
);

const variationSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true },
    // Colours, fonts and side-box style of this design (constants/designRecipes.js).
    recipe: { type: recipeSchema, default: null },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: "LayoutVariant", required: true },
    status: { type: String, enum: VARIATION_STATUSES, default: "PENDING" },
    theme: { type: themeSchema, default: null },
    // "GOD_AREA" (deity in the layout's god opening) or "FULL_ARTWORK"
    // (Special Die-Cut: the AI picture is the whole artwork, in `background`).
    composition: { type: String, default: null },
    compositionStyle: { type: String, default: null }, // Special: "Grand deity", "Calendar focus", …
    // Die-Cut / Normal: areas of removed sections the AI picture also fills (trim mm).
    filledAreas: { type: [mongoose.Schema.Types.Mixed], default: [] },
    godImage: { type: String, default: null }, // relative upload path
    // Any further images the provider returned for the same request (billed).
    extraImages: { type: [String], default: [] },
    // Trim-mm box the AI god image maps onto (the layout crop it was composed
    // for). The app clips it to the god region and draws the real frame on top.
    godImageBox: { type: boxSchema, default: null },
    background: { type: String, default: null }, // only if the layout maps BACKGROUND_AREA
    backgroundBox: { type: boxSchema, default: null }, // trim-mm box the AI artwork was composed for
    // Print-resolution copies made at export (upscaler), when configured.
    godImagePrint: { type: String, default: null },
    backgroundPrint: { type: String, default: null },
    // Picture of the finished design (composed in the browser) for the
    // Dashboard / Generated Designs gallery.
    previewImage: { type: String, default: null },
    exportPdf: { type: String, default: null }, // print artwork PDF
    exportCutlinePdf: { type: String, default: null }, // laser cutline PDF
    productChoice: { type: String, enum: ["original", "enhanced"], default: "original" },
    exportedAt: { type: Date, default: null },
    error: { type: String, default: null },
  },
  { _id: false },
);

const aiCalendarJobSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    selectedVariantId: { type: mongoose.Schema.Types.ObjectId, ref: "LayoutVariant", required: true },
    cutType: { type: String, required: true },
    sizeCode: { type: String, required: true },
    prompt: { type: String, default: "", maxlength: 1000 },
    content: {
      businessName: { type: String, default: "" },
      productList: { type: String, default: "" },
      address: { type: String, default: "" },
      godImage: { type: String, default: null }, // customer's original upload
      productImage: { type: String, default: null },
      // AI-cleaned copy of the product photo (the original is always kept).
      productImageEnhanced: { type: String, default: null },
      rightBoxText: { type: String, default: "" },
    },
    // Designer's options (same for both designs).
    options: {
      language: { type: String, enum: ["english", "tamil"], default: "english" },
      showBusinessName: { type: Boolean, default: true },
      showLeftBox: { type: Boolean, default: true },
      showRightBox: { type: Boolean, default: true },
      showTextLine1: { type: Boolean, default: true }, // Special Die-Cut
      showTextLine2: { type: Boolean, default: true },
      rightBoxMode: { type: String, enum: ["image", "text"], default: "image" },
    },
    // "normal" = content on the layout, no AI ever; "ai" = paid image
    // generation; "preview" = older free previews (before the mode selector).
    mode: { type: String, enum: ["normal", "ai", "preview"], default: "ai" },
    // Admin-only "Test one AI image" (exactly one request; never a customer Generate).
    adminTest: { type: Boolean, default: false },
    // No longer used: product photos are not sent to AI separately (cost
    // rule 2026-10-12). Kept for older records.
    enhanceProduct: { type: Boolean, default: false },
    // AI mode: the cost estimate the designer confirmed before generating.
    confirmedEstimateInr: { type: Number, default: null },
    // The Customise draft this generation was started from.
    designId: { type: mongoose.Schema.Types.ObjectId, ref: "CalendarDesign", default: null },
    status: { type: String, enum: JOB_STATUSES, default: "QUEUED" },
    progress: { type: String, default: "Waiting to start" },
    variations: { type: [variationSchema], default: [] },
    selectedIndex: { type: Number, default: null },
    aiCalls: { type: Number, default: 0 },
    error: { type: String, default: null },
    errorKind: { type: String, default: null }, // QUOTA | AUTH | RATE_LIMIT | TIMEOUT | …
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AiCalendarJob", aiCalendarJobSchema);
module.exports.JOB_STATUSES = JOB_STATUSES;
