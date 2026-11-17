// AI request reliability (2026-11-17), mocks only: no database, no network,
// no provider. Covers the failures seen on 2026-11-16 (Google HTTP 5xx, a
// request interrupted by a lost network) and the protections added for them.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const SRC = path.join(__dirname, "..", "src");

const realFetch = global.fetch;
global.fetch = async () => {
  throw new Error("Network is blocked in tests");
};
test.after(() => {
  global.fetch = realFetch;
});

const quiet = async (fn) => {
  const { log, warn, error } = console;
  console.log = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, warn, error });
  }
};

// Fresh modules with an in-memory usage ledger.
const loadLedger = () => {
  for (const id of Object.keys(require.cache)) if (id.startsWith(SRC)) delete require.cache[id];
  const mongoose = require("mongoose");
  for (const n of ["AiUsageRecord", "AiCalendarJob"]) if (mongoose.models[n]) mongoose.deleteModel(n);
  const AiUsageRecord = require(path.join(SRC, "models/AiUsageRecord"));
  const store = [];
  const fail = { create: false, update: false };
  AiUsageRecord.create = async (r) => {
    if (fail.create) throw new Error("db down");
    store.push({ ...r, createdAt: new Date() });
    return r;
  };
  AiUsageRecord.updateOne = async (q, upd) => {
    if (fail.update) throw new Error("db down");
    const r = store.find((x) => x.requestId === q.requestId);
    if (r) Object.assign(r, upd.$set);
    return { modifiedCount: r ? 1 : 0 };
  };
  const updateManyCalls = [];
  AiUsageRecord.updateMany = async (q, upd) => {
    updateManyCalls.push({ q, upd });
    return { modifiedCount: 0 };
  };
  return { store, fail, updateManyCalls, ledger: require(path.join(SRC, "services/ai/usageLedger")) };
};

const META = {
  provider: "gemini",
  model: "gemini-nano-banana-2.1",
  jobId: "64b000000000000000000001",
  variationIndex: 0,
  purpose: "design-artwork",
  requestedResolution: "2K",
  aspectRatio: "2:3",
  referenceImages: 3,
  imagesRequested: 1,
};

