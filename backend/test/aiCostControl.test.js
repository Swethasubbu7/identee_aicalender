// Cost control for AI Generate, tested with mocks only: no database, no
// network, no provider. The Gemini SDK is replaced by a fake module and
// global fetch throws, so a real request cannot happen from these tests.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const Module = require("module");

const SRC = path.join(__dirname, "..", "src");

// ---- isolation ------------------------------------------------------------
const realFetch = global.fetch;
let networkCalls = 0;
global.fetch = async () => {
  networkCalls += 1;
  throw new Error("Network is blocked in tests");
};
test.after(() => {
  global.fetch = realFetch;
});

// Fake @google/genai: records every generateContent call.
let fakeReply = null;
const sdkCalls = [];
const fakeSdkPath = require.resolve("@google/genai");
const installFakeSdk = () => {
  const m = new Module(fakeSdkPath);
  m.loaded = true;
  m.exports = {
    GoogleGenAI: class {
      constructor() {
        this.models = {
          generateContent: async (request) => {
            sdkCalls.push(request);
            return typeof fakeReply === "function" ? fakeReply(request) : fakeReply;
          },
        };
      }
    },
  };
  require.cache[fakeSdkPath] = m;
};

const BASE_ENV = {
  AI_IMAGE_PROVIDER: "none",
  GEMINI_API_KEY: "None",
  GEMINI_IMAGE_MODEL: "gemini-3-pro-image",
  AI_INR_PER_USD: "96",
  AI_GST_RATE: "0.18",
  AI_BUDGET_INR: "1000",
  AI_DAILY_LIMIT_INR: "400",
  AI_MAX_COST_PER_GENERATE_INR: "200",
  AI_MAX_UNKNOWN_COST_REQUESTS: "0",
};
const ENV_KEYS = Object.keys(BASE_ENV);

let savedEnv = null;
test.afterEach(() => {
  if (savedEnv) process.env = savedEnv;
  savedEnv = null;
});

// Fresh copies of the modules with the given environment and an in-memory
// usage ledger in place of MongoDB.
const load = (env = {}) => {
  savedEnv = { ...process.env };
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, BASE_ENV, env);
  for (const id of Object.keys(require.cache)) if (id.startsWith(SRC)) delete require.cache[id];
  installFakeSdk();
  const dotenv = require("dotenv");
  const original = dotenv.config;
  dotenv.config = () => ({ parsed: {} });
  try {
    const mongoose = require("mongoose");
    for (const name of ["AiUsageRecord", "AiCalendarJob"]) if (mongoose.models[name]) mongoose.deleteModel(name);
    const AiUsageRecord = require(path.join(SRC, "models/AiUsageRecord"));
    const AiCalendarJob = require(path.join(SRC, "models/AiCalendarJob"));
    const store = [];
    const running = { value: false };
    AiUsageRecord.create = async (r) => {
      store.push({ ...r, createdAt: new Date() });
      return r;
    };
    AiUsageRecord.countDocuments = async () => store.filter((r) => r.needsReconciliation && !r.reconciledAt).length;
    AiUsageRecord.aggregate = async () => {
      if (!store.length) return [];
      return [
        {
          totalInr: store.reduce((a, r) => a + (r.totalInr || 0), 0),
          requests: store.filter((r) => r.status !== "BLOCKED").length,
          images: store.reduce((a, r) => a + (r.imagesReturned || 0), 0),
          unknown: store.filter((r) => r.costStatus === "UNKNOWN").length,
        },
      ];
    };
    AiUsageRecord.find = (q = {}) => {
      let rows = store.filter((r) => (!q.status || r.status === q.status) && (!q.model || r.model === q.model));
      if (q.totalInr) rows = rows.filter((r) => r.totalInr != null);
      if (q.jobId) rows = rows.filter((r) => String(r.jobId) === String(q.jobId));
      const chain = {
        sort: () => chain,
        limit: (n) => ((rows = rows.slice(-n).reverse()), chain),
        lean: async () => rows,
        then: (ok, fail) => Promise.resolve(rows).then(ok, fail),
      };
      return chain;
    };
    AiCalendarJob.exists = async () => (running.value ? { _id: "job" } : null);
    return {
      store,
      running,
      config: require(path.join(SRC, "config")),
      pricing: require(path.join(SRC, "services/ai/pricing")),
      ledger: require(path.join(SRC, "services/ai/usageLedger")),
      guard: require(path.join(SRC, "services/ai/spendGuard")),
      imageAi: require(path.join(SRC, "services/ai/imageAi")),
      gemini: require(path.join(SRC, "services/ai/imageAi/geminiProvider")),
      pickLayouts: require(path.join(SRC, "services/ai/pickLayouts")),
      recipes: require(path.join(SRC, "constants/designRecipes")),
    };
  } finally {
    dotenv.config = original;
  }
};

