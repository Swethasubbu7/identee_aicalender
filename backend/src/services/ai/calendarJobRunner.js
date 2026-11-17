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
const { getStorage } = require("../storage");
const { buildArtworkGuide, buildTemplateReference } = require("./layoutReference");
const { specialArtworkPrompt, compositionFor } = require("./calendarPrompts");
const { artDirectionFor } = require("./artDirection");
const { effectiveOptions, aiPaintsProductImage } = require("../layout/composition");
const { themeFor } = require("./themes");
const { recordedRequest, logGenerationSummary, closeInterruptedRequests, flushPendingUsage } = require("./usageLedger");
const { RUNNER_ID, earlierRunsOfThisHost } = require("./runnerId");

// A running job reports in every HEARTBEAT_MS. One that has not for
// STALE_MS (its server crashed, restarted or lost the network) is closed as
// interrupted — on any server sharing the database — and never re-run.
const HEARTBEAT_MS = 30 * 1000;
const STALE_MS = 5 * 60 * 1000;

// Internal cause of a failure for the job record (never shown to designers).
const detailOf = (err) => {
  const text = [err?.kind, err?.httpStatus && `HTTP ${err.httpStatus}`, err?.detail || err?.message].filter(Boolean).join(" · ");
  return text.replace(/AIza[\w-]{10,}|AQ\.[\w.-]{10,}/g, "[redacted]").slice(0, 500) || null;
};

// Jobs this process holds (waiting in its queue or running). One timer
// reports them all in, so a job waiting behind others is not seen as stale.
const owned = new Set();
let beatTimer = null;
const beat = (ids) =>
  Promise.all(
    ids.map((id) =>
      Promise.resolve(AiCalendarJob.updateOne({ _id: id }, { $set: { heartbeatAt: new Date(), runnerId: RUNNER_ID } })).catch(() => {}),
    ),
  );
const own = (jobId) => {
  owned.add(String(jobId));
  if (!beatTimer) {
    beatTimer = setInterval(() => beat([...owned]), HEARTBEAT_MS);
    beatTimer.unref?.();
  }
};
const release = (jobId) => owned.delete(String(jobId));
const startHeartbeat = (jobId) => {
  own(jobId);
  return () => release(jobId);
};

const JOBS_FOLDER = "ai-calendars";
const MAX_AI_INPUT_PX = 2048;

