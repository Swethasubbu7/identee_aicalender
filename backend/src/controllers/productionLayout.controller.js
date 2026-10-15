// Production layout workflow (used from the Layouts page):
//   import PDF → pick page + map objects to roles → validate → activate.
const fs = require("fs");
const path = require("path");

const LayoutVariant = require("../models/LayoutVariant");
const LayoutFamily = require("../models/LayoutFamily");
const CalendarFormat = require("../models/CalendarFormat");
const CalendarDesign = require("../models/CalendarDesign");
const { CUT_TYPES } = require("../constants/calendar");
const { inToMm } = require("../lib/units");
const { uploadPath, toPublicUrl } = require("../lib/assetUrl");
const { imageSize } = require("../lib/imageSize");
const sharp = require("sharp");
const { extractPdfLayout, extractRasterAt, PdfReadError } = require("../services/layout/pdfImporter");
const {
  analysePage,
  analyseLaserPage,
  compareDesignLaser,
  laserCheckFor,
  importVerdict,
  pairLaserPage,
} = require("../services/layout/pdfAnalysis");
const { buildVariantGeometry, MappingError } = require("../services/layout/mappingBuilder");
const { proposeCorrection, applyCorrection } = require("../services/layout/geometryCorrection");
const { runLayoutValidation } = require("../services/layout/runLayoutValidation");
const { suggestMapping } = require("../services/layout/mappingSuggestions");
const { getUpscaler } = require("../services/ai/upscaler");
const { getImageAi } = require("../services/ai/imageAi");
const { estimateImages, checkLimits } = require("../services/ai/spendGuard");
const { recordedRequest } = require("../services/ai/usageLedger");
const { isCdr, convertCdrToPdf } = require("../services/layout/cdrConverter");

// The admin-confirmed size correction, if any (see geometryCorrection.js).
const activeCorrection = (variant) => (variant.geometryCorrection?.active ? variant.geometryCorrection : null);

// Extracted object data is private (not under the public /uploads route).
const IMPORT_DIR = path.join(__dirname, "..", "storage", "imports");
fs.mkdirSync(IMPORT_DIR, { recursive: true });

const removeQuietly = (filePath) => {
  if (filePath) fs.promises.unlink(filePath).catch(() => {});
};

const readJson = async (file) =>
  file ? JSON.parse(await fs.promises.readFile(path.join(IMPORT_DIR, path.basename(file)), "utf8")) : null;
const readImportData = (variant) => readJson(variant.assets?.importDataFile);
const readLaserData = (variant) => readJson(variant.assets?.laserImportDataFile).catch(() => null);

// Extracts a PDF (a CorelDRAW file is converted to PDF first); a file that
// cannot be opened becomes a clear 400 message.
// @returns { data, pdfPath, sourcePath } — pdfPath is the file to use from
//   now on (the converted PDF for CDR uploads); sourcePath the original CDR.
const extractOrExplain = async (filePath, originalName = "") => {
  try {
    let pdfPath = filePath;
    let sourcePath = null;
    let buf = await fs.promises.readFile(filePath);
    if (isCdr(buf, originalName || filePath)) {
      sourcePath = filePath;
      pdfPath = await convertCdrToPdf(filePath);
      buf = await fs.promises.readFile(pdfPath);
    }
    return { data: await extractPdfLayout(buf), pdfPath, sourcePath };
  } catch (err) {
    if (err instanceof PdfReadError) return { error: err.message, code: err.code };
    console.error("PDF import error:", err);
    return { error: "The PDF could not be read.", code: "PDF_UNREADABLE" };
  }
};

// Per page: what was found and what needs mapping; plus the laser PDF and how
// it compares with the design (on the suggested page).
const summariseImport = (extracted, format, laserData) => {
  const pagesSummary = extracted.pages.map((p) => {
    const analysis = analysePage(p, format);
    return {
      index: p.index,
      widthMm: p.widthMm,
      heightMm: p.heightMm,
      rotation: p.rotation || 0,
      objectCount: p.objectCount,
      truncated: p.truncated,
      hiddenFills: p.hiddenFills || 0,
      cutlineCandidates: analysis.cutline.candidates,
      // Same mark drawn on the artwork and with the cutline, if any.
      registration: analysis.registration,
      analysis,
      // A starting point for the mapping screen (reviewed, never auto-saved).
      suggestedMapping: suggestMapping(p, analysis, format.cutType),
    };
  });
  const suggested =
    pagesSummary.find((p) => p.cutlineCandidates.length > 0) ||
    pagesSummary.find((p) => p.analysis.content !== "empty") ||
    pagesSummary[0];
  let laser = null;
  if (laserData) {
    // Laser files often hold one page per size (not always in the same order).
    const laserPage = pairLaserPage(laserData, suggested.index, format);
    const laserAnalysis = analyseLaserPage(laserPage, format);
    const comparison = compareDesignLaser(extracted.pages[suggested.index], suggested.analysis, laserAnalysis);
    laser = { pageCount: laserData.pageCount, pageIndex: laserPage.index, analysis: laserAnalysis, comparison };
  }
  const verdict = importVerdict(suggested.analysis, laser?.analysis, laser?.comparison);
  return { pagesSummary, suggestedPageIndex: suggested.index, laser, verdict };
};

const laserPageFor = (variant, laserData) => {
  if (!laserData) return null;
  const index = variant.importSummary?.laser?.pageIndex ?? variant.mapping?.pageIndex ?? 0;
  return laserData.pages[index] || laserData.pages[0];
};

const laserAnalysisFor = async (variant, laserPage) => {
  if (!laserPage) return null;
  const format = await CalendarFormat.findById(variant.formatId).lean();
  return format ? analyseLaserPage(laserPage, format) : null;
};

const resetApproval = (variant) => {
  variant.status = "DRAFT";
  variant.validation = { status: "NOT_RUN", results: [] };
  variant.approvedBy = undefined;
  variant.approvedAt = undefined;
};