// Console output is captured (and checked) instead of printed.
const captureConsole = async (fn) => {
  const lines = [];
  const { log, warn, error } = console;
  console.log = (...a) => lines.push(a.join(" "));
  console.warn = (...a) => lines.push(a.join(" "));
  console.error = (...a) => lines.push(a.join(" "));
  try {
    await fn();
  } finally {
    Object.assign(console, { log, warn, error });
  }
  return lines.join("\n");
};

// One realistic usage block (shape of Gemini usageMetadata).
const USAGE = {
  promptTokenCount: 1800,
  promptTokensDetails: [
    { modality: "TEXT", tokenCount: 300 },
    { modality: "IMAGE", tokenCount: 1500 },
  ],
  candidatesTokenCount: 2240,
  candidatesTokensDetails: [
    { modality: "IMAGE", tokenCount: 1120 },
    { modality: "TEXT", tokenCount: 1120 },
  ],
  thoughtsTokenCount: 400,
  totalTokenCount: 4440,
};
const META = {
  provider: "gemini",
  model: "gemini-3-pro-image",
  jobId: "64b000000000000000000001",
  variationIndex: 0,
  purpose: "design",
  requestedResolution: "2K",
  aspectRatio: "3:4",
  referenceImages: 3,
  imagesRequested: 1,
};
const png = (n = 1) => ({ buffer: Buffer.from(`img${n}`), mimeType: "image/png" });

// ---- pricing --------------------------------------------------------------
test("cost is calculated from the provider's usage metadata", () => {
  const { pricing } = load();
  const tokens = pricing.tokensFromUsage(USAGE);
  assert.deepEqual(
    { ...tokens },
    {
      inputTokens: 1800,
      inputImageTokens: 1500,
      inputTextTokens: 300,
      cachedTokens: 0,
      imageOutputTokens: 1120,
      textOutputTokens: 1120,
      thinkingTokens: 400,
      totalTokens: 4440,
    },
  );
  const cost = pricing.estimateCost("gemini-3-pro-image", tokens);
  // (1800×2 + 1120×120 + (1120+400)×12) / 1e6 = 0.15624 USD
  assert.equal(cost.status, "ESTIMATED");
  assert.equal(cost.usd, 0.15624);
  assert.equal(cost.inr, 15); // × ₹96
  assert.equal(cost.gstInr, 2.7);
  assert.equal(cost.totalInr, 17.7);
  assert.equal(cost.pricingVersion, "google-billing-2026-10-09");
  assert.equal(cost.inrPerUsd, 96);
});

test("missing usage or an unknown model gives UNKNOWN cost, never zero", () => {
  const { pricing } = load();
  assert.equal(pricing.tokensFromUsage(null), null);
  assert.equal(pricing.estimateCost("gemini-3-pro-image", null).status, "UNKNOWN");
  assert.equal(pricing.estimateCost("gemini-3-pro-image", null).totalInr, undefined);
  assert.equal(pricing.estimateCost("some-new-model", pricing.tokensFromUsage(USAGE)).status, "UNKNOWN");
  // gemini-3.1-flash-image: official page rates ($0.5 / $3 / $60 per 1M).
  const flash = pricing.estimateCost("gemini-3.1-flash-image", pricing.tokensFromUsage(USAGE));
  assert.equal(flash.status, "ESTIMATED");
  assert.equal(flash.usd, 0.07266); // (1800×0.5 + 1120×60 + 1520×3) / 1e6
});

