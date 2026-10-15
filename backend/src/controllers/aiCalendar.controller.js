// AI calendar generation: Customise content + prompt for the selected
// production layout → 2 designs of the same cut type and size → print check
// → printable PDFs (print artwork + laser cutline) of the one the designer picks.
const fs = require("fs");
const path = require("path");

const AiCalendarJob = require("../models/AiCalendarJob");
const LayoutVariant = require("../models/LayoutVariant");
const LayoutFamily = require("../models/LayoutFamily");
const { runLayoutValidation } = require("../services/layout/runLayoutValidation");
const CalendarFormat = require("../models/CalendarFormat");
const CalendarDesign = require("../models/CalendarDesign");
const config = require("../config");
const { CUT_TYPE_LABELS } = require("../constants/calendar");
const { toPublicUrl, uploadPath } = require("../lib/assetUrl");
const { imageSize } = require("../lib/imageSize");
const { withPublicUrls } = require("./layoutVariant.controller");
const { getImageAi } = require("../services/ai/imageAi");
const { getUpscaler, requiredScale } = require("../services/ai/upscaler");
const { pickLayoutsForVariations, variationCountFor } = require("../services/ai/pickLayouts");
const { pickRecipes, normalRecipes } = require("../constants/designRecipes");
const { canUseLayout, hasFullAccess } = require("../services/layout/layoutAccess");
const { estimateGenerate, checkLimits } = require("../services/ai/spendGuard");
const {
  enqueueJob,
  enqueueRegeneration,
  resolveUpload,
  saveImage,
  readImage,
  UPLOADS_DIR,
  JOBS_FOLDER,
} = require("../services/ai/calendarJobRunner");
const { exportSettings, buildPrintPdf, buildCutlinePdf } = require("../services/export/calendarPdf");
const { runPrintCheck, effectiveDpi } = require("../services/export/printCheck");
const { effectiveOptions, aiPaintsProductImage } = require("../services/layout/composition");
const { measureEmbeddedRasters } = require("../services/layout/embeddedRasters");

const CONTENT_PREFIX = "/uploads/design-content/";
const MM_PER_IN = 25.4;


const text = (value, max) => String(value ?? "").slice(0, max);

// Sections actually shown for this job (switched on and given content).
const jobOptions = (job, variant) => {
  const options = job.options?.toObject ? job.options.toObject() : job.options || {};
  const content = job.content || {};
  return effectiveOptions(variant, options, content, {
    aiPaintsProduct: job.mode === "ai" && aiPaintsProductImage(options, content),
  });
};

const contentImage = (value) => {
  if (!value) return null;
  if (typeof value !== "string" || !value.startsWith(CONTENT_PREFIX)) return undefined;
  const abs = resolveUpload(value);
  return abs && fs.existsSync(abs) ? value : undefined;
};

const serializeJob = async (job, req) => {
  const obj = job.toObject ? job.toObject() : job;
  const ids = [...new Set(obj.variations.map((v) => String(v.variantId)))];
  const variants = await LayoutVariant.find({ _id: { $in: ids } }).populate("familyId", "code name status");
  // Designers do not get the mapping; rendering the layers only needs where
  // the trim sits on the production PDF page and the excluded labels.
  const byId = new Map(
    variants.map((v) => {
      const pub = withPublicUrls(v, req);
      return [
        String(v._id),
        {
          ...pub,
          mapping: pub.mapping || {
            pageIndex: v.mapping?.pageIndex || 0,
            trimOriginMm: v.mapping?.trimOriginMm,
            // Guide labels (e.g. "4X5 INCHES") that must never print.
            excludedBoxes: v.mapping?.excludedBoxes || [],
          },
        },
      ];
    }),
  );
  return {
    ...obj,
    content: {
      ...obj.content,
      godImageUrl: toPublicUrl(obj.content.godImage),
      productImageUrl: toPublicUrl(obj.content.productImage),
      productImageEnhancedUrl: toPublicUrl(obj.content.productImageEnhanced),
    },
    variations: obj.variations.map((v) => ({
      ...v,
      variant: byId.get(String(v.variantId)) || null,
      godImageUrl: toPublicUrl(v.godImage),
      previewUrl: toPublicUrl(v.previewImage),
      backgroundUrl: toPublicUrl(v.background),
      exportPdfUrl: toPublicUrl(v.exportPdf),
      exportCutlinePdfUrl: toPublicUrl(v.exportCutlinePdf),
    })),
  };
};

