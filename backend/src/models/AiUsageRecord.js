const mongoose = require("mongoose");

// One AI provider request: what was asked, what came back, the usage the
// provider reported and the application's cost ESTIMATE. Persistent, so
// totals survive restarts. Never holds API keys or customer images.
const aiUsageRecordSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true, unique: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "AiCalendarJob", default: null, index: true },
    variationIndex: { type: Number, default: null },
    purpose: { type: String, default: "design" }, // what the request was for
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    provider: { type: String, required: true },
    model: { type: String, default: null },
    requestedResolution: { type: String, default: null },
    aspectRatio: { type: String, default: null },
    referenceImages: { type: Number, default: 0 },
    imagesRequested: { type: Number, default: 1 },
    imagesReturned: { type: Number, default: null }, // null = unknown (failed/timeout)
    thoughtImagesReturned: { type: Number, default: null }, // interim "thinking" images, if reported

    usage: {
      inputTokens: { type: Number, default: null },
      inputImageTokens: { type: Number, default: null },
      inputTextTokens: { type: Number, default: null },
      cachedTokens: { type: Number, default: null },
      imageOutputTokens: { type: Number, default: null },
      textOutputTokens: { type: Number, default: null },
      thinkingTokens: { type: Number, default: null },
      totalTokens: { type: Number, default: null },
      raw: { type: mongoose.Schema.Types.Mixed, default: null }, // provider usageMetadata as returned
    },

    // SENT = written BEFORE the request goes out and updated when it ends, so
    // a request interrupted by a crash or lost connection is never invisible;
    // INTERRUPTED = the server stopped before the answer arrived (it may still
    // have been billed); NOT_SENT = it certainly never reached the provider.
    status: { type: String, enum: ["SENT", "SUCCESS", "FAILED", "TIMEOUT", "INTERRUPTED", "NOT_SENT", "BLOCKED"], required: true },
    errorKind: { type: String, default: null },
    errorStatus: { type: Number, default: null }, // provider HTTP status, when one came back
    errorDetail: { type: String, default: null }, // provider error text, keys removed
    runnerId: { type: String, default: null },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },

    // Cost estimate (application-side). UNKNOWN when usage is missing: such a
    // request is never counted as zero and is flagged for reconciliation.
    costStatus: { type: String, enum: ["ESTIMATED", "ESTIMATED_UNVERIFIED_PRICE", "UNKNOWN", "NONE"], required: true },
    costUsd: { type: Number, default: null },
    costInr: { type: Number, default: null },
    gstInr: { type: Number, default: null },
    totalInr: { type: Number, default: null },
    pricingVersion: { type: String, default: null },
    pricingSource: { type: String, default: null },
    inrPerUsd: { type: Number, default: null },
    gstRate: { type: Number, default: null },
    needsReconciliation: { type: Boolean, default: false, index: true },
    reconciledAt: { type: Date, default: null },
    reconciliationNote: { type: String, default: null },
  },
  { timestamps: true },
);

aiUsageRecordSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AiUsageRecord", aiUsageRecordSchema);
