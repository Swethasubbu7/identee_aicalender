// GET /api/files/<key> — shared design images (AI artwork, previews, print
// images, customer God / product images) from GridFS or, as a fallback, the
// local uploads folder.
//
// Authentication: a login token (Authorization: Bearer …) OR a signed,
// unexpired link issued by the API to a signed-in user (?u=&e=&s=).
// Authorisation: the user must exist and be active. Generated designs are
// shared by the whole team, so every active team member may view them.
const { authenticateRequest } = require("../core/authenticate");
const User = require("../models/User");
const { getStorage, normalizeKey, isSharedKey, toStoredPath } = require("../services/storage");
const { verifyFileLink } = require("../lib/fileLinks");

const ACTIVE_CACHE_MS = 60 * 1000;
const activeCache = new Map();

const isActiveUser = async (userId) => {
  const hit = activeCache.get(userId);
  if (hit && hit.until > Date.now()) return hit.active;
  const user = await User.findById(userId).select("active").lean().catch(() => null);
  const active = Boolean(user) && user.active !== false;
  activeCache.set(userId, { active, until: Date.now() + ACTIVE_CACHE_MS });
  return active;
};

// { userId, maxAgeSec } of the caller, or { status, message } to refuse.
// Signed-in calendar staff (cookie or Bearer, Phase 2 audience check) or a
// signed link issued to them.
const authenticate = async (req, key) => {
  const header = req.headers.authorization || "";
  const hasStaffCookie = /(^|;\s*)nc_cs_at=/.test(String(req.headers.cookie || ""));
  if (header.startsWith("Bearer ") || (hasStaffCookie && !req.query.s)) {
    const result = await authenticateRequest(req, "calendar-staff");
    if (result.error) return { status: result.error.status, message: result.error.message };
    return { userId: result.principal.id, maxAgeSec: 300 };
  }
  const { u, e, s } = req.query;
  if (!s) return { status: 401, message: "Sign in to view this file" };
  const link = verifyFileLink({ key, u, e, s });
  if (!link.ok) {
    return { status: 403, message: link.reason === "expired" ? "This link has expired — reload the page" : "Invalid file link" };
  }
  return { userId: link.userId, maxAgeSec: Math.max(0, Math.floor((link.expiresAt - Date.now()) / 1000)) };
};

const serveFile = async (req, res) => {
  let key;
  try {
    const parts = Array.isArray(req.params.key) ? req.params.key : [req.params.key];
    key = normalizeKey(parts.join("/"));
  } catch {
    return res.status(404).json({ message: "File not found" });
  }
  if (!isSharedKey(key)) return res.status(404).json({ message: "File not found" });

  const auth = await authenticate(req, key);
  if (auth.status) return res.status(auth.status).json({ message: auth.message });
  if (!(await isActiveUser(auth.userId))) {
    return res.status(403).json({ message: "Your account is not allowed to view design files" });
  }

  let file;
  try {
    file = await getStorage().openFile(toStoredPath(key));
  } catch (err) {
    if (err.code === "STORAGE_NOT_FOUND") return res.status(404).json({ message: "File not found" });
    console.error("Serve file error:", err.message);
    return res.status(500).json({ message: "Failed to read the file" });
  }
  res.setHeader("Content-Type", file.contentType || "application/octet-stream");
  if (file.size != null) res.setHeader("Content-Length", String(file.size));
  res.setHeader("Cache-Control", `private, max-age=${Math.min(auth.maxAgeSec, 3600)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  // The frontend runs on another origin and draws these images on a canvas.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  file.stream.on("error", (err) => {
    console.error("Stream file error:", err.message);
    if (!res.headersSent) res.status(500).end();
    else res.destroy(err);
  });
  file.stream.pipe(res);
};

const clearActiveCache = () => activeCache.clear();

module.exports = { serveFile, clearActiveCache };
