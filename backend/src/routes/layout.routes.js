const express = require("express");

const {
  getLayouts,
  getLayoutById,
  createLayout,
  updateLayout,
  deleteLayout,
} = require("../controllers/layout.controller");

const { verifyToken } = require("../middleware/auth.middleware");
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
router.get("/", getLayouts);
router.get("/:id", getLayoutById);

// Protected — designer/staff management
router.post("/", verifyToken, handleUpload, createLayout);
router.put("/:id", verifyToken, handleUpload, updateLayout);
router.delete("/:id", verifyToken, deleteLayout);

module.exports = router;