// ---- ledger ---------------------------------------------------------------
test("a successful request is recorded with tokens, images and cost", async () => {
  const { ledger, store } = load();
  let out;
  const logs = await captureConsole(async () => {
    out = await ledger.recordedRequest(async () => ({ images: [png()], thoughtImages: 2, usage: USAGE, model: "gemini-3-pro-image" }), META);
  });
  assert.equal(store.length, 1);
  const r = store[0];
  assert.equal(r.status, "SUCCESS");
  assert.equal(r.imagesReturned, 1);
  assert.equal(r.thoughtImagesReturned, 2);
  assert.equal(r.usage.imageOutputTokens, 1120);
  assert.deepEqual(r.usage.raw, USAGE);
  assert.equal(r.totalInr, 17.7);
  assert.equal(r.needsReconciliation, false);
  assert.equal(out.requestId, r.requestId);
  assert.match(logs, /\[AI REQUEST\]/);
  assert.match(logs, /Images requested: 1 {2}Images returned: 1 {2}\(\+2 interim\)/);
  assert.match(logs, /Estimated cost: ₹15\.00 \+ GST ₹2\.70 = ₹17\.70/);
});

test("a timeout is recorded as TIMEOUT with UNKNOWN cost and flagged", async () => {
  const { ledger, store } = load();
  const err = Object.assign(new Error("slow"), { kind: "TIMEOUT", code: "AI_PROVIDER_ERROR" });
  const logs = await captureConsole(async () => {
    await assert.rejects(ledger.recordedRequest(async () => { throw err; }, META), err);
  });
  const r = store[0];
  assert.equal(r.status, "TIMEOUT");
  assert.equal(r.costStatus, "UNKNOWN");
  assert.equal(r.totalInr, null);
  assert.equal(r.needsReconciliation, true);
  assert.equal(r.imagesReturned, null);
  assert.match(logs, /WARNING: cost unknown/);
});

test("a failure that carried usage is still costed", async () => {
  const { ledger, store } = load();
  const err = Object.assign(new Error("no image"), { kind: "NO_IMAGE", usage: USAGE });
  await captureConsole(() => assert.rejects(ledger.recordedRequest(async () => { throw err; }, META)));
  assert.equal(store[0].status, "FAILED");
  assert.equal(store[0].costStatus, "ESTIMATED");
  assert.equal(store[0].totalInr, 17.7);
});

test("a request blocked by the master switch is BLOCKED and costs nothing", async () => {
  const { ledger, store } = load();
  const err = Object.assign(new Error("off"), { kind: "DISABLED" });
  await captureConsole(() => assert.rejects(ledger.recordedRequest(async () => { throw err; }, META)));
  assert.equal(store[0].status, "BLOCKED");
  assert.equal(store[0].costStatus, "NONE");
  assert.equal(store[0].needsReconciliation, false);
});

test("extra returned images are all recorded and a warning is printed", async () => {
  const { ledger, store } = load();
  let out;
  const logs = await captureConsole(async () => {
    out = await ledger.recordedRequest(async () => ({ images: [png(1), png(2), png(3)], usage: USAGE }), META);
  });
  assert.equal(out.images.length, 3);
  assert.equal(store[0].imagesReturned, 3);
  assert.match(logs, /\[AI WARNING\].*returned 3 images for 1 requested/);
});

test("records never contain API keys or customer image data", async () => {
  const { ledger, store } = load({ GEMINI_API_KEY: "AIzaSySecretSecretSecret" });
  const logs = await captureConsole(() =>
    ledger.recordedRequest(async () => ({ images: [png()], usage: USAGE }), META),
  );
  const saved = JSON.stringify(store);
  assert.doesNotMatch(saved + logs, /AIzaSySecret/);
  assert.doesNotMatch(saved, /img1|aW1nMQ/); // image bytes / base64
});

