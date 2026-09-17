const mongoose = require("mongoose");

const layoutSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      enum: ["normal", "special-cut", "die-cut"],
    },
    size: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    previewImage: { type: String, trim: true, default: "" },
    layoutFile: { type: String, trim: true, default: "" },
    editableAreas: { type: [mongoose.Schema.Types.Mixed], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Layout", layoutSchema);
