// Phase 2 foundation: four sign-in audiences, roles & permissions, sessions,
// staff management, notifications. Real HTTP on a random local port; the
// database is an in-memory fake and e-mail is captured (no Atlas, no mail,
// no AI).
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

process.env.JWT_SECRET = "phase2-test-secret";

// Capture e-mail before any controller is loaded (they keep a reference).
const mailer = require("../src/core/mailer");
const sent = [];
mailer.sendMail = async (mail) => {
  sent.push(mail);
};
const codeIn = (mail) => (/\b(\d{6})\b/.exec(mail.text) || [])[1];
const lastMailTo = (email) => [...sent].reverse().find((m) => m.to === email);

const { fakeModel } = require("./helpers/fakeModels");
const User = require("../src/models/User");
const Customer = require("../src/models/Customer");
const AuthSession = require("../src/models/AuthSession");
const OtpCode = require("../src/models/OtpCode");
const AuditLog = require("../src/models/AuditLog");
const Notification = require("../src/models/Notification");
const users = fakeModel(User, { defaults: () => ({ active: true, role: "STAFF", tokenVersion: 0, roles: {} }) });
fakeModel(Customer, {
  defaults: () => ({ emailVerified: false, status: "ACTIVE", tokenVersion: 0, portals: { shop: { enabled: false }, calendar: { enabled: false } } }),
});
const sessions = fakeModel(AuthSession, { defaults: () => ({ revokedAt: null, previousHashes: [] }) });
fakeModel(OtpCode, { defaults: () => ({ attempts: 0, usedAt: null }) });
const audits = fakeModel(AuditLog);
fakeModel(Notification, { defaults: () => ({ readAt: null }) });

const { P, rolesOf, permissionsFor, LEGACY_ROLES } = require("../src/core/roles");
const { AUDIENCE_NAMES } = require("../src/core/audiences");
const { makeAuthRouter } = require("../src/routes/portalAuth.routes");
const staffRoutes = require("../src/routes/staff.routes");
const { notificationsRouter, auditRouter } = require("../src/routes/platform.routes");
const { requireAppHeader, requireAudience, requirePermission } = require("../src/core/authenticate");
const { verifyToken } = require("../src/middleware/auth.middleware");
const aiUsageRoutes = require("../src/routes/aiUsage.routes");
const layoutVariantRoutes = require("../src/routes/layoutVariant.routes");
const legacyAuthRoutes = require("../src/routes/auth.routes");

// ---- App under test ---------------------------------------------------------
const app = express();
app.use(express.json());
app.use(requireAppHeader);
for (const a of AUDIENCE_NAMES) app.use(`/api/auth/${a}`, makeAuthRouter(a));
app.use("/api/auth", legacyAuthRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/notifications", notificationsRouter);
app.use("/api/audit", auditRouter);
// Real Calendar Tool routers: requests here are refused before any
// controller runs, so no database work happens.
app.use("/api/ai-usage", aiUsageRoutes);
app.use("/api/layout-variants", layoutVariantRoutes);
// Probes for the guards themselves.
app.get("/probe/calendar", verifyToken, (req, res) => res.json({ ok: true, who: req.principal.id }));
app.post("/probe/ai", verifyToken, requirePermission(P.CAL_AI_GENERATE), (req, res) => res.json({ ok: true }));
app.get("/probe/shop", requireAudience("shop-customer"), (req, res) => res.json({ ok: true, who: req.principal.id }));

let base;
let server;
test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

// A browser-like client with its own cookie jar.
const client = () => {
  const jar = new Map();
  const call = async (method, path, body, { headers = {}, appHeader = true } = {}) => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...(appHeader && { "X-NC-Request": "1" }),
        ...(cookie && { Cookie: cookie }),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const [name, ...v] = pair.split("=");
      const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
      if (expired) jar.delete(name.trim());
      else jar.set(name.trim(), v.join("="));
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* no body */
    }
    return { status: res.status, body: json };
  };
  return { jar, get: (p, o) => call("GET", p, undefined, o), post: (p, b, o) => call("POST", p, b ?? {}, o), patch: (p, b, o) => call("PATCH", p, b ?? {}, o) };
};

const makeStaff = async ({ name, email, password = "Password-123", roles = null, role = "STAFF", active = true }) =>
  User.create({ name, email, password: await bcrypt.hash(password, 4), role, roles: roles || {}, active });

