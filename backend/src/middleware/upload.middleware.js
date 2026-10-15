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

// ---------------------------------------------------------------------
// Production layout files: the designer's production PDF plus frame /
// preview images. Production PDFs are large (full-resolution artwork), so
// they get their own, configurable size limit.
// ---------------------------------------------------------------------
const productionDir = path.join(__dirname, "..", "uploads", "production");

if (!fs.existsSync(productionDir)) {
  fs.mkdirSync(productionDir, { recursive: true });
}

const PDF_MIME = ["application/pdf", "application/x-pdf", "application/acrobat", "applications/vnd.pdf", "text/pdf"];
const PRODUCTION_MIME = {
  productionPdf: PDF_MIME,
  laserPdf: PDF_MIME,
  artwork: ["image/png", "image/jpeg"],
  frame: ["image/png"],
  preview: ["image/png", "image/jpeg"],
  plate: ["image/png", "image/jpeg"],
  overlay: ["image/png"],
  plateBare: ["image/png"],
  plateGod: ["image/png"],
  plateGodBare: ["image/png"],
  overlayBare: ["image/png"],
  original: ["image/png", "image/jpeg"],
};

upload.productionUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, productionDir),
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${file.fieldname}${path.extname(file.originalname).toLowerCase()}`;
      cb(null, uniqueName);
    },
  }),
  limits: {
    fileSize: (Number(process.env.PRODUCTION_FILE_MAX_MB) || 300) * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = PRODUCTION_MIME[file.fieldname];
    if (!allowed) return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    // Some systems send PDFs as a generic type: a .pdf name is enough here —
    // the importer itself checks that the content is a readable PDF.
    // CorelDRAW files (converted to PDF by the importer) come with many
    // different or generic types: the .cdr extension decides.
    const ext = path.extname(file.originalname || "").toLowerCase();
    const genericPdf =
      allowed === PDF_MIME &&
      ((["application/octet-stream", "binary/octet-stream", ""].includes(file.mimetype || "") && ext === ".pdf") ||
        ext === ".cdr");
    if (!allowed.includes(file.mimetype) && !genericPdf) {
      const err = new Error(`${file.fieldname} must be ${allowed.join(" or ")}`);
      err.code = "INVALID_FILE_TYPE";
      return cb(err);
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------
// Designer content images (god image, product photo) for production
// layouts. Kept apart from layout assets and the old AI-generate uploads.
// ---------------------------------------------------------------------
const designContentDir = path.join(__dirname, "..", "uploads", "design-content");

if (!fs.existsSync(designContentDir)) {
  fs.mkdirSync(designContentDir, { recursive: true });
}

const CONTENT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

upload.designContentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, designContentDir),
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${file.fieldname}${path.extname(file.originalname).toLowerCase()}`;
      cb(null, uniqueName);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!CONTENT_IMAGE_TYPES.includes(file.mimetype)) {
      const err = new Error("Image must be PNG, JPEG or WebP");
      err.code = "INVALID_FILE_TYPE";
      return cb(err);
    }
    cb(null, true);
  },
});

// Composed print artwork for the PDF export. Kept in memory: it is embedded
// into the PDF and never stored on its own. Large sizes at print resolution
// (e.g. 30×40 in) are big, hence the higher limit.
upload.aiExportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!["image/png", "image/jpeg"].includes(file.mimetype)) {
      const err = new Error("Artwork must be PNG or JPEG");
      err.code = "INVALID_FILE_TYPE";
      return cb(err);
    }
    cb(null, true);
  },
});

module.exports = upload;