// POST /api/layout-variants/import multipart: productionPdf
//   (+ optional laserPdf) + fields. Any readable PDF is imported as a DRAFT:
//   page size, structure, layers, fonts or flattened artwork never reject it;
//   what could not be detected is listed for manual mapping.
const importProductionPdf = async (req, res) => {
  const designFile = req.file || req.files?.productionPdf?.[0] || null;
  const laserUpload = req.files?.laserPdf?.[0] || null;
  const pdfPath = designFile?.path;
  try {
    req.file = designFile;
    const familyCode = (req.body.familyCode || "").trim();
    const familyName = (req.body.familyName || "").trim();
    const { cutType, sizeCode } = req.body;
    const replace = req.body.replace === "true" || req.body.replace === true;

    if (!req.file) {
      removeQuietly(laserUpload?.path);
      return res.status(400).json({ message: "Upload the production PDF." });
    }
    if (!familyCode || !CUT_TYPES.includes(cutType) || !sizeCode) {
      removeQuietly(pdfPath);
      removeQuietly(laserUpload?.path);
      return res
        .status(400)
        .json({ message: "Design code, cut type and calendar size are required." });
    }

    const format = await CalendarFormat.findOne({ cutType, sizeCode, active: true });
    if (!format) {
      removeQuietly(pdfPath);
      return res.status(400).json({ message: `${sizeCode} is not offered for ${cutType}.` });
    }

    let family = await LayoutFamily.findOne({ code: familyCode });
    if (family && family.cutType !== cutType) {
      removeQuietly(pdfPath);
      return res.status(400).json({
        message: `Design ${familyCode} already exists as ${family.cutType}.`,
      });
    }

    let variant = family
      ? await LayoutVariant.findOne({ familyId: family._id, formatId: format._id })
      : null;
    if (variant && !replace) {
      removeQuietly(pdfPath);
      return res.status(409).json({
        message: `Design ${familyCode} already has a ${sizeCode} production layout.`,
        variantId: variant._id,
      });
    }
    if (variant?.status === "ACTIVE") {
      removeQuietly(pdfPath);
      return res
        .status(400)
        .json({ message: "Deactivate the layout before replacing its production PDF." });
    }

    const design = await extractOrExplain(pdfPath, req.file.originalname);
    if (design.error) {
      removeQuietly(pdfPath);
      removeQuietly(laserUpload?.path);
      return res.status(400).json({ message: `Production PDF: ${design.error}`, code: design.code });
    }
    const extracted = design.data;
    let laserData = null;
    let laserRead_ = null;
    if (laserUpload) {
      const laserRead = await extractOrExplain(laserUpload.path, laserUpload.originalname);
      laserRead_ = laserRead;
      if (laserRead.error) {
        removeQuietly(pdfPath);
        removeQuietly(laserUpload.path);
        return res.status(400).json({ message: `Laser PDF: ${laserRead.error}`, code: laserRead.code });
      }
      laserData = laserRead.data;
    }

    const expectW = inToMm(format.widthIn);
    const expectH = inToMm(format.heightIn);
    const { pagesSummary, suggestedPageIndex, laser, verdict } = summariseImport(extracted, format, laserData);

    // A CorelDRAW upload continues as its converted PDF (the CDR is kept).
    const designPdf = design.pdfPath;
    const laserPdfPath = laserUpload ? laserRead_.pdfPath : null;
    const importFile = `${path.basename(designPdf)}.objects.json`;
    await fs.promises.writeFile(path.join(IMPORT_DIR, importFile), JSON.stringify(extracted));
    const laserImportFile = laserUpload ? `${path.basename(laserPdfPath)}.objects.json` : null;
    if (laserImportFile) await fs.promises.writeFile(path.join(IMPORT_DIR, laserImportFile), JSON.stringify(laserData));

    if (!family) {
      family = await LayoutFamily.create({
        code: familyCode,
        name: familyName || familyCode,
        cutType,
        status: "CANDIDATE",
        createdBy: req.user.userId,
      });
    } else if (familyName && familyName !== family.name) {
      family.name = familyName;
      await family.save();
    }

    const previous = variant
      ? {
          pdf: variant.assets?.productionFile,
          data: variant.assets?.importDataFile,
          laser: laserUpload ? variant.assets?.laserFile : null,
          laserData: laserUpload ? variant.assets?.laserImportDataFile : null,
        }
      : null;
    if (!variant) {
      variant = new LayoutVariant({
        familyId: family._id,
        formatId: format._id,
        cutType,
        sizeCode,
        createdBy: req.user.userId,
      });
    } else {
      variant.version += 1;
    }
    variant.set({
      trim: { widthMm: null, heightMm: null },
      cutline: { path: null, sourceLayer: null },
      regions: [],
      mapping: null,
      "assets.productionFile": uploadPath("production", path.basename(designPdf)),
      "assets.sourceFile": design.sourcePath ? uploadPath("production", path.basename(design.sourcePath)) : null,
      "assets.importDataFile": importFile,
      ...(laserUpload && {
        "assets.laserFile": uploadPath("production", path.basename(laserPdfPath)),
        "assets.laserImportDataFile": laserImportFile,
      }),
      laserCheck: null,
      importSummary: {
        pageCount: extracted.pageCount,
        layers: extracted.layers,
        pages: pagesSummary,
        suggestedPageIndex,
        expectedTrimMm: { width: expectW, height: expectH },
        laser,
        verdict,
      },
    });
    resetApproval(variant);
    await variant.save();

    if (previous) {
      // The replaced production PDF and its extracted data are no longer used.
      if (previous.pdf) removeQuietly(path.join(__dirname, "..", previous.pdf));
      if (previous.data) removeQuietly(path.join(IMPORT_DIR, path.basename(previous.data)));
      if (previous.laser) removeQuietly(path.join(__dirname, "..", previous.laser));
      if (previous.laserData) removeQuietly(path.join(IMPORT_DIR, path.basename(previous.laserData)));
    }

    res.status(201).json({
      message: "Production PDF imported",
      variantId: variant._id,
      familyId: family._id,
      importSummary: variant.importSummary,
    });
  } catch (error) {
    console.error("Import production PDF error:", error);
    removeQuietly(pdfPath);
    removeQuietly(laserUpload?.path);
    res.status(500).json({ message: "Failed to import production PDF" });
  }
};

