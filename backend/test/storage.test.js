// Shared storage: key rules, local driver, GridFS driver (in-memory fake —
// never Atlas), local fallback, signed file links, the authenticated
// /api/files route, the storage-space guard before paid AI, and the shared
// Generated Designs list. No network except a local test server; no AI.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable, Writable } = require("stream");
const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");

const { normalizeKey, toStoredPath, isSharedKey } = require("../src/services/storage/keys");
const { createLocalDriver } = require("../src/services/storage/localDriver");
const { createGridfsDriver } = require("../src/services/storage/gridfsDriver");
const { createStorage, setStorage } = require("../src/services/storage");
const { storageBlockReason } = require("../src/services/storage/capacity");
const { signFileLink, verifyFileLink, fileLinkUrl } = require("../src/lib/fileLinks");
const { toPublicUrl } = require("../src/lib/assetUrl");
const { runWithUser } = require("../src/lib/requestContext");
const config = require("../src/config");

const PNG_1x1 = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);
const tmpRoot = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "storage-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
};

// ---- in-memory GridFS ------------------------------------------------------
const fakeMongo = ({ usedBytes = 1024 } = {}) => {
  const files = [];
  const chunks = new Map();
  const indexes = [];
  const db = {
    usedBytes,
    stats: async () => ({ dataSize: db.usedBytes, storageSize: db.usedBytes / 2, indexSize: 0 }),
    collection: (name) => ({
      createIndex: async (spec, opts) => indexes.push({ name, spec, opts }),
      aggregate: () => ({
        toArray: async () => [{ _id: null, bytes: files.reduce((n, f) => n + f.length, 0), count: files.length }],
      }),
    }),
  };
  const bucket = {
    find: (filter) => ({ toArray: async () => files.filter((f) => f.filename === filter.filename) }),
    openUploadStream(filename, { metadata }) {
      const id = crypto.randomUUID();
      const parts = [];
      const stream = new Writable({
        write(chunk, _enc, cb) {
          parts.push(chunk);
          cb();
        },
        final(cb) {
          if (files.some((f) => f.filename === filename)) return cb(Object.assign(new Error("E11000 duplicate key"), { code: 11000 }));
          const data = Buffer.concat(parts);
          chunks.set(id, data);
          files.push({ _id: id, filename, length: data.length, metadata, uploadDate: new Date() });
          cb();
        },
      });
      stream.id = id;
      return stream;
    },
    openDownloadStream: (id) => Readable.from([chunks.get(id)]),
  };
  return { db, bucket, files, indexes };
};

const gridfsStorage = (t, opts) => {
  const mongo = fakeMongo(opts);
  const root = tmpRoot(t);
  const local = createLocalDriver({ root, publicBaseUrl: "http://localhost:5000" });
  const gridfs = createGridfsDriver({ getDb: () => mongo.db, makeBucket: () => mongo.bucket });
  return { storage: createStorage({ driver: "gridfs", local, gridfs }), mongo, local, root };
};

// ---- keys --------------------------------------------------------------------
test("stored upload paths map onto storage keys and back", () => {
  const stored = "/uploads/ai-calendars/6af406acd0171013a3859b19/v0-preview-1794377395542.jpg";
  assert.equal(normalizeKey(stored), "ai-calendars/6af406acd0171013a3859b19/v0-preview-1794377395542.jpg");
  assert.equal(toStoredPath(normalizeKey(stored)), stored);
});

test("unsafe keys are rejected", () => {
  for (const bad of ["", "../x.png", "a/../../b.png", "/etc/passwd", "a//b.png", "a/.hidden", "a b.png", null, 5]) {
    assert.throws(() => normalizeKey(bad), { code: "INVALID_STORAGE_KEY" }, String(bad));
  }
});

