const express = require("express");

const {
  getLayouts,
  getLayoutById,
  createLayout,
  updateLayout,
  deleteLayout,
  downloadLayoutFile,
} = require("../controllers/layout.controller");

const { verifyToken } = require("../middleware/auth.middleware");
const { requirePermission } = require("../core/authenticate");
const { P } = require("../core/roles");
const upload = require("../middleware/upload.middleware");

const router = express.Router();

const layoutFiles = upload.fields([
  { name: "previewImage", maxCount: 1 },
  { name: "layoutFile", maxCount: 1 },
]);

// Wrap multer so its errors return clean JSON instead of crashing/hanging
const handleUpload = (req, res, next) => {
  layoutFiles(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: "File is too large. Maximum size is 25MB.",
        });
      }
      console.error("Upload middleware error:", err);
      return res.status(400).json({ message: "File upload failed." });
    }
    next();
  });
};

// Public — browsing layouts
// Legacy preview layouts: calendar staff only (were public before Phase 2).
router.get("/", verifyToken, getLayouts);
router.get("/:id/download", verifyToken, requirePermission(P.CAL_PRODUCTION_FILES), downloadLayoutFile);
router.get("/:id", verifyToken, getLayoutById);

// Protected — any signed-in designer
const signedIn = [verifyToken, requirePermission(P.CAL_LAYOUTS_MANAGE)];
router.post("/", ...signedIn, handleUpload, createLayout);
router.put("/:id", ...signedIn, handleUpload, updateLayout);
router.delete("/:id", ...signedIn, deleteLayout);

module.exports = router;
