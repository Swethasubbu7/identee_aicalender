// Runs AI calendar jobs in the background (generation takes about a minute,
// too long for one HTTP request). In-process queue with a concurrency limit;
// job state lives in MongoDB so the browser can poll it and nothing is lost
// when something fails.
//
// Cost rule (business decision 2026-10-12): exactly ONE image request per
// design — 2 designs = 2 requests per Generate. No separate requests for god
// clean-up, backgrounds or product photos, and no automatic retries. Every
// request is recorded in the usage ledger (services/ai/usageLedger.js).
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const config = require("../../config");
const AiCalendarJob = require("../../models/AiCalendarJob");
const LayoutVariant = require("../../models/LayoutVariant");
const { uploadPath } = require("../../lib/assetUrl");
const { getImageAi } = require("./imageAi");
const { UPLOADS_DIR, resolveUpload } = require("./uploadPaths");
const { buildArtworkGuide, buildTemplateReference } = require("./layoutReference");
const { specialArtworkPrompt, compositionFor } = require("./calendarPrompts");
const { effectiveOptions, aiPaintsProductImage } = require("../layout/composition");
const { themeFor } = require("./themes");
const { recordedRequest, logGenerationSummary } = require("./usageLedger");

const JOBS_FOLDER = "ai-calendars";
const MAX_AI_INPUT_PX = 2048;

const MIME_BY_EXT = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const readImage = async (storedPath) => {
  const abs = resolveUpload(storedPath);
  if (!abs) throw new Error("Invalid image path");
  return { buffer: await fs.promises.readFile(abs), mimeType: MIME_BY_EXT[path.extname(abs).toLowerCase()] || "image/png" };
};

