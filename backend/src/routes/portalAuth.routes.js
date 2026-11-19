// /api/auth/<audience>/... — one router per audience (shop-customer,
// shop-staff, calendar-customer, calendar-staff). Rate limits are per
// audience, so traffic on the shop never locks staff out of the calendar.
const express = require("express");
const { makeAuthController } = require("../controllers/portalAuth.controller");
const { rateLimit } = require("../middleware/security");
const { AUDIENCES } = require("../core/audiences");

const emailOf = (req) => (typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "");
const MIN15 = 15 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const makeAuthRouter = (audience) => {
  const c = makeAuthController(audience);
  const router = express.Router();
  const loginLimits = [
    rateLimit({ windowMs: MIN15, max: 50 }),
    rateLimit({ windowMs: MIN15, max: 10, keyOf: emailOf, message: "Too many sign-in attempts for this account. Please wait 15 minutes." }),
  ];
  const codeLimits = [
    rateLimit({ windowMs: HOUR, max: 20 }),
    rateLimit({ windowMs: HOUR, max: 5, keyOf: emailOf, message: "Too many requests for this e-mail. Please wait an hour." }),
  ];
  const checkLimits = [rateLimit({ windowMs: MIN15, max: 30 })];

  router.post("/login", ...loginLimits, c.login);
  router.post("/refresh", rateLimit({ windowMs: MIN15, max: 120 }), c.refresh);
  router.post("/logout", c.logout);
  router.get("/me", c.me);
  router.post("/change-password", ...checkLimits, c.changePassword);
  router.post("/forgot-password", ...codeLimits, c.forgotPassword);
  router.post("/reset-password", ...checkLimits, c.resetPassword);
  if (AUDIENCES[audience].kind === "customer") {
    router.post("/register", rateLimit({ windowMs: HOUR, max: 10 }), c.register);
    router.post("/verify-email", ...checkLimits, c.verifyEmail);
    router.post("/resend-verification", ...codeLimits, c.resendVerification);
  }
  return router;
};

module.exports = { makeAuthRouter };
