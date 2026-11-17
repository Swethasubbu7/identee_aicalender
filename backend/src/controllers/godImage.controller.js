// Default God-image library (search, add, rename / aliases, hide).
// No AI and no external service: images are saved byte-for-byte (original
// quality and aspect ratio) plus a small WebP thumbnail for the search grid.
const path = require("path");
const GodImage = require("../models/GodImage");
const { toPublicUrl } = require("../lib/assetUrl");
const { imageSize } = require("../lib/imageSize");
const { getStorage } = require("../services/storage");
const { sha256 } = require("../services/storage/common");

// Inside the private, shared design-content folder: library pictures are
// served with signed links and accepted wherever a God image path is.
const LIBRARY_PREFIX = "/uploads/design-content/library/";
const MAX_ALIASES = 20;
const MAX_RESULTS = 60;
const THUMB_PX = 320;

const isLibraryPath = (stored) => typeof stored === "string" && stored.startsWith(LIBRARY_PREFIX);

const cleanName = (value) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

// "Pillaiyar, Ganesha\nGanapathi" → ["Pillaiyar", "Ganesha", "Ganapathi"]
const cleanAliases = (value, name) => {
  const list = Array.isArray(value) ? value : String(value ?? "").split(/[,\n;]/);
  const seen = new Set([cleanName(name).toLowerCase()]);
  const out = [];
  for (const raw of list) {
    const a = cleanName(raw);
    if (!a || seen.has(a.toLowerCase())) continue;
    seen.add(a.toLowerCase());
    out.push(a);
    if (out.length >= MAX_ALIASES) break;
  }
  return out;
};

const termsFor = (name, aliases) => [name, ...aliases].map((t) => t.toLowerCase());

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toClient = (doc) => ({
  _id: doc._id,
  name: doc.name,
  aliases: doc.aliases || [],
  active: doc.active !== false,
  path: doc.file.stored,
  url: toPublicUrl(doc.file.stored),
  thumbUrl: toPublicUrl(doc.thumb || doc.file.stored),
  widthPx: doc.file.widthPx,
  heightPx: doc.file.heightPx,
});

// GET /api/god-images?q=pillaiyar — name or alias contains the text
// (case-insensitive); best matches (name / alias starts with it) first.
const searchGodImages = async (req, res) => {
  try {
    const q = cleanName(req.query.q).toLowerCase();
    const filter = { active: true };
    if (q) filter.searchTerms = { $regex: escapeRegex(q) };
    const docs = await GodImage.find(filter).sort({ name: 1 }).limit(MAX_RESULTS).lean();
    const rank = (d) => (!q ? 0 : d.searchTerms.some((t) => t === q) ? 0 : d.searchTerms.some((t) => t.startsWith(q)) ? 1 : 2);
    docs.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    res.json({ images: docs.map(toClient) });
  } catch (error) {
    console.error("God image search error:", error);
    res.status(500).json({ message: "Could not search the God image library" });
  }
};

// Saves a NEW file, or reuses the identical one already stored.
const saveOnce = async (stored, buffer, options) => {
  try {
    return await getStorage().saveFile(stored, buffer, options);
  } catch (err) {
    if (err.code === "STORAGE_OBJECT_EXISTS") return stored;
    throw err;
  }
};

// POST /api/god-images  multipart: image, name, aliases
const addGodImage = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Choose an image to add." });
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ message: "Give the image a name (e.g. Vinayagar)." });
  const aliases = cleanAliases(req.body?.aliases, name);
  try {
    const buffer = req.file.buffer;
    const hash = sha256(buffer);
    // The same picture already in the library: no second copy.
    const existing = await GodImage.findOne({ "file.sha256": hash });
    if (existing) {
      return res.status(409).json({
        message: `This picture is already in the library as “${existing.name}”${existing.active === false ? " (hidden)" : ""}.`,
        image: toClient(existing),
      });
    }
    const size = imageSize(buffer);
    const ext = path.extname(req.file.originalname || "").toLowerCase().replace(".jpeg", ".jpg") || ".png";
    const stored = await saveOnce(`${LIBRARY_PREFIX}${hash}${ext}`, buffer, {
      contentType: req.file.mimetype,
      metadata: { kind: "god-library", ownerId: String(req.user.userId) },
    });
    let thumb = null;
    try {
      const sharp = require("sharp");
      const small = await sharp(buffer).resize(THUMB_PX, THUMB_PX, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      thumb = await saveOnce(`${LIBRARY_PREFIX}thumbs/${hash}-${THUMB_PX}.webp`, small, {
        contentType: "image/webp",
        metadata: { kind: "god-library-thumb", ownerId: String(req.user.userId) },
      });
    } catch (err) {
      console.error("God image thumbnail failed (full image used instead):", err.message);
    }
    const doc = await GodImage.create({
      name,
      aliases,
      searchTerms: termsFor(name, aliases),
      file: {
        stored,
        sha256: hash,
        widthPx: size?.width ?? null,
        heightPx: size?.height ?? null,
        contentType: req.file.mimetype,
        bytes: buffer.length,
      },
      thumb,
      createdBy: req.user.userId,
      updatedBy: req.user.userId,
    });
    res.status(201).json({ message: "Added to the library", image: toClient(doc) });
  } catch (error) {
    console.error("Add God image error:", error);
    res.status(500).json({ message: "Could not add the image to the library" });
  }
};

// PUT /api/god-images/:id  { name?, aliases?, active? } — the picture itself never changes.
const updateGodImage = async (req, res) => {
  try {
    const doc = await GodImage.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Library image not found" });
    if (req.body?.name !== undefined) {
      const name = cleanName(req.body.name);
      if (!name) return res.status(400).json({ message: "The name cannot be empty." });
      doc.name = name;
    }
    if (req.body?.aliases !== undefined || req.body?.name !== undefined) {
      doc.aliases = cleanAliases(req.body?.aliases !== undefined ? req.body.aliases : doc.aliases, doc.name);
    }
    if (typeof req.body?.active === "boolean") doc.active = req.body.active;
    doc.searchTerms = termsFor(doc.name, doc.aliases);
    doc.updatedBy = req.user.userId;
    await doc.save();
    res.json({ message: "Library image updated", image: toClient(doc) });
  } catch (error) {
    console.error("Update God image error:", error);
    res.status(500).json({ message: "Could not update the library image" });
  }
};

module.exports = { searchGodImages, addGodImage, updateGodImage, isLibraryPath, cleanAliases, LIBRARY_PREFIX };