// GET /api/layout-variants/:id/objects?page=0
const getImportedObjects = async (req, res) => {
  try {
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });
    const data = await readImportData(variant);
    if (!data) return res.status(404).json({ message: "No production PDF imported yet." });
    const pageIndex = Number(req.query.page) || 0;
    const page = data.pages[pageIndex];
    if (!page) return res.status(404).json({ message: "Page not found" });
    const laserData = await readLaserData(variant);
    res.status(200).json({
      message: "Objects fetched",
      productionFile: toPublicUrl(variant.assets.productionFile),
      layers: data.layers,
      page,
      // The laser PDF's page (cutline, cake) for placing / checking it.
      laserPage: laserPageFor(variant, laserData),
    });
  } catch (error) {
    console.error("Get imported objects error:", error);
    res.status(500).json({ message: "Failed to load imported objects" });
  }
};

// PUT /api/layout-variants/:id/mapping
// Body: { pageIndex, cutlineObjectId, regions: [{ role, objectIds, binding?, textStyle?, fit? }] }
const saveMapping = async (req, res) => {
  try {
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });
    if (variant.status === "ARCHIVED") {
      return res.status(400).json({ message: "Archived layouts cannot be edited" });
    }
    const data = await readImportData(variant);
    if (!data) return res.status(400).json({ message: "Import a production PDF first." });

    const pageIndex = Number(req.body.pageIndex) || 0;
    const laserPage = laserPageFor(variant, await readLaserData(variant));
    // Geometry as drawn in the file; an admin-confirmed size correction is
    // re-applied on top (the laser PDF is compared with the file as drawn).
    const sourceGeometry = buildVariantGeometry(data.pages[pageIndex], req.body, laserPage);
    const geometry = applyCorrection(sourceGeometry, activeCorrection(variant));

    variant.trim = geometry.trim;
    variant.cutline = geometry.cutline;
    variant.regions = geometry.regions;
    variant.artworkRasters = geometry.artworkRasters;
    variant.laserCheck = laserCheckFor(sourceGeometry, await laserAnalysisFor(variant, laserPage));
    if (!variant.assets.frame) {
      // Until a separate frame PNG is uploaded, judge frame resolution by the
      // frame image embedded in the production PDF.
      variant.assets.frameWidthPx = geometry.frameImagePx?.width ?? null;
      variant.assets.frameHeightPx = geometry.frameImagePx?.height ?? null;
    }
    variant.mapping = {
      pageIndex,
      cutlineSource: geometry.cutlineSource,
      cutlineObjectId: req.body.cutlineObjectId || null,
      cutlineObjectIds: req.body.cutlineObjectIds || null,
      laserCutlineObjectIds: req.body.laserCutlineObjectIds || (req.body.laserCutlineObjectId ? [req.body.laserCutlineObjectId] : null),
      laserAlignment: geometry.cutlineSource === "laser" ? { ...req.body.laserAlignment, ...geometry.cutlineAlignment } : null,
      cutlineAlignment: geometry.cutlineAlignment,
      artworkObjectIds: req.body.artworkObjectIds || null,
      registration: req.body.registration || null,
      registrationOffsetMm: geometry.registrationOffsetMm,
      trimOriginMm: geometry.trimOriginMm,
      // Objects that must never print (guide labels such as "4X5 INCHES").
      excludedObjectIds: [...new Set(req.body.excludedObjectIds || [])],
      excludedBoxes: geometry.excludedBoxes,
      regions: (req.body.regions || []).map(({ role, objectIds, binding, textStyle, fit }) => ({
        role,
        objectIds,
        binding,
        textStyle,
        fit,
      })),
    };
    variant.version += 1;
    resetApproval(variant);
    await variant.save();
    res.status(200).json({ message: "Mapping saved", variant });
  } catch (error) {
    if (error instanceof MappingError) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Save mapping error:", error);
    res.status(500).json({ message: "Failed to save mapping" });
  }
};

