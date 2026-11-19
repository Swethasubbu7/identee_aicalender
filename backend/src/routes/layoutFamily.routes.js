const express = require("express");
const {
  listFamilies,
  createFamily,
  updateFamily,
} = require("../controllers/layoutFamily.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { requirePermission } = require("../core/authenticate");
const { P } = require("../core/roles");

const router = express.Router();

router.get("/", verifyToken, listFamilies);
router.post("/", verifyToken, requirePermission(P.CAL_LAYOUTS_MANAGE), createFamily);
router.put("/:id", verifyToken, requirePermission(P.CAL_LAYOUTS_MANAGE), updateFamily);

module.exports = router;
