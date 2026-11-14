const express = require("express");
const { serveFile } = require("../controllers/files.controller");

const router = express.Router();

// Auth is checked inside serveFile (login token or signed link).
router.get("/*key", serveFile);

module.exports = router;
