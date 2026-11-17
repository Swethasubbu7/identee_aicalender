// Every AI provider request goes through recordedRequest(): it times the
// call, writes a persistent AiUsageRecord (success, failure or timeout),
// estimates the cost from the provider's usage metadata and prints a console
// line. Spending totals and the application budget are read from the same
// records, so they survive restarts.
//
// These are APPLICATION ESTIMATES. Google's real balance and invoice are in
// Google AI Studio / Cloud Billing; this module never claims to know them.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const config = require("../../config");
const { RUNNER_ID } = require("./runnerId");
const AiUsageRecord = require("../../models/AiUsageRecord");
const { tokensFromUsage, estimateCost } = require("./pricing");

const inr = (v) => (v == null ? "UNKNOWN" : `₹${Number(v).toFixed(2)}`);
const n = (v) => (v == null ? "n/a" : String(v));

const logRequest = (r) => {
  console.log(
    [
      "[AI REQUEST]",
      `Request ID: ${r.requestId}`,
      `Job: ${r.jobId || "-"}  Design: ${r.variationIndex == null ? "-" : r.variationIndex + 1}  Purpose: ${r.purpose}`,
      `Provider / model: ${r.provider} / ${r.model}`,
      `Resolution: ${n(r.requestedResolution)}  Aspect: ${n(r.aspectRatio)}  Reference images: ${r.referenceImages}`,
      `Images requested: ${r.imagesRequested}  Images returned: ${n(r.imagesReturned)}${r.thoughtImagesReturned ? `  (+${r.thoughtImagesReturned} interim)` : ""}`,
      `Input tokens: ${n(r.usage.inputTokens)} (image ${n(r.usage.inputImageTokens)})`,
      `Image output tokens: ${n(r.usage.imageOutputTokens)}  Text output: ${n(r.usage.textOutputTokens)}  Thinking: ${n(r.usage.thinkingTokens)}`,
      `Estimated cost: ${inr(r.costInr)} + GST ${inr(r.gstInr)} = ${inr(r.totalInr)} (${r.costStatus}, pricing ${n(r.pricingVersion)}, ₹${n(r.inrPerUsd)}/USD)`,
      `Duration: ${n(r.durationMs)} ms  Status: ${r.status}${r.errorKind ? ` (${r.errorKind}${r.errorStatus ? `, HTTP ${r.errorStatus}` : ""})` : ""}`,
      ...(r.errorDetail ? [`Provider error: ${r.errorDetail}`] : []),
      ...(r.needsReconciliation ? ["WARNING: cost unknown — check Google Cloud Billing and reconcile this request."] : []),
    ].join("\n"),
  );
};

/**
 * Runs one provider request and records it.
 * @param run      async () => provider result { images: [{buffer,mimeType}], usage, model }
 * @param meta     { provider, model, jobId, variationIndex, purpose, userId,
 *                   requestedResolution, aspectRatio, referenceImages, imagesRequested }
 * @returns provider result (the original error is re-thrown on failure)
 */
// Final results that could not be written (database unreachable when the
// answer arrived) are kept in this file and written later, so a billed
// request is never lost from the ledger.
const PENDING_FILE = path.join(__dirname, "..", "..", "..", "logs", "ai-usage-pending.jsonl");

const keepForLater = (requestId, update) => {
  try {
    fs.mkdirSync(path.dirname(PENDING_FILE), { recursive: true });
    fs.appendFileSync(PENDING_FILE, `${JSON.stringify({ requestId, update, savedAt: new Date().toISOString() })}\n`);
    console.error(`AI usage record ${requestId} kept in ${PENDING_FILE}; it is written to the database later.`);
  } catch (err) {
    console.error(`AI usage record ${requestId} could not be kept:`, err.message, JSON.stringify(update).slice(0, 600));
  }
};

/** Writes results kept by keepForLater(); lines that still fail stay. */
const flushPendingUsage = async () => {
  let text;
  try {
    text = fs.readFileSync(PENDING_FILE, "utf8");
  } catch {
    return 0;
  }
  const left = [];
  let written = 0;
  for (const line of text.split("\n").filter(Boolean)) {
    try {
      const { requestId, update } = JSON.parse(line);
      await AiUsageRecord.updateOne(
        { requestId },
        { $set: { ...update, finishedAt: update.finishedAt ? new Date(update.finishedAt) : new Date() } },
      );
      written += 1;
    } catch {
      left.push(line);
    }
  }
  fs.writeFileSync(PENDING_FILE, left.length ? `${left.join("\n")}\n` : "");
  if (written) console.log(`AI usage: ${written} kept record(s) written to the database.`);
  return written;
};

