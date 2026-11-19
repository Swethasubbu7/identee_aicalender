const express = require("express");
const {
  listFormats,
  confirmCakeSize,
} = require("../controllers/calendarFormat.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { requirePermission } = require("../core/authenticate");
const { P } = require("../core/roles");

const router = express.Router();

router.get("/", verifyToken, listFormats);
router.put("/:id/cake", verifyToken, requirePermission(P.CAL_SETTINGS_MANAGE), confirmCakeSize);

module.exports = router;
