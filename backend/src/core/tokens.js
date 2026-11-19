// Access tokens (short-lived JWT carrying one audience) and refresh tokens
// (random secrets; only their SHA-256 hash is stored in AuthSession).
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { isAudience } = require("./audiences");

const ACCESS_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS) || 15 * 60;
const REFRESH_TTL_DAYS = {
  staff: Number(process.env.STAFF_SESSION_DAYS) || 7,
  customer: Number(process.env.CUSTOMER_SESSION_DAYS) || 30,
};
// A token issued by this app always names its issuer.
const ISSUER = "nauticrew";

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return s;
};

/**
 * @param {{ subjectId: string, audience: string, sessionId: string, tokenVersion?: number }} p
 */
const signAccessToken = ({ subjectId, audience, sessionId, tokenVersion = 0 }) => {
  if (!isAudience(audience)) throw new Error(`Unknown audience ${audience}`);
  return jwt.sign({ sid: sessionId, tv: tokenVersion }, secret(), {
    subject: String(subjectId),
    audience,
    issuer: ISSUER,
    expiresIn: ACCESS_TTL_SECONDS,
  });
};

/** Verifies signature, expiry, issuer AND audience. Throws on any mismatch. */
const verifyAccessToken = (token, audience) => jwt.verify(token, secret(), { audience, issuer: ISSUER });

const newRefreshToken = () => crypto.randomBytes(32).toString("base64url");
const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

const refreshExpiry = (kind, now = Date.now()) => new Date(now + REFRESH_TTL_DAYS[kind] * 24 * 60 * 60 * 1000);

module.exports = {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_DAYS,
  ISSUER,
  signAccessToken,
  verifyAccessToken,
  newRefreshToken,
  hashToken,
  refreshExpiry,
};
