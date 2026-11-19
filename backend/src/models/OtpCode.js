const mongoose = require("mongoose");

// One-time codes for e-mail verification and password reset. Only a hash of
// the code is stored; it is single-use, expires quickly and allows a few
// attempts. Codes are never written to logs.
const otpCodeSchema = new mongoose.Schema(
  {
    purpose: { type: String, enum: ["verify-email", "reset-password"], required: true },
    audience: {
      type: String,
      enum: ["shop-customer", "shop-staff", "calendar-customer", "calendar-staff"],
      required: true,
    },
    subjectType: { type: String, enum: ["staff", "customer"], required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
otpCodeSchema.index({ subjectId: 1, purpose: 1, audience: 1 });
otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OtpCode", otpCodeSchema);
