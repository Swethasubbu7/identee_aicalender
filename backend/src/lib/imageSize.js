// Reads pixel dimensions from PNG / JPEG headers without decoding the image.
const fs = require("fs");

const readHeader = (filePath, bytes = 512 * 1024) => {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
};

const pngSize = (buf) =>
  buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString("ascii", 12, 16) === "IHDR"
    ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: "png" }
    : null;

const jpegSize = (buf) => {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), type: "jpeg" };
    }
    i += 2 + len;
  }
  return null;
};

// WebP: lossy (VP8), lossless (VP8L) and extended (VP8X) headers.
const webpSize = (buf) => {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), type: "webp" };
  }
  if (chunk === "VP8 ") {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, type: "webp" };
  }
  if (chunk === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, type: "webp" };
  }
  return null;
};

// Accepts a file path or an in-memory Buffer.
const imageSize = (input) => {
  if (!input) return null;
  const buf = Buffer.isBuffer(input) ? input : readHeader(input);
  return pngSize(buf) || jpegSize(buf) || webpSize(buf);
};

module.exports = { imageSize, pngSize, jpegSize, webpSize };