test("shared = AI and customer IMAGES only; PDFs, layouts and production stay local", () => {
  assert.equal(isSharedKey("/uploads/ai-calendars/1/v0-artwork-1.jpg"), true);
  assert.equal(isSharedKey("/uploads/ai-calendars/1/v0-preview-1.png"), true);
  assert.equal(isSharedKey("/uploads/design-content/1-image.webp"), true);
  assert.equal(isSharedKey("/uploads/ai-calendars/1/shop-normal-12x18-A-1-PRINT.pdf"), false);
  assert.equal(isSharedKey("/uploads/layouts/1-previewImage.png"), false);
  assert.equal(isSharedKey("/uploads/production/x.png"), false);
  assert.equal(isSharedKey("/uploads/ai-generate/1-customerImage.png"), false);
  assert.equal(isSharedKey("../x"), false);
});

// ---- local driver ----------------------------------------------------------------
test("local driver: write, read, head, no overwrite", async (t) => {
  const storage = createLocalDriver({ root: tmpRoot(t), publicBaseUrl: "http://localhost:5000" });
  const info = await storage.put("ai-calendars/job1/v0-preview-1.jpg", Buffer.from("one"));
  assert.equal(info.size, 3);
  assert.equal((await storage.get("/uploads/ai-calendars/job1/v0-preview-1.jpg")).toString(), "one");
  assert.equal(await storage.exists("ai-calendars/job1/missing.jpg"), false);
  await assert.rejects(storage.put("ai-calendars/job1/v0-preview-1.jpg", Buffer.from("two")), { code: "STORAGE_OBJECT_EXISTS" });
  assert.equal((await storage.get("ai-calendars/job1/v0-preview-1.jpg")).toString(), "one", "original kept");
  await assert.rejects(storage.get("ai-calendars/job1/missing.jpg"), { code: "STORAGE_NOT_FOUND" });
});

test("default storage is local (app behaviour unchanged)", () => {
  assert.equal(config.STORAGE_DRIVER, "local");
  const s = createStorage();
  assert.equal(s.driver, "local");
  assert.equal(s.gridfs, null);
});

// ---- GridFS driver + storage layer -------------------------------------------------
test("GridFS: upload with metadata, unique-key index, read back, never overwrite", async (t) => {
  const { storage, mongo } = gridfsStorage(t);
  const stored = await storage.saveFile("/uploads/ai-calendars/job1/v0-artwork-1.png", PNG_1x1, { metadata: { jobId: "job1" } });
  assert.equal(stored, "/uploads/ai-calendars/job1/v0-artwork-1.png");
  assert.equal(mongo.files.length, 1);
  const meta = mongo.files[0].metadata;
  assert.equal(meta.contentType, "image/png");
  assert.equal(meta.width, 1);
  assert.equal(meta.height, 1);
  assert.equal(meta.jobId, "job1");
  assert.equal(meta.sha256, crypto.createHash("sha256").update(PNG_1x1).digest("hex"));
  assert.deepEqual(mongo.indexes[0], { name: "designFiles.files", spec: { filename: 1 }, opts: { unique: true, name: "filename_unique" } });
  assert.ok((await storage.readFile(stored)).equals(PNG_1x1));
  assert.deepEqual(await storage.imageSizeOf(stored), { width: 1, height: 1 });

  await assert.rejects(storage.saveFile(stored, Buffer.from("other")), { code: "STORAGE_OBJECT_EXISTS" });
  assert.ok((await storage.readFile(stored)).equals(PNG_1x1), "original kept");
  assert.equal(mongo.files.length, 1);
});

test("GridFS mode: PDFs stay on this computer", async (t) => {
  const { storage, mongo, root } = gridfsStorage(t);
  await storage.saveFile("/uploads/ai-calendars/job1/x-PRINT.pdf", Buffer.from("%PDF"));
  assert.equal(mongo.files.length, 0);
  assert.ok(fs.existsSync(path.join(root, "ai-calendars", "job1", "x-PRINT.pdf")));
});

test("GridFS: reading creates nothing in the database (no index, no upload)", async (t) => {
  const { storage, mongo } = gridfsStorage(t);
  assert.equal(await storage.gridfs.head("/uploads/design-content/x.png"), null);
  assert.equal(await storage.fileExists("/uploads/design-content/x.png"), false);
  await storage.gridfs.usage();
  assert.equal(mongo.indexes.length, 0);
  assert.equal(mongo.files.length, 0);
});