const loadOwnJob = async (req, res) => {
  const job = await AiCalendarJob.findById(req.params.id).catch(() => null);
  if (!job || (!hasFullAccess(req) && String(job.userId) !== String(req.user.userId))) {
    res.status(404).json({ message: "Generation not found" });
    return null;
  }
  return job;
};

const loadVariation = async (req, res, { requireDone = true } = {}) => {
  const job = await loadOwnJob(req, res);
  if (!job) return {};
  const index = Number(req.params.index);
  const variation = job.variations[index];
  if (!variation || (requireDone && variation.status !== "DONE")) {
    res.status(400).json({ message: "This design is not ready" });
    return {};
  }
  const variant = await LayoutVariant.findById(variation.variantId).populate("familyId", "code name");
  if (!variant) {
    res.status(404).json({ message: "The layout of this design no longer exists" });
    return {};
  }
  return { job, index, variation, variant };
};

const regionOf = (variant, role) => (variant.regions || []).find((r) => r.role === role);
const productRegion = (variant) => (variant.regions || []).find((r) => r.binding === "productImage");
const productPath = (job, choice) =>
  choice === "enhanced" && job.content.productImageEnhanced ? job.content.productImageEnhanced : job.content.productImage;

// The layout with its validation run NOW (not the stored result, which may
// predate newer rules) — for Print Check only; nothing is saved.
const freshlyValidated = async (variant) => {
  const plain = variant.toObject ? variant.toObject() : { ...variant };
  try {
    const v = await runLayoutValidation(plain);
    return { ...plain, validation: { status: v.status, results: v.results } };
  } catch {
    return plain;
  }
};

// Pixel sizes + boxes of the pictures used by one design.
//   Normal Mode: the layout's own God picture (`layoutGod`), or — for a
//   reusable layout saved from an AI design — its saved artwork / deity.
const measureImages = (job, variation, variant, productChoice) => {
  const sizeOf = (stored) => (stored ? imageSize(resolveUpload(stored)) : null);
  if (job.mode === "normal") {
    const d = variant.design || {};
    const product = productRegion(variant);
    const options = job.options || {};
    const productStored = options.showRightBox !== false && options.rightBoxMode !== "text" ? job.content.productImage : null;
    return {
      layoutGod: !d.artwork && !d.godImage,
      // The layout's own embedded artwork prints as it is: its measured
      // resolution (unless a saved AI artwork replaces it).
      layoutRasters: d.artwork ? null : measureEmbeddedRasters(variant) || variant.artworkRasters || null,
      god: d.godImage ? { size: sizeOf(d.godImage), box: d.godImageBox || regionOf(variant, "GOD_AREA")?.box } : null,
      background: d.artwork ? { size: sizeOf(d.artwork), box: d.artworkBox } : null,
      composition: d.artwork ? "FULL_ARTWORK" : null,
      product: productStored && product ? { size: sizeOf(productStored), box: product.box } : null,
    };
  }
  const bg = regionOf(variant, "BACKGROUND_AREA");
  const product = productRegion(variant);
  const options = job.options || {};
  const showsProductImage = options.showRightBox !== false && options.rightBoxMode !== "text";
  const productStored = showsProductImage ? productPath(job, productChoice) : null;
  return {
    god: variation.godImage
      ? { size: sizeOf(variation.godImagePrint || variation.godImage), box: variation.godImageBox || regionOf(variant, "GOD_AREA")?.box }
      : job.content.godImage && regionOf(variant, "GOD_AREA")
        ? { size: sizeOf(job.content.godImage), box: regionOf(variant, "GOD_AREA").box }
        : null,
    background:
      variation.background && (bg || variation.backgroundBox)
        ? { size: sizeOf(variation.backgroundPrint || variation.background), box: variation.backgroundBox || bg.box }
        : null,
    composition: variation.composition || null,
    product: productStored && product ? { size: sizeOf(productStored), box: product.box } : null,
  };
};

const sizeText = (v) => `${CUT_TYPE_LABELS[v.cutType] || v.cutType} ${String(v.sizeCode).replace("x", "×")}`;

// All designs use the selected layout (fixed); recipes make them different.
//   normal — 5 side-box styles (Normal Cut / Die-Cut), 1 design (Special);
//   ai     — exactly 2 designs (one image request each).
const planDesigns = (selected, mode, prompt) => {
  if (mode === "normal") {
    const recipes = normalRecipes(selected);
    return { picks: pickLayoutsForVariations(selected, recipes.length), recipes };
  }
  const picks = pickLayoutsForVariations(selected, variationCountFor(selected.cutType));
  return { picks, recipes: pickRecipes(prompt, picks.length) };
};