const ledgerUnavailable = (cause) => {
  const err = new Error(
    "The AI usage log could not be written, so nothing was sent to the AI service. Check the database connection and try again.",
  );
  err.code = "AI_PROVIDER_ERROR";
  err.kind = "LEDGER_UNAVAILABLE";
  err.sent = false;
  err.cause = cause;
  return err;
};

const recordedRequest = async (run, meta) => {
  const requestId = crypto.randomUUID();
  const base = {
    requestId,
    jobId: meta.jobId || null,
    variationIndex: meta.variationIndex ?? null,
    purpose: meta.purpose || "design",
    userId: meta.userId || null,
    provider: meta.provider,
    model: meta.model,
    requestedResolution: meta.requestedResolution || null,
    aspectRatio: meta.aspectRatio || null,
    referenceImages: meta.referenceImages || 0,
    imagesRequested: meta.imagesRequested || 1,
    runnerId: RUNNER_ID,
  };
  // Written BEFORE the request goes out: if this server stops before the
  // answer arrives, the request is still on record (cost unknown, flagged).
  // Without a record nothing is sent — an untracked paid request is never made.
  try {
    // Not yet "needs reconciliation": an in-flight request must not block other
    // Generates. It is flagged when it ends without usage, or is interrupted.
    await AiUsageRecord.create({ ...base, status: "SENT", costStatus: "UNKNOWN", needsReconciliation: false });
  } catch (err) {
    console.error(`AI usage record could not be written; request ${requestId} NOT sent:`, err.message);
    throw ledgerUnavailable(err);
  }
  const started = Date.now();
  let result = null;
  let error = null;
  try {
    result = await run();
  } catch (err) {
    error = err;
  }
  const durationMs = Date.now() - started;
  const tokens = tokensFromUsage(result?.usage || error?.usage);
  const model = result?.model || meta.model;
  const timedOut = error?.kind === "TIMEOUT";
  // A request that never reached the provider costs nothing: blocked locally
  // (AI off) or a network error before anything was sent (address lookup).
  const blocked = error?.kind === "DISABLED" || error?.code === "AI_NOT_CONFIGURED";
  const neverSent = blocked || error?.sent === false;
  // No usage metadata = UNKNOWN cost (never assumed zero, never guessed).
  const cost = neverSent ? { status: "NONE" } : estimateCost(model, tokens);
  const record = {
    ...base,
    model,
    imagesReturned: result ? result.images?.length ?? 0 : null,
    thoughtImagesReturned: result ? result.thoughtImages ?? null : null,
    usage: { ...(tokens || {}), raw: result?.usage || error?.usage || null },
    status: blocked ? "BLOCKED" : neverSent ? "NOT_SENT" : timedOut ? "TIMEOUT" : error ? "FAILED" : "SUCCESS",
    errorKind: error ? error.kind || error.code || "ERROR" : null,
    errorStatus: error?.httpStatus ?? null,
    errorDetail: error ? error.detail || String(error.message || "").slice(0, 300) || null : null,
    durationMs,
    finishedAt: new Date(),
    costStatus: cost.status,
    costUsd: cost.usd ?? null,
    costInr: cost.inr ?? null,
    gstInr: cost.gstInr ?? null,
    totalInr: cost.totalInr ?? null,
    pricingVersion: cost.pricingVersion || null,
    pricingSource: cost.pricingSource || null,
    inrPerUsd: cost.inrPerUsd ?? null,
    gstRate: cost.gstRate ?? null,
    // A timeout or failure may still be billed; unknown cost is never zero.
    needsReconciliation: cost.status === "UNKNOWN",
  };
  try {
    await AiUsageRecord.updateOne({ requestId }, { $set: record });
  } catch (err) {
    console.error("AI usage record could not be saved:", err.message);
    keepForLater(requestId, record);
  }
  logRequest(record);
  if (result && result.images?.length > (meta.imagesRequested || 1)) {
    console.warn(
      `[AI WARNING] Request ${requestId} returned ${result.images.length} images for ${meta.imagesRequested || 1} requested — all are kept and were billed.`,
    );
  }
  if (error) throw error;
  return { ...result, requestId };
};

const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);