const registerCustomer = async (c, audience, { name = "Asha", email, password = "Password-123" }) => {
  const r = await c.post(`/api/auth/${audience}/register`, { name, email, password });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  if (r.body.needsVerification) {
    const v = await c.post(`/api/auth/${audience}/verify-email`, { email, code: codeIn(lastMailTo(email)) });
    assert.equal(v.status, 200, JSON.stringify(v.body));
  }
  return r;
};

// ---- Roles ------------------------------------------------------------------
test("roles: matrix grants what the roadmap says", () => {
  const perms = (r) => new Set(permissionsFor(r));
  const designer = perms({ calendar: "DESIGNER" });
  assert.ok(designer.has(P.CAL_AI_GENERATE) && designer.has(P.CAL_DESIGN));
  assert.ok(!designer.has(P.CAL_LAYOUTS_MANAGE) && !designer.has(P.SHOP_ACCESS));
  const manager = perms({ calendar: "CAL_MANAGER" });
  assert.ok(manager.has(P.CAL_DESIGN) && !manager.has(P.CAL_AI_GENERATE));
  const production = perms({ calendar: "PRODUCTION" });
  assert.ok(production.has(P.CAL_PRODUCTION_FILES) && !production.has(P.CAL_DESIGN));
  const sales = perms({ shop: "SALES" });
  assert.ok(sales.has(P.SHOP_ORDERS_MANAGE) && !sales.has(P.SHOP_INVENTORY_MANAGE) && !sales.has(P.CAL_ACCESS));
  const superAdmin = perms({ platform: "SUPER_ADMIN" });
  assert.ok(superAdmin.has(P.PLATFORM_STAFF_MANAGE) && superAdmin.has(P.SHOP_STAFF_MANAGE) && superAdmin.has(P.CAL_AI_GENERATE));
});

test("roles: accounts from before Phase 2 keep their full Calendar Tool access", () => {
  assert.deepEqual(rolesOf({ role: "STAFF" }), LEGACY_ROLES.STAFF);
  assert.deepEqual(rolesOf({ role: "ADMIN" }), LEGACY_ROLES.ADMIN);
  // Stored module roles win over the legacy field.
  assert.deepEqual(rolesOf({ role: "ADMIN", roles: { calendar: "DESIGNER" } }), { platform: null, shop: null, calendar: "DESIGNER" });
  // Unknown values are ignored, never trusted.
  assert.deepEqual(rolesOf({ roles: { calendar: "DESIGNER", shop: "OWNER" } }), { platform: null, shop: null, calendar: "DESIGNER" });
});

