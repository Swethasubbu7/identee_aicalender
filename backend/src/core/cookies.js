// Minimal cookie helpers (no extra dependency). Auth cookies are httpOnly
// (unreadable by page scripts), SameSite=Lax and Secure in production.
const { cookieNames } = require("./audiences");
const { ACCESS_TTL_SECONDS } = require("./tokens");

const isSecure = () =>
  String(process.env.COOKIE_SECURE || "").toLowerCase() === "true" || process.env.NODE_ENV === "production";

const parseCookies = (header = "") => {
  const out = {};
  for (const part of String(header).split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    if (!name || Object.prototype.hasOwnProperty.call(out, name)) continue;
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[name] = part.slice(i + 1).trim();
    }
  }
  return out;
};

const serialize = (name, value, { maxAgeSeconds, path = "/", expires } = {}) => {
  const bits = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, "HttpOnly", "SameSite=Lax"];
  if (isSecure()) bits.push("Secure");
  if (maxAgeSeconds != null) bits.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  if (expires) bits.push(`Expires=${expires.toUTCString()}`);
  return bits.join("; ");
};

const appendCookie = (res, cookie) => {
  const prev = res.getHeader?.("Set-Cookie");
  const list = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  res.setHeader("Set-Cookie", [...list, cookie]);
};

// Refresh cookies travel only to that audience's own auth routes.
const refreshPath = (audience) => `/api/auth/${audience}`;

const setAuthCookies = (res, audience, { accessToken, refreshToken, refreshExpiresAt }) => {
  const names = cookieNames(audience);
  appendCookie(res, serialize(names.access, accessToken, { maxAgeSeconds: ACCESS_TTL_SECONDS, path: "/api" }));
  if (refreshToken) {
    const maxAge = (refreshExpiresAt.getTime() - Date.now()) / 1000;
    appendCookie(res, serialize(names.refresh, refreshToken, { maxAgeSeconds: maxAge, path: refreshPath(audience) }));
  }
};

const clearAuthCookies = (res, audience) => {
  const names = cookieNames(audience);
  appendCookie(res, serialize(names.access, "", { maxAgeSeconds: 0, path: "/api" }));
  appendCookie(res, serialize(names.refresh, "", { maxAgeSeconds: 0, path: refreshPath(audience) }));
};

const readCookie = (req, name) => parseCookies(req.headers?.cookie)[name];

module.exports = { parseCookies, serialize, setAuthCookies, clearAuthCookies, readCookie, refreshPath, isSecure };
