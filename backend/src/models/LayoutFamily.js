const mongoose = require("mongoose");
const { CUT_TYPES, FAMILY_STATUSES } = require("../constants/calendar");

// One design concept, identified by the business's own catalogue code
// (e.g. "NCN/01", "SPLN/DC/02"). Each size it is produced in is a
// LayoutVariant.
const layoutFamilySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    cutType: { type: String, enum: CUT_TYPES, required: true },
    category: { type: String, trim: true, default: "" },
    tags: { type: [String], default: [] },
    // ACTIVE = mapped from production files; CANDIDATE = waiting for a
    // production file; LEGACY = kept as a visual reference only.
    status: { type: String, enum: FAMILY_STATUSES, default: "CANDIDATE" },
    notes: { type: String, default: "" },
    sourceFiles: { type: [String], default: [] }, // relative upload paths
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("LayoutFamily", layoutFamilySchema);
