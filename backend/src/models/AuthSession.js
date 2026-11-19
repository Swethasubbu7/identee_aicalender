const mongoose = require("mongoose");

// One signed-in device/browser for one audience. The refresh token itself is
// never stored, only its SHA-256 hash. Each refresh rotates the token; a
// rotated (old) token used again revokes the whole family (token theft).
const authSessionSchema = new mongoose.Schema(
  {
    subjectType: { type: String, enum: ["staff", "customer"], required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, required: true },
    audience: {
      type: String,
      enum: ["shop-customer", "shop-staff", "calendar-customer", "calendar-staff"],
      required: true,
    },
    refreshTokenHash: { type: String, required: true },
    // Hashes of tokens already rotated out (reuse detection), newest last.
    previousHashes: { type: [String], default: [] },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 300 },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
  },
  { timestamps: true },
);
authSessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
authSessionSchema.index({ previousHashes: 1 });
authSessionSchema.index({ subjectId: 1, audience: 1 });
// MongoDB removes a session a day after it expired.
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.model("AuthSession", authSessionSchema);
