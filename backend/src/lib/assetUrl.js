const { PUBLIC_BASE_URL } = require("../config");

// Uploaded files are stored as relative paths ("/uploads/layouts/x.png").
// Older documents may still hold absolute URLs; those pass through unchanged.
const toPublicUrl = (storedPath) => {
  if (!storedPath) return storedPath;
  if (/^https?:\/\//i.test(storedPath)) return storedPath;
  return `${PUBLIC_BASE_URL}${storedPath.startsWith("/") ? "" : "/"}${storedPath}`;
};

const uploadPath = (folder, filename) => `/uploads/${folder}/${filename}`;

module.exports = { toPublicUrl, uploadPath };
