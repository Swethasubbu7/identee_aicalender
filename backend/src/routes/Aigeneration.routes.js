const express = require("express");

const { generateDesigns } = require("../controllers/aiGeneration.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");

const router = express.Router();

const customerImageUpload = upload.aiImageUpload.single("customerImage");

// Wrap multer the same way layout.routes.js does, so upload errors return
// clean JSON instead of crashing/hanging.
const handleUpload = (req, res, next) => {
  customerImageUpload(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: "File is too large. Maximum size is 25MB.",
        });
      }
      console.error("AI upload middleware error:", err);
      return res.status(400).json({ message: "Image upload failed." });
    }
    next();
  });
};

router.post("/", verifyToken, handleUpload, generateDesigns);

module.exports = router;
