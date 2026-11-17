const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const config = require("../config");
const User = require("../models/User");

// Staff self-registration is closed unless ALLOW_STAFF_SIGNUP=true (security
// audit 2026-11-17: a public sign-up gave full staff access, paid AI
// included). Staff accounts are created by an administrator.
const SIGNUP_CLOSED = {
  message: "Staff accounts are created by an administrator. Please ask your Nauticrew administrator for access.",
};

// Temporary OTP storage (the password is kept only as a hash; the code is
// kept only as a hash; at most MAX_OTP_ATTEMPTS tries).
const otpStore = new Map();
const MAX_OTP_ATTEMPTS = 5;
const hashOtp = (otp) => crypto.createHash("sha256").update(String(otp)).digest();
const text = (v) => (typeof v === "string" ? v : "");

// Gmail transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// ===============================
// REGISTER - Generate & Send OTP
// ===============================
const register = async (req, res) => {
  try {
    if (!config.ALLOW_STAFF_SIGNUP) return res.status(403).json(SIGNUP_CLOSED);
    const name = text(req.body?.name).trim();
    const email = text(req.body?.email);
    const password = text(req.body?.password);

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check existing user
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email already registered",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "The password must have at least 8 characters" });
    }

    // Generate 6-digit OTP (cryptographically random)
    const otp = crypto.randomInt(100000, 1000000).toString();

    // Store registration temporarily: hashes only
    otpStore.set(normalizedEmail, {
      name,
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12),
      otpHash: hashOtp(otp),
      attempts: 0,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    // Send OTP email
    await transporter.sendMail({
      from: `"NAUTICREW" <${process.env.EMAIL_USER}>`,
      to: normalizedEmail,
      subject: "NAUTICREW - Email Verification OTP",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #b08d35;">NAUTICREW</h2>

          <p>Hello ${name},</p>

          <p>
            Your verification OTP for the AI Calendar Designer is:
          </p>

          <div style="
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
            margin: 20px 0;
            color: #b08d35;
          ">
            ${otp}
          </div>

          <p>This OTP is valid for <strong>5 minutes</strong>.</p>

          <p>
            If you did not request this, please ignore this email.
          </p>

          <p>Regards,<br>Nauticrew Team</p>
        </div>
      `,
    });

    // Development log
    console.log("================================");
    console.log("OTP sent to:", normalizedEmail);
    console.log("================================");

    res.status(200).json({
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("Registration error:", error);

    res.status(500).json({
      message: "Failed to send OTP",
    });
  }
};

// ===============================
// VERIFY OTP - Create STAFF Account
// ===============================
const verifyOtp = async (req, res) => {
  try {
    if (!config.ALLOW_STAFF_SIGNUP) return res.status(403).json(SIGNUP_CLOSED);
    const email = text(req.body?.email);
    const otp = typeof req.body?.otp === "number" ? String(req.body.otp) : text(req.body?.otp);

    if (!email || !otp) {
      return res.status(400).json({
        message: "Email and OTP are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const registration = otpStore.get(normalizedEmail);

    if (!registration) {
      return res.status(400).json({
        message: "OTP not found or expired",
      });
    }

    // Check expiry
    if (Date.now() > registration.expiresAt) {
      otpStore.delete(normalizedEmail);

      return res.status(400).json({
        message: "OTP has expired",
      });
    }

    // Check OTP (constant time; limited attempts)
    registration.attempts += 1;
    if (registration.attempts > MAX_OTP_ATTEMPTS) {
      otpStore.delete(normalizedEmail);
      return res.status(429).json({ message: "Too many attempts. Please register again." });
    }
    if (!crypto.timingSafeEqual(registration.otpHash, hashOtp(otp.trim()))) {
      return res.status(400).json({
        message: "Invalid OTP",
      });
    }

    const hashedPassword = registration.passwordHash;

    // Create STAFF account
    const user = await User.create({
      name: registration.name,
      email: registration.email,
      password: hashedPassword,
      role: "STAFF",
    });

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      },
    );

    // Delete OTP data
    otpStore.delete(normalizedEmail);

    res.status(201).json({
      message: "Staff account created successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("OTP verification error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

module.exports = {
  register,
  verifyOtp,
};
