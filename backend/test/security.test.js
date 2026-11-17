// Phase 1 security hardening (2026-11-17). Mocks only: no database, no mail.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const Module = require("module");

const SRC = path.join(__dirname, "..", "src");

const fakeRes = () => ({
  statusCode: 200,
  headers: {},
  body: null,
  status(c) {
    this.statusCode = c;
    return this;
  },
  json(b) {
    this.body = b;
    return this;
  },
  setHeader(k, v) {
    this.headers[k.toLowerCase()] = v;
  },
});

// Fresh modules with the given environment, a fake mailer and an in-memory User model.
const load = (env = {}) => {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const id of Object.keys(require.cache)) if (id.startsWith(SRC)) delete require.cache[id];
  const mongoose = require("mongoose");
  for (const n of mongoose.modelNames()) mongoose.deleteModel(n);
  const mailerPath = require.resolve("nodemailer");
  const savedMailer = require.cache[mailerPath];
  const sent = [];
  const m = new Module(mailerPath);
  m.loaded = true;
  m.exports = { createTransport: () => ({ sendMail: async (mail) => sent.push(mail) }) };
  require.cache[mailerPath] = m;
  const User = require(path.join(SRC, "models/User"));
  const created = [];
  User.findOne = async () => null;
  User.create = async (doc) => {
    created.push(doc);
    return { _id: "u1", ...doc };
  };
  const ctx = {
    sent,
    created,
    User,
    register: require(path.join(SRC, "controllers/register.controller")),
    auth: require(path.join(SRC, "controllers/auth.controller")),
    security: require(path.join(SRC, "middleware/security")),
    config: require(path.join(SRC, "config")),
  };
  process.env = saved;
  if (savedMailer) require.cache[mailerPath] = savedMailer;
  else delete require.cache[mailerPath];
  return ctx;
};

const quiet = async (fn) => {
  const { log, error } = console;
  const lines = [];
  console.log = console.error = (...a) => lines.push(a.join(" "));
  try {
    await fn();
  } finally {
    Object.assign(console, { log, error });
  }
  return lines;
};

test("staff sign-up is CLOSED by default: register and verify-otp refuse, nothing is created or mailed", async () => {
  const ctx = load({ ALLOW_STAFF_SIGNUP: "" });
  assert.equal(ctx.config.ALLOW_STAFF_SIGNUP, false);
  const r1 = fakeRes();
  await ctx.register.register({ body: { name: "X", email: "x@example.com", password: "longpassword" } }, r1);
  assert.equal(r1.statusCode, 403);
  assert.match(r1.body.message, /created by an administrator/);
  const r2 = fakeRes();
  await ctx.register.verifyOtp({ body: { email: "x@example.com", otp: "123456" } }, r2);
  assert.equal(r2.statusCode, 403);
  assert.equal(ctx.sent.length, 0);
  assert.equal(ctx.created.length, 0);
});

