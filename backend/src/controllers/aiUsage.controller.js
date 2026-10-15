// Admin view of the AI usage ledger: application-estimated spending, the
// application budget, recorded requests and reconciliation of requests whose
// cost was UNKNOWN (checked by hand against Google Cloud Billing).
const config = require("../config");
const AiUsageRecord = require("../models/AiUsageRecord");
const { usageSummary } = require("../services/ai/usageLedger");
const { estimateGenerate } = require("../services/ai/spendGuard");
const { VARIATION_COUNT, VARIATION_COUNT_BY_CUT_TYPE } = require("../services/ai/pickLayouts");
const { getImageAi } = require("../services/ai/imageAi");

// GET /api/ai-usage/summary
const getSummary = async (req, res) => {
  try {
    const [summary, estimate, special] = await Promise.all([
      usageSummary(),
      estimateGenerate(VARIATION_COUNT),
      estimateGenerate(VARIATION_COUNT_BY_CUT_TYPE["special-die-cut"]),
    ]);
    res.status(200).json({
      aiEnabled: getImageAi().isConfigured(),
      provider: config.AI_IMAGE_PROVIDER,
      model: config.GEMINI_IMAGE_MODEL,
      designsPerGenerate: VARIATION_COUNT,
      estimatePerGenerate: estimate,
      designsPerSpecialGenerate: VARIATION_COUNT_BY_CUT_TYPE["special-die-cut"],
      estimatePerSpecialGenerate: special,
      ...summary,
    });
  } catch (error) {
    console.error("AI usage summary error:", error);
    res.status(500).json({ message: "Failed to load AI usage" });
  }
};

// GET /api/ai-usage/records?unresolved=true&limit=50
const listRecords = async (req, res) => {
  try {
    const filter = req.query.unresolved === "true" ? { needsReconciliation: true, reconciledAt: null } : {};
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const records = await AiUsageRecord.find(filter).select("-usage.raw").sort({ createdAt: -1 }).limit(limit).lean();
    res.status(200).json({ records });
  } catch (error) {
    console.error("AI usage records error:", error);
    res.status(500).json({ message: "Failed to load AI usage records" });
  }
};

// POST /api/ai-usage/records/:requestId/reconcile
// body: { totalInr (incl. GST, from Google Cloud Billing), note }
const reconcileRecord = async (req, res) => {
  try {
    const totalInr = Number(req.body.totalInr);
    if (!Number.isFinite(totalInr) || totalInr < 0) {
      return res.status(400).json({ message: "totalInr (the billed amount incl. GST) is required." });
    }
    const note = String(req.body.note || "").trim();
    if (!note) return res.status(400).json({ message: "A note saying where the amount comes from is required." });
    const gstRate = config.AI_GST_RATE;
    const costInr = Math.round((totalInr / (1 + gstRate)) * 100) / 100;
    const record = await AiUsageRecord.findOneAndUpdate(
      { requestId: req.params.requestId },
      {
        $set: {
          totalInr,
          costInr,
          gstInr: Math.round((totalInr - costInr) * 100) / 100,
          gstRate,
          costStatus: "ESTIMATED",
          pricingSource: "Reconciled by hand against Google Cloud Billing",
          needsReconciliation: false,
          reconciledAt: new Date(),
          reconciliationNote: note,
        },
      },
      { returnDocument: "after" },
    ).select("-usage.raw");
    if (!record) return res.status(404).json({ message: "Usage record not found" });
    res.status(200).json({ record });
  } catch (error) {
    console.error("AI usage reconcile error:", error);
    res.status(500).json({ message: "Failed to reconcile the record" });
  }
};

module.exports = { getSummary, listRecords, reconcileRecord };