const sumSince = async (since) => {
  const match = since ? { createdAt: { $gte: since } } : {};
  const [row] = await AiUsageRecord.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalInr: { $sum: { $ifNull: ["$totalInr", 0] } },
        requests: { $sum: { $cond: [{ $in: ["$status", ["BLOCKED", "NOT_SENT"]] }, 0, 1] } },
        images: { $sum: { $ifNull: ["$imagesReturned", 0] } },
        unknown: { $sum: { $cond: [{ $and: [{ $eq: ["$costStatus", "UNKNOWN"] }, { $ne: ["$status", "SENT"] }] }, 1, 0] } },
      },
    },
  ]);
  return {
    estimatedInr: Math.round((row?.totalInr || 0) * 100) / 100,
    requests: row?.requests || 0,
    imagesReturned: row?.images || 0,
    unknownCostRequests: row?.unknown || 0,
  };
};

/** Application-estimated spending and budget (incl. GST). */
const usageSummary = async () => {
  const [today, month, total, unresolved] = await Promise.all([
    sumSince(startOfDay()),
    sumSince(startOfMonth()),
    sumSince(null),
    AiUsageRecord.countDocuments({ needsReconciliation: true, reconciledAt: null }),
  ]);
  const budget = config.AI_BUDGET_INR;
  return {
    today,
    month,
    cumulative: total,
    unresolvedUnknownCostRequests: unresolved,
    budget: {
      startingBudgetInr: budget || null,
      estimatedSpendingInr: total.estimatedInr,
      estimatedRemainingInr: budget ? Math.round((budget - total.estimatedInr) * 100) / 100 : null,
      dailyLimitInr: config.AI_DAILY_LIMIT_INR || null,
      dailyRemainingInr: config.AI_DAILY_LIMIT_INR
        ? Math.round((config.AI_DAILY_LIMIT_INR - today.estimatedInr) * 100) / 100
        : null,
      maxCostPerGenerateInr: config.AI_MAX_COST_PER_GENERATE_INR || null,
      note:
        "Application estimates only. Google's real balance and charges are in Google AI Studio → Billing (no live balance API is used).",
    },
  };
};

const logGenerationSummary = async (jobId, designsRequested) => {
  const records = await AiUsageRecord.find({ jobId }).lean();
  const ok = records.filter((r) => r.status === "SUCCESS" && r.imagesReturned > 0).length;
  const known = records.filter((r) => r.totalInr != null).reduce((a, r) => a + r.totalInr, 0);
  const unknown = records.filter((r) => r.costStatus === "UNKNOWN").length;
  const summary = await usageSummary();
  console.log(
    [
      "[GENERATION SUMMARY]",
      `Job: ${jobId}`,
      `Designs requested: ${designsRequested}`,
      `Provider requests: ${records.length}  Successful designs: ${ok}`,
      `Estimated total cost: ₹${known.toFixed(2)} (incl. GST)${unknown ? `  + ${unknown} request(s) with UNKNOWN cost` : ""}`,
      `Today: ₹${summary.today.estimatedInr.toFixed(2)}  This month: ₹${summary.month.estimatedInr.toFixed(2)}  Cumulative: ₹${summary.cumulative.estimatedInr.toFixed(2)}`,
      summary.budget.startingBudgetInr
        ? `Starting application budget: ₹${summary.budget.startingBudgetInr}  Application-estimated remaining: ₹${summary.budget.estimatedRemainingInr}`
        : "Starting application budget: not set (AI_BUDGET_INR)",
      "Google's real balance: check Google AI Studio → Billing.",
    ].join("\n"),
  );
};

/**
 * Requests that were SENT but never finished (the server stopped, or the
 * final update was lost) become INTERRUPTED: cost UNKNOWN and flagged for
 * checking against Google Billing — never assumed free and never re-sent.
 *   ownEarlierRuns: runner-id regex of earlier processes on this computer
 *   olderThanMs:    any SENT request older than this (its runner is gone)
 */
const closeInterruptedRequests = async ({ ownEarlierRuns = null, olderThanMs = null } = {}) => {
  const or = [];
  if (ownEarlierRuns) or.push({ runnerId: ownEarlierRuns });
  if (olderThanMs) or.push({ createdAt: { $lt: new Date(Date.now() - olderThanMs) } });
  if (!or.length) return 0;
  const res = await AiUsageRecord.updateMany(
    { status: "SENT", $or: or },
    {
      $set: {
        status: "INTERRUPTED",
        errorKind: "INTERRUPTED",
        errorDetail: "The server stopped or lost its connection before the provider answered. Check Google Billing for this request.",
        costStatus: "UNKNOWN",
        needsReconciliation: true,
        finishedAt: new Date(),
      },
    },
  );
  return res?.modifiedCount || 0;
};

module.exports = {
  recordedRequest,
  usageSummary,
  logGenerationSummary,
  startOfDay,
  flushPendingUsage,
  closeInterruptedRequests,
  PENDING_FILE,
};
