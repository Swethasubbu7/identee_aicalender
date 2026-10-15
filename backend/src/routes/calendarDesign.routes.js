const express = require("express");
const {
  uploadContentImage,
  createDraft,
  listMyDesigns,
  getDesign,
  updateDesign,
  autosaveDesign,
  uploadThumbnail,
  deleteDesign,
} = require("../controllers/calendarDesign.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");

const router = express.Router();

// Designer content image (god image / product photo) for production layouts.
const contentImage = (req, res, next) =>
  upload.designContentUpload.single("image")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File is too large. Maximum size is 25MB." });
    }
    if (err.code === "INVALID_FILE_TYPE") return res.status(400).json({ message: err.message });
    console.error("Design content upload error:", err);
    return res.status(400).json({ message: "Image upload failed." });
  });

router.post("/uploads", verifyToken, contentImage, uploadContentImage);
router.post("/", verifyToken, createDraft);
router.get("/", verifyToken, listMyDesigns);
router.get("/:id", verifyToken, getDesign);
router.put("/:id", verifyToken, updateDesign);
router.post("/:id/autosave", verifyToken, autosaveDesign);

// Small picture of the design for the project cards.
const thumbnailImage = (req, res, next) =>
  upload.designContentUpload.single("thumbnail")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "INVALID_FILE_TYPE") return res.status(400).json({ message: err.message });
    console.error("Thumbnail upload error:", err);
    return res.status(400).json({ message: "Thumbnail upload failed." });
  });
router.put("/:id/thumbnail", verifyToken, thumbnailImage, uploadThumbnail);
router.delete("/:id", verifyToken, deleteDesign);

module.exports = router;