// POST /api/layout-variants/:id/assets multipart: frame (PNG), preview
const uploadVariantAssets = async (req, res) => {
  const files = [...(req.files?.frame || []), ...(req.files?.preview || [])];
  try {
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) {
      files.forEach((f) => removeQuietly(f.path));
      return res.status(404).json({ message: "Layout variant not found" });
    }
    const frame = req.files?.frame?.[0];
    const preview = req.files?.preview?.[0];
    const plate = req.files?.plate?.[0];
    const overlay = req.files?.overlay?.[0];
    const plateBare = req.files?.plateBare?.[0];
    const overlayBare = req.files?.overlayBare?.[0];
    const plateGod = req.files?.plateGod?.[0];
    const plateGodBare = req.files?.plateGodBare?.[0];
    const original = req.files?.original?.[0];
    if (!frame && !preview && !plate && !overlay && !original && !plateBare && !overlayBare) {
      return res.status(400).json({ message: "Upload a frame, preview or plate image." });
    }
    if (frame) {
      const size = imageSize(frame.path);
      if (!size) {
        removeQuietly(frame.path);
        return res.status(400).json({ message: "Frame must be a valid PNG." });
      }
      variant.assets.frame = uploadPath("production", frame.filename);
      variant.assets.frameWidthPx = size.width;
      variant.assets.frameHeightPx = size.height;
      resetApproval(variant); // production artwork changed → re-validate
    }
    // A reusable layout saved from a design keeps the design's own picture
    // as its card picture (a layer refresh never replaces it).
    if (preview && !variant.design) {
      variant.assets.preview = uploadPath("production", preview.filename);
    }
    if (plate) {
      const size = imageSize(plate.path);
      variant.assets.plate = uploadPath("production", plate.filename);
      variant.assets.plateWidthPx = size?.width ?? null;
      variant.assets.plateHeightPx = size?.height ?? null;
    }
    if (overlay) {
      variant.assets.overlay = uploadPath("production", overlay.filename);
    }
    if (original) {
      variant.assets.original = uploadPath("production", original.filename);
    }
    if (plate) variant.assets.forVersion = variant.version;
    if (plateBare) variant.assets.plateBare = uploadPath("production", plateBare.filename);
    if (plateGod) variant.assets.plateGod = uploadPath("production", plateGod.filename);
    if (plateGodBare) variant.assets.plateGodBare = uploadPath("production", plateGodBare.filename);
    if (overlayBare) variant.assets.overlayBare = uploadPath("production", overlayBare.filename);
    if (plateBare) variant.assets.bareVersion = Number(req.body.bareVersion) || 1;
    // Text colours recorded from the source artwork: { regionId: { color, shadow } }.
    if (req.body.textStyles) {
      const styles = JSON.parse(req.body.textStyles);
      variant.regions.forEach((region) => {
        const found = styles[region.id];
        if (!found || !region.textStyle) return;
        if (typeof found.color === "string") region.textStyle.color = found.color;
        region.textStyle.shadow =
          found.shadow && typeof found.shadow.color === "string"
            ? {
                color: found.shadow.color,
                dxMm: Number(found.shadow.dxMm) || 0,
                dyMm: Number(found.shadow.dyMm) || 0,
              }
            : null;
      });
      variant.markModified("regions");
    }
    await variant.save();
    res.status(200).json({
      message: "Assets uploaded",
      assets: {
        ...variant.assets.toObject(),
        frame: toPublicUrl(variant.assets.frame),
        preview: toPublicUrl(variant.assets.preview),
        plate: toPublicUrl(variant.assets.plate),
        overlay: toPublicUrl(variant.assets.overlay),
        original: toPublicUrl(variant.assets.original),
        plateBare: toPublicUrl(variant.assets.plateBare),
        plateGod: toPublicUrl(variant.assets.plateGod),
        plateGodBare: toPublicUrl(variant.assets.plateGodBare),
        overlayBare: toPublicUrl(variant.assets.overlayBare),
      },
      status: variant.status,
    });
  } catch (error) {
    console.error("Upload variant assets error:", error);
    files.forEach((f) => removeQuietly(f.path));
    res.status(500).json({ message: "Failed to upload assets" });
  }
};

// Geometry that decides whether a layout must be re-approved.
const geometrySignature = (trim, cutline, regions) =>
  JSON.stringify({
    trim: { w: trim?.widthMm, h: trim?.heightMm },
    cutline: cutline?.path || null,
    regions: (regions || []).map((r) => [r.id, r.role, r.shape, r.box?.x, r.box?.y, r.box?.width, r.box?.height, r.path || null]),
  });

// POST /api/layout-variants/:id/reextract
// Re-reads the stored production PDF with the current importer and rebuilds
// the layout from its saved mapping (object ids are stable for the same PDF).
// POST /api/layout-variants/:id/laser multipart: laserPdf
// Adds or replaces the laser-cutting PDF. The layout goes back to DRAFT: its
// mapping must be saved again so the cutline / cake are re-checked against it.
const uploadLaserPdf = async (req, res) => {
  const laserUpload = req.file || req.files?.laserPdf?.[0] || null;
  try {
    if (!laserUpload) return res.status(400).json({ message: "Upload the laser PDF." });
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) {
      removeQuietly(laserUpload.path);
      return res.status(404).json({ message: "Layout variant not found" });
    }
    if (variant.status === "ACTIVE") {
      removeQuietly(laserUpload.path);
      return res.status(400).json({ message: "Deactivate the layout before replacing its laser PDF." });
    }
    const laserRead = await extractOrExplain(laserUpload.path, laserUpload.originalname);
    if (laserRead.error) {
      removeQuietly(laserUpload.path);
      return res.status(400).json({ message: `Laser PDF: ${laserRead.error}`, code: laserRead.code });
    }
    const format = await CalendarFormat.findById(variant.formatId).lean();
    const designData = await readImportData(variant);
    const laserImportFile = `${path.basename(laserRead.pdfPath)}.objects.json`;
    await fs.promises.writeFile(path.join(IMPORT_DIR, laserImportFile), JSON.stringify(laserRead.data));
    const previous = { pdf: variant.assets.laserFile, data: variant.assets.laserImportDataFile };

    const summary = designData ? summariseImport(designData, format, laserRead.data) : null;
    variant.assets.laserFile = uploadPath("production", path.basename(laserRead.pdfPath));
    variant.assets.laserImportDataFile = laserImportFile;
    variant.importSummary = { ...(variant.importSummary || {}), laser: summary?.laser || null, verdict: summary?.verdict || null };
    variant.markModified("importSummary");
    variant.laserCheck = null;
    resetApproval(variant);
    await variant.save();
    if (previous.pdf) removeQuietly(path.join(__dirname, "..", previous.pdf));
    if (previous.data) removeQuietly(path.join(IMPORT_DIR, path.basename(previous.data)));
    res.status(200).json({ message: "Laser PDF added. Save the mapping again to check it.", laser: variant.importSummary.laser });
  } catch (error) {
    console.error("Upload laser PDF error:", error);
    removeQuietly(laserUpload?.path);
    res.status(500).json({ message: "Failed to add the laser PDF" });
  }
};

// Geometry of the mapped layout as drawn in the source file (no correction).
const sourceGeometryOf = async (variant) => {
  const data = await readImportData(variant);
  if (!data || !variant.mapping) throw new MappingError("Map the layout before correcting its size.");
  const laserPage = laserPageFor(variant, await readLaserData(variant));
  return { geometry: buildVariantGeometry(data.pages[variant.mapping.pageIndex || 0], variant.mapping, laserPage), laserPage };
};

