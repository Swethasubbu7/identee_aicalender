const express = require("express");
const {
  listFormats,
  confirmCakeSize,
} = require("../controllers/calendarFormat.controller");
const { verifyToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", verifyToken, listFormats);
router.put("/:id/cake", verifyToken, confirmCakeSize);

module.exports = router;
