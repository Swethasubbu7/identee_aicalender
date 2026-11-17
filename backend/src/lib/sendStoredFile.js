// Sends a stored upload to the browser as a download, byte-for-byte as it was
// uploaded (read only: the file and its records are never changed).
const path = require("path");
const { getStorage } = require("../services/storage");

const TYPES = {
  ".pdf": "application/pdf",
  ".cdr": "application/vnd.corel-draw",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ai": "application/postscript",
  ".eps": "application/postscript",
};

// A safe download name: letters, digits, dot, dash, underscore.
const safeName = (name) => String(name || "layout").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "layout";

/**
 * @param stored   stored upload path ("/uploads/…" or a shared-storage key)
 * @param baseName download name without extension (the stored file's extension is kept)
 * @returns true when sent; false when the file is missing (nothing sent)
 */
const sendStoredFile = async (res, stored, baseName) => {
  let buffer;
  try {
    buffer = await getStorage().readFile(stored);
  } catch {
    return false;
  }
  if (!buffer) return false;
  const ext = path.extname(String(stored)).toLowerCase();
  const filename = `${safeName(baseName)}${ext}`;
  res.setHeader("Content-Type", TYPES[ext] || "application/octet-stream");
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.status(200).end(buffer);
  return true;
};

module.exports = { sendStoredFile, safeName };
