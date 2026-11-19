const express = require("express");
const {
  listProfiles,
  createProfile,
  updateProfile,
} = require("../controllers/productionProfile.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { requirePermission } = require("../core/authenticate");
const { P } = require("../core/roles");

const router = express.Router();

router.get("/", verifyToken, listProfiles);
router.post("/", verifyToken, requirePermission(P.CAL_SETTINGS_MANAGE), createProfile);
router.put("/:id", verifyToken, requirePermission(P.CAL_SETTINGS_MANAGE), updateProfile);

module.exports = router;