const setGeometry = (variant, geometry) => {
  // Keep text colours recorded from the artwork.
  const oldStyles = new Map(variant.regions.map((r) => [r.id, r.textStyle]));
  geometry.regions.forEach((r) => {
    const old = oldStyles.get(r.id);
    if (r.textStyle && old) {
      r.textStyle.color = r.textStyle.color || old.color;
      r.textStyle.shadow = r.textStyle.shadow || old.shadow;
    }
  });
  variant.trim = geometry.trim;
  variant.cutline = geometry.cutline;
  variant.regions = geometry.regions;
  variant.mapping = { ...variant.mapping, excludedBoxes: geometry.excludedBoxes };
  variant.version += 1;
  resetApproval(variant);
};

// GET /api/layout-variants/:id/correction
// The cutline as drawn, the nominal size and the proposed correction.
const getCorrection = async (req, res) => {
  try {
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });
    const format = await CalendarFormat.findById(variant.formatId).lean();
    const { geometry } = await sourceGeometryOf(variant);
    res.status(200).json({
      proposal: proposeCorrection(geometry.trim, format),
      active: activeCorrection(variant),
      sourceCutline: geometry.cutline.path,
      correctedCutline: applyCorrection(geometry, proposeCorrection(geometry.trim, format)).cutline.path,
      laserCheck: variant.laserCheck,
    });
  } catch (error) {
    if (error instanceof MappingError) return res.status(400).json({ message: error.message });
    console.error("Get correction error:", error);
    res.status(500).json({ message: "Failed to read the layout size" });
  }
};

// POST /api/layout-variants/:id/correction  body: { confirm: true }
// Applies the proposed correction (source file untouched; undo with DELETE).
const applyGeometryCorrection = async (req, res) => {
  try {
    if (req.body?.confirm !== true) {
      return res.status(400).json({ message: "Review the proposed correction and confirm it." });
    }
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });
    if (variant.status === "ACTIVE") return res.status(400).json({ message: "Deactivate the layout before correcting it." });
    const format = await CalendarFormat.findById(variant.formatId).lean();
    const { geometry } = await sourceGeometryOf(variant);
    const proposal = proposeCorrection(geometry.trim, format);
    if (!proposal.allowed) return res.status(400).json({ message: proposal.reason, proposal });
    variant.geometryCorrection = {
      active: true,
      scaleX: proposal.scaleX,
      scaleY: proposal.scaleY,
      sourceTrim: proposal.sourceTrim,
      targetTrim: proposal.targetTrim,
      confirmedAt: new Date(),
      confirmedBy: req.user?.userId || null,
    };
    setGeometry(variant, applyCorrection(geometry, variant.geometryCorrection));
    await variant.save();
    res.status(200).json({ message: "Size correction applied. Validate the layout again.", correction: variant.geometryCorrection, trim: variant.trim });
  } catch (error) {
    if (error instanceof MappingError) return res.status(400).json({ message: error.message });
    console.error("Apply correction error:", error);
    res.status(500).json({ message: "Failed to apply the correction" });
  }
};

// DELETE /api/layout-variants/:id/correction — back to the file as drawn.
const undoGeometryCorrection = async (req, res) => {
  try {
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });
    if (variant.status === "ACTIVE") return res.status(400).json({ message: "Deactivate the layout before changing it." });
    const { geometry } = await sourceGeometryOf(variant);
    variant.geometryCorrection = null;
    setGeometry(variant, geometry);
    await variant.save();
    res.status(200).json({ message: "Correction removed: the layout uses the cutline as drawn.", trim: variant.trim });
  } catch (error) {
    if (error instanceof MappingError) return res.status(400).json({ message: error.message });
    console.error("Undo correction error:", error);
    res.status(500).json({ message: "Failed to undo the correction" });
  }
};

// ---- Artwork quality: replacement artwork / labelled upscaled preview -----
const PRINT_DPI = Number(process.env.EXPORT_FALLBACK_DPI) || 300;
const artworkRegionOf = (variant) =>
  (variant.regions || []).find((r) => r.role === "BACKGROUND_AREA") || (variant.regions || []).find((r) => r.role === "FRAME");
const dpiFor = (widthPx, heightPx, box) =>
  Math.round(Math.min(widthPx / (box.width / 25.4), heightPx / (box.height / 25.4)));
// Re-runs validation and stores it, so the Layouts page and Customise show
// the real result (e.g. 83 DPI still FAIL) immediately after a change.
const storeFreshValidation = async (variant) => {
  const result = await runLayoutValidation(variant);
  variant.validation = { status: result.status, checkedAt: new Date(), results: result.results };
  return result;
};
// Proportions of a replacement must match the artwork area: stretching
// would move the artwork against the approved cutline.
const MAX_ASPECT_MISMATCH = 0.02;
const markArtworkChanged = (variant, override) => {
  const previous = variant.assets.artworkOverride?.path;
  variant.assets.artworkOverride = override;
  variant.markModified("assets");
  variant.version += 1; // the preview images must be rendered again
  resetApproval(variant);
  if (previous) removeQuietly(path.join(__dirname, "..", previous));
};

