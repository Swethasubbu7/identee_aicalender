// Re-saves a layout's CURRENT mapping unchanged through the real saveMapping
// handler (e.g. after attaching a laser PDF), then prints the validation.
//   node scripts/resaveMapping.js <variantId>
require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const LayoutVariant = require("../src/models/LayoutVariant");
require("../src/models/LayoutFamily");
const { saveMapping } = require("../src/controllers/productionLayout.controller");
const { validateVariant } = require("../src/controllers/layoutVariant.controller");
const call = (h, req) => new Promise((resolve, reject) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; } };
  Promise.resolve(h(req, res)).catch(reject);
});
(async () => {
  const id = process.argv[2];
  await mongoose.connect(process.env.MONGO_URI);
  const before = await LayoutVariant.findById(id).lean();
  const m = before.mapping;
  const body = Object.fromEntries(["pageIndex", "cutlineObjectId", "cutlineObjectIds", "laserCutlineObjectIds", "laserAlignment", "artworkObjectIds", "registration", "excludedObjectIds", "regions"].map((k) => [k, m[k]]));
  const user = { role: "ADMIN", userId: null };
  const saved = await call(saveMapping, { params: { id }, body, user });
  console.log("saveMapping:", saved.status, saved.body.message);
  const v = await call(validateVariant, { params: { id }, user, body: {} });
  console.log("validation:", v.body.status);
  for (const r of v.body.results || []) if (r.status !== "PASS" && r.status !== "PENDING") console.log(`  ${r.status} ${r.code} — ${r.message}`);
  const after = await LayoutVariant.findById(id).lean();
  console.log("cutline unchanged:", before.cutline.path === after.cutline.path, "| trim", JSON.stringify(after.trim), "| status", after.status);
  await mongoose.disconnect();
})().catch(async (e) => { console.error(e.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });
