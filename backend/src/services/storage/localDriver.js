// Files on this computer's disk (today's behaviour). URLs point at the
// backend's own /uploads static route.
const fs = require("fs");
const path = require("path");
const { normalizeKey } = require("./keys");
const { contentTypeFor, sha256, existsError, notFoundError } = require("./common");

const createLocalDriver = ({ root, publicBaseUrl }) => {
  const rootDir = path.resolve(root);
  const absFor = (value) => {
    const key = normalizeKey(value);
    const abs = path.resolve(rootDir, ...key.split("/"));
    if (!abs.startsWith(rootDir + path.sep)) throw new Error("Storage key escapes the uploads folder");
    return { key, abs };
  };

  return {
    name: "local",

    async put(value, buffer, { contentType, overwrite = false } = {}) {
      const { key, abs } = absFor(value);
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      try {
        // "wx" fails if the file exists, so nothing is overwritten by accident.
        await fs.promises.writeFile(abs, buffer, { flag: overwrite ? "w" : "wx" });
      } catch (err) {
        if (err.code === "EEXIST") throw existsError(key);
        throw err;
      }
      return { key, size: buffer.length, sha256: sha256(buffer), contentType: contentType || contentTypeFor(key) };
    },

    async get(value) {
      const { key, abs } = absFor(value);
      try {
        return await fs.promises.readFile(abs);
      } catch (err) {
        if (err.code === "ENOENT") throw notFoundError(key);
        throw err;
      }
    },

    async head(value) {
      const { key, abs } = absFor(value);
      try {
        const stat = await fs.promises.stat(abs);
        return stat.isFile() ? { key, size: stat.size, contentType: contentTypeFor(key) } : null;
      } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
      }
    },

    // { key, size, contentType, stream } for serving over HTTP.
    async open(value) {
      const { key, abs } = absFor(value);
      const head = await this.head(key);
      if (!head) throw notFoundError(key);
      return { ...head, stream: fs.createReadStream(abs) };
    },

    async exists(value) {
      return Boolean(await this.head(value));
    },

    async getUrl(value) {
      const { key } = absFor(value);
      return `${publicBaseUrl}/uploads/${key}`;
    },

    async remove(value) {
      const { abs } = absFor(value);
      await fs.promises.rm(abs, { force: true });
    },
  };
};

module.exports = { createLocalDriver };
