import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Snackbar,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import AppSidebar from "../../components/AppSidebar";
import { getLayoutVariant } from "../../services/layoutVariantService";
import {
  createDraft,
  getDesign,
  autosaveDesign,
  uploadDesignImage,
  uploadDesignThumbnail,
} from "../../services/calendarDesignService";
import { CUT_TYPE_LABELS } from "../../constants/cutTypes";
import { getContentSlots, EMPTY_CONTENT, contentOptions } from "../../utils/contentSlots";
import { designFromRecipe } from "../../utils/designRecipes";
import { layoutSections, SECTION_LABELS } from "../../utils/sectionAreas";
import { loadFontPair } from "../../utils/fontSets";
import { drawLayoutPreview, flattenOnWhite, loadImage, loadLayoutFonts } from "../../utils/layoutPreview";
import { startAiCalendarJob, startAdminTestImage, getAiLayoutPlan } from "../../services/aiCalendarService";
import { generateLayoutAssets, BARE_LAYER_VERSION } from "../../utils/layoutAssets";
import { SectionLabel, ImageSlot } from "./ContentFields";
import { useCostConfirmation } from "../../components/CostConfirmDialog";
import { aiPaintsProductImage, compositionMode, effectiveOptions } from "../../utils/composition";

// Designs per Generate (the server decides, see /plan): Normal Mode 5 box
// styles (Special: 1), AI Mode exactly 2.
const DESIGN_COUNT = { normal: 5, ai: 2 };
const THUMBNAIL_HEIGHT_PX = 600;
const PROMPT_EXAMPLE = "e.g. Create a premium red and gold Vinayagar calendar with a festive temple-inspired background.";

const AUTOSAVE_DEBOUNCE_MS = 2500;

// Content as stored on the server (image paths, not object URLs).
const toServerContent = (content) => ({
  businessName: content.businessName,
  productList: content.productList,
  address: content.address,
  godImage: content.godImage?.path || null,
  productImage: content.productImage?.path || null,
  rightBoxText: content.rightBoxText,
  showBusinessName: content.showBusinessName,
  showLeftBox: content.showLeftBox,
  showRightBox: content.showRightBox,
  showTextLine1: content.showTextLine1,
  showTextLine2: content.showTextLine2,
  rightBoxMode: content.rightBoxMode,
});

const fromServerContent = (c = {}, language) => ({
  ...EMPTY_CONTENT,
  businessName: c.businessName || "",
  productList: c.productList || "",
  address: c.address || "",
  godImage: c.godImage ? { path: c.godImage, url: c.godImageUrl } : null,
  productImage: c.productImage ? { path: c.productImage, url: c.productImageUrl } : null,
  rightBoxText: c.rightBoxText || "",
  language: language === "tamil" ? "tamil" : "english",
  showBusinessName: c.showBusinessName !== false,
  showLeftBox: c.showLeftBox !== false,
  showRightBox: c.showRightBox !== false,
  showTextLine1: c.showTextLine1 !== false,
  showTextLine2: c.showTextLine2 !== false,
  rightBoxMode: c.rightBoxMode === "text" ? "text" : "image",
});

// Draft payload: content + language (stored on the design) + mode / AI settings.
const draftPayload = (c, prompt, mode) => ({
  content: toServerContent(c),
  language: c.language,
  aiMetadata: { prompt, mode },
});

// The look of the live preview in each mode.
//   Normal Mode: the layout as it is (a saved layout: its saved box style),
//                sections switched off or left empty removed.
//   AI Mode:     the customer's God image on the layout; Special Die-Cut
//                without a god area shows a plain sketch (the template's own
//                sample deity is replaced by the AI).
const designFor = (variant, c, mode) => {
  const options = contentOptions(c);
  const ai = mode === "ai";
  const shown = effectiveOptions(variant, options, c, {
    aiPaintsProduct: ai && aiPaintsProductImage(options, { productImage: c.productImage }),
  });
  const design = designFromRecipe(ai ? null : variant?.design?.recipe || null, shown);
  return ai && variant && compositionMode(variant) === "FULL_ARTWORK" ? { ...design, sketch: true } : design;
};


