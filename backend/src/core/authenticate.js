// Request authentication for the four audiences.
//
//   requireAudience("calendar-staff")  → 401 unless signed in for THAT audience
//   requirePermission("calendar.ai.generate") → 403 unless the role allows it
//
// A token is read from the audience's own httpOnly cookie, or from an
// "Authorization: Bearer" header (API clients and the pre-Phase-2 Calendar
// Tool login, which is accepted for calendar staff only). Whatever its source,
// the token must name the audience, the session must still be open and the
// account must still be active and allowed in that module.
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const Customer = require("../models/Customer");
const AuthSession = require("../models/AuthSession");
const { AUDIENCES, isAudience, cookieNames } = require("./audiences");
const { verifyAccessToken, ISSUER } = require("./tokens");
const { readCookie } = require("./cookies");
const { rolesOf, permissionsFor, canEnterModule } = require("./roles");
const { runWithUser } = require("../lib/requestContext");

const isId = (id) => mongoose.Types.ObjectId.isValid(String(id));

/** The signed-in account as the rest of the app sees it. */
const toPrincipal = (doc, audience) => {
  const meta = AUDIENCES[audience];
  if (meta.kind === "staff") {
    const roles = rolesOf(doc);
    return {
      kind: "staff",
      id: String(doc._id),
      audience,
      name: doc.name,
      email: doc.email,
      roles,
      permissions: permissionsFor(roles),
    };
  }
  return {
    kind: "customer",
    id: String(doc._id),
    audience,
    name: doc.name,
    email: doc.email,
    roles: null,
    permissions: [],
  };
};

/** May this account use this audience right now? */
const isAllowed = (doc, audience) => {
  const meta = AUDIENCES[audience];
  if (!doc) return false;
  if (meta.kind === "staff") return doc.active !== false && canEnterModule(rolesOf(doc), meta.module);
  return doc.status === "ACTIVE" && doc.emailVerified === true && doc.portals?.[meta.portal]?.enabled === true;
};

const loadSubject = (audience, id) =>
  AUDIENCES[audience].kind === "staff" ? User.findById(id) : Customer.findById(id);

const fail = (status, message, code) => ({ error: { status, message, code } });

/**
 * Authenticates a request for one audience without sending a response.
 * @returns {Promise<{ principal } | { error: { status, message, code } }>}
 */
const authenticateRequest = async (req, audience) => {
  if (!isAudience(audience)) return fail(500, "Unknown audience");
  const header = String(req.headers?.authorization || "");
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  const cookie = readCookie(req, cookieNames(audience).access);
  const token = bearer || cookie;
  if (!token) return fail(401, "Please sign in.", "NO_SESSION");

  let subjectId;
  let sessionId = null;
  let tokenVersion = null;
  let legacy = false;
  try {
    const decoded = verifyAccessToken(token, audience);
    subjectId = decoded.sub;
    sessionId = decoded.sid;
    tokenVersion = decoded.tv ?? 0;
  } catch (err) {
    // Pre-Phase-2 Calendar Tool token: { userId, role }, no audience/issuer.
    // Only ever valid for calendar staff, and only via the Bearer header.
    if (audience !== "calendar-staff" || !bearer) return fail(401, "Your session has expired. Please sign in again.", "BAD_TOKEN");
    let decoded;
    try {
      decoded = jwt.verify(bearer, process.env.JWT_SECRET);
    } catch {
      return fail(401, "Your session has expired. Please sign in again.", "BAD_TOKEN");
    }
    if (decoded.aud || decoded.iss === ISSUER || !decoded.userId) {
      return fail(401, "This sign-in is not valid here.", "WRONG_AUDIENCE");
    }
    subjectId = decoded.userId;
    legacy = true;
  }
  if (!isId(subjectId)) return fail(401, "Your session has expired. Please sign in again.", "BAD_TOKEN");

  if (!legacy) {
    const session = isId(sessionId) ? await AuthSession.findById(sessionId) : null;
    if (!session || session.revokedAt || session.audience !== audience || String(session.subjectId) !== String(subjectId)) {
      return fail(401, "Your session has ended. Please sign in again.", "SESSION_ENDED");
    }
  }
  const doc = await loadSubject(audience, subjectId);
  if (!doc || !isAllowed(doc, audience)) return fail(401, "Your account cannot use this area. Please sign in again.", "NOT_ALLOWED");
  if (!legacy && (doc.tokenVersion || 0) !== tokenVersion) {
    return fail(401, "Your session has ended. Please sign in again.", "SESSION_ENDED");
  }
  const principal = { ...toPrincipal(doc, audience), sessionId: legacy ? null : String(sessionId), legacy };
  return { principal };
};

/**
 * Express middleware: only this audience (or one of a list of audiences —
 * the first one the request is signed in for wins).
 */
const requireAudience = (audiences) => {
  const list = Array.isArray(audiences) ? audiences : [audiences];
  return async (req, res, next) => {
    try {
      let last = null;
      for (const audience of list) {
        const result = await authenticateRequest(req, audience);
        if (result.principal) {
          const principal = result.principal;
          req.principal = principal;
          // Pre-Phase-2 code reads req.user.userId / req.user.role.
          req.user = { userId: principal.id, role: principal.roles?.platform === "SUPER_ADMIN" ? "ADMIN" : "STAFF", audience: principal.audience };
          return runWithUser(req.user, next);
        }
        last = result.error;
      }
      return res.status(last.status).json({ message: last.message, code: last.code });
    } catch (err) {
      console.error("Authentication error:", err);
      return res.status(500).json({ message: "Sign-in check failed" });
    }
  };
};

/** Express middleware: every listed permission is required. */
const requirePermission =
  (...permissions) =>
  (req, res, next) => {
    const have = new Set(req.principal?.permissions || []);
    const missing = permissions.filter((p) => !have.has(p));
    if (!req.principal) return res.status(401).json({ message: "Please sign in.", code: "NO_SESSION" });
    if (missing.length) {
      return res.status(403).json({ message: "Your role does not allow this action.", code: "FORBIDDEN", missing });
    }
    return next();
  };

/** Permission needed only when `when(req)` is true (e.g. paid AI mode). */
const requirePermissionWhen = (when, ...permissions) => {
  const check = requirePermission(...permissions);
  return (req, res, next) => (when(req) ? check(req, res, next) : next());
};

/**
 * CSRF guard for cookie-authenticated writes: the browser app sends
 * "X-NC-Request: 1" on every request. A form or link on another site cannot
 * add that header, and a script on another site is stopped by CORS.
 */
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
// Writes that a browser could make with the user's cookies, plus the cookie
// sign-in routes themselves (login CSRF).
const needsAppHeader = (req) =>
  /(^|;\s*)nc_[a-z]{2}_(at|rt)=/.test(String(req.headers?.cookie || "")) ||
  /^\/api\/auth\/(shop|calendar)-(customer|staff)(\/|$|\?)/.test(String(req.originalUrl || req.url || ""));
const requireAppHeader = (req, res, next) => {
  if (SAFE.has(req.method)) return next();
  if (String(req.headers?.authorization || "").startsWith("Bearer ")) return next();
  if (!needsAppHeader(req)) return next();
  if (req.headers?.["x-nc-request"] === "1") return next();
  return res.status(403).json({ message: "Request blocked (missing app header).", code: "CSRF" });
};

module.exports = {
  authenticateRequest,
  requireAudience,
  requirePermission,
  requirePermissionWhen,
  requireAppHeader,
  toPrincipal,
  isAllowed,
};
