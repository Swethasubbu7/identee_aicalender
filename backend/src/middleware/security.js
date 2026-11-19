// Security basics for every response (Phase 1 hardening, 2026-11-17):
//  - security headers (no new dependency);
//  - CORS limited to the configured browser origins;
//  - simple in-memory rate limits for sign-in / sign-up endpoints.
// In-memory limits are per server process — enough for the single server
// this app runs on; a shared store is needed if it ever runs on several.
const config = require("../config");

/** Headers that cost nothing and close common browser attacks. */
const securityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  // The API is never meant to be shown inside another site's frame.
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Images / PDFs are read by the app's own pages on another origin (the
  // frontend), so resources stay loadable cross-origin; CORS still decides
  // which origins may read them in script.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  next();
};

/** cors() options: only the configured origins (requests without Origin, such as same-origin or server-to-server calls, are not affected). */
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    return callback(null, config.CORS_ORIGINS.includes(origin.replace(/\/+$/, "")));
  },
  // Content-Disposition is exposed so downloads keep their file names.
  exposedHeaders: ["Content-Disposition"],
  // Phase 2: sign-in cookies travel with the app's API requests.
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-NC-Request"],
};

/**
 * Fixed-window rate limit per client address (+ optional key, e.g. e-mail).
 * rateLimit({ windowMs, max, keyOf, message })
 */
const rateLimit = ({ windowMs, max, keyOf = () => "", message = "Too many attempts. Please wait a few minutes and try again." }) => {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  sweep.unref?.();
  return (req, res, next) => {
    const key = `${req.ip}|${keyOf(req) || ""}`;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ message });
    }
    return next();
  };
};

const emailOf = (req) => (typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "");

// Sign-in: per address (stops spraying many accounts) and per address+e-mail
// (stops guessing one account's password).
const loginLimits = [
  rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }),
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyOf: emailOf, message: "Too many sign-in attempts for this account. Please wait 15 minutes." }),
];
// Sign-up and one-time codes.
const signupLimits = [rateLimit({ windowMs: 60 * 60 * 1000, max: 10 })];

module.exports = { securityHeaders, corsOptions, rateLimit, loginLimits, signupLimits };
