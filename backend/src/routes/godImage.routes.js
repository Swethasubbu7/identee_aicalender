const express = require("express");
const { searchGodImages, addGodImage, updateGodImage } = require("../controllers/godImage.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { requirePermission } = require("../core/authenticate");
const { P } = require("../core/roles");
const upload = require("../middleware/upload.middleware");

const router = express.Router();

const libraryImage = (req, res, next) =>
  upload.designContentUpload.single("image")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File is too large. Maximum size is 25MB." });
    }
    if (err.code === "INVALID_FILE_TYPE") return res.status(400).json({ message: err.message });
    console.error("God library upload error:", err);
    return res.status(400).json({ message: "Image upload failed." });
  });

router.get("/", verifyToken, requirePermission(P.CAL_DESIGN), searchGodImages);
router.post("/", verifyToken, requirePermission(P.CAL_GOD_LIBRARY_MANAGE), libraryImage, addGodImage);
router.put("/:id", verifyToken, requirePermission(P.CAL_GOD_LIBRARY_MANAGE), updateGodImage);

module.exports = router;