// The pictures the live preview uses in each mode.
//   Normal Mode: no customer God image — the layout's own God picture
//                (`original`, inside the god area), or a saved layout's AI
//                picture (complete artwork / deity in the god opening).
//   AI Mode:     the customer's God image.
const previewImagesFor = (variant, images, content, mode) => {
  if (mode === "ai") return images;
  const saved = variant?.design;
  return {
    ...images,
    godImage: saved?.godImage ? images.savedGod || null : null,
    godImageBox: saved?.godImage ? saved.godImageBox : null,
    filledAreas: saved?.godImage ? saved.filledAreas || [] : [],
    fullArtwork: saved?.artwork ? images.savedArt || null : null,
    fullArtworkBox: saved?.artwork ? saved.artworkBox : null,
    // Without sample text (plateGod); the untouched page only until the
    // refreshes the layout's preview layers.
    layoutGod: saved?.artwork || saved?.godImage ? null : images.plateGod || images.original || null,
    layoutGodBare: saved?.artwork || saved?.godImage ? null : images.plateGodBare || null,
  };
};

// Designer customisation of a production layout: the layout's mapped
// regions are fixed; only the content inside the editable slots changes.
const ProductionCustomiseEditor = () => {
  const { variantId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [variant, setVariant] = useState(null);
  const [error, setError] = useState("");
  const [content, setContent] = useState(EMPTY_CONTENT);
  const [uploading, setUploading] = useState({});
  const [designId, setDesignId] = useState(searchParams.get("design"));
  const [saveState, setSaveState] = useState("");
  const [snackbar, setSnackbar] = useState("");
  const [showGuides, setShowGuides] = useState(true);
  const [images, setImages] = useState({});
  const [fits, setFits] = useState({});
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [layoutPlan, setLayoutPlan] = useState(null); // { aiEnabled, normal: {...}, ai: {...} }
  // Normal Mode (content on the layout, never AI) or AI Mode (paid images).
  const [mode, setModeState] = useState(searchParams.get("mode") === "ai" ? "ai" : "normal");
  const modeRef = useRef(mode);
  const { confirmPaid, dialog: costDialog } = useCostConfirmation();
  const generatingRef = useRef(false); // no double submission

  const canvasRef = useRef(null);
  const autosaveTimer = useRef(null);
  // Latest content, so async uploads never overwrite newer edits.
  const contentRef = useRef(EMPTY_CONTENT);
  const promptRef = useRef("");
  // For the project-card thumbnail (drawn off-screen, without guides).
  const variantRef = useRef(null);
  const imagesRef = useRef({});
  const needsThumbnailRef = useRef(false);

  // Load the production layout (and an existing draft, if any).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let { variant: v } = await getLayoutVariant(variantId);
        // Preview images rendered for an older mapping still show the sample
        // text of the old regions: they are re-rendered once here.
        const stale =
          v.mapping?.trimOriginMm &&
          v.assets?.productionFile &&
          (!v.assets?.plate ||
            (v.status === "DRAFT" && v.assets?.forVersion !== v.version) ||
            // Bare layers (sections removed) from an older renderer.
            (v.assets?.plateBare && (v.assets?.bareVersion || 1) < BARE_LAYER_VERSION) ||
            // No God-picture layer yet (Normal Mode shows the layout's own God).
            ((v.regions || []).some((r) => r.role === "GOD_AREA") &&
              (!v.assets?.plateGod || (v.assets?.plateBare && !v.assets?.plateGodBare))));
        if (stale) {
          if (!cancelled) setSaveState("Updating the layout preview images…");
          try {
            await generateLayoutAssets(v);
            ({ variant: v } = await getLayoutVariant(variantId));
          } catch (err) {
            console.error("Preview asset refresh failed:", err);
          }
          if (!cancelled) setSaveState("");
        }
        const draftId = searchParams.get("design");
        const draft = draftId ? (await getDesign(draftId)).design : null;
        await loadLayoutFonts(v);
        if (cancelled) return;
        variantRef.current = v;
        setVariant(v);
        // Drafts saved before thumbnails existed get one once their images load.
        needsThumbnailRef.current = Boolean(draft && !draft.thumbnail);
        if (draft) {
          contentRef.current = fromServerContent(draft.content, draft.language);
          setContent(contentRef.current);
          promptRef.current = draft.aiMetadata?.prompt || "";
          setPrompt(promptRef.current);
          if (draft.aiMetadata?.mode === "ai" || draft.aiMetadata?.mode === "normal") {
            modeRef.current = draft.aiMetadata.mode;
            setModeState(draft.aiMetadata.mode);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || "Could not load this layout.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantId]);

  const slots = useMemo(() => getContentSlots(variant), [variant]);
  // Only the optional sections this layout has (Special Die-Cut: name + 2 text lines).
  const sections = useMemo(() => layoutSections(variant), [variant]);

  // Which layouts Generate will use (the selected one + a different one).
  useEffect(() => {
    let cancelled = false;
    // The prompt picks design 1's colours; re-read after typing settles.
    const timer = setTimeout(() => {
      getAiLayoutPlan(variantId, prompt)
        .then((plan) => !cancelled && setLayoutPlan(plan))
        .catch(() => !cancelled && setLayoutPlan(null));
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [variantId, prompt]);

  // Small picture of the design (god image, name, list, photo in the layout)
  // for the Dashboard / Draft Projects cards.
  const saveThumbnail = async (id) => {
    const v = variantRef.current;
    if (!id || !v?.trim?.heightMm) return;
    const canvas = document.createElement("canvas");
    drawLayoutPreview(canvas, {
      variant: v,
      images: previewImagesFor(v, imagesRef.current, contentRef.current, modeRef.current),
      content: contentRef.current,
      pxPerMm: THUMBNAIL_HEIGHT_PX / v.trim.heightMm,
      showGuides: false,
      design: designFor(v, contentRef.current, modeRef.current),
    });
    flattenOnWhite(canvas);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (blob) await uploadDesignThumbnail(id, blob);
  };

  // Load every image the preview needs whenever a source URL changes.
  const plateUrl = variant?.assets?.plate || variant?.assets?.preview || null;
  const frameUrl = variant?.assets?.frame || null;
  const overlayUrl = variant?.assets?.overlay || null;
  const originalUrl = variant?.assets?.original || null;
  const plateBareUrl = variant?.assets?.plateBare || null;
  const overlayBareUrl = variant?.assets?.overlayBare || null;
  const artworkUrl = variant?.assets?.artworkOverride?.url || null;
  // The layout's own God picture without sample text (Normal Mode).
  const plateGodUrl = variant?.assets?.plateGod || null;
  const plateGodBareUrl = variant?.assets?.plateGodBare || null;
  const godUrl = content.godImage?.url || null;
  const productUrl = content.productImage?.url || null;
  // A reusable layout saved from an AI design: its saved AI picture.
  const savedArtUrl = variant?.design?.artworkUrl || null;
  const savedGodUrl = variant?.design?.godImageUrl || null;
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      [plateUrl, frameUrl, overlayUrl, originalUrl, godUrl, productUrl, plateBareUrl, overlayBareUrl, artworkUrl, savedArtUrl, savedGodUrl, plateGodUrl, plateGodBareUrl].map(
        (u) => loadImage(u).catch(() => null),
      ),
    ).then(([plate, frame, overlay, original, godImage, productImage, plateBare, overlayBare, artwork, savedArt, savedGod, plateGod, plateGodBare]) => {
      if (cancelled) return;
      imagesRef.current = {
        plate, frame, overlay, original, godImage, productImage, plateBare, overlayBare, artwork, savedArt, savedGod, plateGod, plateGodBare,
      };
      setImages(imagesRef.current);
      if (needsThumbnailRef.current && plate) {
        needsThumbnailRef.current = false;
        saveThumbnail(designId).catch(() => {});
      }
    });
    return () => {
      cancelled = true;
    };
  }, [plateUrl, frameUrl, overlayUrl, originalUrl, godUrl, productUrl, plateBareUrl, overlayBareUrl, artworkUrl, savedArtUrl, savedGodUrl, plateGodUrl, plateGodBareUrl, designId]);

  // Redraw the live preview on every change.
  const pxPerMm = variant?.assets?.plateWidthPx && variant?.trim?.widthMm
    ? variant.assets.plateWidthPx / variant.trim.widthMm
    : 4;
  // The look of the selected mode, with the designer's language and
  // sections. A section left empty is removed like a switched-off one.
  const liveDesign = useMemo(() => designFor(variant, content, mode), [variant, content, mode]);
  const previewImages = useMemo(() => previewImagesFor(variant, images, content, mode), [variant, images, content, mode]);
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadFontPair(liveDesign.fonts, [content.businessName, content.productList, content.rightBoxText]).then(
      () => !cancelled && setFontsReady((n) => n + 1),
    );
    return () => {
      cancelled = true;
    };
  }, [liveDesign, content.businessName, content.productList, content.rightBoxText]);
  useEffect(() => {
    if (!variant?.trim?.widthMm || !canvasRef.current) return;
    const frame = requestAnimationFrame(() => {
      // AI Mode: the template's sample pictures / text are never restored
      // (the AI paints the artwork; a right image box gets a product picture).
      const result = drawLayoutPreview(canvasRef.current, {
        variant,
        images: previewImages,
        content,
        pxPerMm,
        showGuides,
        design: liveDesign,
        originals: mode !== "ai",
      });
      setFits(result.fits);
    });
    return () => cancelAnimationFrame(frame);
  }, [variant, previewImages, content, pxPerMm, showGuides, liveDesign, fontsReady, mode]);

  // --- saving ---------------------------------------------------------------
  const persist = useCallback(
    async (next) => {
      const payload = draftPayload(next, promptRef.current, modeRef.current);
      let id = designId;
      if (!id) {
        const data = await createDraft({ variantId, ...payload });
        id = data.design._id;
        setDesignId(id);
        setSearchParams({ design: id }, { replace: true });
      } else {
        await autosaveDesign(id, payload);
      }
      setSaveState(`Saved at ${new Date().toLocaleTimeString()}`);
      saveThumbnail(id).catch(() => {});
    },
    [designId, variantId, setSearchParams],
  );

  const scheduleAutosave = (next) => {
    if (!designId) return; // first save is explicit (Save Draft)
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      persist(next).catch(() => setSaveState("Autosave failed"));
    }, AUTOSAVE_DEBOUNCE_MS);
  };
  useEffect(() => () => clearTimeout(autosaveTimer.current), []);

  const update = (patch) => {
    const next = { ...contentRef.current, ...patch };
    contentRef.current = next;
    setContent(next);
    scheduleAutosave(next);
  };

  const pickImage = async (key, file) => {
    // Show it in the preview immediately; upload in the background.
    const localUrl = URL.createObjectURL(file);
    update({ [key]: { url: localUrl, path: null } });
    setUploading((u) => ({ ...u, [key]: true }));
    try {
      const uploaded = await uploadDesignImage(file);
      update({ [key]: { url: localUrl, path: uploaded.path, widthPx: uploaded.widthPx, heightPx: uploaded.heightPx } });
    } catch (err) {
      update({ [key]: null });
      setSnackbar(err.response?.data?.message || "Image upload failed.");
    } finally {
      setUploading((u) => ({ ...u, [key]: false }));
    }
  };

  const setMode = (value) => {
    if (!value || value === modeRef.current) return;
    modeRef.current = value;
    setModeState(value);
    scheduleAutosave(contentRef.current);
  };

  const updatePrompt = (value) => {
    promptRef.current = value;
    setPrompt(value);
    scheduleAutosave(contentRef.current);
  };

  // Generate designs of this same layout. The draft is saved first so
  // nothing is lost.
  //   Normal Mode: 5 box-style designs (Special: 1), made by the app — free,
  //                never sent to an AI service.
  //   AI Mode:     exactly 2 AI designs; the server asks for the cost to be
  //                confirmed first and refuses while AI is switched off.
  const runGenerate = async ({ adminTest = false } = {}) => {
    const c = contentRef.current;
    const ai = modeRef.current === "ai";
    if (ai && !c.godImage?.path) return setSnackbar("Upload the god image first.");
    if (generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    try {
      let id = designId;
      const payload = draftPayload(c, promptRef.current, modeRef.current);
      if (!id) {
        id = (await createDraft({ variantId, ...payload })).design._id;
        setDesignId(id);
        setSearchParams({ design: id }, { replace: true });
      } else {
        await autosaveDesign(id, payload);
      }
      saveThumbnail(id).catch(() => {});
      const body = {
        mode: ai ? "ai" : "normal",
        variantId,
        designId: id,
        businessName: c.businessName,
        productList: c.productList,
        address: c.address,
        // Normal Mode never sends a God image (the layout's own is kept).
        godImage: ai ? c.godImage.path : null,
        productImage: c.productImage?.path || null,
        rightBoxText: c.rightBoxText,
        prompt: ai ? promptRef.current : "",
        ...contentOptions(c),
      };
      // The one-image test has its own endpoint (exactly one request).
      const start = adminTest ? startAdminTestImage : startAiCalendarJob;
      const job = ai ? await confirmPaid((confirmation) => start({ ...body, ...confirmation })) : await startAiCalendarJob(body);
      if (job) return navigate(`/calendar/designs/${job._id}`);
    } catch (err) {
      setSnackbar(err.response?.data?.message || "Could not start the generation.");
    }
    generatingRef.current = false;
    setGenerating(false);
  };

  const saveDraft = async () => {
    try {
      await persist(contentRef.current);
      setSnackbar("Draft saved");
    } catch (err) {
      setSnackbar(err.response?.data?.message || "Saving failed.");
    }
  };

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">{error}</Alert>
        <Button sx={{ mt: 2 }} onClick={() => navigate("/layouts")}>Back to Layouts</Button>
      </Box>
    );
  }
  if (!variant) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress sx={{ color: "#B08D35" }} />
      </Box>
    );
  }

  const family = variant.familyId || {};
  const uploadingAny = Object.values(uploading).some(Boolean);
  const reduced = (slotKey) =>
    slots
      .find((s) => s.key === slotKey)
      ?.regions.map((r) => fits[r.id])
      .find((f) => f && f.fittedPt < f.layoutPt - 0.5);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", background: "#FAF6EC" }}>
      <AppSidebar activeKey="layouts" />
      <Box sx={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100vh" }}>
        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 3, py: 1.5, background: "#161616", flexWrap: "wrap" }}>
          <IconButton size="small" onClick={() => navigate("/layouts")} sx={{ color: "#E9C767" }}>
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography sx={{ color: "#E9C767", fontWeight: 700 }} noWrap>
              Customise · {family.code || "Production layout"}
            </Typography>
            <Box sx={{ display: "flex", gap: 0.75, mt: 0.5, flexWrap: "wrap" }}>
              <Chip size="small" label={CUT_TYPE_LABELS[variant.cutType]} sx={{ background: "rgba(233,199,103,0.15)", color: "#E9C767" }} />
              <Chip size="small" label={variant.sizeCode?.replace("x", "×")} sx={{ background: "rgba(233,199,103,0.15)", color: "#E9C767" }} />
              {variant.status !== "ACTIVE" && <Chip size="small" color="warning" label={`Layout ${variant.status.toLowerCase()}`} />}
            </Box>
          </Box>
          {saveState && <Typography variant="caption" sx={{ color: "#A9A296" }}>{saveState}</Typography>}
          <Button variant="contained" startIcon={<SaveOutlinedIcon />} onClick={saveDraft} disabled={uploadingAny}>
            Save Draft
          </Button>
        </Box>

        {variant.validation?.status === "FAIL" && (
          // The layout is not production-ready: say why, instead of showing
          // a Customise page with fields missing.
          <Alert severity="warning" sx={{ borderRadius: 0 }}>
            {variant.design ? (
              <>
                <strong>Saved design (draft)</strong> — you can reuse it here; it is validated and activated before it
                is used in production. Validation found:
              </>
            ) : (
              <>
                <strong>This production layout is still a draft and failed validation</strong> — fix it on the Layouts page
                (map the regions / correct the file) before using it:
              </>
            )}
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {(variant.validation.results || [])
                .filter((r) => r.stage === "STRUCTURE" && r.status === "FAIL")
                .slice(0, 8)
                .map((r) => (
                  <li key={`${r.code}-${r.message}`}>
                    <Typography variant="caption">{r.message}</Typography>
                  </li>
                ))}
            </Box>
          </Alert>
        )}
        <Box sx={{ display: "flex", flexGrow: 1, minHeight: 0, flexDirection: { xs: "column", md: "row" } }}>
          {/* Content controls */}
          <Box sx={{ width: { xs: "100%", md: 360 }, flexShrink: 0, overflowY: "auto", background: "#fff", borderRight: "1px solid rgba(176,141,53,0.15)", p: 2.5, display: "flex", flexDirection: "column", gap: 2.5 }}>
            <Box>
              <SectionLabel>MODE</SectionLabel>
              <ToggleButtonGroup exclusive fullWidth size="small" value={mode} onChange={(_, v) => setMode(v)}>
                <ToggleButton value="normal" data-testid="mode-normal">Normal Mode</ToggleButton>
                <ToggleButton value="ai" data-testid="mode-ai">
                  <AutoAwesomeIcon sx={{ fontSize: 16, mr: 0.5 }} /> AI Mode
                </ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" sx={{ color: "#7A7266", display: "block", mt: 0.75 }}>
                {mode === "normal"
                  ? variant.cutType === "special-die-cut"
                    ? "Free, no AI. The layout's artwork and God picture stay as they are; you change the business name and the two text lines."
                    : "Free, no AI. The layout's artwork and God picture stay as they are; you change the text and boxes and choose from 5 box styles."
                  : "Paid AI images. Upload the customer's God image and describe the design: the AI creates 2 complete new designs inside this layout's cut shape."}
              </Typography>
              {variant.design && (
                <Alert severity="info" sx={{ mt: 1, py: 0 }}>
                  Saved design “{variant.design.name}” ({variant.design.mode === "ai" ? "AI artwork" : "Normal Mode"}
                  {variant.design.boxStyle && variant.design.boxStyle !== "layout" ? `, ${variant.design.boxStyle} boxes` : ""}). Reused without
                  generating it again.
                </Alert>
              )}
            </Box>
            <Box>
              <SectionLabel>LANGUAGE</SectionLabel>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={content.language}
                onChange={(_, v) => v && update({ language: v })}
              >
                <ToggleButton value="english">English</ToggleButton>
                <ToggleButton value="tamil">தமிழ் Tamil</ToggleButton>
              </ToggleButtonGroup>
              {content.language === "tamil" && (
                <Typography variant="caption" sx={{ color: "#7A7266", display: "block", mt: 0.5 }}>
                  Type or paste the Tamil text yourself. It is printed exactly as entered (never translated) in Tamil fonts.
                </Typography>
              )}
            </Box>
            <Box>
              <SectionLabel>SECTIONS</SectionLabel>
              <Box sx={{ display: "flex", flexDirection: "column" }}>
                {sections.map((key) => (
                  <FormControlLabel
                    key={key}
                    control={<Switch size="small" checked={content[key] !== false} onChange={(e) => update({ [key]: e.target.checked })} />}
                    label={<Typography variant="body2">{SECTION_LABELS[key]}</Typography>}
                  />
                ))}
              </Box>
              {sections.includes("showRightBox") && content.showRightBox !== false && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" sx={{ color: "#7A7266", display: "block", mb: 0.5 }}>Right box shows</Typography>
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={content.rightBoxMode}
                    onChange={(_, v) => v && update({ rightBoxMode: v })}
                  >
                    <ToggleButton value="image">Image</ToggleButton>
                    <ToggleButton value="text">Text</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              )}
            </Box>
            {slots.map((slot) => {
              // Sections the customer does not want are not shown at all.
              if (slot.section && content[slot.section] === false) return null;
              // Normal Mode keeps the layout's own God picture: no upload.
              if (slot.key === "godImage" && mode === "normal") return null;
              if (slot.key === "productImage" && content.rightBoxMode === "text") {
                return (
                  <Box key="rightBoxText">
                    <SectionLabel>RIGHT BOX · TEXT</SectionLabel>
                    <TextField
                      fullWidth
                      multiline
                      minRows={3}
                      value={content.rightBoxText}
                      onChange={(e) => update({ rightBoxText: e.target.value })}
                      slotProps={{ htmlInput: { maxLength: 1000 } }}
                    />
                  </Box>
                );
              }
              if (slot.kind === "image") {
                return (
                  <ImageSlot
                    key={slot.key}
                    slot={slot}
                    value={content[slot.key]}
                    uploading={uploading[slot.key]}
                    onPick={(file) => pickImage(slot.key, file)}
                    onRemove={() => update({ [slot.key]: null })}
                  />
                );
              }
              if (slot.kind === "text") {
                const fit = reduced(slot.key);
                return (
                  <Box key={slot.key}>
                    <SectionLabel>{slot.label.toUpperCase()}</SectionLabel>
                    <TextField
                      fullWidth
                      multiline={slot.multiline}
                      minRows={slot.multiline ? 4 : undefined}
                      placeholder={slot.sample}
                      value={content[slot.key]}
                      onChange={(e) => update({ [slot.key]: e.target.value })}
                    />
                    {fit && (
                      <Typography variant="caption" sx={{ color: "#8a6d1f", display: "block", mt: 0.5 }}>
                        Text reduced to {fit.fittedPt.toFixed(1)} pt (layout size {fit.layoutPt.toFixed(1)} pt) to fit its area.
                      </Typography>
                    )}
                  </Box>
                );
              }
              // AI background area: painted by the AI during Generate.
              return null;
            })}
            {mode === "ai" && (
            <Box>
              <SectionLabel>AI PROMPT</SectionLabel>
              <TextField
                fullWidth
                multiline
                minRows={3}
                placeholder={PROMPT_EXAMPLE}
                value={prompt}
                onChange={(e) => updatePrompt(e.target.value)}
                slotProps={{ htmlInput: { maxLength: 1000 } }}
                helperText="Colours, background, decorations and mood. The AI never changes your text or the layout."
              />
            </Box>
            )}
            <Box sx={{ mt: "auto", display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Button
                fullWidth
                variant="contained"
                size="large"
                data-testid="generate"
                startIcon={generating ? <CircularProgress size={18} color="inherit" /> : mode === "ai" ? <AutoAwesomeIcon /> : null}
                onClick={() => runGenerate()}
                disabled={
                  uploadingAny ||
                  generating ||
                  (layoutPlan && layoutPlan.canGenerate === false) ||
                  (mode === "ai" && layoutPlan && !layoutPlan.aiEnabled)
                }
                sx={{ py: 1.25, fontWeight: 700 }}
              >
                {generating
                  ? "Starting…"
                  : mode === "ai"
                    ? `Generate ${layoutPlan?.ai?.designCount ?? DESIGN_COUNT.ai} AI designs`
                    : `Create ${layoutPlan?.normal?.designCount ?? DESIGN_COUNT.normal} design${(layoutPlan?.normal?.designCount ?? DESIGN_COUNT.normal) === 1 ? "" : "s"} (free, no AI)`}
              </Button>
              <Typography variant="caption" sx={{ color: "#7A7266" }}>
                {mode === "ai"
                  ? `${layoutPlan?.ai?.designCount ?? DESIGN_COUNT.ai} different complete compositions of this layout (God image, frame, flowers, background); your text is printed by the app exactly as typed.`
                  : variant.cutType === "special-die-cut"
                    ? "This layout with your business name and text lines."
                    : "Original boxes, rounded, arched, scalloped and double-border boxes — the same layout and text, drawn by the app."}
              </Typography>
              {mode === "ai" && layoutPlan?.adminTest && (
                // One paid image to measure the real cost and quality before regular Generate.
                <Button
                  fullWidth
                  variant="outlined"
                  data-testid="test-image"
                  onClick={() => runGenerate({ adminTest: true })}
                  disabled={uploadingAny || generating || !layoutPlan.aiEnabled || layoutPlan.canGenerate === false}
                >
                  Test one AI image (1 request
                  {layoutPlan.adminTest.estimate?.totalInr != null ? `, about ₹${layoutPlan.adminTest.estimate.totalInr}` : ""})
                </Button>
              )}
              {layoutPlan?.canGenerate === false && (
                <Alert severity="warning" sx={{ py: 0 }}>{layoutPlan.generateBlockedReason}</Alert>
              )}
              {mode === "ai" && layoutPlan?.ai?.note && <Alert severity="warning" sx={{ py: 0 }}>{layoutPlan.ai.note}</Alert>}
              {mode === "ai" && layoutPlan?.aiEnabled && (
                <Typography variant="caption" sx={{ color: "#7A7266" }}>
                  Estimated AI cost: {layoutPlan.ai.estimate?.totalInr == null ? "unknown" : `about ₹${layoutPlan.ai.estimate.totalInr}`}
                  {" "}({layoutPlan.ai.estimate?.requests} paid requests, incl. GST). You confirm before anything is sent.
                </Typography>
              )}
              {mode === "ai" && layoutPlan?.ai?.limits && !layoutPlan.ai.limits.allowed && (
                <Alert severity="warning" sx={{ py: 0 }}>{layoutPlan.ai.limits.reasons[0]}</Alert>
              )}
              {compositionMode(variant) === "FULL_ARTWORK" ? (
                <Alert icon={<LockOutlinedIcon fontSize="small" />} severity="info">
                  Special Die-Cut: size, cut shape, cake mount and calendar area are fixed by the production layout. The
                  {mode === "ai"
                    ? "AI composes your God image, frame and background freely inside the cut shape. This preview is only a plain sketch of your inputs, not the AI design."
                    : "layout's own artwork is kept; only the business name and text lines change."}
                </Alert>
              ) : (
                <Alert icon={<LockOutlinedIcon fontSize="small" />} severity="info">
                  Size, cut shape, frame, cake mount and calendar area are fixed by the production layout.
                </Alert>
              )}
            </Box>
          </Box>

          {/* Live preview */}
          <Box sx={{ flexGrow: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
              <Typography sx={{ fontWeight: 700, color: "#2A2620", flexGrow: 1 }}>Live Preview</Typography>
              <FormControlLabel
                control={<Switch size="small" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />}
                label={<Typography variant="body2">Show fixed areas</Typography>}
              />
            </Box>
            {!variant.assets?.plate && (
              <Alert severity="warning" sx={{ mb: 1 }}>
                Preview assets for this layout have not been generated yet, so sample text may show through. Fix this in Layout setup with “Refresh preview”.
              </Alert>
            )}
            <Box sx={{ flexGrow: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#EDE7D9", borderRadius: 2, p: 2, overflow: "hidden" }}>
              <canvas
                ref={canvasRef}
                style={{ maxWidth: "100%", maxHeight: "100%", boxShadow: "0 6px 24px rgba(0,0,0,0.18)", background: "transparent" }}
              />
            </Box>
          </Box>
        </Box>
      </Box>
      <Snackbar
        open={Boolean(snackbar)}
        autoHideDuration={3000}
        onClose={() => setSnackbar("")}
        message={snackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
      {costDialog}
    </Box>
  );
};

// A different layout starts from a clean editor state. (The draft id is added
// to the URL by the editor itself on first save, so it is not part of the key.)
const ProductionCustomise = () => {
  const { variantId } = useParams();
  return <ProductionCustomiseEditor key={variantId} />;
};

export default ProductionCustomise;
