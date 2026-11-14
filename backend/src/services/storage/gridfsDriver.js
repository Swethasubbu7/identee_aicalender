// MongoDB GridFS in the app's own database (bucket "designFiles": the
// collections designFiles.files + designFiles.chunks). Every computer that
// uses the same MONGO_URI sees the same files.
//
// Files are never overwritten (one file per key, enforced by a unique index)
// and this driver never deletes anything.
const { normalizeKey } = require("./keys");
const { contentTypeFor, sha256, existsError, notFoundError } = require("./common");

const BUCKET = "designFiles";

const streamToBuffer = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });

const isDuplicateKey = (err) => err?.code === 11000 || /E11000/.test(String(err?.message));

// getDb(): the connected mongodb Db. makeBucket(db): a GridFSBucket (tests
// pass an in-memory fake).
const createGridfsDriver = ({ getDb, makeBucket }) => {
  const connectedDb = () => {
    const db = getDb();
    if (!db) {
      const err = new Error("GridFS storage needs the MongoDB connection");
      err.code = "STORAGE_NOT_CONNECTED";
      throw err;
    }
    return db;
  };
  let cached = null;
  // Reading never writes to the database (no index or collection creation).
  const bucket = async () => (cached ||= makeBucket(connectedDb(), BUCKET));
  // Only before the first upload: one file per key (a second upload of the
  // same key is refused by the database too).
  let indexed = null;
  const ensureUniqueIndex = () =>
    (indexed ||= connectedDb()
      .collection(`${BUCKET}.files`)
      .createIndex({ filename: 1 }, { unique: true, name: "filename_unique" })
      .catch((err) => {
        indexed = null;
        throw err;
      }));

  const findOne = async (key) => {
    const files = await (await bucket()).find({ filename: key }, { limit: 1 }).toArray();
    return files[0] || null;
  };

  const describe = (file) => ({
    key: file.filename,
    id: file._id,
    size: file.length,
    contentType: file.metadata?.contentType || contentTypeFor(file.filename),
    sha256: file.metadata?.sha256 || null,
    width: file.metadata?.width ?? null,
    height: file.metadata?.height ?? null,
    uploadedAt: file.uploadDate,
    metadata: file.metadata || {},
  });

  return {
    name: "gridfs",
    bucketName: BUCKET,

    async put(value, buffer, { contentType, metadata = {} } = {}) {
      const key = normalizeKey(value);
      await ensureUniqueIndex();
      if (await findOne(key)) throw existsError(key);
      const hash = sha256(buffer);
      const type = contentType || contentTypeFor(key);
      const b = await bucket();
      const id = await new Promise((resolve, reject) => {
        const upload = b.openUploadStream(key, {
          metadata: { ...metadata, contentType: type, sha256: hash, size: buffer.length },
        });
        upload.once("error", reject);
        upload.once("finish", () => resolve(upload.id));
        upload.end(buffer);
      }).catch((err) => {
        if (isDuplicateKey(err)) throw existsError(key);
        throw err;
      });
      return { key, id, size: buffer.length, sha256: hash, contentType: type };
    },

    async head(value) {
      const file = await findOne(normalizeKey(value));
      return file ? describe(file) : null;
    },

    async exists(value) {
      return Boolean(await this.head(value));
    },

    async get(value) {
      const key = normalizeKey(value);
      const file = await findOne(key);
      if (!file) throw notFoundError(key);
      return streamToBuffer((await bucket()).openDownloadStream(file._id));
    },

    // { stream, size, contentType } for serving over HTTP.
    async open(value) {
      const key = normalizeKey(value);
      const file = await findOne(key);
      if (!file) throw notFoundError(key);
      const info = describe(file);
      return { ...info, stream: (await bucket()).openDownloadStream(file._id) };
    },

    // Bytes used by the whole database (Atlas counts data + indexes).
    async usage() {
      const db = getDb();
      const stats = await db.stats();
      const used = Math.max(stats.dataSize || 0, stats.storageSize || 0) + (stats.indexSize || 0);
      const files = await db
        .collection(`${BUCKET}.files`)
        .aggregate([{ $group: { _id: null, bytes: { $sum: "$length" }, count: { $sum: 1 } } }])
        .toArray();
      return { usedBytes: used, gridfsBytes: files[0]?.bytes || 0, gridfsFiles: files[0]?.count || 0 };
    },
  };
};

module.exports = { createGridfsDriver, BUCKET };
