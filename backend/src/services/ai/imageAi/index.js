// Pluggable AI image provider (same pattern as the upscaler). The active
// provider comes from AI_IMAGE_PROVIDER; call sites never name a vendor.
//
// Provider contract:
//   name: string
//   isConfigured(): boolean
//   editImage({ prompt, images: [{ buffer, mimeType }], aspectRatio })
//     -> Promise<{ images: [{ buffer, mimeType }], thoughtImages, usage, model }>
//        ONE image is requested per call; every returned image is reported
//        and `usage` is the provider's usage metadata (for the cost ledger).
// All calls go through services/ai/usageLedger.recordedRequest().

const config = require("../../../config");
const geminiProvider = require("./geminiProvider");

class AiNotConfiguredError extends Error {
  constructor() {
    super("AI image generation is not configured on the server.");
    this.code = "AI_NOT_CONFIGURED";
  }
}

const noneProvider = {
  name: "none",
  isConfigured: () => false,
  editImage: async () => {
    throw new AiNotConfiguredError();
  },
};

const providers = new Map([
  [noneProvider.name, noneProvider],
  [geminiProvider.name, geminiProvider],
]);

const registerImageAi = (provider) => {
  if (!provider?.name || typeof provider.editImage !== "function") {
    throw new Error("AI image provider needs a name and an editImage() function");
  }
  providers.set(provider.name, provider);
};

// An unknown provider name (e.g. a typo in AI_IMAGE_PROVIDER) means AI OFF:
// nothing is ever sent, and the server says so once instead of failing.
let warnedUnknown = null;
const getImageAi = (name = config.AI_IMAGE_PROVIDER) => {
  const provider = providers.get(name);
  if (provider) return provider;
  if (warnedUnknown !== name) {
    warnedUnknown = name;
    console.warn(`[AI] Unknown AI_IMAGE_PROVIDER "${String(name).slice(0, 40)}" — AI stays switched off.`);
  }
  return noneProvider;
};

// Aspect ratios the image models accept; the compositor crops the result to
// the exact region shape, so the nearest ratio is enough.
const SUPPORTED_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const logRatio = (r) => {
  const [w, h] = r.split(":").map(Number);
  return Math.log(w / h);
};
const nearestAspectRatio = (width, height) => {
  const target = Math.log(width / height);
  return SUPPORTED_RATIOS.reduce((best, r) =>
    Math.abs(logRatio(r) - target) < Math.abs(logRatio(best) - target) ? r : best,
  );
};

module.exports = { getImageAi, registerImageAi, nearestAspectRatio, SUPPORTED_RATIOS, AiNotConfiguredError };
