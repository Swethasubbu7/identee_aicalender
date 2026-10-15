// Composes the generated calendar designs: the layout's locked artwork
// (plate + overlay, recoloured by the design recipe), the god image, the
// product photo or text in the right box, and the designer's text typeset by
// the app with the recipe's fonts. Used for the on-screen previews and, at
// print resolution, for the PDFs. Preview designs (AI off) use the
// customer's original god image; AI designs use the AI picture.
import { drawLayoutPreview, flattenOnWhite, loadImage, loadLayoutFonts } from "./layoutPreview";
import { layerRenderOptions, BARE_LAYER_VERSION } from "./layoutAssets";
import { renderPageArea } from "./pdfRender";
import { designFromRecipe } from "./designRecipes";
import { loadFontPair } from "./fontSets";
import { aiPaintsProductImage, effectiveOptions, usesAiArtwork } from "./composition";
import {
  fetchAiCalendarSourcePdf,
  prepareAiCalendarExport,
  uploadAiCalendarExport,
} from "../services/aiCalendarService";

const MM_PER_IN = 25.4;
// Browser memory limit for one print canvas: up to ~9 canvases of this size
// are alive at once (layers, bare layers, recoloured copies, the result).
const MAX_PRINT_PIXELS = 35_000_000;

const jobContent = (job) => ({
  businessName: job.content.businessName,
  productList: job.content.productList,
  address: job.content.address,
  rightBoxText: job.content.rightBoxText,
});

// Sections actually shown: switched on AND given content (an empty section
// is removed like a switched-off one — never an empty box). In AI mode a
// right image box without a photo holds the AI-painted product picture.
const designOf = (job, variation) => {
  const options = job.options || {};
  const content = job.content || {};
  return designFromRecipe(
    variation.recipe,
    effectiveOptions(variation.variant, options, content, {
      aiPaintsProduct: job.mode === "ai" && aiPaintsProductImage(options, { productImage: content.productImage }),
    }),
  );
};

// Normal Mode on a reusable layout saved from an AI design: its saved AI
// picture (complete artwork, or the deity in the god opening).
const savedDesign = (job, variation) => (job.mode === "normal" ? variation.variant?.design || null : null);
// Normal Mode without a saved AI picture: the layout's own God picture.
const usesLayoutGod = (job, variation) => {
  const saved = savedDesign(job, variation);
  return job.mode === "normal" && !saved?.artwork && !saved?.godImage;
};
// The layout template is replaced by one complete AI artwork.
const usesFullArtwork = (job, variation) => usesAiArtwork(variation) || Boolean(savedDesign(job, variation)?.artwork);

// Bare layers are only needed when a section is removed or restyled.
const needsBare = (design) =>
  design.boxStyle !== "layout" ||
  !design.sections.showBusinessName ||
  !design.sections.showLeftBox ||
  !design.sections.showRightBox ||
  !design.sections.showTextLine1 ||
  !design.sections.showTextLine2;

/** "enhanced" uses the AI-cleaned product photo when there is one. */
export const productImageUrl = (job, choice) =>
  choice === "enhanced" && job.content.productImageEnhancedUrl
    ? job.content.productImageEnhancedUrl
    : job.content.productImageUrl;