// Designer options shared by all designs of one Generate.
const readOptions = (body) => ({
  language: body.language === "tamil" ? "tamil" : "english",
  showBusinessName: body.showBusinessName !== false && body.showBusinessName !== "false",
  showLeftBox: body.showLeftBox !== false && body.showLeftBox !== "false",
  showRightBox: body.showRightBox !== false && body.showRightBox !== "false",
  showTextLine1: body.showTextLine1 !== false && body.showTextLine1 !== "false",
  showTextLine2: body.showTextLine2 !== false && body.showTextLine2 !== "false",
  rightBoxMode: body.rightBoxMode === "text" ? "text" : "image",
});

const formatOf = (variant) =>
  CalendarFormat.findOne({ cutType: variant.cutType, sizeCode: variant.sizeCode }).catch(() => null);

// POST /api/ai-calendars
// body: mode ("normal" | "ai"), variantId, businessName, productList,
//       address, productImage (paths from POST /api/calendar-designs/uploads),
//       options…, designId?
//   mode "normal": content on the selected layout — NEVER calls an AI
//       provider, never sends any picture anywhere, costs nothing. The
//       layout's own artwork and God picture are kept (no God upload).
//   mode "ai": godImage + prompt required; AI must be switched on; spending
//       limits + confirmCost: true + confirmedEstimateInr (the estimate the
//       designer agreed to) before exactly one request per design is sent.
const createJob = (req, res) => startJob(req, res, { adminTest: false });

// POST /api/ai-calendars/test-image
// "Test one AI image": EXACTLY ONE image request through the same
// configuration, spending limits, cost confirmation and usage ledger as a
// regular AI Generate — used to measure the real cost and quality before
// the regular two-design Generate is enabled. The regular Generate is not
// affected (it always plans two designs).
const createAdminTestImage = (req, res) => {
  return startJob(req, res, { adminTest: true, mode: "ai" });
};

const startJob = async (req, res, { adminTest, mode: forcedMode = null }) => {
  try {
    const mode = forcedMode || (req.body.mode === "ai" ? "ai" : "normal");
    const { variantId } = req.body;
    const selected = await LayoutVariant.findById(variantId).catch(() => null);
    if (!canUseLayout(req, selected)) {
      return res.status(404).json({ message: "Choose an approved production layout." });
    }
    if (mode === "ai" && !getImageAi().isConfigured()) {
      return res.status(409).json({
        message: "AI is switched off on this server. Use Normal Mode (free), or ask the admin to enable AI.",
        aiDisabled: true,
      });
    }

    const requested = readOptions(req.body);
    const godImage = mode === "ai" ? contentImage(req.body.godImage) : null;
    const wantsProductImage = requested.showRightBox && requested.rightBoxMode === "image";
    const productImage = wantsProductImage ? contentImage(req.body.productImage) : null;
    if (mode === "ai" && !godImage) return res.status(400).json({ message: "Upload the god image first." });
    if (productImage === undefined) return res.status(400).json({ message: "Invalid product image." });
    const content = {
      businessName: text(req.body.businessName, 200),
      productList: text(req.body.productList, 2000),
      address: text(req.body.address, 500),
      godImage: godImage || null,
      productImage: productImage || null,
      rightBoxText: requested.rightBoxMode === "text" ? text(req.body.rightBoxText, 1000) : "",
    };
    // A section left empty is treated as switched off: its whole box / strip
    // is removed (Normal) or its space becomes artwork (AI). In AI mode a
    // right image box without a photo is painted by the AI.
    const options = effectiveOptions(selected, requested, content, {
      aiPaintsProduct: mode === "ai" && aiPaintsProductImage(requested, content),
    });

    const plan = planDesigns(selected, mode, req.body.prompt);
    // The admin test makes exactly one design; a regular Generate never does.
    const picks = adminTest ? plan.picks.slice(0, 1) : plan.picks;
    const recipes = adminTest ? plan.recipes.slice(0, 1) : plan.recipes;

    // AI mode: spending limits + explicit cost confirmation before anything
    // is sent. Normal Mode is free and skips this.
    let confirmedEstimateInr = null;
    if (mode === "ai") {
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const recent = await AiCalendarJob.countDocuments({ userId: req.user.userId, mode: "ai", createdAt: { $gte: since } });
      if (recent >= config.AI_JOBS_PER_USER_PER_HOUR) {
        return res.status(429).json({ message: "Generation limit reached. Please try again later." });
      }
      const estimate = await estimateGenerate(picks.length);
      const limits = await checkLimits({ estimateInr: estimate.totalInr, userId: req.user.userId, aiEnabled: true });
      if (!limits.allowed) {
        return res.status(409).json({ message: limits.reasons[0], reasons: limits.reasons, estimate });
      }
      const confirmed = Number(req.body.confirmedEstimateInr);
      if (req.body.confirmCost !== true || !Number.isFinite(confirmed) || confirmed + 0.01 < estimate.totalInr) {
        return res.status(409).json({
          message: `Confirm the estimated cost (₹${estimate.totalInr}) before generating.`,
          needsConfirmation: true,
          estimate,
        });
      }
      confirmedEstimateInr = confirmed;
    }

    let designId = null;
    if (req.body.designId) {
      const design = await CalendarDesign.findOne({ _id: req.body.designId, createdBy: req.user.userId }).catch(() => null);
      designId = design?._id || null;
    }

    const normal = mode === "normal";
    const job = await AiCalendarJob.create({
      userId: req.user.userId,
      selectedVariantId: selected._id,
      designId,
      mode,
      adminTest: Boolean(adminTest),
      options,
      enhanceProduct: false, // product photos are never sent to AI separately
      confirmedEstimateInr,
      cutType: selected.cutType,
      sizeCode: selected.sizeCode,
      prompt: normal ? "" : text(req.body.prompt, 1000),
      content,
      variations: picks.map((p, index) => ({
        index,
        variantId: p.variant._id,
        recipe: recipes[index],
        // Normal Mode designs are drawn by the app from the recipe: ready at once.
        ...(normal && { status: "DONE" }),
      })),
      ...(normal && { status: "DONE", progress: "Done", finishedAt: new Date() }),
    });
    if (!normal) enqueueJob(job._id);
    res.status(202).json({ message: normal ? "Designs ready" : "Generation started", job: await serializeJob(job, req) });
  } catch (error) {
    console.error("Create calendar job error:", error);
    res.status(500).json({ message: "Failed to start the generation" });
  }
};

