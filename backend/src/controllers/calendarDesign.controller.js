const CalendarDesign = require("../models/CalendarDesign");
const Layout = require("../models/Layout");
const LayoutVariant = require("../models/LayoutVariant");
const fs = require("fs");
const path = require("path");
const AiCalendarJob = require("../models/AiCalendarJob");
const { uploadPath, toPublicUrl } = require("../lib/assetUrl");
const { resolveUpload, UPLOADS_DIR } = require("../services/ai/uploadPaths");
const { JOBS_FOLDER } = require("../services/ai/calendarJobRunner");
const { imageSize } = require("../lib/imageSize");

const CONTENT_TEXT_FIELDS = ["businessName", "productList", "address", "rightBoxText"];
const CONTENT_SWITCH_FIELDS = ["showBusinessName", "showLeftBox", "showRightBox", "showTextLine1", "showTextLine2"];
const CONTENT_IMAGE_FIELDS = ["godImage", "productImage"];
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
      productImageUrl: toPublicUrl(obj.content.productImage),
    },
    thumbnailUrl: toPublicUrl(obj.thumbnail),
  };
};

const removeUpload = (stored) => {
  const abs = resolveUpload(stored);
  if (abs) fs.promises.unlink(abs).catch(() => {});
};

// A content image can be shared (e.g. by an AI generation): only delete it
// when nothing else uses it.
const isImageInUse = async (stored) =>
  Boolean(
    (await CalendarDesign.exists({ $or: [{ "content.godImage": stored }, { "content.productImage": stored }] })) ||
      (await AiCalendarJob.exists({ $or: [{ "content.godImage": stored }, { "content.productImage": stored }] })),
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

// POST /api/calendar-designs/uploads — designer content image (god / product).
const uploadContentImage = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Choose an image to upload." });
  const size = imageSize(req.file.path);
  const stored = uploadPath("design-content", req.file.filename);
  res.status(201).json({
    message: "Image uploaded",
    path: stored,
    url: toPublicUrl(stored),
    widthPx: size?.width ?? null,
    heightPx: size?.height ?? null,
  });
};

// PUT /api/calendar-designs/:id/thumbnail  multipart: thumbnail (PNG/JPEG)
const uploadThumbnail = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Thumbnail image is required" });
    const design = await CalendarDesign.findById(req.params.id);
    if (!design || !isOwner(design, req)) {
      removeUpload(uploadPath("design-content", req.file.filename));
      return res.status(404).json({ message: "Design not found" });
    }
    const previous = design.thumbnail;
    design.thumbnail = uploadPath("design-content", req.file.filename);
    await design.save();
    if (previous && previous !== design.thumbnail) removeUpload(previous);
    res.status(200).json({ message: "Thumbnail saved", thumbnailUrl: toPublicUrl(design.thumbnail) });
  } catch (error) {
    console.error("Thumbnail upload error:", error);
    res.status(500).json({ message: "Failed to save the thumbnail" });
  }
};

// DELETE /api/calendar-designs/:id — the designer's own project, with its
// AI generations, thumbnail, and content images nothing else uses.
const deleteDesign = async (req, res) => {
  try {
    const design = await CalendarDesign.findById(req.params.id);
    if (!design || !isOwner(design, req)) {
      return res.status(404).json({ message: "Design not found" });
    }
    const jobs = await AiCalendarJob.find({ designId: design._id }, "_id content").lean();
    await AiCalendarJob.deleteMany({ _id: { $in: jobs.map((j) => j._id) } });
    for (const job of jobs) {
      fs.promises.rm(path.join(UPLOADS_DIR, JOBS_FOLDER, String(job._id)), { recursive: true, force: true }).catch(() => {});
    }
    await design.deleteOne();

    if (design.thumbnail) removeUpload(design.thumbnail);
    const images = new Set(
      [design.content?.godImage, design.content?.productImage, ...jobs.flatMap((j) => [j.content?.godImage, j.content?.productImage])].filter(Boolean),
    );
    for (const stored of images) {
      if (!(await isImageInUse(stored))) removeUpload(stored);
    }
    res.status(200).json({ message: "Project deleted" });
  } catch (error) {
    console.error("Delete design error:", error);
    res.status(500).json({ message: "Failed to delete the project" });
  }
};

module.exports = {
  pickContent,
  uploadThumbnail,
  deleteDesign,
  uploadContentImage,
  createDraft,
  listMyDesigns,
  getDesign,
  updateDesign,
  autosaveDesign,
};