test("summary: today, month, cumulative, images and unresolved unknowns", async () => {
  const { ledger, store } = load();
  await captureConsole(async () => {
    await ledger.recordedRequest(async () => ({ images: [png()], usage: USAGE }), META);
    await ledger.recordedRequest(async () => ({ images: [png()], usage: USAGE }), { ...META, variationIndex: 1 });
    await ledger
      .recordedRequest(async () => { throw Object.assign(new Error("t"), { kind: "TIMEOUT" }); }, META)
      .catch(() => {});
  });
  assert.equal(store.length, 3);
  const s = await ledger.usageSummary();
  assert.equal(s.cumulative.estimatedInr, 35.4);
  assert.equal(s.cumulative.requests, 3);
  assert.equal(s.cumulative.imagesReturned, 2);
  assert.equal(s.cumulative.unknownCostRequests, 1);
  assert.equal(s.unresolvedUnknownCostRequests, 1);
  assert.equal(s.budget.startingBudgetInr, 1000);
  assert.equal(s.budget.estimatedRemainingInr, 964.6);
  assert.equal(s.budget.dailyRemainingInr, 364.6);
  assert.match(s.budget.note, /Google AI Studio/);
});

test("generation summary is printed", async () => {
  const { ledger } = load();
  const logs = await captureConsole(async () => {
    await ledger.recordedRequest(async () => ({ images: [png()], usage: USAGE }), META);
    await ledger.recordedRequest(async () => ({ images: [png()], usage: USAGE }), { ...META, variationIndex: 1 });
    await ledger.logGenerationSummary(META.jobId, 2);
  });
  assert.match(logs, /\[GENERATION SUMMARY\]/);
  assert.match(logs, /Designs requested: 2/);
  assert.match(logs, /Provider requests: 2 {2}Successful designs: 2/);
  assert.match(logs, /Estimated total cost: ₹35\.40/);
  assert.match(logs, /Application-estimated remaining: ₹964\.6/);
});

// ---- estimate + limits ----------------------------------------------------
test("estimate uses list price × billed overhead until measurements exist, then the highest measured cost", async () => {
  const { guard, ledger } = load();
  let e = await guard.estimateGenerate(2);
  // gemini-3-pro-image 2K: $0.134 × 5.1897 × ₹96 × 1.18 = ₹78.78 (= the bill average)
  assert.equal(e.status, "LIST_PRICE_ESTIMATE");
  assert.equal(e.perRequestInr, 78.78);
  assert.equal(e.requests, 2);
  assert.equal(e.totalInr, 157.56);
  await captureConsole(() => ledger.recordedRequest(async () => ({ images: [png()], usage: USAGE }), META));
  e = await guard.estimateGenerate(2);
  assert.equal(e.status, "MEASURED");
  assert.equal(e.totalInr, 35.4);
});

test("cheaper model: estimate from its official list price", async () => {
  const { guard } = load({ GEMINI_IMAGE_MODEL: "gemini-3.1-flash-image" });
  const e = await guard.estimateGenerate(2);
  // $0.101 × 5.1897 × ₹96 × 1.18 = ₹59.38 per request
  assert.equal(e.status, "LIST_PRICE_ESTIMATE");
  assert.equal(e.perRequestInr, 59.38);
  assert.equal(e.totalInr, 118.76);
});

test("estimate is UNKNOWN for a model or resolution without a price", async () => {
  const { guard } = load({ GEMINI_IMAGE_MODEL: "some-future-image-model" });
  const e = await guard.estimateGenerate(2);
  assert.equal(e.status, "UNKNOWN");
  assert.equal(e.totalInr, null);
  const { reasons } = await guard.checkLimits({ estimateInr: null, aiEnabled: true });
  assert.ok(reasons.some((r) => /unknown/i.test(r)));
});

test("limits: allowed inside budget, daily and per-Generate limits", async () => {
  const { guard } = load();
  const r = await guard.checkLimits({ estimateInr: 157.56, userId: "u1", aiEnabled: true });
  assert.deepEqual(r.reasons, []);
  assert.equal(r.allowed, true);
});

test("limits: AI off always refuses", async () => {
  const { guard } = load();
  const r = await guard.checkLimits({ estimateInr: 10, aiEnabled: false });
  assert.equal(r.allowed, false);
  assert.match(r.reasons[0], /switched off/);
});