// ---- Customers ----------------------------------------------------------------
test("customer: register → must verify e-mail → signed in; code is never in a response", async () => {
  const c = client();
  const r = await c.post("/api/auth/shop-customer/register", { name: "Ravi", email: "ravi@example.com", password: "Password-123" });
  assert.equal(r.status, 201);
  assert.equal(r.body.needsVerification, true);
  const code = codeIn(lastMailTo("ravi@example.com"));
  assert.match(code, /^\d{6}$/);
  assert.ok(!JSON.stringify(r.body).includes(code));

  const early = await c.post("/api/auth/shop-customer/login", { email: "ravi@example.com", password: "Password-123" });
  assert.equal(early.status, 403);
  assert.equal(early.body.code, "EMAIL_NOT_VERIFIED");

  const v = await c.post("/api/auth/shop-customer/verify-email", { email: "ravi@example.com", code });
  assert.equal(v.status, 200);
  assert.ok(c.jar.has("nc_sc_at") && c.jar.has("nc_sc_rt"));
  const me = await c.get("/api/auth/shop-customer/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, "ravi@example.com");
  assert.deepEqual(me.body.user.permissions, []);
});

test("isolation: a shop customer reaches nothing of the calendar or staff panels", async () => {
  const c = client();
  await registerCustomer(c, "shop-customer", { email: "iso@example.com" });
  assert.equal((await c.get("/probe/shop")).status, 200);
  assert.equal((await c.get("/api/auth/calendar-customer/me")).status, 401);
  assert.equal((await c.get("/api/auth/shop-staff/me")).status, 401);
  assert.equal((await c.get("/probe/calendar")).status, 401);
  assert.equal((await c.get("/api/ai-usage/summary")).status, 401);
  assert.equal((await c.get("/api/staff")).status, 401);

  // The same token presented as a Bearer header for another audience fails too.
  const token = c.jar.get("nc_sc_at");
  const other = client();
  assert.equal((await other.get("/probe/calendar", { headers: { Authorization: `Bearer ${token}` } })).status, 401);
  assert.equal((await other.get("/api/auth/calendar-customer/me", { headers: { Authorization: `Bearer ${token}` } })).status, 401);
  // …and copied into another audience's cookie name.
  assert.equal((await other.get("/api/auth/calendar-customer/me", { headers: { Cookie: `nc_cc_at=${token}` } })).status, 401);
});

test("customer portals are separate: shop account must join the calendar portal itself", async () => {
  const c = client();
  await registerCustomer(c, "shop-customer", { email: "both@example.com" });
  const cal = client();
  const denied = await cal.post("/api/auth/calendar-customer/login", { email: "both@example.com", password: "Password-123" });
  assert.equal(denied.status, 403);
  // Joining needs the account's own password.
  const wrong = await cal.post("/api/auth/calendar-customer/register", { name: "x", email: "both@example.com", password: "Wrong-password-1" });
  assert.equal(wrong.status, 409);
  const join = await cal.post("/api/auth/calendar-customer/register", { name: "x", email: "both@example.com", password: "Password-123" });
  assert.equal(join.status, 201);
  assert.equal(join.body.needsVerification, false); // e-mail already proven
  assert.equal((await cal.get("/api/auth/calendar-customer/me")).status, 200);
  // Each portal has its own session cookie; neither opens the other.
  assert.ok(cal.jar.has("nc_cc_at") && !cal.jar.has("nc_sc_at"));
  assert.equal((await cal.get("/probe/shop")).status, 401);
});

// ---- Staff ----------------------------------------------------------------------
test("staff: a designer signs in to the calendar panel only and cannot use admin APIs", async () => {
  await makeStaff({ name: "Dee", email: "designer@nc.test", roles: { calendar: "DESIGNER" } });
  const c = client();
  const shop = await c.post("/api/auth/shop-staff/login", { email: "designer@nc.test", password: "Password-123" });
  assert.equal(shop.status, 403);
  const login = await c.post("/api/auth/calendar-staff/login", { email: "designer@nc.test", password: "Password-123" });
  assert.equal(login.status, 200);
  assert.ok(login.body.user.permissions.includes(P.CAL_AI_GENERATE));
  assert.equal((await c.get("/probe/calendar")).status, 200);
  assert.equal((await c.post("/probe/ai")).status, 200);
  // Real Calendar Tool routes: refused before their controllers run.
  assert.equal((await c.get("/api/ai-usage/summary")).status, 403);
  assert.equal((await c.post("/api/layout-variants/import")).status, 403);
  assert.equal((await c.get("/api/staff")).status, 403);
  assert.equal((await c.get("/api/audit")).status, 403);
});

test("staff: a calendar manager may design but not start paid AI", async () => {
  await makeStaff({ name: "Mo", email: "manager@nc.test", roles: { calendar: "CAL_MANAGER" } });
  const c = client();
  assert.equal((await c.post("/api/auth/calendar-staff/login", { email: "manager@nc.test", password: "Password-123" })).status, 200);
  assert.equal((await c.get("/probe/calendar")).status, 200);
  const ai = await c.post("/probe/ai");
  assert.equal(ai.status, 403);
  assert.deepEqual(ai.body.missing, [P.CAL_AI_GENERATE]);
});

test("legacy: an old Calendar Tool token works for calendar staff only, with the old full access", async () => {
  const legacy = await makeStaff({ name: "Old", email: "old@nc.test", role: "STAFF" });
  const token = jwt.sign({ userId: legacy._id, role: "STAFF" }, process.env.JWT_SECRET, { expiresIn: "1d" });
  const c = client();
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  assert.equal((await c.get("/probe/calendar", auth)).status, 200);
  assert.equal((await c.post("/probe/ai", {}, auth)).status, 200);
  assert.equal((await c.get("/api/auth/shop-staff/me", auth)).status, 401);
  assert.equal((await c.get("/probe/shop", auth)).status, 401);

  // A shop-only member cannot use the old Calendar sign-in at all.
  await makeStaff({ name: "Sal", email: "sales@nc.test", roles: { shop: "SALES" } });
  const old = await c.post("/api/auth/login", { email: "sales@nc.test", password: "Password-123" }, { appHeader: false });
  assert.equal(old.status, 403);
});

test("sessions: refresh rotates; a replayed refresh token ends the session", async () => {
  await makeStaff({ name: "Rot", email: "rotate@nc.test", roles: { calendar: "DESIGNER" } });
  const c = client();
  await c.post("/api/auth/calendar-staff/login", { email: "rotate@nc.test", password: "Password-123" });
  const firstRefresh = c.jar.get("nc_cs_rt");
  const r = await c.post("/api/auth/calendar-staff/refresh");
  assert.equal(r.status, 200);
  assert.notEqual(c.jar.get("nc_cs_rt"), firstRefresh);
  assert.equal((await c.get("/probe/calendar")).status, 200);

  // An attacker replays the old refresh token.
  const thief = client();
  thief.jar.set("nc_cs_rt", firstRefresh);
  assert.equal((await thief.post("/api/auth/calendar-staff/refresh")).status, 401);
  // The real user's session was ended as a precaution.
  const after = await c.get("/probe/calendar");
  assert.equal(after.status, 401);
  assert.equal(after.body.code, "SESSION_ENDED");
});

test("sessions: logout ends the session even if the cookie value is kept", async () => {
  await makeStaff({ name: "Lo", email: "logout@nc.test", roles: { calendar: "DESIGNER" } });
  const c = client();
  await c.post("/api/auth/calendar-staff/login", { email: "logout@nc.test", password: "Password-123" });
  const stolen = c.jar.get("nc_cs_at");
  assert.equal((await c.post("/api/auth/calendar-staff/logout")).status, 200);
  assert.ok(!c.jar.has("nc_cs_at"));
  const replay = client();
  assert.equal((await replay.get("/probe/calendar", { headers: { Cookie: `nc_cs_at=${stolen}` } })).status, 401);
});

test("csrf: cookie sign-in routes and cookie writes need the app header", async () => {
  const c = client();
  const r = await c.post("/api/auth/shop-customer/login", { email: "a@b.c", password: "x" }, { appHeader: false });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, "CSRF");
});

