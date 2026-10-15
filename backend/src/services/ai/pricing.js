// Prices used to ESTIMATE the cost of an AI request from the usage metadata
// the provider returns. Estimates only — Google Cloud Billing is the truth.
//
// Rates are per 1 million tokens, in USD. `inrPerUsd` is the rate Google
// actually billed this account at (derived from its own invoice lines).
//
// Source for gemini-3-pro-image: this account's Google Cloud Billing report,
// 1–9 Oct 2026 (SKUs: image output 181,440 tokens = ₹2,089.94; text output
// 36,636 = ₹42.20; image input 12,276 = ₹2.36; text input 9,202 = ₹1.77).
// Those lines equal $120 / $12 / $2 / $2 per 1M tokens at ₹96.0 per USD.
// GST (18%) was added on top by Google (₹384.54 on ₹2,136.31).
const config = require("../../config");

const PRICING = {
  "gemini-3-pro-image": {
    version: "google-billing-2026-10-09",
    source: "Google Cloud Billing report for this account, 1–9 Oct 2026",
    verified: true,
    usdPerMTok: { inputText: 2, inputImage: 2, outputText: 12, outputImage: 120 },
    // Official list price of one output image (pricing page, 2026-10-12).
    usdPerImage: { "1K": 0.134, "2K": 0.134, "4K": 0.24 },
  },
  // Not used by this account yet. Rates from Google's official pricing page
  // (paid tier, standard — not batch), checked 2026-10-12; thinking tokens
  // are billed at the text-output rate. Not yet seen on this account's bill.
  "gemini-3.1-flash-image": {
    version: "google-pricing-page-2026-10-12",
    source: "ai.google.dev/gemini-api/docs/pricing (checked 2026-10-12; not yet on this account's bill)",
    verified: true,
    usdPerMTok: { inputText: 0.5, inputImage: 0.5, outputText: 3, outputImage: 60 },
    usdPerImage: { "0.5K": 0.045, "1K": 0.067, "2K": 0.101, "4K": 0.151 },
  },
  // Verified again 2026-10-15 (pricing page + model page): stable model,
  // text/image input, image + text output, up to 14 reference images,
  // 1K (default) / 2K / 4K; thinking (default level "medium") is billed at
  // the text-output rate. Standard tier, not batch.
  "gemini-nano-banana-2.1": {
    version: "google-pricing-page-2026-10-15",
    source: "ai.google.dev/gemini-api/docs/pricing + models/gemini-nano-banana-2.1 (checked 2026-10-15; not yet on this account's bill)",
    verified: true,
    usdPerMTok: { inputText: 1.5, inputImage: 1.5, outputText: 7.5, outputImage: 30 },
    usdPerImage: { "1K": 0.0336, "2K": 0.0504, "4K": 0.113 },
  },
  "gemini-3.1-flash-lite-image": {
    version: "google-pricing-page-2026-10-12",
    source: "ai.google.dev/gemini-api/docs/pricing (checked 2026-10-12; not yet on this account's bill)",
    verified: true,
    usdPerMTok: { inputText: 0.25, inputImage: 0.25, outputText: 1.5, outputImage: 30 },
    usdPerImage: { "1K": 0.0336 }, // 1K only
  },
};

const pricingFor = (model) => PRICING[model] || null;

const sumModality = (details = [], modality) =>
  (details || [])
    .filter((d) => String(d.modality || "").toUpperCase() === modality)
    .reduce((a, d) => a + (Number(d.tokenCount) || 0), 0);

/**
 * Normalised token counts from Gemini usageMetadata. Returns null when the
 * provider sent no usage (cost must then be UNKNOWN, never zero).
 */
const tokensFromUsage = (usage) => {
  if (!usage || typeof usage !== "object") return null;
  const prompt = Number(usage.promptTokenCount) || 0;
  const promptImage = sumModality(usage.promptTokensDetails, "IMAGE");
  const outImage = sumModality(usage.candidatesTokensDetails, "IMAGE");
  const candidates = Number(usage.candidatesTokenCount) || 0;
  const outText = Math.max(0, candidates - outImage);
  const thinking = Number(usage.thoughtsTokenCount) || 0;
  const cached = Number(usage.cachedContentTokenCount) || 0;
  return {
    inputTokens: prompt,
    inputImageTokens: promptImage,
    inputTextTokens: Math.max(0, prompt - promptImage),
    cachedTokens: cached,
    imageOutputTokens: outImage,
    textOutputTokens: outText,
    thinkingTokens: thinking,
    totalTokens: Number(usage.totalTokenCount) || prompt + candidates + thinking,
  };
};

const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * @returns { status: "ESTIMATED" | "UNKNOWN", usd, inr, gstInr, totalInr,
 *            pricingVersion, pricingSource, inrPerUsd, reason? }
 */
const estimateCost = (model, tokens) => {
  const pricing = pricingFor(model);
  const base = { inrPerUsd: config.AI_INR_PER_USD, gstRate: config.AI_GST_RATE };
  if (!tokens) return { ...base, status: "UNKNOWN", reason: "Provider returned no usage metadata" };
  if (!pricing) return { ...base, status: "UNKNOWN", reason: `No price table for model ${model}` };
  const p = pricing.usdPerMTok;
  const usd =
    (tokens.inputTextTokens * p.inputText +
      tokens.inputImageTokens * p.inputImage +
      tokens.imageOutputTokens * p.outputImage +
      (tokens.textOutputTokens + tokens.thinkingTokens) * p.outputText) /
    1e6;
  const inr = usd * config.AI_INR_PER_USD;
  const gstInr = inr * config.AI_GST_RATE;
  return {
    ...base,
    status: pricing.verified ? "ESTIMATED" : "ESTIMATED_UNVERIFIED_PRICE",
    usd: round(usd, 6),
    inr: round(inr, 2),
    gstInr: round(gstInr, 2),
    totalInr: round(inr + gstInr, 2),
    pricingVersion: pricing.version,
    pricingSource: pricing.source,
  };
};

module.exports = { PRICING, pricingFor, tokensFromUsage, estimateCost };