test("limits: missing budget / daily / max settings refuse Generate", async () => {
  const { guard } = load({ AI_BUDGET_INR: "", AI_DAILY_LIMIT_INR: "", AI_MAX_COST_PER_GENERATE_INR: "" });
  const r = await guard.checkLimits({ estimateInr: 10, aiEnabled: true });
  assert.equal(r.allowed, false);
  assert.equal(r.reasons.length, 3);
});

test("limits: per-Generate maximum, daily limit and remaining budget", async () => {
  let { guard } = load({ AI_MAX_COST_PER_GENERATE_INR: "100" });
  let r = await guard.checkLimits({ estimateInr: 157.56, aiEnabled: true });
  assert.ok(r.reasons.some((x) => /maximum per Generate/.test(x)));

  ({ guard } = load({ AI_DAILY_LIMIT_INR: "150" }));
  r = await guard.checkLimits({ estimateInr: 157.56, aiEnabled: true });
  assert.ok(r.reasons.some((x) => /Today's limit/.test(x)));

  ({ guard } = load({ AI_BUDGET_INR: "100" }));
  r = await guard.checkLimits({ estimateInr: 157.56, aiEnabled: true });
  assert.ok(r.reasons.some((x) => /remaining budget/.test(x)));
});

test("limits: spending already recorded reduces what is left", async () => {
  const { guard, ledger } = load({ AI_BUDGET_INR: "50" });
  await captureConsole(async () => {
    await ledger.recordedRequest(async () => ({ images: [png()], usage: USAGE }), META);
    await ledger.recordedRequest(async () => ({ images: [png()], usage: USAGE }), META);
  });
  // ₹50 − 2 × ₹17.70 = ₹14.60 left; a 2-design Generate (₹35.40) is refused.
  const r = await guard.checkLimits({ estimateInr: 35.4, aiEnabled: true });
  assert.ok(r.reasons.some((x) => /₹14\.6 is below/.test(x)));
});

test("limits: unresolved UNKNOWN-cost requests block Generate", async () => {
  const { guard, ledger } = load();
  await captureConsole(() =>
    ledger
      .recordedRequest(async () => { throw Object.assign(new Error("t"), { kind: "TIMEOUT" }); }, META)
      .catch(() => {}),
  );
  const r = await guard.checkLimits({ estimateInr: 20, aiEnabled: true });
  assert.ok(r.reasons.some((x) => /UNKNOWN cost/.test(x)));
});

test("limits: a second Generate while one is running is refused (duplicate protection)", async () => {
  const { guard, running } = load();
  running.value = true;
  const r = await guard.checkLimits({ estimateInr: 20, userId: "u1", aiEnabled: true });
  assert.ok(r.reasons.some((x) => /already running/.test(x)));
});

// ---- provider -------------------------------------------------------------
const b64 = (s) => Buffer.from(s).toString("base64");

test("provider asks for ONE image and returns every final image plus usage", async () => {
  const { gemini, config } = load({ AI_IMAGE_PROVIDER: "gemini", GEMINI_API_KEY: "AIzaSyFakeFakeFakeFake" });
  sdkCalls.length = 0;
  fakeReply = {
    modelVersion: "gemini-3-pro-image",
    usageMetadata: USAGE,
    candidates: [
      {
        content: {
          parts: [
            { inlineData: { data: b64("thought"), mimeType: "image/png" }, thought: true },
            { inlineData: { data: b64("a"), mimeType: "image/png" } },
            { inlineData: { data: b64("b"), mimeType: "image/png" } },
          ],
        },
      },
    ],
  };
  const out = await gemini.editImage({ prompt: "p", images: [png()], aspectRatio: "3:4" });
  assert.equal(sdkCalls.length, 1);
  assert.equal(sdkCalls[0].config.candidateCount, 1);
  assert.equal(sdkCalls[0].model, config.GEMINI_IMAGE_MODEL);
  assert.equal(out.images.length, 2);
  assert.equal(out.thoughtImages, 1);
  assert.deepEqual(out.usage, USAGE);
});

test("provider never retries a failed request", async () => {
  const { gemini } = load({ AI_IMAGE_PROVIDER: "gemini", GEMINI_API_KEY: "AIzaSyFakeFakeFakeFake" });
  sdkCalls.length = 0;
  fakeReply = () => {
    throw Object.assign(new Error("server error"), { status: 503 });
  };
  await captureConsole(() => assert.rejects(gemini.editImage({ prompt: "p", images: [] }), { code: "AI_PROVIDER_ERROR" }));
  assert.equal(sdkCalls.length, 1);
});

test("provider: no image returned still reports the usage for costing", async () => {
  const { gemini } = load({ AI_IMAGE_PROVIDER: "gemini", GEMINI_API_KEY: "AIzaSyFakeFakeFakeFake" });
  fakeReply = { usageMetadata: USAGE, candidates: [{ finishReason: "STOP", content: { parts: [{ text: "sorry" }] } }] };
  await assert.rejects(gemini.editImage({ prompt: "p", images: [] }), (e) => e.kind === "NO_IMAGE" && e.usage === USAGE);
});

test("AI off: provider refuses before the SDK is touched", async () => {
  for (const env of [
    { AI_IMAGE_PROVIDER: "none", GEMINI_API_KEY: "AIzaSyFakeFakeFakeFake" },
    { AI_IMAGE_PROVIDER: "None", GEMINI_API_KEY: "AIzaSyFakeFakeFakeFake" },
    { AI_IMAGE_PROVIDER: "", GEMINI_API_KEY: "AIzaSyFakeFakeFakeFake" },
    { AI_IMAGE_PROVIDER: "gemini", GEMINI_API_KEY: "None" },
    { AI_IMAGE_PROVIDER: "gemini", GEMINI_API_KEY: "" },
  ]) {
    const { gemini, imageAi } = load(env);
    sdkCalls.length = 0;
    assert.equal(imageAi.getImageAi().isConfigured(), false, JSON.stringify(env));
    await assert.rejects(gemini.editImage({ prompt: "p", images: [] }), { kind: "DISABLED" });
    assert.equal(sdkCalls.length, 0, JSON.stringify(env));
  }
});

test("retired /api/ai-generate endpoint always refuses", () => {
  load({ AI_IMAGE_PROVIDER: "gemini", GEMINI_API_KEY: "AIzaSyFakeFakeFakeFake" });
  const { generateDesigns } = require(path.join(SRC, "controllers/aiGeneration.controller"));
  let status = null;
  const res = { status: (s) => ((status = s), res), json: () => res };
  sdkCalls.length = 0;
  generateDesigns({ body: {} }, res);
  assert.equal(status, 410);
  assert.equal(sdkCalls.length, 0);
});

// ---- two designs from the same layout -------------------------------------
test("Generate plans exactly 2 designs of the SAME selected layout", () => {
  const { pickLayouts, recipes } = load();
  const selected = { _id: "layout-1" };
  const picks = pickLayouts.pickLayoutsForVariations(selected);
  assert.equal(pickLayouts.VARIATION_COUNT, 2);
  assert.equal(picks.length, 2);
  assert.ok(picks.every((p) => p.variant === selected));
  const r = recipes.pickRecipes("", 2);
  assert.equal(r.length, 2);
  assert.notEqual(r[0].id, r[1].id);
  assert.notEqual(r[0].fonts.tamil, r[1].fonts.tamil);
  assert.notEqual(r[0].fonts.english, r[1].fonts.english);
});

test("the first design follows colours named in the prompt", () => {
  const { recipes } = load();
  assert.equal(recipes.pickRecipes("royal maroon with gold", 2)[0].id, "royal-maroon");
  assert.equal(recipes.pickRecipes("peacock blue theme", 2)[0].id, "peacock-blue");
  assert.equal(recipes.pickRecipes("lotus", 2)[0].id, "classic");
  assert.equal(recipes.pickRecipes("அம்மன் சிவப்பு", 2).length, 2); // Tamil prompt: default recipes
});

test("no network request was made by any test", () => {
  assert.equal(networkCalls, 0);
});
