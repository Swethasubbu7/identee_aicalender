// Read-only import report for designer PDFs: what the importer detects in
// each page (and its laser PDF), and whether the file imports automatically,
// needs manual mapping, imports only as a draft, or cannot be processed.
// Never writes to the database; no AI.
//
//   node scripts/analysePdfs.js <manifest.json>
// manifest: [{ "design": "path.pdf", "laser": "path.pdf"?, "cutType": "die-cut",
//              "sizes": ["12x18", …] (per page; omit = detect from the cutline) }]
const fs = require("fs");
const path = require("path");
const { extractPdfLayout } = require("../src/services/layout/pdfImporter");
const { analysePage, analyseLaserPage, compareDesignLaser, importVerdict, pairLaserPage } = require("../src/services/layout/pdfAnalysis");
const { CALENDAR_FORMATS } = require("../src/constants/calendar");

const formatOf = (cutType, size) => CALENDAR_FORMATS.find((f) => f.cutType === cutType && f.sizeCode === size);

// Without a given size: the catalogue size whose cutline is found on the page.
const detectSize = (page, cutType, laserPage) => {
  for (const f of CALENDAR_FORMATS.filter((x) => x.cutType === cutType)) {
    if (analysePage(page, f).cutline.candidates.length) return f.sizeCode;
    if (laserPage && analyseLaserPage(laserPage, f).cutlineSizeOk) return f.sizeCode;
  }
  return null;
};

const extract = async (file) => {
  const t = Date.now();
  try {
    const data = await extractPdfLayout(fs.readFileSync(file));
    return { data, ms: Date.now() - t };
  } catch (err) {
    return { error: `${err.code || "ERROR"}: ${err.message}`, ms: Date.now() - t };
  }
};

(async () => {
  const manifest = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const rows = [];
  for (const entry of manifest) {
    const name = path.basename(entry.design);
    if (!fs.existsSync(entry.design)) {
      rows.push({ file: name, verdict: "MISSING FILE" });
      continue;
    }
    const design = await extract(entry.design);
    const laser = entry.laser && fs.existsSync(entry.laser) ? await extract(entry.laser) : null;
    if (design.error) {
      console.log(`\n■ ${name}\n  CANNOT: ${design.error}`);
      rows.push({ file: name, verdict: "CANNOT", detail: design.error });
      continue;
    }
    console.log(`\n■ ${name}  (${design.data.pageCount} page(s), read in ${(design.ms / 1000).toFixed(1)} s)${laser ? `  + laser ${path.basename(entry.laser)}${laser.error ? ` — ${laser.error}` : ` (${laser.data.pageCount} page(s))`}` : ""}`);
    for (const page of design.data.pages) {
      const sameIndex = laser?.data?.pages[page.index] || null;
      const size = entry.sizes?.[page.index] || detectSize(page, entry.cutType, sameIndex);
      const format = size ? formatOf(entry.cutType, size) : null;
      const laserPage = format && laser?.data ? pairLaserPage(laser.data, page.index, format) : sameIndex;
      if (!format) {
        // Closest outline to any catalogue size (never used automatically).
        const near = CALENDAR_FORMATS.filter((f) => f.cutType === entry.cutType)
          .flatMap((f) => analysePage(page, f).cutline.nearMisses.map((n) => `${n.sizeMm} mm (near ${f.sizeCode})`));
        console.log(
          `  p${page.index + 1}: ${page.widthMm}×${page.heightMm} mm — no ${entry.cutType} cutline of a catalogue size found` +
            `${laserPage ? " (laser page neither)" : ""}${near.length ? ` · near-size outline: ${[...new Set(near)].slice(0, 2).join("; ")}` : ""}` +
            " → DRAFT only (admin chooses the size, maps the artwork)",
        );
        rows.push({ file: name, page: page.index + 1, verdict: "DRAFT", detail: "size not detectable" });
        continue;
      }
      const a = analysePage(page, format);
      const l = laserPage ? analyseLaserPage(laserPage, format) : null;
      const cmp = l ? compareDesignLaser(page, a, l) : null;
      const v = importVerdict(a, l, cmp);
      const d = a.detectedWithLaser || a.detected;
      console.log(
        `  p${page.index + 1} ${entry.cutType} ${size}: page ${page.widthMm}×${page.heightMm} mm${page.rotation ? ` rot ${page.rotation}` : ""} · ${a.content}` +
          ` · ${a.counts.vectorPaths} paths, ${a.counts.images} images, ${a.counts.textBlocks} text${a.counts.truncated ? " (truncated)" : ""}`,
      );
      console.log(
        `      cutline ${d.cutline}${a.cutline.pieces.length ? ` (${a.cutline.pieces.length} pieces to join)` : ""}${a.registration ? " +registration" : ""}` +
          ` · cake ${d.cake}${a.cake.candidates.some((c) => c.orientation === "rotated") ? " (a rotated cake rectangle exists)" : ""}` +
          ` · text ${d.text}${a.text.fonts.length ? ` [${a.text.fonts.slice(0, 3).join(", ")}]` : ""}` +
          ` · lowest raster ${a.lowestDpi ?? "–"} DPI · guide labels ${a.guideLabels.length}` +
          (a.cutline.nearMisses.length ? ` · near-size outline(s) ${a.cutline.nearMisses.map((n) => n.sizeMm).join(", ")} mm` : ""),
      );
      if (l) {
        console.log(
          `      laser p${laserPage.index + 1}: cutline ${l.cutline ? `${Math.round(l.cutline.bbox.width)}×${Math.round(l.cutline.bbox.height)} mm${l.cutlineSizeOk ? "" : " (NOT the catalogue size)"}` : "none"}` +
            ` · cake ${l.cake ? l.cake.orientation : "none"}` +
            (cmp.cutlineDeviationMm != null ? ` · design vs laser ${cmp.cutlineDeviationMm} mm` : "") +
            (cmp.suggestedAlignment ? ` · placement: ${cmp.suggestedAlignment.method}${cmp.suggestedAlignment.exact ? " (exact)" : " (needs confirmation)"}` : ""),
        );
      }
      console.log(`      → ${v.level}: ${v.text}`);
      rows.push({ file: name, page: page.index + 1, size, verdict: v.level });
    }
  }
  const count = (lvl) => rows.filter((r) => r.verdict === lvl).length;
  console.log(`\nPages: ${rows.length} · AUTO ${count("AUTO")} · MANUAL ${count("MANUAL")} · DRAFT ${count("DRAFT")} · CANNOT ${count("CANNOT")}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
