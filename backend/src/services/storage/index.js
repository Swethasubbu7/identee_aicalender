// File storage used by the app.
//
//   STORAGE_DRIVER=local  (default) — every file on this computer's disk.
//   STORAGE_DRIVER=gridfs — shared images (AI artwork, previews, print images,
//       customer God/product images) go to MongoDB GridFS so every computer
//       sees them. Reads try GridFS first, then the local file (fallback for
//       files not migrated yet). PDFs, layouts and production files stay local.
//
// Callers use stored paths ("/uploads/..."), exactly as kept in MongoDB.
const config = require("../../config");
const { UPLOADS_DIR } = require("../ai/uploadPaths");
const { imageSize } = require("../../lib/imageSize");
const { createLocalDriver } = require("./localDriver");
const { createGridfsDriver } = require("./gridfsDriver");
const keys = require("./keys");
const { contentTypeFor } = require("./common");

const createStorage = (overrides = {}) => {
  const driver = (overrides.driver || config.STORAGE_DRIVER || "local").toLowerCase();
  const local = overrides.local || createLocalDriver({ root: UPLOADS_DIR, publicBaseUrl: config.PUBLIC_BASE_URL });
  let gridfs = null;
  if (driver === "gridfs") {
    gridfs =
      overrides.gridfs ||
      createGridfsDriver({
        getDb: () => require("mongoose").connection.db,
        makeBucket: (db, bucketName) => new (require("mongoose").mongo.GridFSBucket)(db, { bucketName }),
      });
  } else if (driver !== "local") {
    throw new Error(`Unknown STORAGE_DRIVER "${driver}" (use "local" or "gridfs")`);
  }

  const useGridfs = (stored) => Boolean(gridfs) && keys.isSharedKey(stored);
  const isNotFound = (err) => err?.code === "STORAGE_NOT_FOUND";

  return {
    driver,
    local,
    gridfs,

    // Saves a NEW file (never overwrites) and returns its stored path.
    // In GridFS mode a failed GridFS write falls back to the local disk, so
    // a paid AI picture is never lost; the migration copies it up later.
    async saveFile(stored, buffer, { contentType, metadata = {} } = {}) {
      const path = keys.toStoredPath(keys.normalizeKey(stored));
      if (useGridfs(path)) {
        const size = imageSize(buffer);
        try {
          await gridfs.put(path, buffer, {
            contentType: contentType || contentTypeFor(path),
            metadata: { ...metadata, width: size?.width ?? null, height: size?.height ?? null, source: metadata.source || "app" },
          });
          return path;
        } catch (err) {
          if (err.code === "STORAGE_OBJECT_EXISTS") throw err;
          console.error(`[storage] GridFS save failed for ${path}; kept on this computer instead:`, err.message);
        }
      }
      await local.put(path, buffer, { contentType });
      return path;
    },

    async readFile(stored) {
      if (useGridfs(stored)) {
        try {
          return await gridfs.get(stored);
        } catch (err) {
          if (!isNotFound(err)) throw err;
        }
      }
      return local.get(stored);
    },

    async fileExists(stored) {
      if (useGridfs(stored) && (await gridfs.exists(stored))) return true;
      return local.exists(stored);
    },

    // Pixel size of a stored image (GridFS metadata, else the file header).
    async imageSizeOf(stored) {
      if (!stored) return null;
      const wh = (size) => (size ? { width: size.width, height: size.height } : null);
      if (useGridfs(stored)) {
        const info = await gridfs.head(stored);
        if (info?.width && info?.height) return wh(info);
        if (info) return wh(imageSize(await gridfs.get(stored)));
      }
      try {
        return wh(imageSize(await local.get(stored)));
      } catch (err) {
        if (isNotFound(err) || err.code === "INVALID_STORAGE_KEY") return null;
        throw err;
      }
    },

    // { stream, size, contentType, location } for serving over HTTP.
    async openFile(stored) {
      if (useGridfs(stored)) {
        try {
          return { ...(await gridfs.open(stored)), location: "gridfs" };
        } catch (err) {
          if (!isNotFound(err)) throw err;
        }
      }
      return { ...(await local.open(stored)), location: "local" };
    },
  };
};

let shared = null;
const getStorage = () => (shared ||= createStorage());
// Tests swap the storage in and out.
const setStorage = (storage) => {
  shared = storage;
};

module.exports = { createStorage, getStorage, setStorage, ...keys };
