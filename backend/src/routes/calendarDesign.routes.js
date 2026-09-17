const express = require("express");
const {
  createDraft,
  getDesign,
  updateDesign,
  autosaveDesign,
} = require("../controllers/calendarDesign.controller");
const { verifyToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/", verifyToken, createDraft);
router.get("/:id", verifyToken, getDesign);
router.put("/:id", verifyToken, updateDesign);
router.post("/:id/autosave", verifyToken, autosaveDesign);

module.exports = router;
