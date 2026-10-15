// Placeholder used until a real upscaling provider is chosen.
// It never pretends to upscale: callers must check isConfigured().

class UpscalerNotConfiguredError extends Error {
  constructor() {
    super("No upscaling provider configured (set UPSCALER_PROVIDER).");
    this.code = "UPSCALER_NOT_CONFIGURED";
  }
}

module.exports = {
  name: "none",
  isConfigured: () => false,
  upscale: async () => {
    throw new UpscalerNotConfiguredError();
  },
  UpscalerNotConfiguredError,
};
