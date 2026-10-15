// CorelDRAW (.cdr) uploads. The importer works on PDF, so a CDR file is
// converted to PDF with an installed converter — Inkscape or LibreOffice,
// both of which read CDR through libcdr and keep vector paths and text:
//
//   CDR_CONVERTER=C:\Program Files\Inkscape\bin\inkscape.com      (or)
//   CDR_CONVERTER=C:\Program Files\LibreOffice\program\soffice.com
//
// Without a converter (or when it cannot read the file, e.g. a CorelDRAW
// version newer than libcdr supports) the admin gets a clear message and the
// option to export a PDF from CorelDRAW. Nothing is guessed from the CDR's
// preview picture: geometry only ever comes from real vector data.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { execFile } = require("child_process");
const { PdfReadError } = require("./pdfImporter");

const CONVERT_TIMEOUT_MS = Number(process.env.CDR_CONVERT_TIMEOUT_MS) || 180000;

// Minimal ZIP reader (CorelDRAW X4+ files are ZIP packages).
const zipEntries = (buf) => {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let k = 0; k < count && p + 46 <= buf.length; k += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    entries.set(name, { method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const read = (name) => {
    const e = entries.get(name);
    if (!e) return null;
    const h = e.offset;
    const start = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28);
    const data = buf.slice(start, start + e.size);
    return e.method === 8 ? zlib.inflateRawSync(data) : data;
  };
  return { names: [...entries.keys()], read };
};

/** CorelDRAW file? (ZIP package with Corel content, or the older RIFF CDR). */
const isCdr = (buf, filename = "") => {
  if (/\.cdr$/i.test(filename)) return true;
  if (buf.length > 12 && buf.slice(0, 4).toString("latin1") === "RIFF" && /^CDR/i.test(buf.slice(8, 11).toString("latin1"))) return true;
  if (buf.readUInt32LE(0) === 0x04034b50) {
    const zip = zipEntries(buf);
    return Boolean(zip && zip.names.some((n) => n === "content/root.dat" || n === "content/riffData.cdr"));
  }
  return false;
};

/** "CorelDRAW 2022" etc., read from the package metadata (when present). */
const cdrVersion = (buf) => {
  try {
    const zip = buf.readUInt32LE(0) === 0x04034b50 ? zipEntries(buf) : null;
    const meta = zip?.read("META-INF/metadata.xml")?.toString("utf8") || "";
    return /<cdr:ProductName>([^<]+)</.exec(meta)?.[1] || null;
  } catch {
    return null;
  }
};

const run = (cmd, args) =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout: CONVERT_TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) =>
      err ? reject(Object.assign(err, { stderr: String(stderr || "") })) : resolve(stdout),
    ),
  );

/**
 * Converts a CDR file to PDF next to it. Returns the PDF path.
 * Throws PdfReadError with a clear, actionable message.
 */
const convertCdrToPdf = async (cdrPath) => {
  const buf = await fs.promises.readFile(cdrPath);
  const version = cdrVersion(buf);
  const converter = process.env.CDR_CONVERTER;
  const exportHint = "Or export a PDF from CorelDRAW (File → Export → PDF) and upload that.";
  if (!converter) {
    throw new PdfReadError(
      "CDR_CONVERTER_MISSING",
      `CorelDRAW file${version ? ` (${version})` : ""}: no CDR converter is installed on the server. ` +
        `Install Inkscape or LibreOffice and set CDR_CONVERTER in backend/.env. ${exportHint}`,
    );
  }
  if (!fs.existsSync(converter)) {
    throw new PdfReadError("CDR_CONVERTER_MISSING", `The CDR converter was not found at ${converter}. ${exportHint}`);
  }
  const dir = path.dirname(cdrPath);
  const base = path.basename(cdrPath, path.extname(cdrPath));
  const pdfPath = path.join(dir, `${base}.pdf`);
  try {
    if (/soffice|libreoffice/i.test(path.basename(converter))) {
      await run(converter, ["--headless", "--convert-to", "pdf", "--outdir", dir, cdrPath]);
    } else {
      await run(converter, [cdrPath, "--export-type=pdf", `--export-filename=${pdfPath}`]);
    }
  } catch (err) {
    throw new PdfReadError(
      "CDR_CONVERT_FAILED",
      `The CorelDRAW file${version ? ` (${version})` : ""} could not be converted` +
        `${err.killed ? " (timed out)" : ""}. Newer CorelDRAW versions are not always readable by the converter. ${exportHint}`,
    );
  }
  if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size < 100) {
    throw new PdfReadError("CDR_CONVERT_FAILED", `The converter produced no PDF for this CorelDRAW file. ${exportHint}`);
  }
  return pdfPath;
};

module.exports = { isCdr, cdrVersion, convertCdrToPdf, zipEntries };
