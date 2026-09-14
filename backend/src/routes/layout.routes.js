const express = require("express");

const {
  getLayouts,
  getLayoutById,
  createLayout,
  updateLayout,
  deleteLayout,
} = require("../controllers/layout.controller");

const router = express.Router();

// Get all active layouts (supports ?type= ?size= ?search=)
router.get("/", getLayouts);

// Get single layout by ID
router.get("/:id", getLayoutById);

// Create a new layout
router.post("/", createLayout);

// Update an existing layout
router.put("/:id", updateLayout);

// Soft-delete (deactivate) a layout
router.delete("/:id", deleteLayout);

module.exports = router;