// Customer photos: fix phone rotation and keep the AI request a sensible size.
const prepareForAi = async (image) => {
  const buffer = await sharp(image.buffer)
    .rotate()
    .resize({ width: MAX_AI_INPUT_PX, height: MAX_AI_INPUT_PX, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  return { buffer, mimeType: "image/png" };
};

const saveImage = async (jobId, name, { buffer, mimeType }) => {
  const dir = path.join(UPLOADS_DIR, JOBS_FOLDER, String(jobId));
  await fs.promises.mkdir(dir, { recursive: true });
  const filename = `${name}-${Date.now()}${mimeType === "image/jpeg" ? ".jpg" : ".png"}`;
  await fs.promises.writeFile(path.join(dir, filename), buffer);
  return uploadPath(`${JOBS_FOLDER}/${jobId}`, filename);
};

const setFields = (jobId, fields) => AiCalendarJob.updateOne({ _id: jobId }, { $set: fields });
const countCall = (jobId) => AiCalendarJob.updateOne({ _id: jobId }, { $inc: { aiCalls: 1 } });
const userMessage = (err) => (err?.code === "AI_PROVIDER_ERROR" ? err.message : "Generation failed. Please try again.");

const loadVariants = async (job) => {
  const variants = await LayoutVariant.find({ _id: { $in: job.variations.map((v) => v.variantId) } }).populate(
    "familyId",
    "code",
  );
  return new Map(variants.map((v) => [String(v._id), v]));
};

const usageMeta = (job, i, ai, aspectRatio, images, purpose) => ({
  provider: ai.name,
  model: config.GEMINI_IMAGE_MODEL,
  jobId: job._id,
  variationIndex: i,
  purpose,
  userId: job.userId,
  requestedResolution: config.GEMINI_IMAGE_SIZE,
  aspectRatio,
  referenceImages: images.length,
  imagesRequested: config.AI_IMAGES_PER_REQUEST,
});

// Every returned image is kept (they were all billed); the first is used.
const saveResultImages = async (job, i, name, result) => {
  const [main, ...extra] = result.images;
  const mainPath = await saveImage(job._id, `v${i}-${name}`, main);
  const extraPaths = [];
  for (const [k, img] of extra.entries()) extraPaths.push(await saveImage(job._id, `v${i}-${name}-extra${k + 1}`, img));
  return { mainPath, extraPaths };
};

// Special Die-Cut without a god area: ONE recorded request paints the whole
// artwork (deity, frame, background) on the production guide. The app keeps
// the cutline, cake and calendar and typesets the text on top.
const runFullArtworkVariation = async (job, i, variant, godImage, theme, ai, options) => {
  const key = `variations.${i}`;
  // Right box as an AI-painted product picture (no photo uploaded).
  const aiProductImage = options.showRightBox !== false && aiPaintsProductImage(options, job.content || {});
  const guide = await buildArtworkGuide(variant, { ...options, aiProductImage });
  if (!guide) throw new Error("This layout has no cutline mapped.");
  // The selected layout as a style reference, with every removed section
  // cut out (it never shows the boxes / banners the customer removed).
  const template = await buildTemplateReference(variant, options);
  const images = [godImage, guide, ...(template ? [template] : [])];
  const composition = compositionFor(i, job.variations.length);
  const prompt = specialArtworkPrompt({
    theme,
    prompt: job.prompt,
    hasTemplateReference: Boolean(template),
    templateHasRemovedAreas: Boolean(template?.removedSections),
    cakeOverlapsArtwork: guide.cakeOverlapsArtwork,
    composition,
    freedSpace: guide.freedSpace,
    freedSpaceIndex: i,
    products: job.content?.productList,
    cutType: variant.cutType,
    noPanels: guide.panelCount === 0,
    productArea: guide.productArea,
  });
  await setFields(job._id, { [`${key}.compositionStyle`]: composition.name });
  const result = await recordedRequest(
    () => ai.editImage({ prompt, images, aspectRatio: guide.aspectRatio }),
    usageMeta(job, i, ai, guide.aspectRatio, images, job.adminTest ? "admin-test-image" : "design-artwork"),
  ).finally(() => countCall(job._id));
  const { mainPath, extraPaths } = await saveResultImages(job, i, "artwork", result);
  await setFields(job._id, {
    [`${key}.composition`]: "FULL_ARTWORK",
    [`${key}.background`]: mainPath,
    [`${key}.backgroundBox`]: guide.box,
    [`${key}.extraImages`]: extraPaths,
    [`${key}.status`]: "DONE",
  });
};

const plainOptions = (o) => (o?.toObject ? o.toObject() : { ...(o || {}) });

// ONE recorded request for one design: the customer's god image, the
// layout's geometry guide and its (cleaned) look as a style reference.
const runVariation = async (job, i, variant, godImage, theme, ai) => {
  const key = `variations.${i}`;
  await setFields(job._id, { [`${key}.status`]: "RUNNING", [`${key}.theme`]: theme, [`${key}.error`]: null });
  // Sections actually shown: switched on AND given content (a right image
  // box without a photo is painted by the AI).
  const raw = plainOptions(job.options);
  const options = effectiveOptions(variant, raw, job.content || {}, { aiPaintsProduct: aiPaintsProductImage(raw, job.content || {}) });
  // AI Mode (business decision 2026-10-15): every design is ONE complete new
  // artwork — deity, background, frame, flowers — for all three cut types;
  // the layout keeps the cutline, cake, calendar and the text positions.
  return runFullArtworkVariation(job, i, variant, godImage, theme, ai, options);
};

const markFailed = (jobId, i, err) =>
  setFields(jobId, {
    [`variations.${i}.status`]: "FAILED",
    [`variations.${i}.error`]: userMessage(err),
    ...(err?.kind && { errorKind: err.kind }),
  });

const finishJob = async (jobId) => {
  const job = await AiCalendarJob.findById(jobId);
  const ok = job.variations.filter((v) => v.status === "DONE").length;
  const total = job.variations.length;
  const failed = job.variations.find((v) => v.status === "FAILED");
  await setFields(jobId, {
    status: ok === total ? "DONE" : ok > 0 ? "PARTIAL" : "FAILED",
    progress: ok === total ? "Done" : `${ok} of ${total} designs generated`,
    error: ok === 0 ? failed?.error || "No design could be generated. Please try again." : null,
    finishedAt: new Date(),
  });
};

const runJob = async (jobId) => {
  const job = await AiCalendarJob.findById(jobId);
  if (!job || job.status !== "QUEUED") return;
  const ai = getImageAi();
  try {
    // Checked again here: the master switch may have changed since the job
    // was created. Nothing is sent while AI is off.
    if (!ai.isConfigured()) {
      const err = new Error("AI image generation is switched off on this server.");
      err.code = "AI_PROVIDER_ERROR";
      throw err;
    }
    await setFields(jobId, { status: "RUNNING", progress: `Designing ${job.variations.length} designs` });
    const byId = await loadVariants(job);
    const godImage = await prepareForAi(await readImage(job.content.godImage));

    // One design at a time: a provider-side problem (quota, auth) stops the
    // job before the next paid request instead of failing all in parallel.
    for (const [i, v] of job.variations.entries()) {
      const variant = byId.get(String(v.variantId));
      try {
        if (!variant) throw new Error("Layout no longer exists");
        await runVariation(job, i, variant, godImage, themeFor(job.prompt, i), ai);
      } catch (err) {
        await markFailed(jobId, i, err);
        if (["QUOTA", "AUTH", "DISABLED"].includes(err?.kind)) break;
      }
    }
    await finishJob(jobId);
  } catch (error) {
    console.error(`AI job ${jobId} failed:`, error.message);
    await setFields(jobId, {
      status: "FAILED",
      progress: "Failed",
      error: userMessage(error),
      errorKind: error?.kind || null,
      finishedAt: new Date(),
    });
  }
  await logGenerationSummary(jobId, job.variations.length).catch(() => {});
};

// Regenerate one design (same layout, same theme, new attempt) — one request.
const runRegeneration = async (jobId, index) => {
  const job = await AiCalendarJob.findById(jobId);
  const variation = job?.variations[index];
  if (!variation) return;
  const ai = getImageAi();
  try {
    if (!ai.isConfigured()) {
      const err = new Error("AI image generation is switched off on this server.");
      err.code = "AI_PROVIDER_ERROR";
      throw err;
    }
    const byId = await loadVariants(job);
    const variant = byId.get(String(variation.variantId));
    if (!variant) throw new Error("Layout no longer exists");
    const godImage = await prepareForAi(await readImage(job.content.godImage));
    const theme = variation.theme?.name ? variation.theme : themeFor(job.prompt, index);
    await runVariation(job, index, variant, godImage, theme, ai);
  } catch (err) {
    await markFailed(jobId, index, err);
  }
  await finishJob(jobId);
  await logGenerationSummary(jobId, 1).catch(() => {});
};

const queue = [];
let running = 0;
const pump = () => {
  while (running < config.AI_MAX_CONCURRENT_JOBS && queue.length) {
    const task = queue.shift();
    running += 1;
    task()
      .catch((err) => console.error("AI job runner error:", err))
      .finally(() => {
        running -= 1;
        pump();
      });
  }
};

const enqueueJob = (jobId) => {
  queue.push(() => runJob(String(jobId)));
  pump();
};

const enqueueRegeneration = (jobId, index) => {
  queue.push(() => runRegeneration(String(jobId), index));
  pump();
};

// The queue is in memory: jobs interrupted by a restart are marked failed.
const recoverInterruptedJobs = () =>
  AiCalendarJob.updateMany(
    { status: { $in: ["QUEUED", "RUNNING"] } },
    { $set: { status: "FAILED", progress: "Failed", error: "Interrupted by a server restart. Please generate again.", finishedAt: new Date() } },
  );

module.exports = {
  enqueueJob,
  enqueueRegeneration,
  recoverInterruptedJobs,
  resolveUpload,
  saveImage,
  readImage,
  UPLOADS_DIR,
  JOBS_FOLDER,
};
