const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { extractPdfLayout } = require("../src/services/layout/pdfImporter");
const {
  buildVariantGeometry,
  findCutlineCandidates,
  translatePath,
  MappingError,
} = require("../src/services/layout/mappingBuilder");
const { imageSize } = require("../src/lib/imageSize");

// Builds a minimal one-page PDF (12×18 in) with known geometry:
//  - a stroked closed rectangle over the whole page (cutline)
//  - a filled 2×3 in box whose lower-left corner is 1 in from the left/bottom
//  - 24 pt Helvetica text
function buildTestPdf() {
  const content = [
    "0 0 864 1296 re S",
    "1 1 0.6 rg 72 72 144 216 re f",
    "BT /F1 24 Tf 100 1000 Td (CLUTCH CREATION) Tj ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 864 1296] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

test("pdfImporter extracts real geometry in mm from the page top-left", async () => {
  const result = await extractPdfLayout(buildTestPdf());
  assert.equal(result.pageCount, 1);
  const page = result.pages[0];
  assert.ok(near(page.widthMm, 304.8) && near(page.heightMm, 457.2));

  const cut = page.objects.find((o) => o.type === "path" && o.paint === "stroke");
  assert.ok(cut, "stroked cutline found");
  assert.equal(cut.closed, true);
  assert.deepEqual(
    [cut.bbox.x, cut.bbox.y, cut.bbox.width, cut.bbox.height].map((v) => Math.round(v * 10) / 10),
    [0, 0, 304.8, 457.2],
  );

  const box = page.objects.find((o) => o.type === "path" && o.paint === "fill");
  assert.ok(near(box.bbox.x, 25.4) && near(box.bbox.width, 50.8) && near(box.bbox.height, 76.2));
  // PDF y is bottom-up: top edge = 1296 - (72 + 216) pt = 1008 pt = 355.6 mm.
  assert.ok(near(box.bbox.y, 355.6), `box y ${box.bbox.y}`);
  assert.equal(box.fillColor, "#ffff99");

  const text = page.objects.find((o) => o.type === "text");
  assert.equal(text.text, "CLUTCH CREATION");
  assert.equal(text.fontName, "Helvetica");
  assert.equal(text.fontSizePt, 24);
  assert.equal(text.horizontalScale, 1);

  assert.deepEqual(findCutlineCandidates(page, 304.8, 457.2, 0.5), [cut.id]);
});

test("pdfImporter rejects data that is not a PDF", async () => {
  await assert.rejects(extractPdfLayout(Buffer.from("not a pdf")));
});

// --- mapping (synthetic objects) -----------------------------------------
const page = {
  objects: [
    { id: "cut", type: "path", paint: "stroke", closed: true, bbox: { x: 100, y: 50, width: 304.8, height: 457.2 },
      path: "M100 50 L404.8 50 L404.8 507.2 L100 507.2 Z", layer: "CUTLINE" },
    { id: "open", type: "path", paint: "stroke", closed: false, bbox: { x: 0, y: 0, width: 10, height: 10 }, path: "M0 0 L10 10" },
    { id: "name1", type: "text", bbox: { x: 110, y: 350, width: 200, height: 30 }, text: "CLUTCH", fontName: "Cambria-Bold", fontSizePt: 86.27, horizontalScale: 1.09 },
    { id: "name2", type: "text", bbox: { x: 300, y: 352, width: 90, height: 30 }, text: "CREATION", fontName: "Cambria-Bold", fontSizePt: 86.27, horizontalScale: 1.09 },
    { id: "oval", type: "path", paint: "fill", closed: true, bbox: { x: 150, y: 390, width: 200, height: 110 },
      path: "M150 445 C150 390 350 390 350 445 C350 500 150 500 150 445 Z" },
    { id: "frameImg", type: "image", bbox: { x: 98, y: 48, width: 309, height: 300 }, imageWidthPx: 2400, imageHeightPx: 2330 },
  ],
};

test("translatePath shifts every coordinate pair", () => {
  assert.equal(translatePath("M100 50 L404.8 50 Z", -100, -50), "M0 0 L304.8 0 Z");
  assert.equal(
    translatePath("C1 2 3 4 5 6 Q7 8 9 10", 1, 10),
    "C2 12 4 14 6 16 Q8 18 10 20",
  );
  assert.equal(translatePath(null, 1, 1), null);
});

test("mapping re-bases geometry on the cutline and keeps text styles from the PDF", () => {
  const g = buildVariantGeometry(page, {
    cutlineObjectId: "cut",
    regions: [
      { role: "NAME_TEXT", objectIds: ["name1", "name2"] },
      { role: "CALENDAR_AREA", objectIds: ["oval"] },
      { role: "TEXT_LINE_1", objectIds: ["name1"], binding: "productList", textStyle: { align: "left", minPt: "40" } },
      { role: "FRAME", objectIds: ["frameImg"] },
    ],
  });
  assert.deepEqual(g.trim, { widthMm: 304.8, heightMm: 457.2 });
  assert.equal(g.cutline.path, "M0 0 L304.8 0 L304.8 457.2 L0 457.2 Z");
  assert.equal(g.cutline.sourceLayer, "CUTLINE");

  const [name, cal, line1, frame] = g.regions;
  assert.deepEqual(name.box, { x: 10, y: 300, width: 280, height: 32 }); // union of x 110–310 and 300–390
  assert.equal(name.policy, "APP_TEXT");
  assert.equal(name.binding, "businessName");
  assert.equal(name.sampleText, "CLUTCH\nCREATION");
  assert.deepEqual(name.textStyle, { fontFamily: "Cambria-Bold", minPt: 86.27, maxPt: 86.27, horizontalScale: 1.09 });
  assert.deepEqual(name.sourceObjectIds, ["name1", "name2"]);

  assert.equal(cal.shape, "path");
  assert.equal(cal.policy, "APP_CALENDAR");
  assert.equal(cal.path.startsWith("M50 395"), true);

  assert.equal(line1.binding, "productList");
  assert.equal(line1.textStyle.align, "left");
  assert.equal(line1.textStyle.minPt, 40);

  assert.equal(frame.policy, "LOCKED");
  assert.deepEqual(g.frameImagePx, { width: 2400, height: 2330 });
});

test("mapping rejects anything not backed by real PDF objects", () => {
  const bad = (mapping, pattern) =>
    assert.throws(() => buildVariantGeometry(page, mapping), (e) => e instanceof MappingError && pattern.test(e.message));
  bad({ regions: [] }, /Select the cutline/);
  bad({ cutlineObjectId: "name1" }, /vector path/);
  bad({ cutlineObjectId: "open" }, /not closed/);
  bad({ cutlineObjectId: "cut", regions: [{ role: "NAME_TEXT", objectIds: [] }] }, /no objects/);
  bad({ cutlineObjectId: "cut", regions: [{ role: "NAME_TEXT", objectIds: ["ghost"] }] }, /not on this page/);
  bad({ cutlineObjectId: "cut", regions: [{ role: "MADE_UP", objectIds: ["oval"] }] }, /Unknown role/);
  bad({ cutlineObjectId: "cut", regions: [{ role: "TEXT_LINE_2", objectIds: ["oval"], binding: "x" }] }, /binding/);
});

test("imageSize reads PNG and JPEG headers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "imgsize-"));
  const png = Buffer.alloc(33);
  png.writeUInt32BE(0x89504e47, 0);
  png.write("\r\n\x1a\n", 4, "latin1");
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(3600, 16);
  png.writeUInt32BE(5400, 20);
  fs.writeFileSync(path.join(dir, "a.png"), png);
  assert.deepEqual(imageSize(path.join(dir, "a.png")), { width: 3600, height: 5400, type: "png" });

  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03]);
  fs.writeFileSync(path.join(dir, "b.jpg"), jpg);
  assert.deepEqual(imageSize(path.join(dir, "b.jpg")), { width: 800, height: 600, type: "jpeg" });

  fs.writeFileSync(path.join(dir, "c.txt"), "hello");
  assert.equal(imageSize(path.join(dir, "c.txt")), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- registration: cutline drawn beside the artwork -----------------------
const besidePage = {
  objects: [
    // Artwork board 0..300 × 0..450 with its cake rectangle at (100, 340).
    { id: "artCake", type: "path", paint: "stroke", closed: true, bbox: { x: 100, y: 340, width: 127, height: 101.6 }, path: "M100 340 L227 340 L227 441.6 L100 441.6 Z" },
    { id: "name", type: "text", bbox: { x: 20, y: 290, width: 260, height: 30 }, text: "NAME", fontName: "Cinzel-Black", fontSizePt: 34.4 },
    // Cutline drawn 700 mm to the right and 40 mm lower, with its own cake copy.
    { id: "cut", type: "path", paint: "stroke", closed: true, bbox: { x: 700, y: 40, width: 304.8, height: 457.2 }, path: "M700 40 L1004.8 40 L1004.8 497.2 L700 497.2 Z" },
    { id: "cutCake", type: "path", paint: "stroke", closed: true, bbox: { x: 800, y: 380, width: 127, height: 101.6 }, path: "M800 380 L927 380 L927 481.6 L800 481.6 Z" },
    { id: "smallMark", type: "path", paint: "stroke", closed: true, bbox: { x: 10, y: 10, width: 5, height: 5 }, path: "M10 10 L15 10 L15 15 L10 15 Z" },
  ],
};

test("registration pair is found automatically and aligns the cutline exactly", () => {
  const { findRegistrationPair } = require("../src/services/layout/mappingBuilder");
  const pair = findRegistrationPair(besidePage, "cut");
  assert.deepEqual(pair, { artObjectId: "artCake", cutlineObjectId: "cutCake" });

  const g = buildVariantGeometry(besidePage, {
    cutlineObjectId: "cut",
    registration: pair,
    regions: [
      { role: "CAKE_MOUNT", objectIds: ["artCake"] },
      { role: "NAME_TEXT", objectIds: ["name"] },
    ],
  });
  assert.deepEqual(g.registrationOffsetMm, { x: 700, y: 40 });
  assert.equal(g.cutline.path, "M0 0 L304.8 0 L304.8 457.2 L0 457.2 Z");
  // Cake on the artwork lands exactly where its copy sits inside the cutline.
  assert.deepEqual(g.regions[0].box, { x: 100, y: 340, width: 127, height: 101.6 });
  assert.deepEqual(g.regions[1].box, { x: 20, y: 290, width: 260, height: 30 });
});

test("registration marks must exist, differ and match in size", () => {
  const bad = (registration, pattern) =>
    assert.throws(
      () => buildVariantGeometry(besidePage, { cutlineObjectId: "cut", registration, regions: [] }),
      (e) => e instanceof MappingError && pattern.test(e.message),
    );
  bad({ artObjectId: "artCake" }, /both registration marks/);
  bad({ artObjectId: "artCake", cutlineObjectId: "artCake" }, /different objects/);
  bad({ artObjectId: "smallMark", cutlineObjectId: "cutCake" }, /not the same size/);
});

test("no registration pair is suggested when the cutline already sits on the artwork", () => {
  const { findRegistrationPair } = require("../src/services/layout/mappingBuilder");
  assert.equal(findRegistrationPair(page, "cut"), null);
});

test("a text box picked without its text still gets the sample text style", () => {
  const boxPage = {
    objects: [
      { id: "cut", type: "path", paint: "stroke", closed: true, bbox: { x: 0, y: 0, width: 304.8, height: 457.2 }, path: "M0 0 L304.8 0 L304.8 457.2 L0 457.2 Z" },
      { id: "yellow", type: "path", paint: "fillStroke", closed: true, bbox: { x: 10, y: 340, width: 68, height: 98 }, fillColor: "#ffff99", strokeColor: "#ffcc00", strokeWidthMm: 1.41 },
      { id: "list", type: "text", bbox: { x: 20, y: 350, width: 45, height: 80 }, text: "T-SHIRT\nSHIRT", fontName: "CenturyGothic-Bold", fontSizePt: 17.9, horizontalScale: 1 },
      { id: "elsewhere", type: "text", bbox: { x: 200, y: 20, width: 50, height: 10 }, text: "OTHER", fontName: "Arial", fontSizePt: 10 },
    ],
  };
  const g = buildVariantGeometry(boxPage, { cutlineObjectId: "cut", regions: [{ role: "SIDE_BOX_LEFT", objectIds: ["yellow"] }] });
  const left = g.regions[0];
  assert.equal(left.textStyle.fontFamily, "CenturyGothic-Bold");
  assert.equal(left.textStyle.maxPt, 17.9);
  assert.equal(left.sampleText, "T-SHIRT\nSHIRT");
  assert.deepEqual(left.textSourceIds, ["list"]);
  assert.deepEqual(left.box, { x: 10, y: 340, width: 68, height: 98 }); // geometry = the box itself
  assert.equal(left.boxStyle.fillColor, "#ffff99");
});

test("a side box picked by its photo still gets the box border style", () => {
  const photoPage = {
    objects: [
      { id: "cut", type: "path", paint: "stroke", closed: true, bbox: { x: 0, y: 0, width: 381, height: 609.6 }, path: "M0 0 L381 0 L381 609.6 L0 609.6 Z" },
      { id: "border", type: "path", paint: "stroke", closed: true, bbox: { x: 285.5, y: 456.5, width: 84.8, height: 122.8 }, strokeColor: "#ffcc00", strokeWidthMm: 1.41 },
      { id: "photo", type: "image", bbox: { x: 285.31, y: 456.52, width: 85.02, height: 122.38 }, imageWidthPx: 669, imageHeightPx: 963 },
    ],
  };
  const g = buildVariantGeometry(photoPage, { cutlineObjectId: "cut", regions: [{ role: "SIDE_BOX_RIGHT", objectIds: ["photo"] }] });
  assert.equal(g.regions[0].boxSourceId, "border");
  assert.deepEqual(g.regions[0].boxStyle, { fillColor: null, strokeColor: "#ffcc00", strokeWidthMm: 1.41 });
});
