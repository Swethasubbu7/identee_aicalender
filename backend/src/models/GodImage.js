const mongoose = require("mongoose");

// Default God-image library: one saved picture, found by its name or any
// alias ("Vinayagar" also as "Pillaiyar", "Ganesha", …). The picture is
// stored once (file named by its SHA-256, so the same picture is never kept
// twice) and drafts / generations refer to it by its stored path, exactly
// like an uploaded God image — selecting it never copies the file.
const godImageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    aliases: { type: [String], default: [] },
    // Lower-case name + aliases, for case-insensitive search.
    searchTerms: { type: [String], default: [], index: true },
    file: {
      stored: { type: String, required: true }, // "/uploads/design-content/library/<sha256>.<ext>"
      sha256: { type: String, required: true, index: true },
      widthPx: { type: Number, default: null },
      heightPx: { type: Number, default: null },
      contentType: { type: String, default: null },
      bytes: { type: Number, default: null },
    },
    thumb: { type: String, default: null }, // small WebP for the search grid
    // Hidden instead of deleted: drafts and generations may still use it.
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("GodImage", godImageSchema);
