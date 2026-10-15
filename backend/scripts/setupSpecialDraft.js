// Imports a Special Die-Cut production PDF as a DRAFT layout, through the
// same code the Layouts page uses (import → mapping → validation). It never
// activates the layout: a layout that passes validation becomes VALIDATED
// only by the normal rules, and one that fails stays DRAFT.
// No AI provider is used.
//
//   node scripts/setupSpecialDraft.js <design.pdf> <laser.pdf> <mapping.json>
//
// The laser PDF is used only to verify that its cutline and cake match the
// design file exactly (the app makes its own laser file from the cutline).
// Safe to re-run: the same family + size is replaced (still DRAFT).
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const User = require("../src/models/User");
const LayoutVariant = require("../src/models/LayoutVariant");
const { extractPdfLayout } = require("../src/services/layout/pdfImporter");
const { cutlineDeviationMm, laserCutline } = require("../src/services/layout/cutlineCompare");
const { importProductionPdf, saveMapping } = require("../src/controllers/productionLayout.controller");
const { validateVariant } = require("../src/controllers/layoutVariant.controller");

const PRODUCTION_DIR = path.join(__dirname, "..", "src", "uploads", "production");

// Calls an Express handler and returns { status, body }.
const call = (handler, req) =>
  new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
        return this;
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });

(async () => {
  const [designFile, laserFile, mappingFile] = process.argv.slice(2);
  if (!designFile || !laserFile || !mappingFile) {
    console.error("Usage: node scripts/setupSpecialDraft.js <design.pdf> <laser.pdf> <mapping.json>");
    process.exit(2);
  }
  const mapping = JSON.parse(fs.readFileSync(mappingFile, "utf8"));
  if (mapping.cutType !== "special-die-cut") throw new Error("This script only sets up Special Die-Cut layouts.");

  // 1. The laser file must match the design file before anything is stored.
  const design = await extractPdfLayout(fs.readFileSync(designFile));
  const laser = await extractPdfLayout(fs.readFileSync(laserFile));
  const page = design.pages[mapping.pageIndex || 0];
  const cut = page.objects.find((o) => o.id === mapping.cutlineObjectId);
  const lCut = laserCutline(laser.pages[0]);
  const dev = cut && lCut ? cutlineDeviationMm(cut, lCut) : null;
  if (dev == null || dev > 0.5) {
    throw new Error(`Laser cutline does not match the design cutline (deviation ${dev == null ? "n/a" : `${dev.toFixed(2)} mm`}). Nothing imported.`);
  }
  console.log(`Laser cutline matches the design cutline (max deviation ${dev.toFixed(2)} mm).`);

  await mongoose.connect(process.env.MONGO_URI);
  const admin = await User.findOne({ role: "ADMIN" }).select("_id");
  if (!admin) throw new Error("No ADMIN user found (run npm run make-admin first).");

  // 2. Import (copy of the PDF in the uploads folder, like the upload does).
  const stored = path.join(PRODUCTION_DIR, `${Date.now()}-productionPdf.pdf`);
  fs.mkdirSync(PRODUCTION_DIR, { recursive: true });
  fs.copyFileSync(designFile, stored);
  const imported = await call(importProductionPdf, {
    file: { path: stored },
    body: {
      familyCode: mapping.familyCode,
      familyName: mapping.familyName,
      cutType: mapping.cutType,
      sizeCode: mapping.sizeCode,
      replace: true,
    },
    user: { userId: admin._id },
  });
  if (imported.status >= 300) throw new Error(`Import refused: ${imported.body.message}`);
  const variantId = imported.body.variantId;
  console.log(`Imported ${mapping.familyCode} ${mapping.sizeCode} → layout ${variantId}`);

  // 3. Mapping.
  const mapped = await call(saveMapping, {
    params: { id: variantId },
    body: {
      pageIndex: mapping.pageIndex || 0,
      cutlineObjectId: mapping.cutlineObjectId,
      registration: mapping.registration,
      excludedObjectIds: mapping.excludedObjectIds || [],
      regions: mapping.regions,
    },
  });
  if (mapped.status >= 300) throw new Error(`Mapping refused: ${mapped.body.message}`);

  // 4. Validation (same handler as the Validate button).
  const validated = await call(validateVariant, { params: { id: variantId } });
  const v = await LayoutVariant.findById(variantId);
  console.log(`\nTrim ${v.trim.widthMm}×${v.trim.heightMm} mm · ${v.regions.length} regions · status ${v.status}`);
  for (const r of validated.body.results.filter((x) => x.stage === "STRUCTURE")) {
    console.log(`  ${r.status.padEnd(4)} ${r.code} — ${r.message}`);
  }
  console.log(`\nStructure: ${validated.body.status} · production values: ${validated.body.productionStatus} · layout status: ${v.status}`);
  if (v.status === "ACTIVE") throw new Error("Unexpected: layout is ACTIVE.");
  console.log("Next (admin, Layouts page): open the layout → Validate step → “Refresh preview assets” to render its preview layers.");
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error("Setup failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
