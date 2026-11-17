const express = require("express");

const { register, verifyOtp } = require("../controllers/register.controller");
const { signupLimits } = require("../middleware/security");

const router = express.Router();

// Register
router.post("/register", ...signupLimits, register);

// Verify OTP
router.post("/verify-otp", ...signupLimits, verifyOtp);

module.exports = router;
