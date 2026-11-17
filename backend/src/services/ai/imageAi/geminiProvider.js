// Google Gemini image provider. The key stays in backend/.env
// (GEMINI_API_KEY); the client is created on first use so a server without
// a key still starts and reports "not configured" instead of crashing.
const config = require("../../../config");

// Only when the operator chose Gemini explicitly AND a real key is set.
const isConfigured = () =>
  config.AI_IMAGE_PROVIDER === "gemini" && config.hasRealApiKey(process.env.GEMINI_API_KEY);

// HTTP options for every request:
//  - retryOptions.attempts = 1: the SDK sends each request exactly ONCE. It
//    retries 408/429/5xx up to 5 times when retry options are set, and every
//    retry of an image request may be billed (business rule: no automatic
//    retries). Set explicitly so a future SDK default cannot change it.
//  - timeout: the HTTP request itself is aborted at the app's limit (the
//    race in withTimeout() below stays as a backstop).
const httpOptions = () => ({ retryOptions: { attempts: 1 }, timeout: config.AI_REQUEST_TIMEOUT_MS });

let client = null;
const getClient = () => {
  if (!client) {
    const { GoogleGenAI } = require("@google/genai");
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: httpOptions() });
  }
  return client;
};

// `message` is safe to show to the designer. `httpStatus` and `detail` (the
// provider's own error text, with anything key-like removed) are kept for
// the usage ledger and logs so a failure can be diagnosed afterwards.
class AiProviderError extends Error {
  constructor(message, { cause, retryable = false, kind = "FAILED", usage = null, httpStatus = null, detail = null, sent = true } = {}) {
    super(message);
    this.code = "AI_PROVIDER_ERROR";
    this.kind = kind;
    this.retryable = retryable; // informational only: nothing retries automatically
    this.cause = cause;
    this.usage = usage; // provider usage, when a reply arrived (it may be billed)
    this.httpStatus = httpStatus;
    this.detail = detail;
    // false only when the request certainly never reached the provider
    // (e.g. the address could not be looked up): nothing can be billed.
    this.sent = sent;
  }
}

// Provider text without anything that looks like a key or token.
const safeDetail = (text) =>
  String(text || "")
    .replace(/AIza[\w-]{10,}|AQ\.[\w.-]{10,}|ya29\.[\w.-]+|key=[\w.-]+|Bearer\s+[\w.-]+/g, "[redacted]")
    .slice(0, 500) || null;

// Network failures. Lookup / refused errors happen before anything is sent;
// any other network error may have happened after Google received it.
const NETWORK_NOT_SENT = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|getaddrinfo/i;
const NETWORK_ANY = /fetch failed|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|network|UND_ERR|other side closed/i;
const errorText = (error) =>
  [error?.message, error?.cause?.message, error?.cause?.code, error?.code].filter(Boolean).join(" | ");

const describe = (error) => {
  const text = String(error?.message || "");
  const detail = safeDetail(errorText(error));
  // The SDK does not always set a numeric status; the API body carries "code".
  const status = Number(error?.status) || Number(/"code":\s*(\d{3})/.exec(text)?.[1]) || 0;
  const make = (message, opts) => new AiProviderError(message, { cause: error, httpStatus: status || null, detail, ...opts });
  if (!status && error?.name === "AbortError") {
    return make("The AI service is very busy and took too long to answer. Please press Try again in a few minutes.", { kind: "TIMEOUT" });
  }
  if (!status && NETWORK_NOT_SENT.test(errorText(error))) {
    return make("The AI service could not be reached (network problem). Nothing was sent — check the internet connection and try again.", {
      kind: "NETWORK",
      sent: false,
    });
  }
  if (!status && NETWORK_ANY.test(errorText(error))) {
    return make("The connection to the AI service was lost. Please check the internet connection and try again.", { kind: "NETWORK" });
  }
  const result = describeStatus(status, text);
  result.cause = error;
  result.httpStatus = status || null;
  result.detail = detail;
  return result;
};

const describeStatus = (status, text) => {
  if (status === 429 && /free_tier|limit: 0/i.test(text)) {
    return new AiProviderError(
      "The Gemini API key is on the free plan, which has no image-generation quota. Turn on billing for this key in Google AI Studio.",
      { kind: "QUOTA" },
    );
  }
  if (status === 402 || /prepayment credits are depleted/i.test(text)) {
    return new AiProviderError(
      "The AI credit is used up. Add credit in Google AI Studio (Billing), then press Try again.",
      { kind: "QUOTA" },
    );
  }
  if (status === 429) {
    return new AiProviderError("The AI service is busy or the usage limit was reached. Please try again in a minute.", {
      retryable: true,
      kind: "RATE_LIMIT",
    });
  }
  if (status === 400 && /api key/i.test(text)) {
    return new AiProviderError("The AI API key is invalid.", { kind: "AUTH" });
  }
  if (status === 401 || status === 403) {
    return new AiProviderError("The AI API key is not allowed to use this model.", { kind: "AUTH" });
  }
  if ([502, 503, 504].includes(status)) {
    return new AiProviderError("Google's AI service is overloaded or unavailable right now. Please try again in a few minutes.", {
      retryable: true,
      kind: "UNAVAILABLE",
    });
  }
  if (status >= 500) {
    return new AiProviderError("Google's AI service had an internal error with this request. Please try again in a few minutes.", {
      retryable: true,
      kind: "SERVER_ERROR",
    });
  }
  if (status === 400) {
    return new AiProviderError("The AI service rejected the request.", { kind: "BAD_REQUEST" });
  }
  return new AiProviderError("The AI service could not complete the request.", {});
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
// Under the Node test runner (NODE_TEST_CONTEXT is set in every test file's
// process) only a test's own fake SDK may answer: the real SDK would make
// PAID requests with the key from backend/.env. A fake is installed straight
// into require.cache and has no filename; the real, loaded module does.
const realSdkInTests = () => {
  if (!process.env.NODE_TEST_CONTEXT) return false;
  const cached = require.cache[require.resolve("@google/genai")];
  return !cached || Boolean(cached.filename);
};

const call = async (request) => {
  // Last line of defence: never open a connection while AI is switched off.
  if (!isConfigured()) {
    throw new AiProviderError("AI generation is switched off on this server.", { kind: "DISABLED" });
  }
  if (realSdkInTests()) {
    throw new AiProviderError("Real AI requests are blocked while tests run.", { kind: "DISABLED" });
  }
  try {
    return await withTimeout(getClient().models.generateContent(request), config.AI_REQUEST_TIMEOUT_MS);
  } catch (error) {
    const err = error instanceof AiProviderError ? error : describe(error);
    // Provider messages can contain request details: log them, never return them.
    console.error(`Gemini ${request.model} failed (${err.kind}${err.httpStatus ? `, HTTP ${err.httpStatus}` : ""}):`, err.detail || safeDetail(errorText(error)));
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
