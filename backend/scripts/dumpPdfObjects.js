// Read-only: lists the main objects the importer sees on a PDF page
// (large paths, images, text), to plan a manual mapping. No DB, no AI.
//   node scripts/dumpPdfObjects.js <file.pdf> [pageIndex] [minSizeMm]
const { extractPdfLayout } = require("../src/services/layout/pdfImporter");
(async () => {
  const [file, page = 0, min = 20] = process.argv.slice(2);
  const layout = await extractPdfLayout(require("fs").readFileSync(file));
  const p = layout.pages[Number(page)];
  console.log(`page ${p.widthMm ?? p.width}×${p.heightMm ?? p.height} mm, objects ${p.objects.length}, layers ${JSON.stringify(layout.layers || [])}`);
  const r = (v) => Math.round(v * 10) / 10;
  for (const o of p.objects) {
    const b = o.bbox;
    if (o.type !== "text" && b.width < min && b.height < min) continue;
    const extra = o.type === "image" ? `${o.imageWidthPx}×${o.imageHeightPx}px ${Math.round(o.imageWidthPx / (b.width / 25.4))}dpi` : o.type === "text" ? JSON.stringify(String(o.text).slice(0, 50)) + ` ${o.fontName || ""} ${o.fontSizeMm ? r(o.fontSizeMm) + "mm" : ""}` : `${o.paint} fill=${o.fillColor} stroke=${o.strokeColor} seg=${o.segments}`;
    console.log(`${o.id.padEnd(8)} ${o.type.padEnd(5)} x${r(b.x)} y${r(b.y)} ${r(b.width)}×${r(b.height)} ${extra} ${o.layer ? "[" + o.layer + "]" : ""}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