// POST /api/layout-variants/:id/artwork multipart: artwork (PNG/JPEG)
// Higher-resolution artwork for the layout's background / frame area. Its
// real pixel size decides the print resolution check.
const uploadArtwork = async (req, res) => {
  const file = req.file;
  try {
    if (!file) return res.status(400).json({ message: "Upload the artwork image (PNG or JPEG)." });
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) {
      removeQuietly(file.path);
      return res.status(404).json({ message: "Layout variant not found" });
    }
    const region = artworkRegionOf(variant);
    if (!region) {
      removeQuietly(file.path);
      return res.status(400).json({ message: "Map the background / frame artwork area first." });
    }
    const size = imageSize(file.path);
    if (!size) {
      removeQuietly(file.path);
      return res.status(400).json({ message: "The artwork must be a PNG or JPEG image." });
    }
    const aspectDiff = Math.abs(size.width / size.height - region.box.width / region.box.height) / (region.box.width / region.box.height);
    if (aspectDiff > MAX_ASPECT_MISMATCH) {
      removeQuietly(file.path);
      return res.status(400).json({
        message:
          `This image is ${size.width} × ${size.height} px, but the artwork area is ${region.box.width.toFixed(1)} × ${region.box.height.toFixed(1)} mm — ` +
          `the proportions differ by ${Math.round(aspectDiff * 1000) / 10}%. Upload a high-resolution export of the same artboard ` +
          "(stretching it would misalign the artwork with the approved cutline).",
      });
    }
    const dpi = dpiFor(size.width, size.height, region.box);
    markArtworkChanged(variant, {
      kind: "replacement",
      path: uploadPath("production", path.basename(file.path)),
      widthPx: size.width,
      heightPx: size.height,
      dpi,
      regionRole: region.role,
      aspectMismatchPercent: Math.round(aspectDiff * 1000) / 10,
      createdAt: new Date(),
    });
    const validation = await storeFreshValidation(variant);
    await variant.save();
    res.status(200).json({
      message:
        `High-resolution artwork added: ${size.width} × ${size.height} px = ${dpi} DPI at print size` +
        (dpi < 150 ? " — still too low for print (minimum 150 DPI)." : dpi < 285 ? " (below the 300 DPI target)." : ".") +
        ` Validation: ${validation.status}.`,
      artworkOverride: variant.assets.artworkOverride,
      validation: variant.validation,
    });
  } catch (error) {
    console.error("Upload artwork error:", error);
    removeQuietly(file?.path);
    res.status(500).json({ message: "Failed to add the artwork" });
  }
};

// The PDF's embedded artwork: pixels, page box and a PNG copy (kept for
// comparing with enhanced versions; the production file is never changed).
const sourceArtworkOf = async (variant) => {
  const raster = (variant.artworkRasters || [])[0];
  const data = await readImportData(variant);
  const page = data?.pages[variant.mapping?.pageIndex || 0];
  const object = raster && page?.objects.find((o) => o.id === raster.objectId);
  if (!object) return null;
  const pdfPath = path.join(__dirname, "..", variant.assets.productionFile);
  const pixels = await extractRasterAt(await fs.promises.readFile(pdfPath), variant.mapping?.pageIndex || 0, object.bbox);
  if (!pixels) return null;
  let sourcePath = variant.assets.artworkSource;
  if (!sourcePath) {
    const filename = `${Date.now()}-artwork-source.png`;
    await sharp(pixels.data, { raw: { width: pixels.width, height: pixels.height, channels: pixels.channels } })
      .png()
      .toFile(path.join(__dirname, "..", "uploads", "production", filename));
    sourcePath = uploadPath("production", filename);
  }
  return { raster, object, pixels, sourcePath };
};

// What enhancing would give, and what it would cost (no request is made).
const enhancePlan = async (variant) => {
  const src = (variant.artworkRasters || [])[0];
  const region = artworkRegionOf(variant);
  if (!src || !region) return null;
  const targetW = Math.round((src.widthMm / 25.4) * PRINT_DPI);
  const targetH = Math.round((src.heightMm / 25.4) * PRINT_DPI);
  const ai = getUpscaler("image-ai");
  // Largest AI output (4K long side) → the real detail an AI pass can give.
  const longSide = 4096;
  const scale = longSide / Math.max(src.widthPx, src.heightPx);
  const aiDetailDpi = dpiFor(Math.round(src.widthPx * scale), Math.round(src.heightPx * scale), { width: src.widthMm, height: src.heightMm });
  return {
    source: { widthPx: src.widthPx, heightPx: src.heightPx, dpi: src.dpi, widthMm: src.widthMm, heightMm: src.heightMm },
    target: { widthPx: targetW, heightPx: targetH, dpi: PRINT_DPI },
    smooth: { detailDpi: src.dpi, costInr: 0 },
    ai: {
      available: ai.isConfigured(),
      detailDpi: aiDetailDpi,
      estimate: estimateImages(1, ai.size),
      reason: ai.isConfigured() ? null : "AI is switched off on this server (AI_IMAGE_PROVIDER).",
    },
    // Without AI the only genuine fix is a higher-resolution source.
    needsSource: src.dpi < 150 && !ai.isConfigured(),
  };
};

// GET /api/layout-variants/:id/artwork/enhance
const getEnhancePlan = async (req, res) => {
  try {
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });
    const plan = await enhancePlan(variant);
    if (!plan) return res.status(400).json({ message: "Map the background artwork first." });
    const withUrl = (o) => (o ? { ...o, url: toPublicUrl(o.path) } : null);
    res.status(200).json({
      plan,
      candidate: withUrl(variant.assets.artworkCandidate),
      override: withUrl(variant.assets.artworkOverride),
      sourceUrl: toPublicUrl(variant.assets.artworkSource),
    });
  } catch (error) {
    console.error("Enhance plan error:", error);
    res.status(500).json({ message: "Failed to read the artwork" });
  }
};

