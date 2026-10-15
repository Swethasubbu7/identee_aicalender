const express = require("express");
const {
  listProfiles,
  createProfile,
  updateProfile,
} = require("../controllers/productionProfile.controller");
const { verifyToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", verifyToken, listProfiles);
router.post("/", verifyToken, createProfile);
router.put("/:id", verifyToken, updateProfile);

module.exports = router;
