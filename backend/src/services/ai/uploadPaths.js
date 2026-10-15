// Stored files are referenced as "/uploads/..." paths. These helpers turn
// them into absolute paths and refuse anything outside the uploads folder.
const path = require("path");

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

const resolveUpload = (storedPath) => {
  if (typeof storedPath !== "string" || !storedPath.startsWith("/uploads/")) return null;
  const abs = path.resolve(UPLOADS_DIR, storedPath.slice("/uploads/".length));
  return abs.startsWith(UPLOADS_DIR + path.sep) ? abs : null;
};

module.exports = { UPLOADS_DIR, resolveUpload };
