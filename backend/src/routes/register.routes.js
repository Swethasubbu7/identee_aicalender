const express = require("express");

const { register, verifyOtp } = require("../controllers/register.controller");

const router = express.Router();

// Register
router.post("/register", register);

// Verify OTP
router.post("/verify-otp", verifyOtp);

module.exports = router;