test("GridFS mode: files not migrated yet are read from this computer (fallback)", async (t) => {
  const { storage, local, mongo } = gridfsStorage(t);
  await local.put("design-content/1-image.png", PNG_1x1);
  assert.ok((await storage.readFile("/uploads/design-content/1-image.png")).equals(PNG_1x1));
  assert.equal(await storage.fileExists("/uploads/design-content/1-image.png"), true);
  assert.deepEqual(await storage.imageSizeOf("/uploads/design-content/1-image.png"), { width: 1, height: 1 });
  const opened = await storage.openFile("/uploads/design-content/1-image.png");
  assert.equal(opened.location, "local");
  opened.stream.destroy();
  assert.equal(mongo.files.length, 0, "reading never uploads");
  await assert.rejects(storage.readFile("/uploads/design-content/none.png"), { code: "STORAGE_NOT_FOUND" });
});

test("GridFS mode: a failed GridFS write keeps the (paid) picture on this computer", async (t) => {
  const { storage, root } = gridfsStorage(t);
  storage.gridfs.put = async () => {
    throw new Error("Atlas unreachable");
  };
  const errors = [];
  const original = console.error;
  console.error = (...a) => errors.push(a.join(" "));
  try {
    const stored = await storage.saveFile("/uploads/ai-calendars/job1/v0-artwork-2.png", PNG_1x1);
    assert.equal(stored, "/uploads/ai-calendars/job1/v0-artwork-2.png");
  } finally {
    console.error = original;
  }
  assert.ok(fs.existsSync(path.join(root, "ai-calendars", "job1", "v0-artwork-2.png")));
  assert.match(errors.join("\n"), /kept on this computer/);
});

// ---- capacity guard ------------------------------------------------------------------
test("capacity: local storage is never blocked", async () => {
  assert.equal(await storageBlockReason({ designs: 2, storage: createStorage({ driver: "local" }) }), null);
});

test("capacity: GridFS blocks a paid Generate when space is short", async (t) => {
  const { storage, mongo } = gridfsStorage(t);
  mongo.db.usedBytes = 100 * 1024 * 1024;
  assert.equal(await storageBlockReason({ designs: 2, storage }), null);
  // 512 limit − 50 min free − 2 × 15 per design = 432 MB used is the edge.
  mongo.db.usedBytes = 440 * 1024 * 1024;
  assert.match(await storageBlockReason({ designs: 2, storage }), /storage is almost full: 440 MB of 512 MB used/);
  mongo.db.stats = async () => {
    throw new Error("network");
  };
  const original = console.error;
  console.error = () => {};
  try {
    assert.match(await storageBlockReason({ storage }), /Could not check the free storage space/);
  } finally {
    console.error = original;
  }
});

test("capacity: the AI spending guard refuses before any request when storage is full", async (t) => {
  const AiUsageRecord = require("../src/models/AiUsageRecord");
  const AiCalendarJob = require("../src/models/AiCalendarJob");
  const saved = { agg: AiUsageRecord.aggregate, find: AiUsageRecord.find, count: AiUsageRecord.countDocuments, exists: AiCalendarJob.exists };
  AiUsageRecord.aggregate = async () => [];
  AiUsageRecord.find = () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }), lean: async () => [] });
  AiUsageRecord.countDocuments = async () => 0;
  AiCalendarJob.exists = async () => null;
  const { storage, mongo } = gridfsStorage(t);
  mongo.db.usedBytes = 500 * 1024 * 1024;
  setStorage(storage);
  t.after(() => {
    setStorage(null);
    Object.assign(AiUsageRecord, { aggregate: saved.agg, find: saved.find, countDocuments: saved.count });
    AiCalendarJob.exists = saved.exists;
  });
  const { checkLimits } = require("../src/services/ai/spendGuard");
  const limits = await checkLimits({ estimateInr: 10, userId: null, aiEnabled: true, designs: 2 });
  assert.equal(limits.allowed, false);
  assert.ok(limits.reasons.some((r) => /storage is almost full/.test(r)), limits.reasons.join(" | "));
});

