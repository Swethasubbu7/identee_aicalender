const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const User = require("../models/User");

// Temporary OTP storage
const otpStore = new Map();

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
    const { name, email, password } = req.body;

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

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store registration temporarily
    otpStore.set(normalizedEmail, {
      name,
      email: normalizedEmail,
      password,
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    // Send OTP email
    await transporter.sendMail({
      from: `"IDENTEE" <${process.env.EMAIL_USER}>`,
      to: normalizedEmail,
      subject: "IDENTEE - Email Verification OTP",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #b08d35;">IDENTEE</h2>

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

          <p>Regards,<br>IDENTEE Team</p>
        </div>
      `,
    });

    // Development log
    console.log("================================");
    console.log("OTP sent to:", normalizedEmail);
    console.log("OTP:", otp);
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
    const { email, otp } = req.body;

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

    // Check OTP
    if (registration.otp !== otp.toString()) {
      return res.status(400).json({
        message: "Invalid OTP",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registration.password, 10);

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
