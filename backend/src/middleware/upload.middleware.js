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

module.exports = upload;