// POST /api/layout-variants/:id/artwork/enhance
// body: { method: "smooth" | "ai", confirmCost?, confirmedEstimateInr? }
// Makes an enhanced CANDIDATE (compared and approved separately).
//   smooth — resampling only: more pixels, no new detail (free).
//   ai     — ONE image-model request (4K) that restores detail, then
//            resampled to the print size; needs the cost confirmation.
const enhanceArtwork = async (req, res) => {
  try {
    const method = req.body?.method === "ai" ? "ai" : "smooth";
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });
    const plan = await enhancePlan(variant);
    if (!plan) return res.status(400).json({ message: "Map the background artwork first." });
    const src = await sourceArtworkOf(variant);
    if (!src) return res.status(400).json({ message: "The embedded artwork could not be read." });
    const { pixels, raster, object, sourcePath } = src;
    let base = sharp(pixels.data, { raw: { width: pixels.width, height: pixels.height, channels: pixels.channels } });
    let detailDpi = raster.dpi;
    let aiPx = null;

    if (method === "ai") {
      const up = getUpscaler("image-ai");
      if (!up.isConfigured()) return res.status(409).json({ message: plan.ai.reason, plan });
      const estimate = plan.ai.estimate;
      const limits = await checkLimits({ estimateInr: estimate.totalInr, userId: req.user?.userId, aiEnabled: true });
      if (!limits.allowed) return res.status(409).json({ message: limits.reasons[0], reasons: limits.reasons, estimate });
      const confirmed = Number(req.body?.confirmedEstimateInr);
      if (req.body?.confirmCost !== true || !Number.isFinite(confirmed) || confirmed + 0.01 < estimate.totalInr) {
        return res.status(409).json({ message: `Confirm the estimated cost (₹${estimate.totalInr}) before enhancing.`, needsConfirmation: true, estimate });
      }
      const png = await base.png().toBuffer();
      const result = await recordedRequest(() => up.enhance({ buffer: png, mimeType: "image/png", widthPx: pixels.width, heightPx: pixels.height }), {
        provider: getImageAi().name,
        model: up.model(),
        purpose: "artwork-enhance",
        userId: req.user?.userId || null,
        requestedResolution: up.size,
        referenceImages: 1,
        imagesRequested: 1,
      });
      const out = result.images[0];
      const meta = await sharp(out.buffer).metadata();
      aiPx = `${meta.width}×${meta.height}`;
      detailDpi = dpiFor(meta.width, meta.height, object.bbox);
      base = sharp(out.buffer);
    }

    const filename = `${Date.now()}-artwork-${method === "ai" ? "ai-enhanced" : "smooth"}.jpg`;
    await base
      .resize(plan.target.widthPx, plan.target.heightPx, { kernel: "lanczos3", fit: "fill" })
      .sharpen({ sigma: method === "ai" ? 0.4 : 0.6 })
      .jpeg({ quality: 93 })
      .toFile(path.join(__dirname, "..", "uploads", "production", filename));
    const previous = variant.assets.artworkCandidate?.path;
    variant.assets.artworkSource = sourcePath;
    variant.assets.artworkCandidate = {
      kind: method === "ai" ? "ai-enhanced" : "upscaled",
      path: uploadPath("production", filename),
      widthPx: plan.target.widthPx,
      heightPx: plan.target.heightPx,
      sourcePx: `${pixels.width}×${pixels.height}`,
      sourceDpi: raster.dpi,
      aiPx,
      detailDpi, // real detail: the source's (smooth) or the AI output's
      dpi: method === "ai" ? detailDpi : raster.dpi,
      regionRole: artworkRegionOf(variant).role,
      createdAt: new Date(),
    };
    variant.markModified("assets");
    await variant.save();
    if (previous) removeQuietly(path.join(__dirname, "..", previous));
    res.status(200).json({
      message:
        method === "ai"
          ? `AI-enhanced version ready: real detail about ${detailDpi} DPI (from ${pixels.width}×${pixels.height} px). Compare and approve it.`
          : `Smooth enlargement ready (${pixels.width}×${pixels.height} → ${plan.target.widthPx}×${plan.target.heightPx} px). It adds no new detail. Compare and approve it.`,
      candidate: { ...variant.assets.artworkCandidate, url: toPublicUrl(variant.assets.artworkCandidate.path) },
      sourceUrl: toPublicUrl(sourcePath),
    });
  } catch (error) {
    if (error?.code === "AI_PROVIDER_ERROR") return res.status(502).json({ message: error.message, kind: error.kind });
    console.error("Enhance artwork error:", error);
    res.status(500).json({ message: "Failed to enhance the artwork" });
  }
};

// Kept for older clients: a smooth enlargement candidate.
const upscaleArtwork = (req, res) => enhanceArtwork({ ...req, body: { method: "smooth" } }, res);

// POST /api/layout-variants/:id/artwork/candidate/approve
// The compared candidate becomes the artwork used in the final composition.
const approveArtworkCandidate = async (req, res) => {
  try {
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });
    const candidate = variant.assets.artworkCandidate;
    if (!candidate) return res.status(400).json({ message: "There is no enhanced version to approve." });
    variant.assets.artworkCandidate = null;
    markArtworkChanged(variant, { ...candidate, approvedAt: new Date() });
    const validation = await storeFreshValidation(variant);
    await variant.save();
    const stillLow = validation.results.find((r) => r.code === "ARTWORK_RESOLUTION" && r.status === "FAIL");
    res.status(200).json({
      message:
        candidate.kind === "upscaled"
          ? `Smooth enlargement in use for previews. It adds no real detail, so the print-quality check still uses ${candidate.sourceDpi} DPI` +
            (stillLow ? " and the layout still fails validation — upload a high-resolution source." : ".")
          : `Enhanced artwork approved (real detail about ${candidate.detailDpi} DPI). Validation: ${validation.status}.`,
      artworkOverride: variant.assets.artworkOverride,
      validation: variant.validation,
    });
  } catch (error) {
    console.error("Approve artwork error:", error);
    res.status(500).json({ message: "Failed to approve the artwork" });
  }
};

// DELETE /api/layout-variants/:id/artwork/candidate
const discardArtworkCandidate = async (req, res) => {
  try {
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });
    const previous = variant.assets.artworkCandidate?.path;
    variant.assets.artworkCandidate = null;
    variant.markModified("assets");
    await variant.save();
    if (previous) removeQuietly(path.join(__dirname, "..", previous));
    res.status(200).json({ message: "Enhanced version discarded." });
  } catch (error) {
    console.error("Discard artwork error:", error);
    res.status(500).json({ message: "Failed to discard" });
  }
};

// DELETE /api/layout-variants/:id/artwork — back to the PDF's own artwork.
const removeArtwork = async (req, res) => {
  try {
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });
    markArtworkChanged(variant, null);
    await storeFreshValidation(variant);
    await variant.save();
    res.status(200).json({ message: "The layout uses the artwork from its production PDF again.", validation: variant.validation });
  } catch (error) {
    console.error("Remove artwork error:", error);
    res.status(500).json({ message: "Failed to remove the artwork" });
  }
};

