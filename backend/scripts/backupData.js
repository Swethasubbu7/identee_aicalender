// Full backup before risky changes: every MongoDB collection as Extended JSON
// (ObjectIds and dates preserved) plus the uploaded / imported files.
// GridFS files (bucket "designFiles") are saved as real files with their
// metadata instead of raw chunks, so the backup stays usable as it grows.
// Atlas free clusters have no Atlas backups: this script IS the backup.
// Usage: node scripts/backupData.js [label]  → backups/<timestamp>-<label>/
// Read-only on the database.
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const { EJSON } = require("bson");

const GRIDFS_BUCKET = "designFiles";

(async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = path.join(__dirname, "../../backups", `${stamp}-${process.argv[2] || "manual"}`);
  fs.mkdirSync(path.join(out, "db"), { recursive: true });
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  for (const { name } of await db.listCollections().toArray()) {
    if (name === `${GRIDFS_BUCKET}.chunks`) continue; // saved as files below
    const docs = await db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(out, "db", `${name}.json`), EJSON.stringify(docs, { relaxed: false }));
    console.log(`${name}: ${docs.length}`);
  }

  // GridFS → files/gridfs/<key>, checked against the stored SHA-256.
  const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: GRIDFS_BUCKET });
  let saved = 0;
  let mismatched = 0;
  for await (const file of db.collection(`${GRIDFS_BUCKET}.files`).find({})) {
    const target = path.join(out, "files", "gridfs", ...String(file.filename).split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await pipeline(bucket.openDownloadStream(file._id), fs.createWriteStream(target));
    const expected = file.metadata?.sha256;
    if (expected) {
      const actual = crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
      if (actual !== expected) mismatched += 1;
    }
    saved += 1;
  }
  if (saved) console.log(`gridfs files: ${saved}${mismatched ? ` (${mismatched} CHECKSUM MISMATCH)` : " (checksums OK)"}`);
  await mongoose.disconnect();

  for (const dir of ["src/uploads", "uploads", "src/storage"]) {
    const src = path.join(__dirname, "..", dir);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(out, "files", dir), { recursive: true });
  }
  console.log("backup:", out);
  if (mismatched) process.exitCode = 1;
})().catch(async (e) => {
  console.error(e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
