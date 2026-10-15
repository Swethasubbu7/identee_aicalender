// Application-side spending controls for AI Generate (not a provider-side
// billing cap — Google can still bill beyond these numbers if requests are
// made outside this app or a limit is set too high).
//
// estimateGenerate(): expected cost of one Generate (one request per design).
//   Basis, in order of preference:
//   1. MEASURED — highest recorded cost of recent successful requests of the
//      configured model in this app's usage ledger;
//   2. OFFICIAL PRICE × BILLED OVERHEAD — the model's official list price per
//      output image, multiplied by the overhead this account was actually
//      billed: on the Oct 2026 Google bill a gemini-3-pro-image request cost
//      5.19× its list image price (thinking, interim images, inputs). Used
//      until the first requests of the model are measured.
//   3. UNKNOWN — no price for this model/resolution: Generate is refused.
// checkLimits(): every reason Generate must be refused right now.
const config = require("../../config");
const AiUsageRecord = require("../../models/AiUsageRecord");
const AiCalendarJob = require("../../models/AiCalendarJob");
const { usageSummary } = require("./usageLedger");
const { pricingFor } = require("./pricing");

const MEASURED_SAMPLE = 20;
// Google bill 1–9 Oct 2026: ₹2,136.31 before GST for ~32 gemini-3-pro-image
// requests at 2K, billed at ₹96/USD → $0.6954 per request; list price $0.134.
const BILLED_OVERHEAD = {
  factor: Math.round((2136.31 / 32 / 96 / 0.134) * 10000) / 10000, // 5.1897
  source: "Google Cloud Billing, 1–9 Oct 2026 (gemini-3-pro-image, 2K): billed 5.19× the list image price per request",
};

const round2 = (v) => Math.round(v * 100) / 100;

// Per-request amounts: USD, INR before GST, GST, INR incl. GST.
const breakdown = (usd) => {
  const inr = usd * config.AI_INR_PER_USD;
  return {
    perRequestUsd: Math.round(usd * 10000) / 10000,
    perRequestInrBeforeGst: round2(inr),
    perRequestGstInr: round2(inr * config.AI_GST_RATE),
    perRequestInr: round2(inr * (1 + config.AI_GST_RATE)),
  };
};

const listPriceEstimate = (model, resolution) => {
  const usd = pricingFor(model)?.usdPerImage?.[resolution];
  if (usd == null) return null;
  return {
    ...breakdown(usd * BILLED_OVERHEAD.factor),
    basis:
      `Official list price $${usd} per ${resolution} image × ${BILLED_OVERHEAD.factor} billed overhead × ₹${config.AI_INR_PER_USD}/USD + ${Math.round(config.AI_GST_RATE * 100)}% GST. ` +
      `Not a measurement — replaced by measured costs after the first recorded requests. (${BILLED_OVERHEAD.source})`,
  };
};

const estimateGenerate = async (designCount) => {
  const model = config.GEMINI_IMAGE_MODEL;
  const resolution = config.GEMINI_IMAGE_SIZE;
  const recent = await AiUsageRecord.find({ model, status: "SUCCESS", totalInr: { $ne: null } })
    .sort({ createdAt: -1 })
    .limit(MEASURED_SAMPLE)
    .lean();
  let amounts = null;
  let basis = null;
  let status = "UNKNOWN";
  if (recent.length) {
    // Highest recent cost, not the average: estimates should not undershoot.
    const top = recent.reduce((a, r) => (r.totalInr > a.totalInr ? r : a));
    amounts = top.costUsd != null ? breakdown(top.costUsd) : { perRequestInr: top.totalInr };
    basis = `Measured: highest cost of the last ${recent.length} recorded request(s) of ${model} in this app.`;
    status = "MEASURED";
  } else {
    const list = listPriceEstimate(model, resolution);
    if (list) ({ basis, ...amounts } = list), (status = "LIST_PRICE_ESTIMATE");
  }
  const requests = designCount * config.AI_IMAGES_PER_REQUEST;
  const perRequestInr = amounts?.perRequestInr ?? null;
  const times = (v, d = 2) => (v == null ? null : Math.round(v * requests * 10 ** d) / 10 ** d);
  return {
    model,
    resolution,
    requests,
    perRequestInr,
    perRequestUsd: amounts?.perRequestUsd ?? null,
    perRequestInrBeforeGst: amounts?.perRequestInrBeforeGst ?? null,
    perRequestGstInr: amounts?.perRequestGstInr ?? null,
    totalUsd: times(amounts?.perRequestUsd, 4),
    totalInrBeforeGst: times(amounts?.perRequestInrBeforeGst),
    totalGstInr: times(amounts?.perRequestGstInr),
    inrPerUsd: config.AI_INR_PER_USD,
    gstRate: config.AI_GST_RATE,
    totalInr: perRequestInr == null ? null : round2(perRequestInr * requests),
    status,
    basis: basis || `No price for ${model} at ${resolution} — Generate stays blocked until a price is added (services/ai/pricing.js).`,
  };
};

