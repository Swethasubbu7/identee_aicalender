const CalendarDesign = require("../models/CalendarDesign");
const Layout = require("../models/Layout");
const LayoutVariant = require("../models/LayoutVariant");
const fs = require("fs");
const AiCalendarJob = require("../models/AiCalendarJob");
const { uploadPath, toPublicUrl } = require("../lib/assetUrl");
const { resolveUpload } = require("../services/ai/uploadPaths");
const { imageSize } = require("../lib/imageSize");
const { getStorage } = require("../services/storage");
const { contentFileName } = require("../middleware/upload.middleware");
const { isLibraryPath } = require("./godImage.controller");

const CONTENT_TEXT_FIELDS = ["businessName", "productList", "address", "rightBoxText"];
const CONTENT_SWITCH_FIELDS = ["showBusinessName", "showLeftBox", "showRightBox", "showTextLine1", "showTextLine2"];
// godImageOriginal: the God image as uploaded / picked, kept when the
// designer applies background removal or enhancement (to undo it).
const CONTENT_IMAGE_FIELDS = ["godImage", "godImageOriginal", "productImage", "leftBoxImage"];
const { fontStyleOf, textColourOf, textSizesOf, godPlacementOf } = require("../constants/typography");
const MAX_TEXT_LENGTH = 2000;
// Content images must be files uploaded through POST /uploads below.
const CONTENT_IMAGE_PREFIX = "/uploads/design-content/";

// Whitelists designer content; returns { "content.x": value } updates.
const pickContent = (content) => {
  if (!content || typeof content !== "object") return {};
  const update = {};
  for (const key of CONTENT_TEXT_FIELDS) {
    if (content[key] === undefined) continue;
    update[`content.${key}`] = String(content[key] ?? "").slice(0, MAX_TEXT_LENGTH);
  }
  for (const key of CONTENT_SWITCH_FIELDS) {
    if (content[key] === undefined) continue;
    update[`content.${key}`] = content[key] !== false && content[key] !== "false";
  }
  if (content.rightBoxMode !== undefined) {
    update["content.rightBoxMode"] = content.rightBoxMode === "text" ? "text" : "image";
  }
  if (content.leftBoxMode !== undefined) {
    update["content.leftBoxMode"] = content.leftBoxMode === "image" ? "image" : "text";
  }
  // Typography chosen before generating ("" / {} = automatic).
  if (content.fontStyle !== undefined) update["content.fontStyle"] = fontStyleOf(content.fontStyle);
  if (content.textColour !== undefined) update["content.textColour"] = textColourOf(content.textColour);
  if (content.textSizes !== undefined) update["content.textSizes"] = textSizesOf(content.textSizes);
  if (content.godPlacement !== undefined) update["content.godPlacement"] = godPlacementOf(content.godPlacement);
  for (const key of CONTENT_IMAGE_FIELDS) {
    if (content[key] === undefined) continue;
    const value = content[key];
    if (value === null || value === "") {
      update[`content.${key}`] = null;
    } else if (typeof value === "string" && value.startsWith(CONTENT_IMAGE_PREFIX) && !value.includes("..")) {
      update[`content.${key}`] = value;
    } else {
      throw new Error(`${key} must be an uploaded design image`);
    }
  }
  return update;
};

const withContentUrls = (design) => {
  const obj = design.toObject ? design.toObject() : design;
  if (!obj.content) return obj;
  return {
    ...obj,
    content: {
      ...obj.content,
      godImageUrl: toPublicUrl(obj.content.godImage),
      godImageOriginalUrl: toPublicUrl(obj.content.godImageOriginal),
      productImageUrl: toPublicUrl(obj.content.productImage),
      leftBoxImageUrl: toPublicUrl(obj.content.leftBoxImage),
    },
    thumbnailUrl: toPublicUrl(obj.thumbnail),
  };
};

// Existing behaviour for files on this computer only. Files in GridFS are
// never deleted by the app (removal needs an approved clean-up).
// God-library pictures are shared by every design and are never removed here.
const removeUpload = (stored) => {
  if (isLibraryPath(stored)) return;
  const abs = resolveUpload(stored);
  if (abs) fs.promises.unlink(abs).catch(() => {});
};

// A content image can be shared (e.g. by an AI generation): only delete it
// when nothing else uses it.
const isImageInUse = async (stored) =>
  Boolean(
    (await CalendarDesign.exists({
      $or: CONTENT_IMAGE_FIELDS.map((key) => ({ [`content.${key}`]: stored })),
    })) ||
      (await AiCalendarJob.exists({
        $or: [{ "content.godImage": stored }, { "content.productImage": stored }, { "content.leftBoxImage": stored }],
      })),
  );

// Designs are private to the user who created them.
const isOwner = (design, req) =>
  design.createdBy && String(design.createdBy) === String(req.user?.userId);

const createDraft = async (req, res) => {
  try {
    const { layoutId, variantId, canvasData, elements, year, language, aiMetadata } =
      req.body;

    if (!layoutId && !variantId) {
      return res.status(400).json({ message: "layoutId or variantId is required" });
    }

    if (variantId) {
      const variant = await LayoutVariant.findById(variantId);
      // Any production layout that is not archived (drafts are saved, but
      // Generate still needs a usable layout — see canUseLayout).
      if (!variant || variant.status === "ARCHIVED") {
        return res.status(404).json({ message: "Production layout not found" });
      }
    } else {
      const layout = await Layout.findById(layoutId);
      if (!layout) {
        return res.status(404).json({ message: "Layout not found" });
      }
    }

    const design = new CalendarDesign({
      layoutId: layoutId || null,
      variantId: variantId || null,
      createdBy: req.user?.userId,
      canvasData: canvasData || null,
      elements: elements || [],
      year,
      language,
      status: "draft",
      ...(aiMetadata !== undefined && { aiMetadata }),
    });
    design.set(pickContent(req.body.content));
    await design.save();

    res.status(201).json({ message: "Draft created", design: withContentUrls(design) });
  } catch (error) {
    if (/uploaded design image/.test(error.message)) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Create draft error:", error);
    res.status(500).json({ message: "Failed to create draft" });
  }
};

// GET /api/calendar-designs?limit=  — the designer's own projects, newest first.
const listMyDesigns = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 200);
    const designs = await CalendarDesign.find({ createdBy: req.user.userId })
      .select("-canvasData -elements")
      .populate("layoutId", "name previewImage type size")
      .populate({
        path: "variantId",
        select: "cutType sizeCode status assets.preview familyId",
        populate: { path: "familyId", select: "code name" },
      })
      .sort({ updatedAt: -1 })
      .limit(limit);

    // Production-layout drafts: stored paths → absolute URLs for the cards.
    const withUrls = designs.map((design) => {
      const obj = withContentUrls(design);
      if (obj.variantId?.assets) {
        obj.variantId = {
          ...obj.variantId,
          assets: { ...obj.variantId.assets, preview: toPublicUrl(obj.variantId.assets.preview) },
        };
      }
      return obj;
    });
    res.status(200).json({ message: "Designs fetched", designs: withUrls });
  } catch (error) {
    console.error("List designs error:", error);
    res.status(500).json({ message: "Failed to fetch designs" });
  }
};

const getDesign = async (req, res) => {
  try {
    const design = await CalendarDesign.findById(req.params.id);
    if (!design || !isOwner(design, req)) {
      return res.status(404).json({ message: "Design not found" });
    }
    res.status(200).json({ message: "Design fetched", design: withContentUrls(design) });
  } catch (error) {
    console.error("Get design error:", error);
    res.status(400).json({ message: "Invalid design ID" });
  }
};

const updateDesign = async (req, res) => {
  try {
    const { canvasData, elements, year, language, status, aiMetadata } =
      req.body;
    const design = await CalendarDesign.findById(req.params.id);
    if (!design || !isOwner(design, req)) {
      return res.status(404).json({ message: "Design not found" });
    }

    if (canvasData !== undefined) design.canvasData = canvasData;
    if (elements !== undefined) design.elements = elements;
    if (year !== undefined) design.year = year;
    if (language !== undefined) design.language = language;
    if (status !== undefined) design.status = status;
    if (aiMetadata !== undefined) design.aiMetadata = aiMetadata;
    design.set(pickContent(req.body.content));

    await design.save();
    res.status(200).json({ message: "Design updated", design: withContentUrls(design) });
  } catch (error) {
    if (/uploaded design image/.test(error.message)) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Update design error:", error);
    res.status(400).json({ message: "Failed to update design" });
  }
};

