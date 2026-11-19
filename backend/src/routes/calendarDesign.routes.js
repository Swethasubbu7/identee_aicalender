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
  bulkDeleteDesigns,
  processGodImage,
} = require("../controllers/calendarDesign.controller");
const { verifyToken: signedIn } = require("../middleware/auth.middleware");
const { requirePermission } = require("../core/authenticate");
const { P } = require("../core/roles");

// Drafts / Customise: designers, managers and admins.
const verifyToken = [signedIn, requirePermission(P.CAL_DESIGN)];
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
// Free God-image tools (background removal / enhancement), result previewed first.
router.post("/god-image/process", verifyToken, processGodImage);
router.post("/", verifyToken, createDraft);
// Selected drafts only; generated designs are kept.
router.post("/bulk-delete", verifyToken, bulkDeleteDesigns);
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
