const express = require("express");

const { generateDesigns } = require("../controllers/aiGeneration.controller");
const { verifyToken } = require("../middleware/auth.middleware");

const router = express.Router();

// Retired endpoint: always refuses, accepts no uploads, calls no provider.
router.post("/", verifyToken, generateDesigns);

module.exports = router;
