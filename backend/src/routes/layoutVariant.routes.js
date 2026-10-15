const express = require("express");
const {
  listVariants,
  getVariant,
  updateVariant,
  validateVariant,
  activateVariant,
  archiveVariant,
} = require("../controllers/layoutVariant.controller");
const {
  importProductionPdf,
  uploadLaserPdf,
  getCorrection,
  applyGeometryCorrection,
  undoGeometryCorrection,
  uploadArtwork,
  upscaleArtwork,
  removeArtwork,
  getEnhancePlan,
  enhanceArtwork,
  approveArtworkCandidate,
  discardArtworkCandidate,
  getImportedObjects,
  saveMapping,
  uploadVariantAssets,
  deactivateVariant,
  deleteVariant,
  reextractVariant,
} = require("../controllers/productionLayout.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");

const router = express.Router();
const signedIn = [verifyToken];

// Wrap multer so upload errors return clean JSON (same pattern as layouts).
const withUpload = (middleware) => (req, res, next) =>
  middleware(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File is too large." });
    }
    if (err.code === "INVALID_FILE_TYPE") {
      return res.status(400).json({ message: err.message });
    }
    console.error("Production upload error:", err);
    return res.status(400).json({ message: "File upload failed." });
  });

const pdfUpload = withUpload(
  upload.productionUpload.fields([
    { name: "productionPdf", maxCount: 1 },
    { name: "laserPdf", maxCount: 1 },
  ]),
);
const laserUpload = withUpload(upload.productionUpload.single("laserPdf"));
const artworkUpload = withUpload(upload.productionUpload.single("artwork"));
const assetUpload = withUpload(
  upload.productionUpload.fields([
    { name: "frame", maxCount: 1 },
    { name: "preview", maxCount: 1 },
    { name: "plate", maxCount: 1 },
    { name: "overlay", maxCount: 1 },
    { name: "plateBare", maxCount: 1 },
    { name: "plateGod", maxCount: 1 },
    { name: "plateGodBare", maxCount: 1 },
    { name: "overlayBare", maxCount: 1 },
    { name: "original", maxCount: 1 },
  ]),
);

// Designers see ACTIVE variants only (enforced in the controller).
router.get("/", verifyToken, listVariants);

// Production layout workflow (Layouts page → Add Production Layout).
router.post("/import", ...signedIn, pdfUpload, importProductionPdf);
router.post("/:id/laser", ...signedIn, laserUpload, uploadLaserPdf);
router.get("/:id/correction", ...signedIn, getCorrection);
router.post("/:id/correction", ...signedIn, applyGeometryCorrection);
router.delete("/:id/correction", ...signedIn, undoGeometryCorrection);
router.post("/:id/artwork", ...signedIn, artworkUpload, uploadArtwork);
router.post("/:id/artwork/upscale", ...signedIn, upscaleArtwork);
router.delete("/:id/artwork", ...signedIn, removeArtwork);
router.get("/:id/artwork/enhance", ...signedIn, getEnhancePlan);
router.post("/:id/artwork/enhance", ...signedIn, enhanceArtwork);
router.post("/:id/artwork/candidate/approve", ...signedIn, approveArtworkCandidate);
router.delete("/:id/artwork/candidate", ...signedIn, discardArtworkCandidate);
router.get("/:id/objects", ...signedIn, getImportedObjects);
router.put("/:id/mapping", ...signedIn, saveMapping);
router.post("/:id/assets", ...signedIn, assetUpload, uploadVariantAssets);
router.post("/:id/deactivate", ...signedIn, deactivateVariant);
router.post("/:id/reextract", ...signedIn, reextractVariant);

router.get("/:id", verifyToken, getVariant);
router.put("/:id", ...signedIn, updateVariant);
router.post("/:id/validate", ...signedIn, validateVariant);
router.post("/:id/activate", ...signedIn, activateVariant);
router.post("/:id/archive", ...signedIn, archiveVariant);
router.delete("/:id", ...signedIn, deleteVariant); // approved layouts need ?confirm=<code>

module.exports = router;