// ---- Gemini errors ---------------------------------------------------------
test("Gemini errors: 500 / 503 / network are told apart, with the HTTP status and Google's text kept", () => {
  const { describeError } = require(path.join(SRC, "services/ai/imageAi/geminiProvider"));
  const internal = describeError({ status: 500, message: '{"error":{"code":500,"message":"Internal error encountered.","status":"INTERNAL"}}' });
  assert.equal(internal.kind, "SERVER_ERROR");
  assert.equal(internal.httpStatus, 500);
  assert.match(internal.detail, /Internal error encountered/);
  assert.equal(internal.sent, true);

  const busy = describeError({ message: '{"error":{"code":503,"message":"The model is overloaded.","status":"UNAVAILABLE"}}' });
  assert.equal(busy.kind, "UNAVAILABLE");
  assert.equal(busy.httpStatus, 503);

  // Address lookup failed: nothing reached Google, nothing can be billed.
  const dns = describeError({ message: "fetch failed", cause: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND generativelanguage.googleapis.com" } });
  assert.equal(dns.kind, "NETWORK");
  assert.equal(dns.sent, false);
  // A connection lost mid-request may have been received (and billed).
  const reset = describeError({ message: "fetch failed", cause: { code: "ECONNRESET", message: "read ECONNRESET" } });
  assert.equal(reset.kind, "NETWORK");
  assert.equal(reset.sent, true);

  assert.equal(describeError({ name: "AbortError", message: "This operation was aborted" }).kind, "TIMEOUT");
  // Never a key in the stored text.
  const leaked = describeError({ status: 400, message: "bad request key=AIzaSyA1234567890abcdefghij" });
  assert.doesNotMatch(leaked.detail, /AIza/);
});

test("Gemini SDK: every request is sent exactly once (no SDK retries) and aborted at the app's timeout", async () => {
  const fakeSdkPath = require.resolve("@google/genai");
  const saved = require.cache[fakeSdkPath];
  let clientOptions = null;
  let sends = 0;
  const m = new Module(fakeSdkPath);
  m.loaded = true;
  m.exports = {
    GoogleGenAI: class {
      constructor(opts) {
        clientOptions = opts;
        this.models = {
          generateContent: async () => {
            sends += 1;
            throw Object.assign(new Error('{"error":{"code":500,"message":"Internal error encountered."}}'), { status: 500 });
          },
        };
      }
    },
  };
  require.cache[fakeSdkPath] = m;
  const env = { ...process.env };
  Object.assign(process.env, { AI_IMAGE_PROVIDER: "gemini", GEMINI_API_KEY: "test-key-not-real-1234567890" });
  try {
    for (const id of Object.keys(require.cache)) if (id.startsWith(SRC)) delete require.cache[id];
    const gemini = require(path.join(SRC, "services/ai/imageAi/geminiProvider"));
    const config = require(path.join(SRC, "config"));
    await quiet(() =>
      assert.rejects(gemini.editImage({ prompt: "p", images: [] }), (e) => e.kind === "SERVER_ERROR" && e.httpStatus === 500),
    );
    assert.equal(sends, 1);
    assert.deepEqual(clientOptions.httpOptions.retryOptions, { attempts: 1 });
    assert.equal(clientOptions.httpOptions.timeout, config.AI_REQUEST_TIMEOUT_MS);
  } finally {
    process.env = env;
    if (saved) require.cache[fakeSdkPath] = saved;
    else delete require.cache[fakeSdkPath];
  }
});

// ---- usage ledger ------------------------------------------------------------
test("ledger: the request is on record (SENT) BEFORE it is sent, then completed", async () => {
  const { store, ledger } = loadLedger();
  let seenWhileSending = null;
  await quiet(() =>
    ledger.recordedRequest(async () => {
      seenWhileSending = { ...store[0] };
      return { images: [{ buffer: Buffer.from("x"), mimeType: "image/png" }], usage: null };
    }, META),
  );
  assert.equal(seenWhileSending.status, "SENT");
  // In flight it does not block other Generates as an "unknown cost".
  assert.equal(seenWhileSending.needsReconciliation, false);
  assert.equal(store.length, 1);
  assert.equal(store[0].status, "SUCCESS");
  // No usage from Google: the cost is UNKNOWN and flagged — never invented.
  assert.equal(store[0].costStatus, "UNKNOWN");
  assert.equal(store[0].totalInr, null);
  assert.equal(store[0].needsReconciliation, true);
});

test("ledger: a Google 5xx keeps the HTTP status and Google's text; cost UNKNOWN, not zero", async () => {
  const { store, ledger } = loadLedger();
  const { describeError } = require(path.join(SRC, "services/ai/imageAi/geminiProvider"));
  const err = describeError({ status: 503, message: '{"error":{"code":503,"message":"The model is overloaded."}}' });
  await quiet(() => assert.rejects(ledger.recordedRequest(async () => { throw err; }, META)));
  assert.equal(store[0].status, "FAILED");
  assert.equal(store[0].errorKind, "UNAVAILABLE");
  assert.equal(store[0].errorStatus, 503);
  assert.match(store[0].errorDetail, /overloaded/);
  assert.equal(store[0].costStatus, "UNKNOWN");
  assert.equal(store[0].totalInr, null);
  assert.equal(store[0].needsReconciliation, true);
});

test("ledger: a request that never reached Google (address lookup failed) is NOT_SENT and costs nothing", async () => {
  const { store, ledger } = loadLedger();
  const { describeError } = require(path.join(SRC, "services/ai/imageAi/geminiProvider"));
  const err = describeError({ message: "fetch failed", cause: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND x" } });
  await quiet(() => assert.rejects(ledger.recordedRequest(async () => { throw err; }, META)));
  assert.equal(store[0].status, "NOT_SENT");
  assert.equal(store[0].costStatus, "NONE");
  assert.equal(store[0].needsReconciliation, false);
});

test("ledger: if the usage log cannot be written first, the paid request is NOT sent", async () => {
  const { fail, ledger } = loadLedger();
  fail.create = true;
  let sent = 0;
  await quiet(() =>
    assert.rejects(
      ledger.recordedRequest(async () => {
        sent += 1;
        return { images: [], usage: null };
      }, META),
      (e) => e.kind === "LEDGER_UNAVAILABLE" && e.sent === false && e.code === "AI_PROVIDER_ERROR",
    ),
  );
  assert.equal(sent, 0);
});

test("ledger: a result that cannot be saved (database lost) is kept on disk and written later", async () => {
  const { store, fail, ledger } = loadLedger();
  const file = ledger.PENDING_FILE;
  const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (before && before.trim()) return; // never touch real pending results
  try {
    fail.update = true;
    const USAGE = { promptTokenCount: 100, candidatesTokenCount: 1680, candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1680 }] };
    await quiet(() => ledger.recordedRequest(async () => ({ images: [{ buffer: Buffer.from("x"), mimeType: "image/png" }], usage: USAGE }), META));
    assert.equal(store[0].status, "SENT"); // the final update was lost …
    assert.match(fs.readFileSync(file, "utf8"), /"status":"SUCCESS"/); // … but kept
    fail.update = false;
    assert.equal(await quiet(() => ledger.flushPendingUsage()), 1);
    assert.equal(store[0].status, "SUCCESS");
    assert.equal(store[0].usage.imageOutputTokens, 1680);
    assert.equal(fs.readFileSync(file, "utf8"), "");
  } finally {
    if (before === null) fs.rmSync(file, { force: true });
  }
});

test("ledger: unfinished requests are closed as INTERRUPTED (cost UNKNOWN, flagged), never re-sent", async () => {
  const { updateManyCalls, ledger } = loadLedger();
  const own = /^host:(?!1:1$)/;
  await ledger.closeInterruptedRequests({ ownEarlierRuns: own, olderThanMs: 60000 });
  const [{ q, upd }] = updateManyCalls;
  assert.equal(q.status, "SENT");
  assert.equal(q.$or[0].runnerId, own);
  assert.ok(q.$or[1].createdAt.$lt instanceof Date);
  assert.equal(upd.$set.status, "INTERRUPTED");
  assert.equal(upd.$set.costStatus, "UNKNOWN");
  assert.equal(upd.$set.needsReconciliation, true);
  assert.equal(await ledger.closeInterruptedRequests({}), 0); // no filter = nothing touched
});

// ---- job recovery --------------------------------------------------------------
const loadRunner = () => {
  const { store } = loadLedger();
  const AiCalendarJob = require(path.join(SRC, "models/AiCalendarJob"));
  const jobs = [];
  const updates = [];
  AiCalendarJob.find = async (q) => {
    const statuses = q.status.$in;
    return jobs.filter((j) => statuses.includes(j.status) && j.matches(q));
  };
  AiCalendarJob.updateOne = async (q, upd) => {
    updates.push({ q, upd });
    return {};
  };
  const runner = require(path.join(SRC, "services/ai/calendarJobRunner"));
  const { RUNNER_ID, HOST, SERVER } = require(path.join(SRC, "services/ai/runnerId"));
  return { runner, jobs, updates, store, RUNNER_ID, HOST, SERVER };
};

test("recovery: only jobs of this server's EARLIER run or stale jobs are closed; never re-run", async () => {
  const ctx = loadRunner();
  const { HOST, SERVER, RUNNER_ID } = ctx;
  const ownOld = `${SERVER}:999:1`;
  // Minimal matcher for the recovery filter ($or of runnerId regex / stale heartbeat).
  const job = (id, runnerId, heartbeatAt, variations) => ({
    _id: id,
    status: "RUNNING",
    runnerId,
    heartbeatAt,
    updatedAt: heartbeatAt || new Date(),
    variations,
    matches(q) {
      return q.$or.some(
        (c) =>
          (c.runnerId && c.runnerId.test(this.runnerId || "")) ||
          (c.heartbeatAt?.$lt && this.heartbeatAt && this.heartbeatAt < c.heartbeatAt.$lt) ||
          (c.heartbeatAt === null && !this.heartbeatAt && c.updatedAt?.$lt && this.updatedAt < c.updatedAt.$lt),
      );
    },
  });
  ctx.jobs.push(
    job("restarted", ownOld, new Date(), [{ status: "RUNNING" }, { status: "DONE" }]),
    job("other-live-server", "other-pc:1:1", new Date(), [{ status: "RUNNING" }]),
    job("this-process", RUNNER_ID, new Date(), [{ status: "RUNNING" }]),
    // Another server on the same computer (another port), still running.
    job("same-pc-other-port", `${HOST}:59999:1:1`, new Date(), [{ status: "RUNNING" }]),
    job("stale-elsewhere", "other-pc:2:2", new Date(Date.now() - 60 * 60 * 1000), [{ status: "PENDING" }]),
  );
  await quiet(() => ctx.runner.recoverInterruptedJobs());
  const closed = ctx.updates.map((u) => u.q._id);
  assert.deepEqual(closed.sort(), ["restarted", "stale-elsewhere"]);
  const restarted = ctx.updates.find((u) => u.q._id === "restarted").upd.$set;
  assert.equal(restarted.status, "PARTIAL"); // its finished design is kept
  assert.equal(restarted["variations.0.status"], "FAILED");
  assert.equal(restarted["variations.0.errorKind"], "INTERRUPTED");
  assert.equal(restarted["variations.1.status"], undefined);
  const stale = ctx.updates.find((u) => u.q._id === "stale-elsewhere").upd.$set;
  assert.equal(stale.status, "FAILED");
  assert.match(stale.error, /Nothing is retried automatically/);
  // Only if still unfinished (the runner may just have finished it).
  assert.deepEqual(ctx.updates[0].q.status, { $in: ["QUEUED", "RUNNING"] });
});