/** Reasons why an AI Generate must not run now (empty = allowed). */
const checkLimits = async ({ estimateInr, userId, aiEnabled }) => {
  const reasons = [];
  if (!aiEnabled) reasons.push("AI is switched off on this server (AI_IMAGE_PROVIDER).");
  if (estimateInr == null) reasons.push("The cost of a Generate is unknown for this model.");
  const summary = await usageSummary();
  const b = summary.budget;
  if (!config.AI_BUDGET_INR) reasons.push("No application budget is set (AI_BUDGET_INR).");
  else if (estimateInr != null && b.estimatedRemainingInr < estimateInr) {
    reasons.push(`Application-estimated remaining budget ₹${b.estimatedRemainingInr} is below this Generate (₹${estimateInr}).`);
  }
  if (!config.AI_DAILY_LIMIT_INR) reasons.push("No daily spending limit is set (AI_DAILY_LIMIT_INR).");
  else if (estimateInr != null && b.dailyRemainingInr < estimateInr) {
    reasons.push(`Today's limit would be exceeded (₹${summary.today.estimatedInr} spent of ₹${config.AI_DAILY_LIMIT_INR}).`);
  }
  if (!config.AI_MAX_COST_PER_GENERATE_INR) reasons.push("No maximum cost per Generate is set (AI_MAX_COST_PER_GENERATE_INR).");
  else if (estimateInr != null && estimateInr > config.AI_MAX_COST_PER_GENERATE_INR) {
    reasons.push(`This Generate (₹${estimateInr}) is above the maximum per Generate (₹${config.AI_MAX_COST_PER_GENERATE_INR}).`);
  }
  if (summary.unresolvedUnknownCostRequests > config.AI_MAX_UNKNOWN_COST_REQUESTS) {
    reasons.push(
      `${summary.unresolvedUnknownCostRequests} earlier request(s) have an UNKNOWN cost — reconcile them with Google Cloud Billing first.`,
    );
  }
  if (userId) {
    const running = await AiCalendarJob.exists({ userId, mode: "ai", status: { $in: ["QUEUED", "RUNNING"] } });
    if (running) reasons.push("A Generate is already running — wait for it to finish.");
  }
  return { allowed: reasons.length === 0, reasons, summary };
};

/** Estimated cost of `count` single-image requests at `resolution` (e.g. "4K"). */
const estimateImages = (count, resolution) => {
  const model = config.GEMINI_IMAGE_MODEL;
  const list = listPriceEstimate(model, resolution);
  return {
    model,
    resolution,
    requests: count,
    perRequestInr: list?.perRequestInr ?? null,
    perRequestUsd: list?.perRequestUsd ?? null,
    totalUsd: list ? Math.round(list.perRequestUsd * count * 10000) / 10000 : null,
    totalInrBeforeGst: list ? round2(list.perRequestInrBeforeGst * count) : null,
    totalGstInr: list ? round2(list.perRequestGstInr * count) : null,
    inrPerUsd: config.AI_INR_PER_USD,
    gstRate: config.AI_GST_RATE,
    totalInr: list ? round2(list.perRequestInr * count) : null,
    status: list ? "LIST_PRICE_ESTIMATE" : "UNKNOWN",
    basis: list?.basis || `No price for ${model} at ${resolution}.`,
  };
};

module.exports = { estimateGenerate, estimateImages, checkLimits, BILLED_OVERHEAD };
