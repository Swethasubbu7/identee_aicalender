// Sign-in sessions: create, rotate (refresh), revoke.
const AuthSession = require("../models/AuthSession");
const { newRefreshToken, hashToken, refreshExpiry, signAccessToken } = require("./tokens");
const { AUDIENCES } = require("./audiences");

const KEEP_PREVIOUS = 5;

class SessionError extends Error {}

const clientInfo = (req) => ({
  ip: req?.ip || null,
  userAgent: String(req?.headers?.["user-agent"] || "").slice(0, 300) || null,
});

/** Starts a session; returns the tokens to put in cookies. */
const createSession = async ({ subject, audience, req }) => {
  const kind = AUDIENCES[audience].kind;
  const refreshToken = newRefreshToken();
  const expiresAt = refreshExpiry(kind);
  const session = await AuthSession.create({
    subjectType: kind,
    subjectId: subject._id,
    audience,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt,
    ...clientInfo(req),
  });
  const accessToken = signAccessToken({
    subjectId: subject._id,
    audience,
    sessionId: session._id,
    tokenVersion: subject.tokenVersion || 0,
  });
  return { session, accessToken, refreshToken, refreshExpiresAt: expiresAt };
};

/**
 * Exchanges a refresh token for new tokens. A token that was already rotated
 * out (replayed — e.g. stolen) revokes the session it belonged to.
 * @returns {Promise<{ session, refreshToken, refreshExpiresAt }>}
 */
const rotateSession = async ({ refreshToken, audience, req }) => {
  if (!refreshToken) throw new SessionError("No session");
  const h = hashToken(refreshToken);
  const session = await AuthSession.findOne({ refreshTokenHash: h, audience });
  if (!session) {
    const replayed = await AuthSession.findOne({ previousHashes: h, audience });
    if (replayed && !replayed.revokedAt) {
      replayed.revokedAt = new Date();
      replayed.revokedReason = "refresh-token-reuse";
      await replayed.save();
    }
    throw new SessionError("Session not found");
  }
  if (session.revokedAt) throw new SessionError("Session ended");
  if (session.expiresAt.getTime() <= Date.now()) throw new SessionError("Session expired");

  const next = newRefreshToken();
  session.previousHashes = [...(session.previousHashes || []), h].slice(-KEEP_PREVIOUS);
  session.refreshTokenHash = hashToken(next);
  session.lastUsedAt = new Date();
  Object.assign(session, clientInfo(req));
  await session.save();
  return { session, refreshToken: next, refreshExpiresAt: session.expiresAt };
};

const revokeSession = async (sessionId, reason = "logout") => {
  if (!sessionId) return;
  await AuthSession.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });
};

/** Ends every session of a subject (all audiences unless one is given). */
const revokeAllSessions = async (subjectId, reason, audience = null) => {
  const filter = { subjectId, revokedAt: null, ...(audience && { audience }) };
  await AuthSession.updateMany(filter, { $set: { revokedAt: new Date(), revokedReason: reason } });
};

module.exports = { createSession, rotateSession, revokeSession, revokeAllSessions, SessionError };
