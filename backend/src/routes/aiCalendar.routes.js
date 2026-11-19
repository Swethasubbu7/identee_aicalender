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
  setNameStyle,
  setAreaEdit,
} = require("../controllers/aiCalendar.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { requirePermission, requirePermissionWhen } = require("../core/authenticate");
const { P } = require("../core/roles");
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
// Normal Mode is free; AI Mode is paid (still behind the spend guard).
router.post("/", verifyToken, requirePermission(P.CAL_DESIGN), requirePermissionWhen((req) => req.body?.mode === "ai", P.CAL_AI_GENERATE), createJob);
// Admin-only one-image AI test (exactly one paid request, same safeguards).
router.post("/test-image", verifyToken, requirePermission(P.CAL_AI_GENERATE, P.CAL_SETTINGS_MANAGE), createAdminTestImage);
router.get("/", verifyToken, listJobs);
router.get("/plan", verifyToken, getLayoutPlan);
router.get("/:id", verifyToken, getJob);
router.post("/:id/variations/:index/regenerate", verifyToken, requirePermission(P.CAL_DESIGN, P.CAL_AI_GENERATE), regenerateVariation);
router.post("/:id/variations/:index/print-check", verifyToken, requirePermission(P.CAL_PRODUCTION_FILES), printCheck);
router.post("/:id/variations/:index/prepare-export", verifyToken, requirePermission(P.CAL_PRODUCTION_FILES), prepareExport);
router.get("/:id/variations/:index/source.pdf", verifyToken, requirePermission(P.CAL_PRODUCTION_FILES), sourcePdf);
router.post("/:id/variations/:index/export", verifyToken, requirePermission(P.CAL_PRODUCTION_FILES), artworkUpload, exportPdf);
router.get("/:id/variations/:index/download/:kind", verifyToken, requirePermission(P.CAL_PRODUCTION_FILES), downloadPdf);
router.put("/:id/variations/:index/preview", verifyToken, requirePermission(P.CAL_DESIGN), previewUpload, savePreview);
router.put("/:id/variations/:index/name-style", verifyToken, requirePermission(P.CAL_DESIGN), setNameStyle);
router.put("/:id/variations/:index/edits", verifyToken, requirePermission(P.CAL_DESIGN), setAreaEdit);
router.post("/:id/variations/:index/save-layout", verifyToken, requirePermission(P.CAL_DESIGN), saveAsLayout);

module.exports = router;
