// Signed, expiring links to shared design files (served by /api/files).
//
// <img> tags cannot send the login token, so the backend hands out links
// signed with the server secret, tied to the file and to the signed-in user
// who received them. /api/files checks the signature, the expiry and that
// the user still exists and is active before sending anything.
const crypto = require("crypto");
const config = require("../config");
const { normalizeKey } = require("../services/storage/keys");

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is required to sign file links");
  return s;
};

const ttl = () => Math.max(60, config.STORAGE_URL_TTL_SECONDS);

const signature = (key, userId, expires) =>
  crypto.createHmac("sha256", secret()).update(`file:v1|${key}|${userId}|${expires}`).digest("base64url");

// Expiry is rounded up to the next TTL window (valid for TTL to 2×TTL), so
// the same link is reused within a window and browsers can cache it.
const signFileLink = (stored, userId, nowMs = Date.now()) => {
  const key = normalizeKey(stored);
  const window = ttl();
  const expires = (Math.floor(nowMs / 1000 / window) + 2) * window;
  return { key, u: String(userId), e: String(expires), s: signature(key, String(userId), expires) };
};

const fileLinkUrl = (stored, userId, nowMs) => {
  const { key, u, e, s } = signFileLink(stored, userId, nowMs);
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${config.PUBLIC_BASE_URL}/api/files/${path}?u=${encodeURIComponent(u)}&e=${e}&s=${s}`;
};

// Returns { ok, userId, expiresAt } or { ok: false, reason }.
const verifyFileLink = ({ key, u, e, s }, nowMs = Date.now()) => {
  if (!key || !u || !e || !s) return { ok: false, reason: "missing" };
  const expires = Number(e);
  if (!Number.isInteger(expires)) return { ok: false, reason: "invalid" };
  if (expires * 1000 <= nowMs) return { ok: false, reason: "expired" };
  const expected = Buffer.from(signature(key, String(u), expires));
  const given = Buffer.from(String(s));
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, userId: String(u), expiresAt: expires * 1000 };
};

module.exports = { signFileLink, fileLinkUrl, verifyFileLink };
