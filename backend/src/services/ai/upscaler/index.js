// Pluggable image upscaler. The final provider/API is not chosen yet, so the
// active provider is selected by the UPSCALER_PROVIDER env var and new
// providers are added with registerUpscaler() — no call sites change.
//
// Provider contract:
//   name: string
//   isConfigured(): boolean
//   upscale({ buffer, mimeType, targetWidthPx, targetHeightPx })
//     -> Promise<{ buffer, mimeType, widthPx, heightPx }>

const config = require("../../../config");
const noneProvider = require("./noneProvider");
const imageModelUpscaler = require("./imageModelUpscaler");

const providers = new Map([
  [noneProvider.name, noneProvider],
  [imageModelUpscaler.name, imageModelUpscaler],
]);

const registerUpscaler = (provider) => {
  if (!provider?.name || typeof provider.upscale !== "function") {
    throw new Error("Upscaler provider needs a name and an upscale() function");
  }
  providers.set(provider.name, provider);
};

const getUpscaler = (name = config.UPSCALER_PROVIDER) => {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`Unknown upscaler provider "${name}"`);
  }
  return provider;
};

// Returns how much enlargement an image needs to reach targetPx, or null when
// the target is unknown (e.g. minimum DPI not confirmed yet).
const requiredScale = (sourcePx, targetPx) =>
  targetPx && sourcePx ? Math.max(1, targetPx / sourcePx) : null;

module.exports = { registerUpscaler, getUpscaler, requiredScale };
