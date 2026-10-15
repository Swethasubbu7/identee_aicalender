const express = require("express");
const {
  createJob,
  listJobs,
  savePreview,
  saveAsLayout,
  createAdminTestImage,
  getLayoutPlan,
  getJob,
  regenerateVariation,
  printCheck,
  prepareExport,
  sourcePdf,
  exportPdf,
  downloadPdf,
} = require("../controllers/aiCalendar.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");

const router = express.Router();

const artworkUpload = (req, res, next) =>
  upload.aiExportUpload.single("artwork")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ message: "Artwork is too large." });
    if (err.code === "INVALID_FILE_TYPE") return res.status(400).json({ message: err.message });
    console.error("Artwork upload error:", err);
    return res.status(400).json({ message: "Artwork upload failed." });
  });

const previewUpload = (req, res, next) =>
  upload.aiExportUpload.single("preview")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "INVALID_FILE_TYPE") return res.status(400).json({ message: err.message });
    return res.status(400).json({ message: "Preview upload failed." });
  });

// All AI work happens on the server; the browser never sees the API key.
router.post("/", verifyToken, createJob);
// Admin-only one-image AI test (exactly one paid request, same safeguards).
router.post("/test-image", verifyToken, createAdminTestImage);
router.get("/", verifyToken, listJobs);
router.get("/plan", verifyToken, getLayoutPlan);
router.get("/:id", verifyToken, getJob);
router.post("/:id/variations/:index/regenerate", verifyToken, regenerateVariation);
router.post("/:id/variations/:index/print-check", verifyToken, printCheck);
router.post("/:id/variations/:index/prepare-export", verifyToken, prepareExport);
router.get("/:id/variations/:index/source.pdf", verifyToken, sourcePdf);
router.post("/:id/variations/:index/export", verifyToken, artworkUpload, exportPdf);
router.get("/:id/variations/:index/download/:kind", verifyToken, downloadPdf);
router.put("/:id/variations/:index/preview", verifyToken, previewUpload, savePreview);
router.post("/:id/variations/:index/save-layout", verifyToken, saveAsLayout);

module.exports = router;