// ---- signed links ----------------------------------------------------------------------
test("signed links: valid for the user, refused when expired or tampered", () => {
  const now = Date.UTC(2026, 10, 14, 10, 0, 0);
  const link = signFileLink("/uploads/ai-calendars/j/v0-preview-1.jpg", "user1", now);
  assert.equal(link.key, "ai-calendars/j/v0-preview-1.jpg");
  const ok = verifyFileLink(link, now);
  assert.equal(ok.ok, true);
  assert.equal(ok.userId, "user1");
  assert.ok(ok.expiresAt - now >= config.STORAGE_URL_TTL_SECONDS * 1000);
  assert.equal(verifyFileLink(link, Number(link.e) * 1000 + 1).reason, "expired");
  assert.equal(verifyFileLink({ ...link, key: "ai-calendars/j/other.jpg" }, now).reason, "invalid");
  assert.equal(verifyFileLink({ ...link, u: "user2" }, now).reason, "invalid");
  assert.equal(verifyFileLink({ ...link, e: String(Number(link.e) + 3600) }, now).reason, "invalid");
  assert.equal(verifyFileLink({ ...link, s: "" }, now).reason, "missing");
});

test("toPublicUrl: shared images get signed /api/files links; layouts unchanged", () => {
  const base = config.PUBLIC_BASE_URL;
  assert.equal(toPublicUrl("/uploads/layouts/1-previewImage.png"), `${base}/uploads/layouts/1-previewImage.png`);
  assert.equal(toPublicUrl("https://cdn.example.com/x.png"), "https://cdn.example.com/x.png");
  assert.equal(toPublicUrl("/uploads/design-content/1-image.png"), `${base}/api/files/design-content/1-image.png`);
  const url = runWithUser({ userId: "u1" }, () => toPublicUrl("/uploads/design-content/1-image.png"));
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/api/files/design-content/1-image.png");
  assert.equal(parsed.searchParams.get("u"), "u1");
  assert.equal(verifyFileLink({ key: "design-content/1-image.png", ...Object.fromEntries(parsed.searchParams) }).ok, true);
  // PDFs keep their (blocked) /uploads path: they are downloaded through the logged-in endpoint.
  assert.equal(toPublicUrl("/uploads/ai-calendars/j/a-PRINT.pdf"), `${base}/uploads/ai-calendars/j/a-PRINT.pdf`);
});