// Approval is kept only if the production geometry is unchanged.
const reextractVariant = async (req, res) => {
  try {
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });
    if (!variant.assets?.productionFile || !variant.mapping) {
      return res.status(400).json({ message: "This layout has no imported PDF or mapping yet." });
    }
    const pdfPath = path.join(__dirname, "..", variant.assets.productionFile);
    const extracted = await extractPdfLayout(await fs.promises.readFile(pdfPath));
    const importFile = variant.assets.importDataFile || `${path.basename(pdfPath)}.objects.json`;
    await fs.promises.writeFile(path.join(IMPORT_DIR, path.basename(importFile)), JSON.stringify(extracted));

    const mapping = variant.mapping;
    const laserPage = laserPageFor(variant, await readLaserData(variant));
    const sourceGeometry = buildVariantGeometry(extracted.pages[mapping.pageIndex || 0], mapping, laserPage);
    const geometry = applyCorrection(sourceGeometry, activeCorrection(variant));
    const before = geometrySignature(variant.trim, variant.cutline, variant.regions);
    const after = geometrySignature(geometry.trim, geometry.cutline, geometry.regions);
    const geometryChanged = before !== after;

    // Keep text colours recorded earlier from the artwork.
    const oldStyles = new Map(variant.regions.map((r) => [r.id, r.textStyle]));
    geometry.regions.forEach((r) => {
      const old = oldStyles.get(r.id);
      if (r.textStyle && old) {
        r.textStyle.color = r.textStyle.color || old.color;
        r.textStyle.shadow = r.textStyle.shadow || old.shadow;
      }
    });

    variant.trim = geometry.trim;
    variant.cutline = geometry.cutline;
    variant.regions = geometry.regions;
    variant.artworkRasters = geometry.artworkRasters;
    variant.laserCheck = laserCheckFor(sourceGeometry, await laserAnalysisFor(variant, laserPage));
    variant.assets.importDataFile = importFile;
    const formatDoc = await CalendarFormat.findById(variant.formatId).lean();
    if (formatDoc) {
      const fresh = summariseImport(extracted, formatDoc, await readLaserData(variant));
      variant.importSummary = {
        ...(variant.importSummary || {}),
        pages: fresh.pagesSummary,
        laser: fresh.laser || variant.importSummary?.laser || null,
        verdict: fresh.verdict,
      };
      variant.markModified("importSummary");
    }
    variant.mapping = {
      ...mapping,
      registrationOffsetMm: geometry.registrationOffsetMm,
      trimOriginMm: geometry.trimOriginMm,
      excludedBoxes: geometry.excludedBoxes,
    };
    if (geometryChanged) {
      variant.version += 1;
      resetApproval(variant);
    }
    await variant.save();
    res.status(200).json({
      message: geometryChanged
        ? "Re-extracted: production geometry changed, layout needs re-validation"
        : "Re-extracted: production geometry unchanged",
      geometryChanged,
      status: variant.status,
    });
  } catch (error) {
    if (error instanceof MappingError) {
      return res.status(400).json({ message: `Saved mapping no longer matches the PDF: ${error.message}` });
    }
    console.error("Re-extract variant error:", error);
    res.status(500).json({ message: "Failed to re-extract the production PDF" });
  }
};

// POST /api/layout-variants/:id/deactivate — ACTIVE → VALIDATED
const deactivateVariant = async (req, res) => {
  try {
    const variant = await LayoutVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });
    if (variant.status !== "ACTIVE") {
      return res.status(400).json({ message: "Only active layouts can be deactivated" });
    }
    variant.status = "VALIDATED";
    await variant.save();
    res.status(200).json({ message: "Layout deactivated", status: variant.status });
  } catch (error) {
    console.error("Deactivate variant error:", error);
    res.status(500).json({ message: "Failed to deactivate layout" });
  }
};

// DELETE /api/layout-variants/:id?confirm=<layout code>
// Any layout can be deleted (business decision 2026-10-08). Drafts go
// straight away; validated / active / archived layouts are approved
// production records, so the admin must type the layout code to confirm.
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
const deleteVariant = async (req, res) => {
  try {
    const variant = await LayoutVariant.findById(req.params.id).populate("familyId", "code");
    if (!variant) return res.status(404).json({ message: "Layout variant not found" });
    const code = variant.familyId?.code || "";
    if (variant.status !== "DRAFT" && String(req.query.confirm || "").trim() !== code) {
      return res.status(409).json({
        message: `This layout is ${variant.status.toLowerCase()}. Type the layout code "${code}" to confirm deleting it.`,
      });
    }
    const designs = await CalendarDesign.countDocuments({ variantId: variant._id });
    if (designs > 0) {
      return res.status(409).json({ message: `This layout is used by ${designs} saved design(s) and cannot be deleted.` });
    }

    const { importDataFile, ...publicAssets } = variant.assets?.toObject?.() || variant.assets || {};
    await variant.deleteOne();

    // Stored files: only paths under /uploads/production belong to this layout.
    for (const value of Object.values(publicAssets)) {
      if (typeof value === "string" && value.startsWith("/uploads/production/")) {
        removeQuietly(path.join(UPLOADS_DIR, "production", path.basename(value)));
      }
    }
    if (importDataFile) removeQuietly(path.join(IMPORT_DIR, path.basename(importDataFile)));

    // A family left without any layout is removed too.
    const familyId = variant.familyId?._id || variant.familyId;
    const remaining = await LayoutVariant.countDocuments({ familyId });
    if (remaining === 0) await LayoutFamily.deleteOne({ _id: familyId });

    res.status(200).json({ message: "Layout deleted" });
  } catch (error) {
    console.error("Delete variant error:", error);
    res.status(500).json({ message: "Failed to delete the layout" });
  }
};

module.exports = {
  importProductionPdf,
  getEnhancePlan,
  enhanceArtwork,
  approveArtworkCandidate,
  discardArtworkCandidate,
  uploadArtwork,
  upscaleArtwork,
  removeArtwork,
  getCorrection,
  applyGeometryCorrection,
  undoGeometryCorrection,
  uploadLaserPdf,
  getImportedObjects,
  saveMapping,
  uploadVariantAssets,
  deactivateVariant,
  deleteVariant,
  reextractVariant,
  IMPORT_DIR,
};
