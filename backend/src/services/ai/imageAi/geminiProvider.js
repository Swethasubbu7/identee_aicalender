// Google Gemini image provider. The key stays in backend/.env
// (GEMINI_API_KEY); the client is created on first use so a server without
// a key still starts and reports "not configured" instead of crashing.
const config = require("../../../config");

// Only when the operator chose Gemini explicitly AND a real key is set.
const isConfigured = () =>
  config.AI_IMAGE_PROVIDER === "gemini" && config.hasRealApiKey(process.env.GEMINI_API_KEY);

let client = null;
const getClient = () => {
  if (!client) {
    const { GoogleGenAI } = require("@google/genai");
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
};

// `message` is safe to show to the designer; provider details are only logged.
class AiProviderError extends Error {
  constructor(message, { cause, retryable = false, kind = "FAILED", usage = null } = {}) {
    super(message);
    this.code = "AI_PROVIDER_ERROR";
    this.kind = kind;
    this.retryable = retryable; // informational only: nothing retries automatically
    this.cause = cause;
    this.usage = usage; // provider usage, when a reply arrived (it may be billed)
  }
}

const describe = (error) => {
  const text = String(error?.message || "");
  // The SDK does not always set a numeric status; the API body carries "code".
  const status = Number(error?.status) || Number(/"code":\s*(\d{3})/.exec(text)?.[1]) || 0;
  if (status === 429 && /free_tier|limit: 0/i.test(text)) {
    return new AiProviderError(
      "The Gemini API key is on the free plan, which has no image-generation quota. Turn on billing for this key in Google AI Studio.",
      { cause: error, kind: "QUOTA" },
    );
  }
  if (status === 402 || /prepayment credits are depleted/i.test(text)) {
    return new AiProviderError(
      "The AI credit is used up. Add credit in Google AI Studio (Billing), then press Try again.",
      { cause: error, kind: "QUOTA" },
    );
  }
  if (status === 429) {
    return new AiProviderError("The AI service is busy or the usage limit was reached. Please try again in a minute.", {
      cause: error,
      retryable: true,
      kind: "RATE_LIMIT",
    });
  }
  if (status === 400 && /api key/i.test(text)) {
    return new AiProviderError("The AI API key is invalid.", { cause: error, kind: "AUTH" });
  }
  if (status === 401 || status === 403) {
    return new AiProviderError("The AI API key is not allowed to use this model.", { cause: error, kind: "AUTH" });
  }
  if (status >= 500) {
    return new AiProviderError("The AI service had a temporary problem.", { cause: error, retryable: true });
  }
  return new AiProviderError("The AI service could not complete the request.", { cause: error });
};

const withTimeout = (promise, ms) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      // Not retried: the slow request may still finish (and be charged) on
      // Google's side, and a retry would double the wait.
      timer = setTimeout(() => reject(new AiProviderError("The AI service is very busy and took too long to answer. Please press Try again in a few minutes.", { kind: "TIMEOUT" })), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

const imagePart = ({ buffer, mimeType }) => ({
  inlineData: { mimeType: mimeType || "image/png", data: buffer.toString("base64") },
});

// No automatic retries (business rule 2026-10-12): a failed or slow request
// may still be billed, so repeating it silently could double the cost. The
// designer decides whether to try again.
const call = async (request) => {
  // Last line of defence: never open a connection while AI is switched off.
  if (!isConfigured()) {
    throw new AiProviderError("AI generation is switched off on this server.", { kind: "DISABLED" });
  }
  try {
    return await withTimeout(getClient().models.generateContent(request), config.AI_REQUEST_TIMEOUT_MS);
  } catch (error) {
    const err = error instanceof AiProviderError ? error : describe(error);
    // Provider messages can contain request details: log them, never return them.
    console.error(`Gemini ${request.model} failed (${err.kind}):`, String(error?.message || error).slice(0, 300));
    throw err;
  }
};

/**
 * One request for ONE image (candidateCount 1).
 * @returns { images: [{ buffer, mimeType }], thoughtImages, usage, model }
 *   images        — every final image returned (none are discarded)
 *   thoughtImages — interim "thinking" images the model reported, if any
 *   usage         — the provider's usageMetadata, unchanged
 */
const editImage = async ({ prompt, images = [], aspectRatio, imageSize = null }) => {
  const response = await call({
    model: config.GEMINI_IMAGE_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }, ...images.map(imagePart)] }],
    config: {
      candidateCount: 1,
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        ...(aspectRatio && { aspectRatio }),
        ...((imageSize || config.GEMINI_IMAGE_SIZE) && { imageSize: imageSize || config.GEMINI_IMAGE_SIZE }),
      },
    },
  });
  const usage = response.usageMetadata || null;
  const parts = (response.candidates || []).flatMap((c) => c.content?.parts || []);
  const imageParts = parts.filter((p) => p.inlineData?.data);
  const finals = imageParts.filter((p) => !p.thought);
  if (finals.length === 0) {
    const reason = response.candidates?.[0]?.finishReason || "no image returned";
    throw new AiProviderError(
      /SAFETY|PROHIBITED|BLOCK/i.test(reason)
        ? "The AI service refused this image. Try a different god image or prompt."
        : "The AI service returned no image. Please try again.",
      { kind: "NO_IMAGE", usage },
    );
  }
  return {
    images: finals.map((p) => ({ buffer: Buffer.from(p.inlineData.data, "base64"), mimeType: p.inlineData.mimeType || "image/png" })),
    thoughtImages: imageParts.length - finals.length,
    usage,
    model: response.modelVersion || config.GEMINI_IMAGE_MODEL,
  };
};

module.exports = {
  name: "gemini",
  isConfigured,
  editImage,
  AiProviderError,
  describeError: describe,
};
