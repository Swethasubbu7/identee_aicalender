const express = require("express");
const { login } = require("../controllers/auth.controller");
const { loginLimits } = require("../middleware/security");

const router = express.Router();

router.post("/login", ...loginLimits, login);

module.exports = router;