const MIME_BY_EXT = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
// Stored images are read through the storage layer (GridFS shared storage
// with this computer's uploads folder as the fallback).
const readImage = async (storedPath) => {
  if (typeof storedPath !== "string" || !storedPath.startsWith("/uploads/")) throw new Error("Invalid image path");
  return {
    buffer: await getStorage().readFile(storedPath),
    mimeType: MIME_BY_EXT[path.extname(storedPath).toLowerCase()] || "image/png",
  };
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

// New file per save (never overwrites). In GridFS mode a failed GridFS write
// is kept on this computer instead, so a paid AI picture is never lost.
const saveImage = async (jobId, name, { buffer, mimeType }) => {
  const filename = `${name}-${Date.now()}${mimeType === "image/jpeg" ? ".jpg" : ".png"}`;
  return getStorage().saveFile(uploadPath(`${JOBS_FOLDER}/${jobId}`, filename), buffer, {
    contentType: mimeType === "image/jpeg" ? "image/jpeg" : "image/png",
    metadata: { kind: name.replace(/^v\d+-/, ""), jobId: String(jobId) },
  });
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
  // Own creative direction per design (seeded: the same on a regenerate).
  const direction = artDirectionFor(`${job._id}:${i}`);
  const prompt = specialArtworkPrompt({
    artDirection: direction.text,
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
  await setFields(job._id, { [`${key}.compositionStyle`]: composition.name, [`${key}.artDirection`]: direction.text });
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

const markFailed = (jobId, i, err) => {
  if (!err?.code) console.error(`AI job ${jobId} design ${i + 1} failed:`, err?.stack || err);
  return setFields(jobId, {
    [`variations.${i}.status`]: "FAILED",
    [`variations.${i}.error`]: userMessage(err),
    [`variations.${i}.errorKind`]: err?.kind || null,
    [`variations.${i}.errorDetail`]: detailOf(err),
    ...(err?.kind && { errorKind: err.kind }),
  });
};

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
  // Claimed atomically: a job is only ever run once, by one server.
  const job = await AiCalendarJob.findOneAndUpdate(
    { _id: jobId, status: "QUEUED" },
    { $set: { status: "RUNNING", runnerId: RUNNER_ID, heartbeatAt: new Date() } },
    { new: true },
  );
  if (!job) return;
  const ai = getImageAi();
  const stopHeartbeat = startHeartbeat(jobId);
  try {
    // Checked again here: the master switch may have changed since the job
    // was created. Nothing is sent while AI is off.
    if (!ai.isConfigured()) {
      const err = new Error("AI image generation is switched off on this server.");
      err.code = "AI_PROVIDER_ERROR";
      throw err;
    }
    await setFields(jobId, { progress: `Designing ${job.variations.length} designs` });
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
        // Stop before the next paid request when the next one would fail the same way.
        if (["QUOTA", "AUTH", "DISABLED", "NETWORK", "LEDGER_UNAVAILABLE"].includes(err?.kind)) break;
      }
    }
    await finishJob(jobId);
  } catch (error) {
    console.error(`AI job ${jobId} failed:`, error?.stack || error);
    await setFields(jobId, {
      status: "FAILED",
      progress: "Failed",
      error: userMessage(error),
      errorKind: error?.kind || null,
      errorDetail: detailOf(error),
      finishedAt: new Date(),
    }).catch((err) => console.error(`AI job ${jobId}: failure could not be saved (closed later as interrupted):`, err.message));
  } finally {
    stopHeartbeat();
  }
  await logGenerationSummary(jobId, job.variations.length).catch(() => {});
};

// Regenerate one design (same layout, same theme, new attempt) — one request.
const runRegeneration = async (jobId, index) => {
  const job = await AiCalendarJob.findById(jobId);
  const variation = job?.variations[index];
  if (!variation) return;
  const ai = getImageAi();
  const stopHeartbeat = startHeartbeat(jobId);
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
    await markFailed(jobId, index, err).catch(() => {});
  } finally {
    stopHeartbeat();
  }
  await finishJob(jobId).catch((err) => console.error(`AI job ${jobId}: result could not be saved:`, err.message));
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

// Held (and reported in) from the moment it is queued until it ends.
const enqueueJob = (jobId) => {
  own(jobId);
  queue.push(() => runJob(String(jobId)).finally(() => release(jobId)));
  pump();
};

const enqueueRegeneration = (jobId, index) => {
  own(jobId);
  queue.push(() => runRegeneration(String(jobId), index).finally(() => release(jobId)));
  pump();
};

// The queue is in memory. Interrupted jobs are closed as FAILED (never
// re-run: their request may already have been billed) together with their
// unfinished designs and usage records:
//  - on start: jobs of an EARLIER process of this server (restart / crash);
//  - every sweep: jobs on any server that stopped reporting in (STALE_MS).
// Jobs another live server is running are left alone.
const INTERRUPTED_MESSAGE = "Generation was interrupted (server restart or lost connection). Nothing is retried automatically — press Try again to generate again.";

const closeJobs = async (filter) => {
  const jobs = await AiCalendarJob.find({ status: { $in: ["QUEUED", "RUNNING"] }, ...filter });
  for (const job of jobs) {
    const set = {
      status: "FAILED",
      progress: "Failed",
      error: INTERRUPTED_MESSAGE,
      errorKind: "INTERRUPTED",
      finishedAt: new Date(),
    };
    job.variations.forEach((v, i) => {
      if (["PENDING", "RUNNING"].includes(v.status)) {
        set[`variations.${i}.status`] = "FAILED";
        set[`variations.${i}.error`] = INTERRUPTED_MESSAGE;
        set[`variations.${i}.errorKind`] = "INTERRUPTED";
      }
    });
    // Designs already finished keep their pictures: the job is PARTIAL.
    if (job.variations.some((v) => v.status === "DONE")) {
      set.status = "PARTIAL";
      set.progress = `${job.variations.filter((v) => v.status === "DONE").length} of ${job.variations.length} designs generated`;
      set.error = null;
    }
    // Only if it is still unfinished (its runner may have just finished it).
    await AiCalendarJob.updateOne({ _id: job._id, status: { $in: ["QUEUED", "RUNNING"] } }, { $set: set });
  }
  return jobs.length;
};

const staleFilter = () => {
  const before = new Date(Date.now() - STALE_MS);
  return {
    $or: [{ heartbeatAt: { $lt: before } }, { heartbeatAt: null, updatedAt: { $lt: before } }],
  };
};

const recoverInterruptedJobs = async () => {
  const own = earlierRunsOfThisHost();
  const closed = await closeJobs({ $or: [{ runnerId: own }, ...staleFilter().$or] });
  // Older jobs (before runner ids) waiting in this server's queue are gone too.
  const requests = await closeInterruptedRequests({ ownEarlierRuns: own, olderThanMs: STALE_MS + 2 * config.AI_REQUEST_TIMEOUT_MS });
  await flushPendingUsage();
  if (closed || requests) console.log(`AI recovery: ${closed} interrupted job(s), ${requests} unfinished request(s) closed (not retried).`);
  return { closed, requests };
};

// Regular check while the server runs (other servers may have stopped).
const sweepInterrupted = async () => {
  const closed = await closeJobs(staleFilter());
  const requests = await closeInterruptedRequests({ olderThanMs: STALE_MS + 2 * config.AI_REQUEST_TIMEOUT_MS });
  await flushPendingUsage();
  return { closed, requests };
};

let sweepTimer = null;
const startInterruptedSweep = (everyMs = 2 * 60 * 1000) => {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => sweepInterrupted().catch((err) => console.error("AI sweep failed:", err.message)), everyMs);
  sweepTimer.unref?.();
};

module.exports = {
  sweepInterrupted,
  startInterruptedSweep,
  STALE_MS,
  enqueueJob,
  enqueueRegeneration,
  recoverInterruptedJobs,
  resolveUpload,
  saveImage,
  readImage,
  UPLOADS_DIR,
  JOBS_FOLDER,
};
