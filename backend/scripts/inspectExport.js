// READ-ONLY: inspects the exported print + laser PDFs of one design.
//   node scripts/inspectExport.js <jobId> <variationIndex> [outDir]
// Prints page / trim boxes, the embedded artwork's pixel size and real DPI
// at the trim size, and the laser file's vector paths; saves the embedded
// artwork as JPEG in outDir (for visual inspection). No AI, no writes to
// the database.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const zlib = require("zlib");
const { PDFDocument, PDFName, PDFRawStream, PDFArray } = require("pdf-lib");
const AiCalendarJob = require("../src/models/AiCalendarJob");
const { resolveUpload } = require("../src/services/ai/uploadPaths");

const MM_PER_PT = 25.4 / 72;
const box = (b) => b && `${(b.width * MM_PER_PT).toFixed(1)}×${(b.height * MM_PER_PT).toFixed(1)} mm at (${(b.x * MM_PER_PT).toFixed(1)}, ${(b.y * MM_PER_PT).toFixed(1)})`;

(async () => {
  const [jobId, index = "0", outDir] = process.argv.slice(2);
  await mongoose.connect(process.env.MONGO_URI);
  const job = await AiCalendarJob.findById(jobId).lean();
  const v = job?.variations?.[Number(index)];
  if (!v?.exportPdf) throw new Error("This design has no export yet");
  for (const [label, stored] of [["Print PDF", v.exportPdf], ["Laser PDF", v.exportCutlinePdf]]) {
    const file = resolveUpload(stored);
    const doc = await PDFDocument.load(fs.readFileSync(file));
    const page = doc.getPage(0);
    console.log(`${label}: ${path.basename(file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
    console.log(`  MediaBox ${box(page.getMediaBox())}`);
    console.log(`  TrimBox  ${box(page.getTrimBox())}`);
    const trim = page.getTrimBox();
    // Embedded images.
    let n = 0;
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const d = obj.dict;
      if (d.get(PDFName.of("Subtype"))?.toString() !== "/Image") continue;
      const w = d.get(PDFName.of("Width"))?.asNumber?.() ?? Number(d.get(PDFName.of("Width")));
      const h = d.get(PDFName.of("Height"))?.asNumber?.() ?? Number(d.get(PDFName.of("Height")));
      const dpi = Math.round(Math.min(w / (trim.width / 72), h / (trim.height / 72)));
      console.log(`  Image ${w}×${h} px, filter ${d.get(PDFName.of("Filter"))} → about ${dpi} DPI over the trim`);
      if (outDir && String(d.get(PDFName.of("Filter"))) === "/DCTDecode") {
        const out = path.join(outDir, `${label.startsWith("Print") ? "print" : "laser"}-image-${n}.jpg`);
        fs.writeFileSync(out, obj.contents);
        console.log(`  saved ${out}`);
      }
      n += 1;
    }
    if (!n) console.log("  (no raster images — vector only)");
    // Content streams are usually Flate-compressed: decode before counting.
    const contents = page.node.get(PDFName.of("Contents"));
    const streams = !contents ? [] : contents instanceof PDFArray ? contents.asArray() : [contents];
    const ops = streams
      .map((ref) => {
        const raw = Buffer.from(doc.context.lookup(ref).contents || []);
        try {
          return zlib.inflateSync(raw).toString("latin1");
        } catch {
          return raw.toString("latin1");
        }
      })
      .join("\n");
    if (label === "Laser PDF") {
      const count = (re) => (ops.match(re) || []).length;
      console.log(`  content ${ops.length} bytes decoded; subpaths ${count(/ m\b/g)}, lines ${count(/ l\b/g)}, curves ${count(/ c\b/g)}, strokes ${count(/\bS\b/g)}`);
    }
  }
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
