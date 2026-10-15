const mongoose = require("mongoose");
const { CUT_TYPES } = require("../constants/calendar");

// Printer / laser production values. None of these are known yet, so every
// field defaults to null and is reported as PENDING by validation and print
// check until the printing team confirms it. Never fill these with guesses.
const pendingNumber = { type: Number, default: null };
const pendingString = { type: String, default: null, trim: true };

const productionProfileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Empty = applies to every cut type.
    cutTypes: { type: [{ type: String, enum: CUT_TYPES }], default: [] },
    material: pendingString, // e.g. paper board / eco felt

    print: {
      bleedMm: pendingNumber,
      safeMarginMm: pendingNumber,
      minDpi: pendingNumber,
      colorMode: pendingString, // e.g. "CMYK"
      iccProfileName: pendingString,
      iccProfileFile: pendingString, // relative upload path
    },
    laser: {
      cutlineSpotName: pendingString,
      cutlineStrokeWidthMm: pendingNumber,
      cutlineColor: pendingString,
      kerfMm: pendingNumber,
      minFeatureMm: pendingNumber,
      registrationMarksRequired: { type: Boolean, default: null },
    },

    isDefault: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("ProductionProfile", productionProfileSchema);