const autosaveDesign = async (req, res) => {
  try {
    const { canvasData, elements, year, language, aiMetadata } = req.body;
    const design = await CalendarDesign.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.userId },
      {
        ...(canvasData !== undefined && { canvasData }),
        ...(elements !== undefined && { elements }),
        ...(year !== undefined && { year }),
        ...(language !== undefined && { language }),
        ...(aiMetadata !== undefined && { aiMetadata }),
        ...pickContent(req.body.content),
      },
      { returnDocument: "after" },
    );
    if (!design) {
      return res.status(404).json({ message: "Design not found" });
    }
    res.status(200).json({ message: "Autosaved", updatedAt: design.updatedAt });
  } catch (error) {
    if (/uploaded design image/.test(error.message)) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Autosave error:", error);
    res.status(400).json({ message: "Autosave failed" });
  }
};

// POST /api/calendar-designs/god-image/process  { source, op, targetLongPx? }
//   op "remove-background" | "enhance" — free tools on this server (no AI,
//   nothing sent anywhere). The result is a NEW image the designer previews
//   before applying; the source (an upload or a library picture) is kept.
const GOD_IMAGE_OPS = ["remove-background", "enhance"];
const MAX_PROCESS_BYTES = 40 * 1024 * 1024;
const processGodImage = async (req, res) => {
  const { source, op } = req.body || {};
  if (!GOD_IMAGE_OPS.includes(op)) return res.status(400).json({ message: "Unknown image tool." });
  if (typeof source !== "string" || !source.startsWith(CONTENT_IMAGE_PREFIX) || source.includes("..")) {
    return res.status(400).json({ message: "Choose an uploaded God image first." });
  }
  try {
    const storage = getStorage();
    let input;
    try {
      input = await storage.readFile(source);
    } catch {
      return res.status(404).json({ message: "The God image could not be found." });
    }
    if (input.length > MAX_PROCESS_BYTES) return res.status(400).json({ message: "The image is too large to process." });
    const tools = require("../services/image/godImageTools");
    const targetLongPx = Number(req.body.targetLongPx) > 0 ? Math.round(Number(req.body.targetLongPx)) : null;
    const result = op === "remove-background" ? await tools.removeBackground(input) : await tools.enhance(input, { targetLongPx });
    const ext = op === "remove-background" || result.contentType === "image/png" ? "png" : "jpg";
    const suffix = op === "remove-background" ? "god-nobg" : "god-enhanced";
    const stored = await storage.saveFile(uploadPath("design-content", `${Date.now()}-${suffix}.${ext}`), result.buffer, {
      contentType: ext === "png" ? "image/png" : "image/jpeg",
      metadata: { kind: "content-image", field: suffix, source, ownerId: String(req.user.userId) },
    });
    res.status(201).json({
      message: op === "remove-background" ? "Background removed (preview)" : "Enhanced (preview)",
      path: stored,
      url: toPublicUrl(stored),
      widthPx: result.widthPx,
      heightPx: result.heightPx,
      ...(op === "remove-background" && {
        removedShare: Math.round(result.removedShare * 1000) / 1000,
        plainBackground: result.plainBackground,
        alreadyTransparent: result.alreadyTransparent,
      }),
      ...(op === "enhance" && { scale: Math.round(result.scale * 100) / 100 }),
    });
  } catch (error) {
    console.error("God image tool error:", error);
    res.status(500).json({ message: "The image could not be processed." });
  }
};

// POST /api/calendar-designs/uploads — designer content image (god / product).
// Saved through the storage layer (GridFS shared storage, or this computer).
const uploadContentImage = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Choose an image to upload." });
  try {
    const size = imageSize(req.file.buffer);
    const stored = await getStorage().saveFile(uploadPath("design-content", contentFileName(req.file)), req.file.buffer, {
      contentType: req.file.mimetype,
      metadata: { kind: "content-image", field: req.file.fieldname, ownerId: String(req.user.userId) },
    });
    res.status(201).json({
      message: "Image uploaded",
      path: stored,
      url: toPublicUrl(stored),
      widthPx: size?.width ?? null,
      heightPx: size?.height ?? null,
    });
  } catch (error) {
    console.error("Content image upload error:", error);
    res.status(500).json({ message: "Failed to save the image" });
  }
};