test("if sign-up is re-opened: code never logged, password stored only hashed, 5 attempts max", async () => {
  const ctx = load({ ALLOW_STAFF_SIGNUP: "true", JWT_SECRET: "test-secret" });
  const res = fakeRes();
  const logs = await quiet(() =>
    ctx.register.register({ body: { name: "New Staff", email: "New@Example.com", password: "a-long-password" } }, res),
  );
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const otp = /(\d{6})/.exec(ctx.sent[0].html || ctx.sent[0].text)[1];
  assert.ok(!logs.some((l) => l.includes(otp)), "the code is never written to the log");
  // Wrong codes: refused; the 6th try ends the registration.
  for (let i = 0; i < 5; i += 1) {
    const r = fakeRes();
    await quiet(() => ctx.register.verifyOtp({ body: { email: "new@example.com", otp: otp === "111111" ? "222222" : "111111" } }, r));
    assert.equal(r.statusCode, 400);
  }
  const blocked = fakeRes();
  await quiet(() => ctx.register.verifyOtp({ body: { email: "new@example.com", otp } }, blocked));
  assert.equal(blocked.statusCode, 429);
  assert.equal(ctx.created.length, 0);

  // A fresh registration with the right code works; the password is a bcrypt hash.
  const again = fakeRes();
  await quiet(() => ctx.register.register({ body: { name: "New Staff", email: "new@example.com", password: "a-long-password" } }, again));
  const otp2 = /(\d{6})/.exec(ctx.sent[1].html || ctx.sent[1].text)[1];
  const ok = fakeRes();
  const secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-secret";
  try {
    await quiet(() => ctx.register.verifyOtp({ body: { email: "new@example.com", otp: otp2 } }, ok));
  } finally {
    if (secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secret;
  }
  assert.equal(ok.statusCode, 201, JSON.stringify(ok.body));
  assert.match(ctx.created[0].password, /^\$2[aby]\$12\$/);
  assert.notEqual(ctx.created[0].password, "a-long-password");
});

test("if sign-up is re-opened: short passwords and non-text fields are refused", async () => {
  const ctx = load({ ALLOW_STAFF_SIGNUP: "true" });
  const short = fakeRes();
  await ctx.register.register({ body: { name: "A", email: "a@example.com", password: "short" } }, short);
  assert.equal(short.statusCode, 400);
  const obj = fakeRes();
  await ctx.register.register({ body: { name: "A", email: { $gt: "" }, password: "a-long-password" } }, obj);
  assert.equal(obj.statusCode, 400);
});

test("login: an object instead of an e-mail is refused (no database query injection)", async () => {
  const ctx = load();
  let queried = null;
  ctx.User.findOne = async (q) => {
    queried = q;
    return null;
  };
  const res = fakeRes();
  await ctx.auth.login({ body: { email: { $gt: "" }, password: "x" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(queried, null);
  const res2 = fakeRes();
  await ctx.auth.login({ body: { email: "  Admin@Example.com ", password: "x" } }, res2);
  assert.deepEqual(queried, { email: "admin@example.com" }); // trimmed, lower-case
});

test("rate limit: the 11th sign-in attempt for one account within 15 minutes is refused", () => {
  const { loginLimits } = load().security;
  const req = { ip: "203.0.113.5", body: { email: "admin@example.com" } };
  const results = [];
  for (let i = 0; i < 12; i += 1) {
    const res = fakeRes();
    let passed = true;
    for (const mw of loginLimits) {
      let nextCalled = false;
      mw(req, res, () => (nextCalled = true));
      if (!nextCalled) {
        passed = false;
        break;
      }
    }
    results.push(passed ? 200 : res.statusCode);
  }
  assert.deepEqual(results.slice(0, 10), Array(10).fill(200));
  assert.equal(results[10], 429);
  // Another account from the same address is still allowed.
  let passed = 0;
  for (const mw of loginLimits) mw({ ip: "203.0.113.5", body: { email: "other@example.com" } }, fakeRes(), () => (passed += 1));
  assert.equal(passed, loginLimits.length);
});

test("CORS: only the configured origins; requests without an Origin are unaffected", async () => {
  const { corsOptions } = load({ CORS_ORIGINS: "https://nauticrew.example, http://localhost:5173/" }).security;
  const allowed = (origin) => new Promise((resolve) => corsOptions.origin(origin, (_e, ok) => resolve(ok)));
  assert.equal(await allowed("https://nauticrew.example"), true);
  assert.equal(await allowed("http://localhost:5173"), true);
  assert.equal(await allowed("https://evil.example"), false);
  assert.equal(await allowed(undefined), true);
  assert.deepEqual(corsOptions.exposedHeaders, ["Content-Disposition"]);
});

test("security headers are set on every response", () => {
  const { securityHeaders } = load().security;
  const res = fakeRes();
  securityHeaders({ secure: true }, res, () => {});
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["x-frame-options"], "DENY");
  assert.equal(res.headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.match(res.headers["strict-transport-security"], /max-age=/);
});
