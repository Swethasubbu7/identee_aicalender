require("dotenv").config();

const PORT = Number(process.env.PORT) || 5000;

// A missing, empty or placeholder key ("None", "none", "null", …) is not a key.
const hasRealApiKey = (key) =>
  Boolean(key && String(key).trim()) &&
  !/^(none|null|undefined|false|off|disabled|-)$/i.test(String(key).trim());

module.exports = {
  PORT,
  // Public origin used to build absolute asset URLs in API responses.
  // Stored paths in MongoDB are relative ("/uploads/..."), so changing this
  // never requires a data migration.
  PUBLIC_BASE_URL: (
    process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`
  ).replace(/\/$/, ""),

  // Software tolerance used when comparing two CAD measurements of the same
  // thing (e.g. a mapped cake rectangle vs. the catalogue cake size). This is
  // NOT a printer/laser specification — those live in ProductionProfile.
  // 2 mm confirmed by the business on 2026-10-07 (designer cutlines deviate
  // by up to ~1.8 mm). Override with GEOMETRY_MATCH_TOLERANCE_MM.
  GEOMETRY_MATCH_TOLERANCE_MM:
    Number(process.env.GEOMETRY_MATCH_TOLERANCE_MM) || 2,

  // Upscaling provider is pluggable; "none" means not configured yet.
  UPSCALER_PROVIDER: process.env.UPSCALER_PROVIDER || "none",

  // AI image generation. The API key is read on the server only (never sent
  // to the browser). Provider and models are configurable so the provider
  // can be changed after testing without touching call sites.
  // AI is OFF unless AI_IMAGE_PROVIDER is set explicitly (e.g. "gemini") AND
  // a real key is present. Business decision 2026-10-10: no AI calls until
  // explicitly approved; nothing is enabled just because a key exists.
  AI_IMAGE_PROVIDER: (process.env.AI_IMAGE_PROVIDER || "none").trim().toLowerCase() || "none",
  hasRealApiKey,
  // One image model for every AI picture (one picture per design). Default:
  // gemini-nano-banana-2.1 — the cheapest Gemini image model that takes
  // several reference images and outputs 2K / 4K ($0.0504 per 2K image vs
  // $0.101 for gemini-3.1-flash-image; official pricing page, checked
  // 2026-10-14). Its quality for god images is NOT yet tested: the first
  // paid test needs approval. Set GEMINI_IMAGE_MODEL to switch models.
  GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1",
  // "1K" | "2K" | "4K" — bigger is sharper in print and costs more.
  GEMINI_IMAGE_SIZE: process.env.GEMINI_IMAGE_SIZE || "2K",
  // Pro image calls usually take ~40 s but can take several minutes when
  // Google is busy; 5 minutes before giving up.
  AI_REQUEST_TIMEOUT_MS: Number(process.env.AI_REQUEST_TIMEOUT_MS) || 300000,
  // Cost / abuse limits for AI calendar generation.
  AI_MAX_CONCURRENT_JOBS: Number(process.env.AI_MAX_CONCURRENT_JOBS) || 2,
  AI_JOBS_PER_USER_PER_HOUR: Number(process.env.AI_JOBS_PER_USER_PER_HOUR) || 10,

  // Export resolution used ONLY while the printer has not confirmed a
  // minimum DPI (ProductionProfile.print.minDpi). Every export made with it
  // is flagged "Needs designer/printer confirmation".
  EXPORT_FALLBACK_DPI: Number(process.env.EXPORT_FALLBACK_DPI) || 300,
  // Layout artwork embedded in a production PDF below this resolution blocks
  // activation (it would print visibly soft); below EXPORT_FALLBACK_DPI it is
  // a warning. Working value until the printer confirms a minimum.
  MIN_ARTWORK_DPI: Number(process.env.MIN_ARTWORK_DPI) || 150,

  // --- AI cost control (application-side estimates; Google Billing is the
  // source of truth and has no hard cap from these settings) -------------
  // Rate Google billed this account at (derived from its invoice lines).
  AI_INR_PER_USD: Number(process.env.AI_INR_PER_USD) || 96,
  AI_GST_RATE: process.env.AI_GST_RATE !== undefined ? Number(process.env.AI_GST_RATE) : 0.18,
  // Starting application budget (INR) the estimated spending is counted
  // against. 0 = not set (no remaining-budget figure, Generate blocked).
  AI_BUDGET_INR: Number(process.env.AI_BUDGET_INR) || 0,
  AI_DAILY_LIMIT_INR: Number(process.env.AI_DAILY_LIMIT_INR) || 0, // 0 = Generate blocked
  AI_MAX_COST_PER_GENERATE_INR: Number(process.env.AI_MAX_COST_PER_GENERATE_INR) || 0, // 0 = Generate blocked
  // Requests with UNKNOWN cost allowed before Generate is blocked for reconciliation.
  AI_MAX_UNKNOWN_COST_REQUESTS: Number(process.env.AI_MAX_UNKNOWN_COST_REQUESTS) || 0,
  // Images requested per AI call (one design per request; never more).
  AI_IMAGES_PER_REQUEST: 1,
};
