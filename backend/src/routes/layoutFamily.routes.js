const express = require("express");
const {
  listFamilies,
  createFamily,
  updateFamily,
} = require("../controllers/layoutFamily.controller");
const { verifyToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", verifyToken, listFamilies);
router.post("/", verifyToken, createFamily);
router.put("/:id", verifyToken, updateFamily);

module.exports = router;
