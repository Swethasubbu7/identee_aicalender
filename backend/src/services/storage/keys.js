// Storage keys are the stored upload path without the leading "/uploads/":
//   "/uploads/ai-calendars/<jobId>/v0-preview-1.jpg" -> "ai-calendars/<jobId>/v0-preview-1.jpg"
// so documents already in MongoDB map onto shared storage with no rewrite.

// Folders whose IMAGES are shared between computers (GridFS when enabled).
// Layouts, production files and print PDFs always stay local.
const SHARED_PREFIXES = ["ai-calendars/", "design-content/"];
const SHARED_EXTENSIONS = /\.(png|jpe?g|webp)$/i;

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const invalidKey = (key) => {
  const err = new Error(`Invalid storage key: ${JSON.stringify(key)}`);
  err.code = "INVALID_STORAGE_KEY";
  return err;
};

// Accepts a key or a stored "/uploads/..." path; returns a safe key or throws.
const normalizeKey = (value) => {
  if (typeof value !== "string" || !value) throw invalidKey(value);
  const key = value.startsWith("/uploads/") ? value.slice("/uploads/".length) : value;
  const parts = key.split("/");
  if (key.length > 512 || parts.some((p) => !SEGMENT.test(p) || p === "." || p === "..")) {
    throw invalidKey(value);
  }
  return key;
};

const toStoredPath = (key) => `/uploads/${normalizeKey(key)}`;

// True for AI artwork, previews, print images and customer images — the
// files every team member must be able to see. False for PDFs and layouts.
const isSharedKey = (value) => {
  try {
    const key = normalizeKey(value);
    return SHARED_PREFIXES.some((p) => key.startsWith(p)) && SHARED_EXTENSIONS.test(key);
  } catch {
    return false;
  }
};

module.exports = { SHARED_PREFIXES, normalizeKey, toStoredPath, isSharedKey };
