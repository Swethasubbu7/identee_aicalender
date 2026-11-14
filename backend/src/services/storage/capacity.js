// Free space check before any PAID AI request. With GridFS the AI pictures
// are saved in the Atlas database; if it is full, a picture that was already
// paid for could not be saved. So Generate is refused while space is short.
//
// Local storage (STORAGE_DRIVER=local) writes to this computer's disk and is
// not limited here.
const config = require("../../config");
const { getStorage } = require("./index");

const MB = 1024 * 1024;
const round1 = (v) => Math.round(v * 10) / 10;

// designs: how many AI designs the request will save.
// Returns null when there is room, else a reason to show the designer.
const storageBlockReason = async ({ designs = 1, storage = getStorage() } = {}) => {
  if (!storage.gridfs) return null;
  let usage;
  try {
    usage = await storage.gridfs.usage();
  } catch (err) {
    console.error("[storage] Could not read the database size:", err.message);
    return "Could not check the free storage space in the database. Try again in a minute.";
  }
  const usedMb = usage.usedBytes / MB;
  const freeMb = config.STORAGE_LIMIT_MB - usedMb;
  const neededMb = config.STORAGE_MIN_FREE_MB + Math.max(1, designs) * config.STORAGE_MB_PER_AI_DESIGN;
  if (freeMb < neededMb) {
    return (
      `Design storage is almost full: ${round1(usedMb)} MB of ${config.STORAGE_LIMIT_MB} MB used, ` +
      `${round1(Math.max(freeMb, 0))} MB free; this Generate needs ${round1(neededMb)} MB. Ask the admin to free up space.`
    );
  }
  return null;
};

const storageSummary = async (storage = getStorage()) => {
  if (!storage.gridfs) return { driver: storage.driver };
  const usage = await storage.gridfs.usage();
  return {
    driver: storage.driver,
    limitMb: config.STORAGE_LIMIT_MB,
    usedMb: round1(usage.usedBytes / MB),
    freeMb: round1(config.STORAGE_LIMIT_MB - usage.usedBytes / MB),
    gridfsMb: round1(usage.gridfsBytes / MB),
    gridfsFiles: usage.gridfsFiles,
  };
};

module.exports = { storageBlockReason, storageSummary };
