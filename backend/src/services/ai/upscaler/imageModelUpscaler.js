// AI image enhancement with the configured image model (UPSCALER_PROVIDER=image-ai).
// One request: the model redraws the SAME picture at its largest output size
// (4K), restoring detail; the app then resamples it to the print pixel size.
// The real detail is that of the model output, which is reported separately
// from the final pixel count — never claimed as more.
const config = require("../../../config");
const { getImageAi, nearestAspectRatio } = require("../imageAi");

const ENHANCE_SIZE = process.env.UPSCALER_IMAGE_SIZE || "4K";
const ENHANCE_PROMPT =
  "Reproduce this exact image at the highest possible resolution and sharpness. Restore fine detail, clean edges and " +
  "textures, remove blur, noise and compression artefacts. Do not change anything else: same composition, framing, " +
  "aspect ratio, colours, deity, ornaments and every element in the same place. Do not add, remove or move anything. " +
  "Do not add any text, letters, numbers, logos or watermarks.";

module.exports = {
  name: "image-ai",
  size: ENHANCE_SIZE,
  isConfigured: () => getImageAi().isConfigured(),
  /** @returns provider result { images, usage, model } (recorded by the caller) */
  enhance: ({ buffer, mimeType, widthPx, heightPx }) =>
    getImageAi().editImage({
      prompt: ENHANCE_PROMPT,
      images: [{ buffer, mimeType }],
      aspectRatio: nearestAspectRatio(widthPx, heightPx),
      imageSize: ENHANCE_SIZE,
    }),
  upscale: async () => {
    throw new Error("Use enhance() — resampling to print size is done by the caller.");
  },
  model: () => config.GEMINI_IMAGE_MODEL,
};