// PUT /api/calendar-designs/:id/thumbnail  multipart: thumbnail (PNG/JPEG)
const uploadThumbnail = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Thumbnail image is required" });
    const design = await CalendarDesign.findById(req.params.id);
    if (!design || !isOwner(design, req)) {
      return res.status(404).json({ message: "Design not found" });
    }
    const previous = design.thumbnail;
    design.thumbnail = await getStorage().saveFile(
      uploadPath("design-content", contentFileName(req.file)),
      req.file.buffer,
      { contentType: req.file.mimetype, metadata: { kind: "thumbnail", designId: String(design._id), ownerId: String(req.user.userId) } },
    );
    await design.save();
    if (previous && previous !== design.thumbnail) removeUpload(previous);
    res.status(200).json({ message: "Thumbnail saved", thumbnailUrl: toPublicUrl(design.thumbnail) });
  } catch (error) {
    console.error("Thumbnail upload error:", error);
    res.status(500).json({ message: "Failed to save the thumbnail" });
  }
};

// Deletes ONLY the given drafts (CalendarDesign documents), already checked
// to belong to userId. Generated designs (AiCalendarJob documents and their
// files under uploads/ai-calendars), layouts and production files are never
// touched: a generation simply keeps its (now dangling) designId. The draft's
// thumbnail and any content image nothing else uses are removed afterwards.
const removeDrafts = async (designs, userId) => {
  if (!designs.length) return;
  await CalendarDesign.deleteMany({ _id: { $in: designs.map((d) => d._id) }, createdBy: userId });
  for (const design of designs) {
    if (design.thumbnail) removeUpload(design.thumbnail);
    for (const stored of CONTENT_IMAGE_FIELDS.map((key) => design.content?.[key])) {
      if (stored && !(await isImageInUse(stored))) removeUpload(stored);
    }
  }
};

// DELETE /api/calendar-designs/:id — one of the designer's own drafts.
// Its generated designs are kept (see removeDrafts).
const deleteDesign = async (req, res) => {
  try {
    const design = await CalendarDesign.findById(req.params.id);
    if (!design || !isOwner(design, req)) {
      return res.status(404).json({ message: "Design not found" });
    }
    await removeDrafts([design], design.createdBy);
    res.status(200).json({ message: "Project deleted" });
  } catch (error) {
    console.error("Delete design error:", error);
    res.status(500).json({ message: "Failed to delete the project" });
  }
};

const MAX_BULK_DELETE = 200;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

// POST /api/calendar-designs/bulk-delete  { ids: [designId, …] }
// Deletes the designer's own selected drafts only; ids that are not theirs
// (or no longer exist) are reported back as notFound and left alone.
const bulkDeleteDesigns = async (req, res) => {
  const raw = req.body?.ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    return res.status(400).json({ message: "Select at least one draft to delete." });
  }
  const ids = [...new Set(raw.map(String))];
  if (ids.length > MAX_BULK_DELETE) {
    return res.status(400).json({ message: `Delete at most ${MAX_BULK_DELETE} drafts at a time.` });
  }
  if (!ids.every((id) => OBJECT_ID.test(id))) {
    return res.status(400).json({ message: "Invalid draft id." });
  }
  try {
    const userId = req.user?.userId;
    const designs = await CalendarDesign.find({ _id: { $in: ids }, createdBy: userId }, "_id createdBy thumbnail content");
    await removeDrafts(designs, userId);
    const deleted = designs.map((d) => String(d._id));
    res.status(200).json({
      message: `${deleted.length} draft${deleted.length === 1 ? "" : "s"} deleted`,
      deleted,
      notFound: ids.filter((id) => !deleted.includes(id)),
    });
  } catch (error) {
    console.error("Bulk delete designs error:", error);
    res.status(500).json({ message: "Failed to delete the selected drafts" });
  }
};

module.exports = {
  pickContent,
  uploadThumbnail,
  deleteDesign,
  bulkDeleteDesigns,
  processGodImage,
  uploadContentImage,
  createDraft,
  listMyDesigns,
  getDesign,
  updateDesign,
  autosaveDesign,
};
