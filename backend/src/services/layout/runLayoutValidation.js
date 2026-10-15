const CalendarFormat = require("../../models/CalendarFormat");
const ProductionProfile = require("../../models/ProductionProfile");
const { validateLayoutVariant } = require("./layoutValidator");
const { GEOMETRY_MATCH_TOLERANCE_MM } = require("../../config");

// Explicit profile on the variant wins; otherwise the default profile that
// covers this cut type (an empty cutTypes list covers all).
const resolveProfile = async (variant) => {
  if (variant.productionProfileId) {
    return ProductionProfile.findById(variant.productionProfileId).lean();
  }
  return ProductionProfile.findOne({
    isDefault: true,
    $or: [{ cutTypes: { $size: 0 } }, { cutTypes: variant.cutType }],
  }).lean();
};

const runLayoutValidation = async (variant) => {
  const plain = variant.toObject ? variant.toObject() : variant;
  const [format, profile] = await Promise.all([
    CalendarFormat.findById(plain.formatId).lean(),
    resolveProfile(plain),
  ]);
  return validateLayoutVariant(plain, {
    format,
    profile,
    toleranceMm: GEOMETRY_MATCH_TOLERANCE_MM,
  });
};

module.exports = { runLayoutValidation, resolveProfile };
