const Layout = require("../models/Layout");

const ALLOWED_TYPES = ["normal", "special-cut"];

// ===============================
// GET ALL LAYOUTS (with filters)
// ===============================
const getLayouts = async (req, res) => {
  try {
    const { type, size, search } = req.query;

    // Only show active layouts on the public listing endpoint
    const filter = { isActive: true };

    if (type) {
      filter.type = type;
    }

    if (size) {
      filter.size = size;
    }

    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const layouts = await Layout.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      message: "Layouts fetched successfully",
      count: layouts.length,
      layouts,
    });
  } catch (error) {
    console.error("Get layouts error:", error);

    res.status(500).json({
      message: "Failed to fetch layouts",
    });
  }
};

// ===============================
// GET SINGLE LAYOUT BY ID
// ===============================
const getLayoutById = async (req, res) => {
  try {
    const { id } = req.params;

    const layout = await Layout.findById(id);

    if (!layout) {
      return res.status(404).json({
        message: "Layout not found",
      });
    }

    res.status(200).json({
      message: "Layout fetched successfully",
      layout,
    });
  } catch (error) {
    console.error("Get layout by id error:", error);

    // Handles invalid ObjectId format as well
    res.status(400).json({
      message: "Invalid layout ID",
    });
  }
};

// ===============================
// CREATE LAYOUT
// ===============================
const createLayout = async (req, res) => {
  try {
    const {
      name,
      type,
      size,
      description,
      previewImage,
      layoutFile,
      isActive,
    } = req.body;

    if (!name || !type || !size) {
      return res.status(400).json({
        message: "Name, type and size are required",
      });
    }

    if (!ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({
        message: `Type must be one of: ${ALLOWED_TYPES.join(", ")}`,
      });
    }

    const layout = await Layout.create({
      name,
      type,
      size,
      description,
      previewImage,
      layoutFile,
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json({
      message: "Layout created successfully",
      layout,
    });
  } catch (error) {
    console.error("Create layout error:", error);

    res.status(500).json({
      message: "Failed to create layout",
    });
  }
};

// ===============================
// UPDATE LAYOUT
// ===============================
const updateLayout = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      type,
      size,
      description,
      previewImage,
      layoutFile,
      isActive,
    } = req.body;

    if (type && !ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({
        message: `Type must be one of: ${ALLOWED_TYPES.join(", ")}`,
      });
    }

    const layout = await Layout.findById(id);

    if (!layout) {
      return res.status(404).json({
        message: "Layout not found",
      });
    }

    if (name !== undefined) layout.name = name;
    if (type !== undefined) layout.type = type;
    if (size !== undefined) layout.size = size;
    if (description !== undefined) layout.description = description;
    if (previewImage !== undefined) layout.previewImage = previewImage;
    if (layoutFile !== undefined) layout.layoutFile = layoutFile;
    if (isActive !== undefined) layout.isActive = isActive;

    await layout.save();

    res.status(200).json({
      message: "Layout updated successfully",
      layout,
    });
  } catch (error) {
    console.error("Update layout error:", error);

    res.status(400).json({
      message: "Failed to update layout",
    });
  }
};

// ===============================
// SOFT DELETE (DEACTIVATE) LAYOUT
// ===============================
const deleteLayout = async (req, res) => {
  try {
    const { id } = req.params;

    const layout = await Layout.findById(id);

    if (!layout) {
      return res.status(404).json({
        message: "Layout not found",
      });
    }

    layout.isActive = false;
    await layout.save();

    res.status(200).json({
      message: "Layout deactivated successfully",
      layout,
    });
  } catch (error) {
    console.error("Delete layout error:", error);

    res.status(400).json({
      message: "Failed to deactivate layout",
    });
  }
};

module.exports = {
  getLayouts,
  getLayoutById,
  createLayout,
  updateLayout,
  deleteLayout,
};
