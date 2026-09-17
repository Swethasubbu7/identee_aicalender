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

// Public — browsing layouts
router.get("/", getLayouts);
router.get("/:id", getLayoutById);

// Protected — designer/staff management
router.post("/", verifyToken, layoutFiles, createLayout);
router.put("/:id", verifyToken, layoutFiles, updateLayout);
router.delete("/:id", verifyToken, deleteLayout);

module.exports = router;