// GET /api/ai-calendars/plan?variantId=&mode=&prompt=  — what Generate will
// make in each mode (shown in Customise before anything is generated).
const getLayoutPlan = async (req, res) => {
  try {
    const selected = await LayoutVariant.findById(req.query.variantId)
      .populate("familyId", "code")
      .catch(() => null);
    // Admins may open any layout that is not archived (drafts included) to
    // check it; Generate itself still needs a usable layout.
    const canView = canUseLayout(req, selected) || (hasFullAccess(req) && selected && selected.status !== "ARCHIVED");
    if (!canView) {
      return res.status(404).json({ message: "Choose an approved production layout." });
    }
    const canGenerate = canUseLayout(req, selected);
    const aiEnabled = getImageAi().isConfigured();
    const normal = planDesigns(selected, "normal");
    const ai = planDesigns(selected, "ai", req.query.prompt);
    // The cost an AI Generate would have (shown; nothing is charged here).
    const estimate = await estimateGenerate(ai.picks.length);
    const limits = aiEnabled
      ? await checkLimits({ estimateInr: estimate.totalInr, userId: req.user.userId, aiEnabled })
      : null;
    res.status(200).json({
      layoutCode: selected.familyId?.code || null,
      canGenerate,
      generateBlockedReason: canGenerate
        ? null
        : `This layout is ${String(selected.status).toLowerCase()} — it must pass validation and be validated / activated before designs can be made from it.`,
      aiEnabled,
      normal: { designCount: normal.picks.length, recipes: normal.recipes.map((r) => r.name) },
      adminTest: hasFullAccess(req) ? { designCount: 1, estimate: await estimateGenerate(1) } : null,
      ai: {
        designCount: ai.picks.length,
        recipes: ai.recipes.map((r) => r.name),
        estimate,
        limits: limits && { allowed: limits.allowed, reasons: limits.reasons, budget: limits.summary.budget },
        note: aiEnabled ? null : "AI is switched off on this server: AI Mode cannot generate. Normal Mode works (free).",
      },
    });
  } catch (error) {
    console.error("Layout plan error:", error);
    res.status(500).json({ message: "Failed to check the layouts" });
  }
};

