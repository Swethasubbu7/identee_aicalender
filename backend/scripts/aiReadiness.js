// What a paid Generate would use and cost — for approval BEFORE the first
// real request. Makes NO request to any AI provider and never prints keys.
//
//   npm run ai:readiness
require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../src/config");
const { getImageAi } = require("../src/services/ai/imageAi");
const { pricingFor } = require("../src/services/ai/pricing");
const { estimateGenerate, checkLimits } = require("../src/services/ai/spendGuard");
const { VARIATION_COUNT } = require("../src/services/ai/pickLayouts");

const yesNo = (v) => (v ? "yes" : "no");
const inr = (v) => (v == null ? "UNKNOWN" : `₹${v.toFixed(2)}`);
const money = (e) =>
  e.totalInr == null
    ? "UNKNOWN"
    : `$${e.totalUsd} → ${inr(e.totalInrBeforeGst)} + GST ${inr(e.totalGstInr)} = ${inr(e.totalInr)}`;

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const model = config.GEMINI_IMAGE_MODEL;
  const price = pricingFor(model);
  const one = await estimateGenerate(1);
  const two = await estimateGenerate(VARIATION_COUNT);
  const limits = await checkLimits({ estimateInr: two.totalInr, aiEnabled: true });
  const b = limits.summary.budget;

  console.log(
    [
      "AI READINESS (no AI request is made by this report)",
      "",
      `AI switch (AI_IMAGE_PROVIDER):   ${config.AI_IMAGE_PROVIDER}  → AI ${getImageAi().isConfigured() ? "ON" : "OFF"}`,
      `Real API key present:            ${yesNo(config.hasRealApiKey(process.env.GEMINI_API_KEY))} (value never shown)`,
      `Model (GEMINI_IMAGE_MODEL):      ${model}`,
      `Resolution (GEMINI_IMAGE_SIZE):  ${config.GEMINI_IMAGE_SIZE}`,
      `Official price:                  ${price ? `${price.usdPerImage?.[config.GEMINI_IMAGE_SIZE] != null ? `$${price.usdPerImage[config.GEMINI_IMAGE_SIZE]} per image` : "no per-image price"}; tokens $${price.usdPerMTok.inputText} in / $${price.usdPerMTok.outputText} text+thinking / $${price.usdPerMTok.outputImage} image per 1M` : "none in pricing.js"}`,
      `Price source:                    ${price?.source || "-"}`,
      "",
      `Admin one-image test:            ${money(one)} (${one.status}) — 1 request`,
      `Regular AI Generate:             ${money(two)} — ${two.requests} requests (always ${VARIATION_COUNT} designs)`,
      `Normal Mode:                     free — never calls AI`,
      `Basis:                           ${two.basis}`,
      "",
      `Application budget:              ${b.startingBudgetInr == null ? "not set (AI_BUDGET_INR)" : `₹${b.startingBudgetInr}, estimated remaining ₹${b.estimatedRemainingInr}`}`,
      `Daily limit:                     ${b.dailyLimitInr == null ? "not set (AI_DAILY_LIMIT_INR)" : `₹${b.dailyLimitInr}, remaining today ₹${b.dailyRemainingInr}`}`,
      `Max per Generate:                ${b.maxCostPerGenerateInr == null ? "not set (AI_MAX_COST_PER_GENERATE_INR)" : `₹${b.maxCostPerGenerateInr}`}`,
      `Recorded so far:                 ${limits.summary.cumulative.requests} requests, ${inr(limits.summary.cumulative.estimatedInr)}; unresolved UNKNOWN-cost: ${limits.summary.unresolvedUnknownCostRequests}`,
      "Google's real balance:           check Google AI Studio → Billing (not readable by this app)",
      "",
      limits.allowed
        ? "Spending checks: OK — a Generate would be allowed after the designer confirms the cost."
        : `Spending checks would refuse a Generate:\n  - ${limits.reasons.join("\n  - ")}`,
    ].join("\n"),
  );
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error("Readiness report failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
