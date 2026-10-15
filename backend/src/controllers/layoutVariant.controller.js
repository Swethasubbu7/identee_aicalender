const LayoutVariant = require("../models/LayoutVariant");
const { canUseLayout, hasFullAccess } = require("../services/layout/layoutAccess");
const LayoutFamily = require("../models/LayoutFamily");
const { runLayoutValidation } = require("../services/layout/runLayoutValidation");
const { toPublicUrl } = require("../lib/assetUrl");


// Absolute asset URLs; internal import data is only shown to admins.
const withPublicUrls = (variant, req) => {
  const obj = variant.toObject ? variant.toObject() : variant;
  const assets = {
    ...obj.assets,
    preview: toPublicUrl(obj.assets?.preview),
    frame: toPublicUrl(obj.assets?.frame),
    plate: toPublicUrl(obj.assets?.plate),
    overlay: toPublicUrl(obj.assets?.overlay),
    plateBare: toPublicUrl(obj.assets?.plateBare),
    plateGod: toPublicUrl(obj.assets?.plateGod),
    plateGodBare: toPublicUrl(obj.assets?.plateGodBare),
    overlayBare: toPublicUrl(obj.assets?.overlayBare),
    original: toPublicUrl(obj.assets?.original),
    artworkOverride: obj.assets?.artworkOverride
      ? { ...obj.assets.artworkOverride, url: toPublicUrl(obj.assets.artworkOverride.path) }
      : null,
    artworkCandidate: obj.assets?.artworkCandidate
      ? { ...obj.assets.artworkCandidate, url: toPublicUrl(obj.assets.artworkCandidate.path) }
      : null,
    artworkSource: toPublicUrl(obj.assets?.artworkSource),
    productionFile: toPublicUrl(obj.assets?.productionFile),
  };
  delete assets.importDataFile;
  // Reusable layout saved from a chosen design: its pictures as URLs.
  const design = obj.design
    ? {
        ...obj.design,
        artworkUrl: toPublicUrl(obj.design.artwork),
        godImageUrl: toPublicUrl(obj.design.godImage),
      }
    : null;
  if (hasFullAccess(req)) return { ...obj, assets, design };
  const { mapping, importSummary, ...rest } = obj;
  delete assets.productionFile;
  return { ...rest, assets, design };
};

// GET /api/layout-variants?cutType=&sizeCode=&status=
// Designers see ACTIVE variants and the reusable layouts they saved.
const listVariants = async (req, res) => {
  try {
    const { cutType, sizeCode, status, familyId } = req.query;
    const filter = {
      ...(cutType && { cutType }),
      ...(sizeCode && { sizeCode }),
      ...(familyId && { familyId }),
      ...(hasFullAccess(req)
        ? { status: status || { $ne: "ARCHIVED" } }
        : {
            $or: [
              { status: "ACTIVE" },
              { design: { $ne: null }, createdBy: req.user.userId, status: { $ne: "ARCHIVED" } },
            ],
          }),
    };
    const variants = await LayoutVariant.find(filter)
      .populate("familyId", "code name status")
      .sort({ updatedAt: -1 });
    res.status(200).json({
      message: "Layout variants fetched",
      variants: variants.map((v) => withPublicUrls(v, req)),
    });
  } catch (error) {
    console.error("List variants error:", error);
    res.status(500).json({ message: "Failed to fetch layout variants" });
  }
};

const getVariant = async (req, res) => {
  try {
    const variant = await LayoutVariant.findById(req.params.id).populate(
      "familyId",
      "code name status",
    );
    if (!variant || (!hasFullAccess(req) && !canUseLayout(req, variant))) {
      return res.status(404).json({ message: "Layout variant not found" });
    }
    res
      .status(200)
      .json({ message: "Layout variant fetched", variant: withPublicUrls(variant, req) });
  } catch (error) {
    console.error("Get variant error:", error);
    res.status(400).json({ message: "Invalid layout variant ID" });
  }
};

// PUT /api/layout-variants/:id
// Only non-geometry settings. Geometry comes exclusively from an imported
// production PDF (import + mapping endpoints) — never typed in.
const updateVariant = async (req, res) => {
  try {
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });
    if (req.body.productionProfileId !== undefined) {
      variant.productionProfileId = req.body.productionProfileId || null;
    }
    await variant.save();
    res
      .status(200)
      .json({ message: "Layout variant updated", variant: withPublicUrls(variant, req) });
  } catch (error) {
    console.error("Update variant error:", error);
    res.status(400).json({ message: error.message || "Failed to update layout variant" });
  }
};

// POST /api/layout-variants/:id/validate
const validateVariant = async (req, res) => {
  try {
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });

    const result = await runLayoutValidation(variant);
    variant.validation = {
      status: result.status,
      checkedAt: new Date(),
      results: result.results,
    };
    if (variant.status === "DRAFT" && result.status === "PASS") {
      variant.status = "VALIDATED";
    }
    if (result.status === "FAIL" && variant.status !== "ARCHIVED") {
      variant.status = "DRAFT";
    }
    await variant.save();
    res.status(200).json({
      message: "Validation complete",
      status: result.status,
      productionStatus: result.productionStatus,
      results: result.results,
      variantStatus: variant.status,
    });
  } catch (error) {
    console.error("Validate variant error:", error);
    res.status(500).json({ message: "Failed to validate layout variant" });
  }
};

// POST /api/layout-variants/:id/activate
// Re-validates first; only a structurally valid variant becomes ACTIVE.
const activateVariant = async (req, res) => {
  try {
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });

    const result = await runLayoutValidation(variant);
    variant.validation = {
      status: result.status,
      checkedAt: new Date(),
      results: result.results,
    };
    if (result.status !== "PASS") {
      variant.status = "DRAFT";
      await variant.save();
      return res.status(400).json({
        message: "Layout variant failed validation",
        results: result.results,
      });
    }
    variant.status = "ACTIVE";
    variant.approvedBy = req.user.userId;
    variant.approvedAt = new Date();
    await variant.save();
    await LayoutFamily.updateOne(
      { _id: variant.familyId, status: "CANDIDATE" },
      { status: "ACTIVE" },
    );
    res.status(200).json({
      message: "Layout variant activated",
      productionStatus: result.productionStatus,
      variant: withPublicUrls(variant, req),
    });
  } catch (error) {
    console.error("Activate variant error:", error);
    res.status(500).json({ message: "Failed to activate layout variant" });
  }
};

// POST /api/layout-variants/:id/archive
const archiveVariant = async (req, res) => {
  try {
    const variant = await LayoutVariant.findByIdAndUpdate(
      req.params.id,
      { status: "ARCHIVED" },
      { returnDocument: "after" },
    );
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });
    res.status(200).json({ message: "Layout variant archived", variant: withPublicUrls(variant, req) });
  } catch (error) {
    console.error("Archive variant error:", error);
    res.status(400).json({ message: "Failed to archive layout variant" });
  }
};

module.exports = {
  listVariants,
  getVariant,
  updateVariant,
  validateVariant,
  activateVariant,
  archiveVariant,
  withPublicUrls,
};
