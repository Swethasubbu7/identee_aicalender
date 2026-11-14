const express = require("express");
const { verifyToken } = require("../middleware/auth.middleware");
const { tamilSuggestions } = require("../services/transliterate");

const router = express.Router();

// GET /api/transliterate/tamil?word=kilatch → { suggestions: ["கிளட்ச்", …] }
router.get("/tamil", verifyToken, async (req, res) => {
  try {
    res.status(200).json({ suggestions: await tamilSuggestions(String(req.query.word || "")) });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.status ? error.message : "Tamil conversion failed" });
  }
});

module.exports = router;