const compose = async (job, variation, { layers, pxPerMm, productChoice, godUrl, backgroundUrl }) => {
  const { variant } = variation;
  const design = designOf(job, variation);
  const content = jobContent(job);
  const saved = savedDesign(job, variation);
  await loadLayoutFonts(variant);
  await loadFontPair(design.fonts, [content.businessName, content.productList, content.rightBoxText]);
  // AI designs: the AI god picture (placed on the box it was composed for);
  // Normal Mode: none (the layout's own) or a saved layout's AI picture;
  // older previews: the customer's own god image, unchanged.
  const aiGod = godUrl || variation.godImageUrl || saved?.godImageUrl;
  const [godImage, background, productImage, artwork] = await Promise.all([
    loadImage(aiGod || (job.mode === "normal" ? null : job.content.godImageUrl)).catch(() => null),
    loadImage(backgroundUrl || variation.backgroundUrl || saved?.artworkUrl).catch(() => null),
    loadImage(productImageUrl(job, productChoice)).catch(() => null),
    loadImage(variant.assets?.artworkOverride?.url).catch(() => null),
  ]);
  // A complete AI artwork replaces the template artwork completely: only the
  // geometry (cutline, cake, text areas) comes from the layout.
  const fullArtwork = usesFullArtwork(job, variation) && background;
  const godBox = variation.godImageBox || saved?.godImageBox || null;
  const filled = variation.godImage ? variation.filledAreas || [] : saved?.filledAreas || [];
  const canvas = document.createElement("canvas");
  const { fits } = drawLayoutPreview(canvas, {
    variant,
    images: {
      ...(fullArtwork ? {} : layers),
      artwork: fullArtwork ? null : artwork,
      // One complete AI artwork over the whole board (any cut type).
      fullArtwork: fullArtwork ? background : null,
      fullArtworkBox: fullArtwork ? variation.backgroundBox : null,
      // In a complete AI artwork the deity is part of the picture.
      godImage: fullArtwork ? null : godImage,
      godImageBox: aiGod ? godBox : null,
      // Removed sections the AI picture was painted for (Die-Cut / Normal).
      filledAreas: aiGod ? filled : [],
      // Normal Mode: the layout's own God picture in the god area.
      layoutGod: usesLayoutGod(job, variation) ? layers.layoutGod || null : null,
      layoutGodBare: usesLayoutGod(job, variation) ? layers.layoutGodBare || null : null,
      background: fullArtwork ? null : background,
      backgroundBox: null,
      productImage,
    },
    content,
    pxPerMm,
    showGuides: false,
    originals: false,
    design,
  });
  flattenOnWhite(canvas);
  return { canvas, fits };
};

// Bare layers stored by an older renderer still show removed boxes (e.g. a
// drawn box larger than its mapped region). Until someone refreshes the
// layout, previews render them from the job's source PDF instead — the same
// file and options the print export uses. One render per job + layout.
const freshBareCache = new Map(); // `${jobId}:${variantId}` → Promise<{ plateBare, overlayBare }>
const freshBareLayers = (job, variation, pxPerMm) => {
  const key = `${job._id}:${variation.variant._id}`;
  if (!freshBareCache.has(key)) {
    freshBareCache.set(
      key,
      (async () => {
        const pdfBytes = await fetchAiCalendarSourcePdf(job._id, variation.index);
        const pdfUrl = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
        const { pageIndex, box, bareOptions, overlayBareOptions } = layerRenderOptions(variation.variant);
        const render = async (options) => (options ? (await renderPageArea(pdfUrl, pageIndex, box, pxPerMm, options)).canvas : null);
        return { plateBare: await render(bareOptions), overlayBare: await render(overlayBareOptions) };
      })().catch((err) => {
        freshBareCache.delete(key);
        throw err;
      }),
    );
  }
  return freshBareCache.get(key);
};
// Normal Mode: the layout's own God picture without sample text. Stored as
// assets.plateGod (layout refresh); until then rendered from the job's
// source PDF (the same file the print export uses).
const godLayerCache = new Map(); // `${jobId}:${variantId}` → Promise<{ layoutGod, layoutGodBare }>
const layoutGodLayers = async (job, variation, pxPerMm) => {
  const { assets } = variation.variant;
  if (assets?.plateGod) {
    const [layoutGod, layoutGodBare] = await Promise.all([
      loadImage(assets.plateGod).catch(() => null),
      loadImage(assets.plateGodBare).catch(() => null),
    ]);
    return { layoutGod, layoutGodBare };
  }
  const key = `${job._id}:${variation.variant._id}`;
  if (!godLayerCache.has(key)) {
    godLayerCache.set(
      key,
      (async () => {
        const { pageIndex, box, godOptions, godBareOptions } = layerRenderOptions(variation.variant);
        if (!godOptions) return {};
        const pdfBytes = await fetchAiCalendarSourcePdf(job._id, variation.index);
        const pdfUrl = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
        const render = async (options) => (options ? (await renderPageArea(pdfUrl, pageIndex, box, pxPerMm, options)).canvas : null);
        try {
          return { layoutGod: await render(godOptions), layoutGodBare: await render(godBareOptions) };
        } finally {
          URL.revokeObjectURL(pdfUrl);
        }
      })().catch((err) => {
        godLayerCache.delete(key);
        throw err;
      }),
    );
  }
  return godLayerCache.get(key);
};

const bareIsStale = (variant) => Boolean(variant.assets?.plateBare) && (variant.assets?.bareVersion || 1) < BARE_LAYER_VERSION;

