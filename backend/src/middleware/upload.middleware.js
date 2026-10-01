const multer = require("multer");
const path = require("path");
const fs = require("fs");

// backend/middleware -> up ONE level -> backend/uploads/layouts
const uploadDir = path.join(__dirname, "..", "uploads", "layouts");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.fieldname}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — raised from 15MB
});

// ---------------------------------------------------------------------
// AI Generate flow: customer-uploaded photos (separate from layout
// preview/layout-file uploads above). Same pattern, own folder, so
// customer images don't mix with admin layout assets on disk.
// Attached as a property on the existing `upload` export rather than a
// new module, so `require("../middleware/upload.middleware")` keeps
// working exactly as before everywhere it's already used.
// ---------------------------------------------------------------------
const aiUploadDir = path.join(__dirname, "..", "uploads", "ai-generate");

if (!fs.existsSync(aiUploadDir)) {
  fs.mkdirSync(aiUploadDir, { recursive: true });
}

const aiStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, aiUploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.fieldname}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

upload.aiImageUpload = multer({
  storage: aiStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // same 25MB limit as layouts
});

module.exports = upload;