// GET /api/ai-calendars?limit=  — the designer's generations, newest first
// (failed ones are left out: they have nothing to show).
const listJobs = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const jobs = await AiCalendarJob.find({ userId: req.user.userId, status: { $ne: "FAILED" } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate({ path: "variations.variantId", select: "familyId", populate: { path: "familyId", select: "code" } })
      .lean();
    res.status(200).json({
      jobs: jobs.map((j) => ({
        _id: j._id,
        createdAt: j.createdAt,
        status: j.status,
        mode: j.mode,
        cutType: j.cutType,
        sizeCode: j.sizeCode,
        businessName: j.content.businessName,
        designId: j.designId,
        selectedIndex: j.selectedIndex,
        variations: j.variations.map((v) => ({
          index: v.index,
          status: v.status,
          layoutCode: v.variantId?.familyId?.code || null,
          previewUrl: toPublicUrl(v.previewImage),
          // Preview designs show the customer's own god image until their
          // finished picture is saved.
          godImageUrl: toPublicUrl(v.godImage || j.content.godImage),
          recipeName: v.recipe?.name || null,
          pdfReady: Boolean(v.exportPdf),
        })),
      })),
    });
  } catch (error) {
    console.error("List AI calendar jobs error:", error);
    res.status(500).json({ message: "Failed to fetch your generated designs" });
  }
};

// PUT /api/ai-calendars/:id/variations/:index/preview  multipart: preview (JPEG/PNG)
// Saves the finished design picture shown in the gallery (replaces the old one).
const savePreview = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Preview image is required" });
    const { job, index, variation } = await loadVariation(req, res);
    if (!job) return;
    const previous = variation.previewImage;
    const stored = await saveImage(job._id, `v${index}-preview`, { buffer: req.file.buffer, mimeType: req.file.mimetype });
    job.variations[index].previewImage = stored;
    await job.save();
    const old = previous && previous !== stored ? resolveUpload(previous) : null;
    if (old) fs.promises.unlink(old).catch(() => {});
    res.status(200).json({ previewUrl: toPublicUrl(stored) });
  } catch (error) {
    console.error("Save preview error:", error);
    res.status(500).json({ message: "Failed to save the preview" });
  }
};

// GET /api/ai-calendars/:id
const getJob = async (req, res) => {
  try {
    const job = await loadOwnJob(req, res);
    if (!job) return;
    res.status(200).json({ job: await serializeJob(job, req) });
  } catch (error) {
    console.error("Get AI calendar job error:", error);
    res.status(500).json({ message: "Failed to fetch the generation" });
  }
};

// POST /api/ai-calendars/:id/variations/:index/regenerate
const regenerateVariation = async (req, res) => {
  try {
    const { job, index } = await loadVariation(req, res, { requireDone: false });
    if (!job) return;
    if (job.mode === "preview") {
      return res.status(409).json({ message: "Preview designs are made by the app and don't need regenerating." });
    }
    if (["QUEUED", "RUNNING"].includes(job.status) || job.variations[index].status === "RUNNING") {
      return res.status(409).json({ message: "Wait until the current generation has finished." });
    }
    // A regeneration is one paid request: same limits and confirmation.
    const estimate = await estimateGenerate(1);
    const limits = await checkLimits({
      estimateInr: estimate.totalInr,
      userId: req.user.userId,
      aiEnabled: getImageAi().isConfigured(),
    });
    if (!limits.allowed) {
      return res.status(409).json({ message: limits.reasons[0], reasons: limits.reasons, estimate });
    }
    const confirmed = Number(req.body?.confirmedEstimateInr);
    if (req.body?.confirmCost !== true || !Number.isFinite(confirmed) || confirmed + 0.01 < estimate.totalInr) {
      return res.status(409).json({
        message: `Confirm the estimated cost (₹${estimate.totalInr}) before regenerating.`,
        needsConfirmation: true,
        estimate,
      });
    }
    job.variations[index].status = "PENDING";
    job.variations[index].error = null;
    job.variations[index].exportPdf = null;
    job.variations[index].exportCutlinePdf = null;
    job.variations[index].previewImage = null;
    job.status = "RUNNING";
    job.progress = `Regenerating design ${index + 1}`;
    job.error = null;
    await job.save();
    enqueueRegeneration(job._id, index);
    res.status(202).json({ job: await serializeJob(job, req) });
  } catch (error) {
    console.error("Regenerate error:", error);
    res.status(500).json({ message: "Failed to regenerate this design" });
  }
};

