// Copies shared design images from THIS computer's uploads folder into
// MongoDB GridFS so every team member can see them.
//
//   npm run storage:migrate-gridfs              → DRY RUN (default): reads only
//   npm run storage:migrate-gridfs -- --apply   → copies the files
//
// Safety:
//   • Only files referenced by database records are copied (AI jobs, designs,
//     saved layouts) — never PDFs, layouts or production files.
//   • Nothing is ever deleted or overwritten: local files stay where they are,
//     and a file already in GridFS is skipped (a different copy is reported).
//   • Every copied file is read back and checked by SHA-256.
//   • --apply refuses to start if the database would go over its size limit.
//   • No AI requests.
// Run it on every computer that generated designs. It can be re-run safely.
const fs = require("fs");
const os = require("os");
const path = require("path");
require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const config = require("../src/config");
const { createStorage, isSharedKey, normalizeKey, toStoredPath } = require("../src/services/storage");
const { sha256 } = require("../src/services/storage/common");

const APPLY = process.argv.includes("--apply");
const MB = 1024 * 1024;
const mb = (bytes) => `${(bytes / MB).toFixed(1)} MB`;

// Every shared image path inside a document (any depth).
const collectPaths = (value, out) => {
  if (typeof value === "string") {
    if (value.startsWith("/uploads/") && isSharedKey(value)) out.add(toStoredPath(normalizeKey(value)));
  } else if (Array.isArray(value)) {
    for (const v of value) collectPaths(v, out);
  } else if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value) && !value._bsontype) {
    for (const v of Object.values(value)) collectPaths(v, out);
  }
  return out;
};

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set in backend/.env");
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const storage = createStorage({ driver: "gridfs" });

  const referenced = new Set();
  for (const name of ["aicalendarjobs", "calendardesigns", "layoutvariants"]) {
    for await (const doc of db.collection(name).find({})) collectPaths(doc, referenced);
  }

  const rows = [];
  for (const stored of [...referenced].sort()) {
    const local = await storage.local.head(stored);
    const remote = await storage.gridfs.head(stored);
    let action;
    if (remote && local) {
      const localHash = sha256(await storage.local.get(stored));
      action = remote.sha256 === localHash ? "ALREADY_IN_GRIDFS" : "DIFFERENT_COPY_IN_GRIDFS";
    } else if (remote) action = "ALREADY_IN_GRIDFS";
    else if (local) action = "COPY";
    else action = "MISSING_ON_THIS_COMPUTER";
    rows.push({ stored, action, bytes: local?.size || remote?.size || 0 });
  }

  const count = (a) => rows.filter((r) => r.action === a).length;
  const toCopy = rows.filter((r) => r.action === "COPY");
  const copyBytes = toCopy.reduce((n, r) => n + r.bytes, 0);
  const usage = await storage.gridfs.usage();
  const projected = usage.usedBytes + copyBytes * 1.02; // + GridFS chunk overhead
  const limit = config.STORAGE_LIMIT_MB * MB;

  console.log(`\nShared images referenced in the database: ${rows.length}`);
  console.log(`  to copy from this computer:   ${toCopy.length} (${mb(copyBytes)})`);
  console.log(`  already in GridFS:            ${count("ALREADY_IN_GRIDFS")}`);
  console.log(`  different copy in GridFS:     ${count("DIFFERENT_COPY_IN_GRIDFS")} (left as is — check manually)`);
  console.log(`  not on this computer:         ${count("MISSING_ON_THIS_COMPUTER")} (copy them from the computer that made them)`);
  console.log(`Database size now ${mb(usage.usedBytes)}; after copying about ${mb(projected)} of ${config.STORAGE_LIMIT_MB} MB.`);

  const reportDir = path.join(__dirname, "..", "..", "backups");
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportFile = path.join(reportDir, `gridfs-migration-${APPLY ? "apply" : "dry-run"}-${stamp}.json`);
  const report = { at: new Date().toISOString(), host: os.hostname(), apply: APPLY, usedBytes: usage.usedBytes, projectedBytes: projected, rows };

  if (!APPLY) {
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`\nDRY RUN — nothing was written. Report: ${reportFile}`);
    console.log("To copy the files: npm run storage:migrate-gridfs -- --apply");
    return;
  }
  if (limit - projected < config.STORAGE_MIN_FREE_MB * MB) {
    throw new Error(
      `Not copying: the database would have less than ${config.STORAGE_MIN_FREE_MB} MB free (limit ${config.STORAGE_LIMIT_MB} MB).`,
    );
  }

  let copied = 0;
  for (const row of toCopy) {
    try {
      const buffer = await storage.local.get(row.stored);
      const hash = sha256(buffer);
      const { imageSize } = require("../src/lib/imageSize");
      const size = imageSize(buffer);
      const key = normalizeKey(row.stored);
      await storage.gridfs.put(row.stored, buffer, {
        metadata: {
          kind: key.startsWith("design-content/") ? "content-image" : "ai-calendar-image",
          jobId: key.startsWith("ai-calendars/") ? key.split("/")[1] : null,
          width: size?.width ?? null,
          height: size?.height ?? null,
          source: "migrated",
          migratedFrom: os.hostname(),
          migratedAt: new Date(),
        },
      });
      const back = await storage.gridfs.get(row.stored);
      if (sha256(back) !== hash) throw new Error("read-back checksum differs");
      row.result = "COPIED_AND_VERIFIED";
      copied += 1;
    } catch (err) {
      row.result = err.code === "STORAGE_OBJECT_EXISTS" ? "ALREADY_IN_GRIDFS" : `FAILED: ${err.message}`;
    }
    process.stdout.write(`\r  copied ${copied}/${toCopy.length}`);
  }
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  const failed = toCopy.filter((r) => String(r.result).startsWith("FAILED")).length;
  console.log(`\nCopied and verified ${copied} file(s); ${failed} failed. Local files were not changed. Report: ${reportFile}`);
  if (failed) process.exitCode = 1;
};

main()
  .catch((err) => {
    console.error("Migration stopped:", err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch(() => {}));