test("password reset: code by e-mail, old sessions end, new password works", async () => {
  const c = client();
  await registerCustomer(c, "calendar-customer", { email: "reset@example.com" });
  assert.equal((await c.get("/api/auth/calendar-customer/me")).status, 200);

  const anon = client();
  const unknown = await anon.post("/api/auth/calendar-customer/forgot-password", { email: "nobody@example.com" });
  const known = await anon.post("/api/auth/calendar-customer/forgot-password", { email: "reset@example.com" });
  assert.deepEqual(unknown.body, known.body); // no account enumeration
  const code = codeIn(lastMailTo("reset@example.com"));
  const bad = await anon.post("/api/auth/calendar-customer/reset-password", { email: "reset@example.com", code: "000000", password: "New-password-1" });
  assert.equal(bad.status, 400);
  const ok = await anon.post("/api/auth/calendar-customer/reset-password", { email: "reset@example.com", code, password: "New-password-1" });
  assert.equal(ok.status, 200);
  assert.equal((await c.get("/api/auth/calendar-customer/me")).status, 401);
  assert.equal((await anon.post("/api/auth/calendar-customer/login", { email: "reset@example.com", password: "New-password-1" })).status, 200);
  // A used code cannot be used again.
  assert.equal((await anon.post("/api/auth/calendar-customer/reset-password", { email: "reset@example.com", code, password: "Other-password-1" })).status, 400);
});

test("one-time codes lock after 5 wrong tries", async () => {
  const c = client();
  await c.post("/api/auth/shop-customer/register", { name: "Lock", email: "lock@example.com", password: "Password-123" });
  const code = codeIn(lastMailTo("lock@example.com"));
  for (let i = 0; i < 5; i += 1) {
    await c.post("/api/auth/shop-customer/verify-email", { email: "lock@example.com", code: code === "111111" ? "222222" : "111111" });
  }
  const r = await c.post("/api/auth/shop-customer/verify-email", { email: "lock@example.com", code });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /Too many/);
});

