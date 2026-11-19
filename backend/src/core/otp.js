// One-time codes (e-mail verification, password reset). 6 digits, hashed,
// single-use, 15-minute expiry, at most 5 attempts. Issuing a new code
// cancels the previous unused one.
const crypto = require("crypto");
const OtpCode = require("../models/OtpCode");

const OTP_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const hash = (code) => crypto.createHash("sha256").update(String(code)).digest("hex");

const issueOtp = async ({ purpose, audience, subjectType, subjectId }) => {
  await OtpCode.updateMany({ subjectId, purpose, audience, usedAt: null }, { $set: { usedAt: new Date() } });
  const code = crypto.randomInt(100000, 1000000).toString();
  await OtpCode.create({
    purpose,
    audience,
    subjectType,
    subjectId,
    codeHash: hash(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });
  return code;
};

/** @returns {Promise<{ ok: true } | { ok: false, reason: "invalid"|"expired"|"locked" }>} */
const checkOtp = async ({ purpose, audience, subjectId, code }) => {
  const entry = await OtpCode.findOne({ subjectId, purpose, audience, usedAt: null }).sort({ createdAt: -1 });
  if (!entry) return { ok: false, reason: "invalid" };
  if (entry.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (entry.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "locked" };
  const given = Buffer.from(hash(typeof code === "string" ? code.trim() : ""), "hex");
  const stored = Buffer.from(entry.codeHash, "hex");
  if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
    entry.attempts += 1;
    await entry.save();
    return { ok: false, reason: entry.attempts >= MAX_ATTEMPTS ? "locked" : "invalid" };
  }
  entry.usedAt = new Date();
  await entry.save();
  return { ok: true };
};

const OTP_MESSAGES = {
  invalid: "The code is not correct.",
  expired: "The code has expired. Ask for a new one.",
  locked: "Too many wrong codes. Ask for a new one.",
};

module.exports = { issueOtp, checkOtp, OTP_MESSAGES, OTP_TTL_MS, MAX_ATTEMPTS };
