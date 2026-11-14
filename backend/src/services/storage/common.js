const crypto = require("crypto");
const path = require("path");

const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".json": "application/json",
};

const contentTypeFor = (key) => CONTENT_TYPES[path.extname(key).toLowerCase()] || "application/octet-stream";

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

const existsError = (key) => {
  const err = new Error(`Refusing to overwrite existing file: ${key}`);
  err.code = "STORAGE_OBJECT_EXISTS";
  return err;
};

const notFoundError = (key) => {
  const err = new Error(`File not found in storage: ${key}`);
  err.code = "STORAGE_NOT_FOUND";
  return err;
};

module.exports = { contentTypeFor, sha256, existsError, notFoundError };
