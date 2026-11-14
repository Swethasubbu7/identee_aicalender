const { PUBLIC_BASE_URL } = require("../config");
const { isSharedKey, normalizeKey } = require("../services/storage/keys");
const { currentUser } = require("./requestContext");

// Uploaded files are stored as relative paths ("/uploads/layouts/x.png").
// Older documents may still hold absolute URLs; those pass through unchanged.
//
// Shared design images (AI artwork, previews, customer images) are never
// public: they get a signed, expiring /api/files link for the signed-in user
// of this request (checked again when the file is requested).
const toPublicUrl = (storedPath) => {
  if (!storedPath) return storedPath;
  if (/^https?:\/\//i.test(storedPath)) return storedPath;
  if (isSharedKey(storedPath)) {
    const user = currentUser();
    if (user?.userId) return require("./fileLinks").fileLinkUrl(storedPath, user.userId);
    // No signed-in user here: the link only works with a login token.
    return `${PUBLIC_BASE_URL}/api/files/${normalizeKey(storedPath)}`;
  }
  return `${PUBLIC_BASE_URL}${storedPath.startsWith("/") ? "" : "/"}${storedPath}`;
};

const uploadPath = (folder, filename) => `/uploads/${folder}/${filename}`;

module.exports = { toPublicUrl, uploadPath };
