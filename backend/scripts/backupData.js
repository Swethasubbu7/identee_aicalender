// Full backup before risky changes: every MongoDB collection as Extended JSON
// (ObjectIds and dates preserved) plus the uploaded / imported files.
// Usage: node scripts/backupData.js [label]  → backups/<timestamp>-<label>/
const path = require("path");
const fs = require("fs");
require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const { EJSON } = require("bson");

(async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = path.join(__dirname, "../../backups", `${stamp}-${process.argv[2] || "manual"}`);
  fs.mkdirSync(path.join(out, "db"), { recursive: true });
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  for (const { name } of await db.listCollections().toArray()) {
    const docs = await db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(out, "db", `${name}.json`), EJSON.stringify(docs, { relaxed: false }));
    console.log(`${name}: ${docs.length}`);
  }
  await mongoose.disconnect();
  for (const dir of ["src/uploads", "uploads", "src/storage"]) {
    const src = path.join(__dirname, "..", dir);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(out, "files", dir), { recursive: true });
  }
  console.log("backup:", out);
})().catch(async (e) => {
  console.error(e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
