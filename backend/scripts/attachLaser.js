// Attaches a laser PDF to an existing layout through the real upload
// handler (same checks as the Layouts page), then re-runs validation.
//   node scripts/attachLaser.js <variantId> <laser.pdf>
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { uploadLaserPdf } = require("../src/controllers/productionLayout.controller");
const { validateVariant } = require("../src/controllers/layoutVariant.controller");
const call = (h, req) => new Promise((resolve, reject) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; } };
  Promise.resolve(h(req, res)).catch(reject);
});
(async () => {
  const [id, laser] = process.argv.slice(2);
  await mongoose.connect(process.env.MONGO_URI);
  const dest = path.join(__dirname, "../src/uploads/production", `${Date.now()}-laserPdf.pdf`);
  fs.copyFileSync(laser, dest);
  const user = { role: "ADMIN", userId: null };
  const up = await call(uploadLaserPdf, { params: { id }, user, file: { path: dest, filename: path.basename(dest), originalname: path.basename(laser), mimetype: "application/pdf", size: fs.statSync(dest).size } });
  console.log("laser upload:", up.status, up.body.message);
  const v = await call(validateVariant, { params: { id }, user, body: {} });
  console.log("validation:", v.status, v.body.status);
  for (const r of v.body.results || v.body.validation?.results || []) if (r.status !== "PASS") console.log(`  ${r.status} ${r.code} — ${r.message}`);
  await mongoose.disconnect();
})().catch(async (e) => { console.error(e.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });
