// Sign-in for the four Nauticrew audiences (Phase 2).
//   /api/auth/<audience>/login | refresh | logout | me | change-password
//   /api/auth/<audience>/forgot-password | reset-password
//   customers only: /register | verify-email | resend-verification
// Staff accounts are created by an administrator (staff.controller.js).
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Customer = require("../models/Customer");
const { AUDIENCES, cookieNames } = require("../core/audiences");
const { createSession, rotateSession, revokeSession, revokeAllSessions, SessionError } = require("../core/sessions");
const { setAuthCookies, clearAuthCookies, readCookie } = require("../core/cookies");
const { authenticateRequest, toPrincipal, isAllowed } = require("../core/authenticate");
const { verifyAccessToken, signAccessToken, hashToken } = require("../core/tokens");
const AuthSession = require("../models/AuthSession");
const { issueOtp, checkOtp, OTP_MESSAGES } = require("../core/otp");
const mailer = require("../core/mailer");
const { audit } = require("../core/audit");
const { notify } = require("../core/notify");
const { rolesOf, canEnterModule } = require("../core/roles");

const BCRYPT_COST = 12;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
// A real bcrypt hash compared when the account does not exist, so a wrong
// e-mail and a wrong password take the same time (made once, on first use).
let dummyHash = null;
const getDummyHash = async () => (dummyHash ||= await bcrypt.hash("nauticrew-no-such-account", BCRYPT_COST));

const str = (v, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const emailOf = (body) => str(body?.email, 254).toLowerCase();
const looksLikeEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const passwordProblem = (p) =>
  typeof p !== "string" || p.length < PASSWORD_MIN
    ? `The password must have at least ${PASSWORD_MIN} characters.`
    : p.length > PASSWORD_MAX
      ? `The password must have at most ${PASSWORD_MAX} characters.`
      : null;

const PORTAL_NAMES = { shop: "Nauticrew Shop", calendar: "Nauticrew Calendars" };

const makeAuthController = (audience) => {
  const meta = AUDIENCES[audience];
  const isStaff = meta.kind === "staff";
  const Model = isStaff ? User : Customer;
  const passwordOf = (doc) => (isStaff ? doc.password : doc.passwordHash);
  const setPassword = async (doc, password) => {
    const h = await bcrypt.hash(password, BCRYPT_COST);
    if (isStaff) doc.password = h;
    else doc.passwordHash = h;
    doc.tokenVersion = (doc.tokenVersion || 0) + 1;
  };
  const module = meta.module;
  const auditActor = (doc) => ({ type: meta.kind, id: doc._id, audience });

  const startSession = async (req, res, doc) => {
    const tokens = await createSession({ subject: doc, audience, req });
    setAuthCookies(res, audience, tokens);
    return toPrincipal(doc, audience);
  };

  const profile = (principal) => ({
    id: principal.id,
    name: principal.name,
    email: principal.email,
    audience,
    roles: principal.roles,
    permissions: principal.permissions,
  });

  // POST /login { email, password }
  const login = async (req, res) => {
    try {
      const email = emailOf(req.body);
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!email || !password) return res.status(400).json({ message: "Email and password are required." });
      const doc = await Model.findOne({ email });
      const ok = await bcrypt.compare(password.slice(0, PASSWORD_MAX), doc ? passwordOf(doc) : await getDummyHash());
      if (!doc || !ok) {
        if (doc) await audit(req, { action: "auth.login.failed", module, entity: meta.kind, entityId: doc._id, actor: auditActor(doc) });
        return res.status(401).json({ message: "Invalid email or password." });
      }
      if (!isStaff && doc.status === "ACTIVE" && !doc.emailVerified) {
        return res.status(403).json({ message: "Please verify your e-mail address first.", code: "EMAIL_NOT_VERIFIED" });
      }
      if (!isAllowed(doc, audience)) {
        // Same answer whether the account is inactive, suspended or simply
        // has no access to this portal / panel.
        return res.status(403).json({ message: "This account cannot sign in here.", code: "NOT_ALLOWED" });
      }
      doc.lastLoginAt = new Date();
      await doc.save();
      const principal = await startSession(req, res, doc);
      await audit(req, { action: "auth.login", module, entity: meta.kind, entityId: doc._id, actor: auditActor(doc) });
      return res.json({ message: "Signed in", user: profile(principal) });
    } catch (err) {
      console.error(`Login (${audience}) error:`, err);
      return res.status(500).json({ message: "Sign-in failed. Please try again." });
    }
  };

  // POST /refresh  (refresh cookie)
  const refresh = async (req, res) => {
    try {
      const { session, refreshToken, refreshExpiresAt } = await rotateSession({
        refreshToken: readCookie(req, cookieNames(audience).refresh),
        audience,
        req,
      });
      const doc = await Model.findById(session.subjectId);
      if (!doc || !isAllowed(doc, audience)) {
        await revokeSession(session._id, "account-not-allowed");
        clearAuthCookies(res, audience);
        return res.status(401).json({ message: "Please sign in again.", code: "NOT_ALLOWED" });
      }
      const accessToken = signAccessToken({ subjectId: doc._id, audience, sessionId: session._id, tokenVersion: doc.tokenVersion || 0 });
      setAuthCookies(res, audience, { accessToken, refreshToken, refreshExpiresAt });
      return res.json({ message: "Session renewed", user: profile(toPrincipal(doc, audience)) });
    } catch (err) {
      if (err instanceof SessionError) {
        clearAuthCookies(res, audience);
        return res.status(401).json({ message: "Please sign in again.", code: "NO_SESSION" });
      }
      console.error(`Refresh (${audience}) error:`, err);
      return res.status(500).json({ message: "Could not renew the session." });
    }
  };

  // POST /logout
  const logout = async (req, res) => {
    try {
      const token = readCookie(req, cookieNames(audience).access);
      let sessionId = null;
      if (token) {
        try {
          sessionId = verifyAccessToken(token, audience).sid;
        } catch {
          /* expired access token: fall back to the refresh cookie */
        }
      }
      if (!sessionId) {
        const rt = readCookie(req, cookieNames(audience).refresh);
        if (rt) {
          const s = await AuthSession.findOne({ refreshTokenHash: hashToken(rt), audience });
          sessionId = s?._id || null;
        }
      }
      await revokeSession(sessionId, "logout");
    } catch (err) {
      console.error(`Logout (${audience}) error:`, err.message);
    }
    clearAuthCookies(res, audience);
    return res.json({ message: "Signed out" });
  };

  // GET /me
  const me = async (req, res) => {
    const result = await authenticateRequest(req, audience);
    if (result.error) return res.status(result.error.status).json({ message: result.error.message, code: result.error.code });
    return res.json({ user: profile(result.principal) });
  };

  // POST /change-password { currentPassword, newPassword }  (signed in)
  const changePassword = async (req, res) => {
    try {
      const result = await authenticateRequest(req, audience);
      if (result.error) return res.status(result.error.status).json({ message: result.error.message });
      const problem = passwordProblem(req.body?.newPassword);
      if (problem) return res.status(400).json({ message: problem });
      const doc = await Model.findById(result.principal.id);
      const ok = await bcrypt.compare(String(req.body?.currentPassword || "").slice(0, PASSWORD_MAX), passwordOf(doc));
      if (!ok) return res.status(400).json({ message: "The current password is not correct." });
      await setPassword(doc, req.body.newPassword);
      await doc.save();
      await revokeAllSessions(doc._id, "password-changed");
      const principal = await startSession(req, res, doc);
      await audit(req, { action: "auth.password.change", module, entity: meta.kind, entityId: doc._id, actor: auditActor(doc) });
      return res.json({ message: "Password changed. Other devices were signed out.", user: profile(principal) });
    } catch (err) {
      console.error(`Change password (${audience}) error:`, err);
      return res.status(500).json({ message: "Could not change the password." });
    }
  };

  // POST /forgot-password { email } — always the same answer.
  const forgotPassword = async (req, res) => {
    const answer = { message: "If an account exists for this e-mail, a reset code has been sent." };
    try {
      const email = emailOf(req.body);
      if (!looksLikeEmail(email)) return res.json(answer);
      const doc = await Model.findOne({ email });
      // Staff must belong to this module; customers must have this portal
      // (an unverified customer may reset too: the code proves the e-mail).
      const eligible =
        doc &&
        (isStaff
          ? doc.active !== false && canEnterModule(rolesOf(doc), module)
          : doc.status === "ACTIVE" && doc.portals?.[meta.portal]?.enabled);
      if (eligible) {
        const code = await issueOtp({ purpose: "reset-password", audience, subjectType: meta.kind, subjectId: doc._id });
        await mailer.sendMail({
          to: doc.email,
          subject: "Your Nauticrew password reset code",
          text: `Hello ${doc.name},\n\nYour password reset code is ${code}. It is valid for 15 minutes.\n\nIf you did not ask for this, you can ignore this e-mail.\n\nNauticrew`,
        });
        await audit(req, { action: "auth.password.reset-requested", module, entity: meta.kind, entityId: doc._id, actor: auditActor(doc) });
      }
    } catch (err) {
      console.error(`Forgot password (${audience}) error:`, err.message);
    }
    return res.json(answer);
  };

  // POST /reset-password { email, code, password }
  const resetPassword = async (req, res) => {
    try {
      const email = emailOf(req.body);
      const problem = passwordProblem(req.body?.password);
      if (problem) return res.status(400).json({ message: problem });
      const doc = email ? await Model.findOne({ email }) : null;
      if (!doc) return res.status(400).json({ message: OTP_MESSAGES.invalid });
      const check = await checkOtp({ purpose: "reset-password", audience, subjectId: doc._id, code: req.body?.code });
      if (!check.ok) return res.status(400).json({ message: OTP_MESSAGES[check.reason] });
      await setPassword(doc, req.body.password);
      // The code arrived by e-mail, so the address is proven.
      if (!isStaff) doc.emailVerified = true;
      await doc.save();
      await revokeAllSessions(doc._id, "password-reset");
      await audit(req, { action: "auth.password.reset", module, entity: meta.kind, entityId: doc._id, actor: auditActor(doc) });
      return res.json({ message: "Password changed. Please sign in with the new password." });
    } catch (err) {
      console.error(`Reset password (${audience}) error:`, err);
      return res.status(500).json({ message: "Could not reset the password." });
    }
  };

  const sendVerification = async (doc) => {
    const code = await issueOtp({ purpose: "verify-email", audience, subjectType: "customer", subjectId: doc._id });
    await mailer.sendMail({
      to: doc.email,
      subject: `Verify your e-mail for ${PORTAL_NAMES[meta.portal]}`,
      text: `Hello ${doc.name},\n\nYour verification code is ${code}. It is valid for 15 minutes.\n\nNauticrew`,
    });
  };

  // POST /register { name, email, password, phone?, businessName? }  (customers)
  const register = async (req, res) => {
    try {
      const name = str(req.body?.name, 120);
      const email = emailOf(req.body);
      const password = req.body?.password;
      if (!name || !looksLikeEmail(email)) return res.status(400).json({ message: "Name and a valid e-mail are required." });
      const problem = passwordProblem(password);
      if (problem) return res.status(400).json({ message: problem });

      let doc = await Customer.findOne({ email });
      if (doc) {
        // Same person joining the other portal: proven by their password.
        const ok = await bcrypt.compare(String(password).slice(0, PASSWORD_MAX), doc.passwordHash);
        if (!ok || doc.portals?.[meta.portal]?.enabled) {
          return res.status(409).json({ message: "An account with this e-mail already exists. Please sign in or reset your password." });
        }
        if (doc.status !== "ACTIVE") return res.status(403).json({ message: "This account cannot sign in here.", code: "NOT_ALLOWED" });
        doc.portals[meta.portal] = { enabled: true, joinedAt: new Date() };
        await doc.save();
      } else {
        doc = await Customer.create({
          name,
          email,
          phone: str(req.body?.phone, 20) || null,
          businessName: str(req.body?.businessName, 160) || null,
          passwordHash: await bcrypt.hash(password, BCRYPT_COST),
          portals: { [meta.portal]: { enabled: true, joinedAt: new Date() } },
        });
      }
      await audit(req, { action: "customer.register", module, entity: "customer", entityId: doc._id, actor: auditActor(doc) });
      if (doc.emailVerified) {
        const principal = await startSession(req, res, doc);
        return res.status(201).json({ message: "Account ready", needsVerification: false, user: profile(principal) });
      }
      try {
        await sendVerification(doc);
      } catch (mailErr) {
        // The account exists; the customer can ask for a new code later.
        console.error(`Verification e-mail (${audience}) failed:`, mailErr.message);
        return res.status(201).json({
          message: "Your account was created, but the verification e-mail could not be sent. Please use “Send a new code” in a few minutes.",
          needsVerification: true,
        });
      }
      return res.status(201).json({ message: "We sent a verification code to your e-mail.", needsVerification: true });
    } catch (err) {
      if (err?.code === 11000) return res.status(409).json({ message: "An account with this e-mail already exists. Please sign in or reset your password." });
      console.error(`Register (${audience}) error:`, err);
      return res.status(500).json({ message: "Registration failed. Please try again." });
    }
  };

  // POST /verify-email { email, code } → signs the customer in.
  const verifyEmail = async (req, res) => {
    try {
      const doc = await Customer.findOne({ email: emailOf(req.body) });
      if (!doc || !doc.portals?.[meta.portal]?.enabled) return res.status(400).json({ message: OTP_MESSAGES.invalid });
      if (!doc.emailVerified) {
        const check = await checkOtp({ purpose: "verify-email", audience, subjectId: doc._id, code: req.body?.code });
        if (!check.ok) return res.status(400).json({ message: OTP_MESSAGES[check.reason] });
        doc.emailVerified = true;
      }
      doc.lastLoginAt = new Date();
      await doc.save();
      if (!isAllowed(doc, audience)) return res.status(403).json({ message: "This account cannot sign in here.", code: "NOT_ALLOWED" });
      const principal = await startSession(req, res, doc);
      await notify({
        recipientType: "customer",
        recipientId: doc._id,
        audience,
        type: "account.welcome",
        title: `Welcome to ${PORTAL_NAMES[meta.portal]}`,
      });
      await audit(req, { action: "customer.email.verified", module, entity: "customer", entityId: doc._id, actor: auditActor(doc) });
      return res.json({ message: "E-mail verified", user: profile(principal) });
    } catch (err) {
      console.error(`Verify e-mail (${audience}) error:`, err);
      return res.status(500).json({ message: "Verification failed. Please try again." });
    }
  };

  // POST /resend-verification { email } — always the same answer.
  const resendVerification = async (req, res) => {
    const answer = { message: "If this account still needs verification, a new code has been sent." };
    try {
      const doc = await Customer.findOne({ email: emailOf(req.body) });
      if (doc && !doc.emailVerified && doc.status === "ACTIVE" && doc.portals?.[meta.portal]?.enabled) await sendVerification(doc);
    } catch (err) {
      console.error(`Resend verification (${audience}) error:`, err.message);
    }
    return res.json(answer);
  };

  return {
    login,
    refresh,
    logout,
    me,
    changePassword,
    forgotPassword,
    resetPassword,
    ...(isStaff ? {} : { register, verifyEmail, resendVerification }),
  };
};

module.exports = { makeAuthController, passwordProblem, PASSWORD_MIN, BCRYPT_COST };