// POST /api/ai-calendars/:id/variations/:index/print-check
// body: { textFits: { regionId: { fittedPt, layoutPt } }, productChoice }
const printCheck = async (req, res) => {
  try {
    const { job, variation, variant } = await loadVariation(req, res);
    if (!job) return;
    const settings = await exportSettings(variant);
    const result = runPrintCheck({
      variant: await freshlyValidated(variant),
      format: await formatOf(variant),
      settings,
      images: measureImages(job, variation, variant, req.body?.productChoice),
      content: job.content,
      options: jobOptions(job, variant),
      textFits: req.body?.textFits && typeof req.body.textFits === "object" ? req.body.textFits : {},
    });
    res.status(200).json(result);
  } catch (error) {
    console.error("Print check error:", error);
    res.status(500).json({ message: "Failed to run the print check" });
  }
};

// POST /api/ai-calendars/:id/variations/:index/prepare-export
// Print settings for this layout + print-resolution copies of the AI images
// (through the configured upscaler, when one is configured).
const prepareExport = async (req, res) => {
  try {
    const { job, index, variation, variant } = await loadVariation(req, res);
    if (!job) return;
    const settings = await exportSettings(variant);
    const upscaler = getUpscaler();
    const warnings = [];
    const images = {};

    const prepare = async (field, box, label) => {
      const stored = variation[field];
      if (!stored || !box) return;
      let printPath = variation[`${field}Print`] || stored;
      let size = imageSize(resolveUpload(printPath));
      const scale = requiredScale(effectiveDpi(size, box), settings.dpi);
      if (scale && scale > 1.05 && printPath === stored && upscaler.isConfigured()) {
        const source = await readImage(stored);
        const up = await upscaler.upscale({
          ...source,
          targetWidthPx: Math.round((box.width / MM_PER_IN) * settings.dpi),
          targetHeightPx: Math.round((box.height / MM_PER_IN) * settings.dpi),
        });
        printPath = await saveImage(job._id, `v${index}-${field}-print`, up);
        job.variations[index][`${field}Print`] = printPath;
        size = imageSize(resolveUpload(printPath));
      }
      const dpi = effectiveDpi(size, box);
      if (dpi && dpi < settings.dpi * 0.95) {
        warnings.push(
          `${label}: about ${dpi} DPI at print size (target ${settings.dpi})` +
            (upscaler.isConfigured() ? "." : " — no upscaler is configured yet."),
        );
      }
      images[field] = { url: toPublicUrl(printPath), effectiveDpi: dpi };
    };
    await prepare("godImage", variation.godImageBox || regionOf(variant, "GOD_AREA")?.box, "God image");
    // A complete AI artwork covers the box it was composed for (the trim),
    // not the layout's background region.
    await prepare("background", variation.backgroundBox || regionOf(variant, "BACKGROUND_AREA")?.box, "AI artwork");
    // Normal Mode on a reusable layout saved from an AI design: its artwork
    // prints as stored — report its real resolution (never upscaled here).
    const saved = job.mode === "normal" ? variant.design : null;
    for (const [field, box, label] of [
      ["artwork", saved?.artworkBox, "Saved AI artwork"],
      ["godImage", saved?.godImageBox, "Saved AI God image"],
    ]) {
      if (!saved?.[field] || !box) continue;
      const dpi = effectiveDpi(imageSize(resolveUpload(saved[field])), box);
      if (dpi && dpi < settings.dpi * 0.95) {
        warnings.push(`${label}: about ${dpi} DPI at print size (target ${settings.dpi}). It may print soft.`);
      }
      images[`saved-${field}`] = { url: toPublicUrl(saved[field]), effectiveDpi: dpi };
    }
    await job.save();

    res.status(200).json({
      dpi: settings.dpi,
      dpiConfirmed: settings.dpiConfirmed,
      pending: settings.pending,
      warnings,
      images,
    });
  } catch (error) {
    console.error("Prepare export error:", error);
    res.status(500).json({ message: "Failed to prepare the export" });
  }
};

// GET /api/ai-calendars/:id/variations/:index/source.pdf
// The layout's production PDF, only for the owner of this generation, so the
// browser can render the locked artwork at print resolution.
const sourcePdf = async (req, res) => {
  try {
    const { variant } = await loadVariation(req, res);
    if (!variant) return;
    const abs = resolveUpload(variant.assets?.productionFile);
    if (!abs || !fs.existsSync(abs)) return res.status(404).json({ message: "Production file missing" });
    res.setHeader("Cache-Control", "private, no-store");
    res.sendFile(abs);
  } catch (error) {
    console.error("Source PDF error:", error);
    res.status(500).json({ message: "Failed to read the production file" });
  }
};

