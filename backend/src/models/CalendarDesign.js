const mongoose = require("mongoose");

const calendarDesignSchema = new mongoose.Schema(
  {
    // Legacy preview-only layout (old customisation page)…
    layoutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Layout",
      default: null,
    },
    // …or a production layout (fixed geometry + content slots).
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LayoutVariant",
      default: null,
    },
    // Designer content placed into the production layout's slots.
    content: {
      businessName: { type: String, default: "" },
      productList: { type: String, default: "" },
      address: { type: String, default: "" },
      godImage: { type: String, default: null }, // relative upload path
      productImage: { type: String, default: null },
      rightBoxText: { type: String, default: "" },
      // Optional sections (customer's choice) and what the right box holds.
      showBusinessName: { type: Boolean, default: true },
      showLeftBox: { type: Boolean, default: true },
      showRightBox: { type: Boolean, default: true },
      showTextLine1: { type: Boolean, default: true }, // Special Die-Cut
      showTextLine2: { type: Boolean, default: true },
      rightBoxMode: { type: String, enum: ["image", "text"], default: "image" },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Small picture of the design as last saved (shown on the project cards).
    thumbnail: { type: String, default: null }, // relative upload path
    canvasData: { type: mongoose.Schema.Types.Mixed, default: null }, // fabric.js JSON
    elements: { type: [mongoose.Schema.Types.Mixed], default: [] },
    year: { type: Number, default: new Date().getFullYear() + 1 },
    language: { type: String, enum: ["english", "tamil"], default: "english" },
    status: {
      type: String,
      enum: ["draft", "saved"],
      default: "draft",
    },
    aiMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

calendarDesignSchema.pre("validate", function requireLayout() {
  if (!this.layoutId && !this.variantId) {
    this.invalidate("layoutId", "A design needs a layout or a production layout");
  }
});

module.exports = mongoose.model("CalendarDesign", calendarDesignSchema);