/** On-screen preview of one design: { url, blob, fits }. */
export const composeVariationPreview = async (job, variation, productChoice = "original") => {
  const { variant } = variation;
  const pxPerMm = variant.assets.plateWidthPx ? variant.assets.plateWidthPx / variant.trim.widthMm : 3;
  const templateLayers = !usesFullArtwork(job, variation);
  const stale = templateLayers && bareIsStale(variant) && needsBare(designOf(job, variation));
  const [plate, overlay, storedPlateBare, storedOverlayBare, fresh, layoutGod] = await Promise.all([
    loadImage(variant.assets.plate || variant.assets.preview).catch(() => null),
    loadImage(variant.assets.overlay).catch(() => null),
    loadImage(variant.assets.plateBare).catch(() => null),
    loadImage(variant.assets.overlayBare).catch(() => null),
    stale ? freshBareLayers(job, variation, pxPerMm).catch(() => null) : null,
    usesLayoutGod(job, variation) ? layoutGodLayers(job, variation, pxPerMm).catch(() => ({})) : {},
  ]);
  const plateBare = fresh?.plateBare || storedPlateBare;
  const overlayBare = fresh?.overlayBare || storedOverlayBare;
  const { canvas, fits } = await compose(job, variation, {
    layers: { plate, overlay, plateBare, overlayBare, ...layoutGod },
    pxPerMm,
    productChoice,
  });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  return { url: URL.createObjectURL(blob), blob, fits };
};

/**
 * Final production render + printable PDFs: renders the locked layers from
 * the production PDF at print resolution, composes the design, and has the
 * server build the print PDF and the laser cutline PDF.
 * onStep(text) reports progress. Returns the server's export result.
 */
export const exportVariationPdf = async (job, variation, { productChoice = "original" } = {}, onStep = () => {}) => {
  const { variant } = variation;
  onStep("Preparing print images");
  const plan = await prepareAiCalendarExport(job._id, variation.index);

  const areaMm2 = variant.trim.widthMm * variant.trim.heightMm;
  let pxPerMm = plan.dpi / MM_PER_IN;
  const notes = [];
  if (areaMm2 * pxPerMm * pxPerMm > MAX_PRINT_PIXELS) {
    pxPerMm = Math.sqrt(MAX_PRINT_PIXELS / areaMm2);
    notes.push(
      `Artwork rendered at ${Math.round(pxPerMm * MM_PER_IN)} DPI instead of ${plan.dpi} (browser memory limit for this size).`,
    );
  }

  onStep("Rendering the layout at print resolution");
  const pdfBytes = await fetchAiCalendarSourcePdf(job._id, variation.index);
  const pdfUrl = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
  const layers = {};
  try {
    const { pageIndex, box, cleanOptions, overlayOptions, bareOptions, overlayBareOptions, godOptions, godBareOptions } =
      layerRenderOptions(variant);
    const render = async (options) => (options ? (await renderPageArea(pdfUrl, pageIndex, box, pxPerMm, options)).canvas : null);
    // A complete AI artwork: the template layers are not used.
    const templateLayers = !usesFullArtwork(job, variation);
    if (templateLayers) layers.plate = await render(cleanOptions);
    if (templateLayers) layers.overlay = await render(overlayOptions);
    if (templateLayers && needsBare(designOf(job, variation))) {
      layers.plateBare = await render(bareOptions);
      layers.overlayBare = await render(overlayBareOptions);
    }
    // Normal Mode: the layout's own God picture at print resolution (the
    // artwork without sample text, used only inside the god area).
    if (templateLayers && usesLayoutGod(job, variation)) {
      layers.layoutGod = await render(godOptions);
      if (needsBare(designOf(job, variation))) layers.layoutGodBare = await render(godBareOptions);
    }

    onStep("Composing the design");
    const { canvas } = await compose(job, variation, {
      layers,
      pxPerMm,
      productChoice,
      godUrl: plan.images.godImage?.url || plan.images["saved-godImage"]?.url,
      backgroundUrl: plan.images.background?.url || plan.images["saved-artwork"]?.url,
    });
    const artwork = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    // Free the large canvases before uploading.
    for (const c of [canvas, ...Object.values(layers)]) if (c) c.width = c.height = 0;

    onStep("Building the PDF files");
    const result = await uploadAiCalendarExport(job._id, variation.index, artwork, productChoice);
    return { ...result, dpi: plan.dpi, dpiConfirmed: plan.dpiConfirmed, warnings: [...plan.warnings, ...notes] };
  } finally {
    URL.revokeObjectURL(pdfUrl);
  }
};