const fileSlug = (value) => String(value || "calendar").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "calendar";

// POST /api/ai-calendars/:id/variations/:index/export
// multipart: artwork (composed design at print resolution), productChoice
const exportPdf = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Composed artwork is required" });
    const { job, index, variation, variant } = await loadVariation(req, res);
    if (!job) return;
    const size = imageSize(req.file.buffer);
    if (!size) return res.status(400).json({ message: "Artwork must be a PNG or JPEG image" });

    const settings = await exportSettings(variant);
    const format = await formatOf(variant);
    const check = runPrintCheck({
      variant: await freshlyValidated(variant),
      format,
      settings,
      images: measureImages(job, variation, variant, req.body?.productChoice),
      content: job.content,
      options: jobOptions(job, variant),
    });
    if (check.status === "FAIL") {
      return res.status(400).json({
        message: "The print check failed. Fix the failed items before exporting.",
        checks: check.checks.filter((c) => c.status === "FAIL"),
      });
    }

    const meta = {
      title: `${job.content.businessName || "Calendar"} · ${variant.familyId?.code || ""} ${variant.sizeCode}`,
      familyCode: variant.familyId?.code,
      cakeLabel: format?.cake?.label,
    };
    const [printBytes, cutlineBytes] = await Promise.all([
      buildPrintPdf({ variant, artwork: { buffer: req.file.buffer, mimeType: req.file.mimetype }, settings, meta }),
      buildCutlinePdf({ variant, settings, meta }),
    ]);

    const dir = path.join(UPLOADS_DIR, JOBS_FOLDER, String(job._id));
    await fs.promises.mkdir(dir, { recursive: true });
    const base = `${fileSlug(job.content.businessName)}-${variant.cutType}-${variant.sizeCode}-${fileSlug(variant.familyId?.code)}-${Date.now()}`;
    await fs.promises.writeFile(path.join(dir, `${base}-PRINT.pdf`), printBytes);
    await fs.promises.writeFile(path.join(dir, `${base}-LASER-CUTLINE.pdf`), cutlineBytes);
    const printStored = uploadPath(`${JOBS_FOLDER}/${job._id}`, `${base}-PRINT.pdf`);
    const cutlineStored = uploadPath(`${JOBS_FOLDER}/${job._id}`, `${base}-LASER-CUTLINE.pdf`);

    job.variations[index].exportPdf = printStored;
    job.variations[index].exportCutlinePdf = cutlineStored;
    job.variations[index].exportedAt = new Date();
    job.variations[index].productChoice = req.body?.productChoice === "enhanced" ? "enhanced" : "original";
    job.selectedIndex = index;
    await job.save();

    res.status(201).json({
      message: "PDF exported",
      printUrl: toPublicUrl(printStored),
      cutlineUrl: toPublicUrl(cutlineStored),
      artworkDpi: Math.round(size.width / (variant.trim.widthMm / MM_PER_IN)),
      sizeIn: {
        width: Math.round((variant.trim.widthMm / MM_PER_IN) * 100) / 100,
        height: Math.round((variant.trim.heightMm / MM_PER_IN) * 100) / 100,
      },
      pending: settings.pending,
    });
  } catch (error) {
    console.error("Export PDF error:", error);
    res.status(500).json({ message: "Failed to build the PDF. Your designs are kept — please try again." });
  }
};

// GET /api/ai-calendars/:id/variations/:index/download/:kind  (print | cutline)
// Sends the stored PDF as a file download with a readable name.
const downloadPdf = async (req, res) => {
  try {
    const { variation } = await loadVariation(req, res);
    if (!variation) return;
    const stored = req.params.kind === "cutline" ? variation.exportCutlinePdf : variation.exportPdf;
    const abs = resolveUpload(stored);
    if (!abs || !fs.existsSync(abs)) return res.status(404).json({ message: "Export the PDF first." });
    res.download(abs, path.basename(abs).replace(/-\d{13}(?=-(PRINT|LASER-CUTLINE)\.pdf$)/, ""));
  } catch (error) {
    console.error("Download PDF error:", error);
    res.status(500).json({ message: "Failed to download the PDF" });
  }
};