// ---- Staff management --------------------------------------------------------
test("staff management: module admins manage only their module", async () => {
  await makeStaff({ name: "Cal Admin", email: "caladmin@nc.test", roles: { calendar: "CAL_ADMIN" } });
  await makeStaff({ name: "Shop Admin", email: "shopadmin@nc.test", roles: { shop: "ECOM_ADMIN" } });
  const cal = client();
  await cal.post("/api/auth/calendar-staff/login", { email: "caladmin@nc.test", password: "Password-123" });

  const created = await cal.post("/api/staff", { name: "New Designer", email: "newdesigner@nc.test", roles: { calendar: "DESIGNER" } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.match(codeIn(lastMailTo("newdesigner@nc.test")), /^\d{6}$/);
  assert.equal((await cal.post("/api/staff", { name: "X", email: "x@nc.test", roles: { shop: "SALES" } })).status, 403);
  assert.equal((await cal.post("/api/staff", { name: "X", email: "y@nc.test", roles: { platform: "SUPER_ADMIN" } })).status, 403);

  const shop = client();
  await shop.post("/api/auth/shop-staff/login", { email: "shopadmin@nc.test", password: "Password-123" });
  const list = await shop.get("/api/staff");
  assert.equal(list.status, 200);
  assert.ok(list.body.staff.every((s) => s.roles.shop));
  // A calendar member is invisible (404) to the shop admin.
  assert.equal((await shop.patch(`/api/staff/${created.body.staff.id}/active`, { active: false })).status, 404);

  // The new member sets a password with the e-mailed code, then signs in.
  const nd = client();
  const setPw = await nd.post("/api/auth/calendar-staff/reset-password", {
    email: "newdesigner@nc.test",
    code: codeIn(lastMailTo("newdesigner@nc.test")),
    password: "Designer-pass-1",
  });
  assert.equal(setPw.status, 200);
  assert.equal((await nd.post("/api/auth/calendar-staff/login", { email: "newdesigner@nc.test", password: "Designer-pass-1" })).status, 200);

  // Role change applies at once: the old session is refused.
  const change = await cal.patch(`/api/staff/${created.body.staff.id}/roles`, { calendar: "PRODUCTION" });
  assert.equal(change.status, 200);
  assert.equal((await nd.get("/probe/calendar")).status, 401);
  assert.ok(audits.some((a) => a.action === "staff.roles.update"));
});

test("staff management: deactivation signs the member out; nobody can lock themselves out", async () => {
  const boss = await makeStaff({ name: "Boss", email: "boss@nc.test", role: "ADMIN" }); // legacy → Super Admin
  const worker = await makeStaff({ name: "Worker", email: "worker@nc.test", roles: { calendar: "DESIGNER", shop: "SALES" } });
  const w = client();
  await w.post("/api/auth/calendar-staff/login", { email: "worker@nc.test", password: "Password-123" });
  assert.equal((await w.get("/probe/calendar")).status, 200);

  const b = client();
  assert.equal((await b.post("/api/auth/calendar-staff/login", { email: "boss@nc.test", password: "Password-123" })).status, 200);
  assert.equal((await b.patch(`/api/staff/${boss._id}/active`, { active: false })).status, 400);
  assert.equal((await b.patch(`/api/staff/${boss._id}/roles`, { platform: null })).status, 400);
  assert.equal((await b.patch(`/api/staff/${worker._id}/active`, { active: false })).status, 200);
  assert.equal((await w.get("/probe/calendar")).status, 401);
  assert.ok(sessions.filter((s) => String(s.subjectId) === String(worker._id)).every((s) => s.revokedAt));
  assert.equal(users.find((u) => String(u._id) === String(worker._id)).active, false);
});

// ---- Notifications -------------------------------------------------------------
test("notifications: each account sees and marks only its own", async () => {
  const a = client();
  await registerCustomer(a, "shop-customer", { email: "note-a@example.com" });
  const b = client();
  await registerCustomer(b, "shop-customer", { email: "note-b@example.com" });
  const listA = await a.get("/api/notifications/shop-customer");
  assert.equal(listA.status, 200);
  assert.equal(listA.body.notifications.length, 1); // welcome
  const idA = listA.body.notifications[0]._id;
  assert.equal((await b.post(`/api/notifications/shop-customer/${idA}/read`)).status, 404);
  assert.equal((await a.post(`/api/notifications/shop-customer/${idA}/read`)).status, 200);
  assert.equal((await a.get("/api/notifications/shop-customer")).body.unread, 0);
  // Another audience's list is not reachable with this sign-in.
  assert.equal((await a.get("/api/notifications/calendar-customer")).status, 401);
});

test("customer: a failed verification e-mail still creates the account and says what to do", async () => {
  const real = mailer.sendMail;
  mailer.sendMail = async () => {
    throw new Error("mail down");
  };
  try {
    const c = client();
    const r = await c.post("/api/auth/shop-customer/register", { name: "NoMail", email: "nomail@example.com", password: "Password-123" });
    assert.equal(r.status, 201);
    assert.equal(r.body.needsVerification, true);
    assert.match(r.body.message, /could not be sent/);
  } finally {
    mailer.sendMail = real;
  }
});