// ---- /api/files route ------------------------------------------------------------------
const startFilesServer = async (t, users) => {
  const User = require("../src/models/User");
  const savedFind = User.findById;
  // Staff records as stored (role defaults to STAFF). Supports both
  // findById(id).select().lean() and `await findById(id)` (Phase 2 sign-in check).
  const record = (id) => (users[id] ? { _id: id, role: "STAFF", ...users[id] } : null);
  User.findById = (id) => ({
    select: () => ({ lean: async () => record(id) }),
    then: (resolve, reject) => Promise.resolve(record(id)).then(resolve, reject),
  });
  const { clearActiveCache } = require("../src/controllers/files.controller");
  clearActiveCache();
  const app = express();
  app.use("/api/files", require("../src/routes/files.routes"));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => {
    User.findById = savedFind;
    clearActiveCache();
    server.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
};

test("/api/files: login or signed link required; active users only; shared images only", async (t) => {
  const { storage, local } = gridfsStorage(t);
  setStorage(storage);
  t.after(() => setStorage(null));
  await storage.saveFile("/uploads/ai-calendars/job1/v0-preview-1.png", PNG_1x1); // GridFS
  await local.put("design-content/7-image.png", PNG_1x1); // not migrated yet
  await local.put("ai-calendars/job1/x-PRINT.pdf", Buffer.from("%PDF"));
  const active = "6ae000000000000000000001";
  const inactive = "6ae000000000000000000002";
  const origin = await startFilesServer(t, { [active]: { active: true }, [inactive]: { active: false } });
  const at = (stored, user) => fileLinkUrl(stored, user).replace(config.PUBLIC_BASE_URL, origin);

  let res = await fetch(`${origin}/api/files/ai-calendars/job1/v0-preview-1.png`);
  assert.equal(res.status, 401, "no login, no link");

  res = await fetch(at("/uploads/ai-calendars/job1/v0-preview-1.png", active));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.match(res.headers.get("cache-control"), /^private, max-age=\d+$/);
  assert.ok(Buffer.from(await res.arrayBuffer()).equals(PNG_1x1));

  res = await fetch(at("/uploads/design-content/7-image.png", active));
  assert.equal(res.status, 200, "local fallback for files not migrated yet");
  await res.arrayBuffer();

  res = await fetch(at("/uploads/ai-calendars/job1/v0-preview-1.png", inactive));
  assert.equal(res.status, 403, "inactive account");

  const link = new URL(at("/uploads/ai-calendars/job1/v0-preview-1.png", active));
  link.pathname = "/api/files/design-content/7-image.png"; // signature for another file
  res = await fetch(link);
  assert.equal(res.status, 403, "link used for a different file");

  const token = jwt.sign({ userId: active }, process.env.JWT_SECRET, { expiresIn: "1h" });
  res = await fetch(`${origin}/api/files/ai-calendars/job1/v0-preview-1.png`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200, "login token works too");
  await res.arrayBuffer();
  res = await fetch(`${origin}/api/files/ai-calendars/job1/v0-preview-1.png`, { headers: { Authorization: "Bearer nope" } });
  assert.equal(res.status, 401);

  res = await fetch(`${origin}/api/files/ai-calendars/job1/x-PRINT.pdf`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 404, "PDFs are not served here");
  res = await fetch(`${origin}/api/files/layouts/1-previewImage.png`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 404, "layouts are not served here");
  res = await fetch(`${origin}/api/files/ai-calendars/job1/missing.png`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 404);
});

// ---- shared Generated Designs list ------------------------------------------------------------
test("Generated Designs: active members see the whole team's designs with Created By", async (t) => {
  const AiCalendarJob = require("../src/models/AiCalendarJob");
  const User = require("../src/models/User");
  const saved = { find: AiCalendarJob.find, findById: User.findById };
  const me = "6ae000000000000000000001";
  const other = "6ae000000000000000000003";
  let filterSeen = null;
  const jobs = [
    { _id: "j1", userId: { _id: other, name: "Priya" }, content: { businessName: "A" }, variations: [{ index: 0, status: "DONE", previewImage: "/uploads/ai-calendars/j1/v0-preview-1.jpg" }] },
    { _id: "j2", userId: { _id: me, name: "Me" }, content: { businessName: "B" }, variations: [] },
  ];
  AiCalendarJob.find = (filter) => {
    filterSeen = filter;
    const chain = { sort: () => chain, limit: () => chain, populate: () => chain, lean: async () => jobs };
    return chain;
  };
  let viewer = { active: true };
  User.findById = () => ({ select: () => ({ lean: async () => viewer }) });
  t.after(() => {
    AiCalendarJob.find = saved.find;
    User.findById = saved.findById;
  });
  const { listJobs } = require("../src/controllers/aiCalendar.controller");
  const call = (query = {}) =>
    new Promise((resolve) => {
      const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(body) { resolve({ status: this.statusCode, body }); } };
      runWithUser({ userId: me }, () => listJobs({ user: { userId: me }, query }, res));
    });

  const { status, body } = await call();
  assert.equal(status, 200);
  assert.equal(filterSeen.userId, undefined, "no per-user filter");
  assert.deepEqual(body.jobs[0].createdBy, { id: other, name: "Priya", isMe: false });
  assert.deepEqual(body.jobs[1].createdBy, { id: me, name: "Me", isMe: true });
  assert.match(body.jobs[0].variations[0].previewUrl, /\/api\/files\/ai-calendars\/j1\/v0-preview-1\.jpg\?u=/);

  await call({ scope: "mine" });
  assert.equal(filterSeen.userId, me);

  viewer = { active: false };
  assert.equal((await call()).status, 403, "inactive accounts see nothing");
});