// POST /api/ai-calendars/:id/variations/:index/save-layout   body: { name }
// Saves the chosen design as a NEW reusable layout (new family + DRAFT
// variant). The source layout is never changed. Production geometry —
// trim, cutline, cake / calendar regions, content regions, mapping, the
// production file and any confirmed size correction — is copied unchanged;
// the design's look is stored in `design`:
//   Normal Mode → box style, fonts, sections (the layout artwork is reused);
//   AI Mode     → the chosen AI picture (complete artwork, or the deity in
//                 the god opening) with the box it was composed for.
// The new layout is validated at once; it is only used in production after
// an admin activates it.
const SAVED_NAME_MAX = 80;
const saveAsLayout = async (req, res) => {
  try {
    const { job, index, variation, variant } = await loadVariation(req, res);
    if (!job) return;
    const name = String(req.body?.name || "").trim().slice(0, SAVED_NAME_MAX);
    if (!name) return res.status(400).json({ message: "Enter a name for the layout." });
    if (job.mode === "preview") {
      return res.status(409).json({ message: "Older previews cannot be saved as layouts. Generate again in Normal or AI Mode." });
    }
    const ai = job.mode === "ai";
    const fullArtwork = ai && variation.composition === "FULL_ARTWORK" && variation.background;
    const aiGod = ai && !fullArtwork && variation.godImage;
    if (ai && !fullArtwork && !aiGod) return res.status(409).json({ message: "This AI design has no picture to save." });
    const pixels = (stored) => {
      const size = stored ? imageSize(resolveUpload(stored)) : null;
      return size ? { widthPx: size.width, heightPx: size.height } : null;
    };

    // The look of the chosen design. Saving again from a saved layout keeps
    // its AI picture (Normal Mode only changes the box style).
    const base = variant.design || {};
    const design = {
      ...base,
      mode: ai ? "ai" : base.mode || "normal",
      name,
      boxStyle: variation.recipe?.boxStyle || "layout",
      recipe: variation.recipe || null,
      options: job.options?.toObject ? job.options.toObject() : job.options,
      ...(fullArtwork && {
        artwork: variation.background,
        artworkBox: variation.backgroundBox,
        artworkPx: pixels(variation.background),
        godImage: null,
        godImageBox: null,
        godImagePx: null,
      }),
      ...(aiGod && {
        artwork: null,
        artworkBox: null,
        artworkPx: null,
        godImage: variation.godImage,
        godImageBox: variation.godImageBox,
        godImagePx: pixels(variation.godImage),
        filledAreas: variation.filledAreas || [],
      }),
      sourceJobId: job._id,
      variationIndex: index,
      savedAt: new Date(),
    };

    const source = variant.toObject();
    const sourceCode = source.familyId?.code || "LAYOUT";
    const family = await LayoutFamily.create({
      code: `${sourceCode}-S${Date.now().toString(36).toUpperCase()}`,
      name,
      cutType: source.cutType,
      category: "Saved design",
      status: "CANDIDATE",
      notes: `Saved from ${sourceCode} v${source.version} (${ai ? "AI" : "Normal"} Mode design ${index + 1}).`,
      createdBy: req.user.userId,
    });
    const saved = new LayoutVariant({
      familyId: family._id,
      formatId: source.formatId,
      cutType: source.cutType,
      sizeCode: source.sizeCode,
      status: "DRAFT",
      version: 1,
      trim: source.trim,
      cutline: source.cutline,
      assets: {
        ...source.assets,
        artworkCandidate: null,
        // The card picture: the chosen design as shown on the Designs page.
        preview: variation.previewImage || source.assets?.preview || null,
        // The copied layers are current for this copy (version 1).
        forVersion: 1,
      },
      importSummary: source.importSummary,
      mapping: source.mapping,
      regions: source.regions,
      productionProfileId: source.productionProfileId,
      artworkRasters: source.artworkRasters,
      geometryCorrection: source.geometryCorrection,
      laserCheck: source.laserCheck,
      design,
      sourceVariantId: source._id,
      sourceVersion: source.version,
      createdBy: req.user.userId,
    });
    const validation = await runLayoutValidation(saved);
    saved.validation = { status: validation.status, checkedAt: new Date(), results: validation.results };
    await saved.save();
    res.status(201).json({
      message: "Saved as a reusable layout (draft — an admin validates and activates it for production).",
      layout: { _id: saved._id, code: family.code, name, status: saved.status, validation: saved.validation.status },
    });
  } catch (error) {
    console.error("Save as layout error:", error);
    res.status(500).json({ message: "Failed to save the layout" });
  }
};

module.exports = {
  saveAsLayout,
  createAdminTestImage,
  createJob,
  listJobs,
  savePreview,
  getLayoutPlan,
  getJob,
  regenerateVariation,
  printCheck,
  prepareExport,
  sourcePdf,
  exportPdf,
  downloadPdf,
};
