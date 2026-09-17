const mongoose = require("mongoose");

const calendarDesignSchema = new mongoose.Schema(
  {
    layoutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Layout",
      required: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
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

module.exports = mongoose.model("CalendarDesign", calendarDesignSchema);
