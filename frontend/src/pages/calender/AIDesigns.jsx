import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Step,
  StepLabel,
  Stepper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import BookmarkAddOutlinedIcon from "@mui/icons-material/BookmarkAddOutlined";
import AppSidebar from "../../components/AppSidebar";
import { CUT_TYPE_LABELS } from "../../constants/cutTypes";
import {
  getAiCalendarJob,
  startAiCalendarJob,
  regenerateAiCalendarVariation,
  printCheckAiCalendar,
  downloadAiCalendarPdf,
  saveAiVariationPreview,
  saveDesignAsLayout,
} from "../../services/aiCalendarService";
import { composeVariationPreview, exportVariationPdf } from "../../utils/aiCalendarCompose";
import { useCostConfirmation } from "../../components/CostConfirmDialog";
import { compositionMode, disabledSections, effectiveOptions } from "../../utils/composition";

const POLL_MS = 3000;
const FINISHED = ["DONE", "PARTIAL", "FAILED"];
const GOLD = "#B08D35";
const sizeLabel = (code) => code?.replace("x", "×");
const apiMessage = (err, fallback) => err.response?.data?.message || err.message || fallback;

const STATUS_COLOR = { PASS: "success", WARN: "warning", FAIL: "error", PENDING: "default" };

const DesignCard = ({ job, variation, picture, selected, busy, onSelect, onRegenerate, onDownload }) => {
  const { variant, theme, recipe } = variation;
  const working = ["PENDING", "RUNNING"].includes(variation.status);
  // Normal Mode and older previews are made by the app (never AI).
  const preview = job.mode !== "ai";
  // Special Die-Cut designs are named by their composition (Grand deity, …).
  const name = [variation.compositionStyle, recipe?.name || theme?.name].filter(Boolean).join(" · ");
  const palette = recipe?.palette?.length ? recipe.palette : theme?.palette || [];
  return (
    <Box
      sx={{
        flex: "1 1 220px",
        maxWidth: 320,
        borderRadius: 3,
        border: `2px solid ${selected ? GOLD : "rgba(176,141,53,0.2)"}`,
        background: "#FFFFFF",
        p: 1.5,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ background: "#F3EEE2", borderRadius: 2, minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {picture ? (
          <Box component="img" src={picture} alt={`Design ${variation.index + 1}`} sx={{ width: "100%", display: "block", borderRadius: 2 }} />
        ) : variation.status === "FAILED" ? (
          <Alert severity="error" sx={{ m: 2 }}>{variation.error || "This design could not be generated."}</Alert>
        ) : (
          <Box sx={{ textAlign: "center", color: "#7A7266" }}>
            <CircularProgress size={28} sx={{ color: GOLD }} />
            <Typography variant="body2" sx={{ mt: 1 }}>{working && !preview ? "AI is designing…" : "Composing…"}</Typography>
          </Box>
        )}
      </Box>
      <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 0.75, flexGrow: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={{ fontWeight: 700, flexGrow: 1 }}>
            Design {variation.index + 1}{name ? ` · ${name}` : ""}
          </Typography>
          {palette.map((c) => (
            <Box key={c} title={c} sx={{ width: 14, height: 14, borderRadius: "50%", background: c, border: "1px solid rgba(0,0,0,0.15)" }} />
          ))}
        </Box>
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          <Chip size="small" label={`${variant?.familyId?.code || "Layout"} · ${CUT_TYPE_LABELS[job.cutType]} ${sizeLabel(job.sizeCode)}`} />
          {job.mode === "normal" && <Chip size="small" color="info" variant="outlined" label="Normal Mode · no AI" />}
          {job.mode === "preview" && (
            <Chip
              size="small"
              color="info"
              variant="outlined"
              label={compositionMode(variant) === "FULL_ARTWORK" ? "Layout sketch · not AI" : "Normal mode · not AI"}
            />
          )}
          {job.mode === "ai" && <Chip size="small" color="secondary" variant="outlined" label="AI Mode" />}
          {variant && variant.status !== "ACTIVE" && <Chip size="small" color="warning" variant="outlined" label="Layout not activated" />}
        </Box>
        <Box sx={{ mt: "auto", pt: 1, display: "flex", gap: 1 }}>
          <Button
            fullWidth
            variant={selected ? "contained" : "outlined"}
            startIcon={selected ? <CheckCircleIcon /> : null}
            disabled={variation.status !== "DONE" || !picture}
            onClick={() => onSelect(variation.index)}
          >
            {selected ? "Selected" : "Choose this design"}
          </Button>
          {!preview && (
            <Button
              variant="text"
              startIcon={<RefreshIcon />}
              disabled={busy || working}
              onClick={() => onRegenerate(variation.index)}
              sx={{ whiteSpace: "nowrap" }}
            >
              Regenerate
            </Button>
          )}
        </Box>
        {/* Already exported earlier: download straight from the card. */}
        {variation.exportPdfUrl && (
          <Box sx={{ display: "flex", gap: 1, mt: 0.5 }}>
            <Button size="small" fullWidth variant="contained" color="success" startIcon={<DownloadIcon />} onClick={() => onDownload(variation.index, "print")}>
              Print PDF
            </Button>
            <Button size="small" fullWidth variant="outlined" color="success" startIcon={<DownloadIcon />} onClick={() => onDownload(variation.index, "cutline")}>
              Laser PDF
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
};

// Generate (2 designs) → designer chooses one → Preview → Print check → printable PDFs.
const AIDesigns = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [pollKey, setPollKey] = useState(0);
  const [previews, setPreviews] = useState({}); // key → { url, fits }
  const [productChoice, setProductChoice] = useState("original");
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [check, setCheck] = useState({ loading: false, result: null, error: "" });
  const [exporting, setExporting] = useState({ step: "", result: null, error: "" });
  const [retrying, setRetrying] = useState(false);
  // Save the chosen design as a reusable layout.
  const [saving, setSaving] = useState({ name: "", busy: false, result: null, error: "" });
  const { confirmPaid, dialog: costDialog } = useCostConfirmation();
  const composing = useRef(new Set());

  // Poll the generation until it has finished.
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const poll = async () => {
      try {
        const fresh = await getAiCalendarJob(jobId);
        if (cancelled) return;
        setJob(fresh);
        if (!FINISHED.includes(fresh.status)) timer = setTimeout(poll, POLL_MS);
      } catch (err) {
        if (!cancelled) setError(apiMessage(err, "Could not load the designs"));
      }
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, pollKey]);

  const previewKey = (v) => `${v.index}:${v.godImage}:${v.background}:${productChoice}`;

  // Compose each finished design (again when the product photo choice changes).
  useEffect(() => {
    if (!job) return;
    for (const v of job.variations) {
      const key = previewKey(v);
      if (v.status !== "DONE" || !v.variant || composing.current.has(key)) continue;
      composing.current.add(key);
      composeVariationPreview(job, v, productChoice)
        .then((p) => {
          setPreviews((all) => ({ ...all, [key]: p }));
          // Keep a picture of the finished design for the Dashboard gallery.
          if (!v.previewUrl && productChoice === "original") {
            saveAiVariationPreview(job._id, v.index, p.blob).catch(() => {});
          }
        })
        .catch(() => composing.current.delete(key));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, productChoice]);

  const backToCustomise = () =>
    job
      ? navigate(`/calendar/production/${job.selectedVariantId}${job.designId ? `?design=${job.designId}` : ""}`)
      : navigate("/layouts");

  const resetSelection = () => {
    setCheck({ loading: false, result: null, error: "" });
    setExporting({ step: "", result: null, error: "" });
    setSaving((v) => ({ ...v, busy: false, result: null, error: "" }));
  };

  const choose = (index) => {
    setSelectedIndex(index);
    resetSelection();
  };

  const regenerate = async (index) => {
    try {
      if (selectedIndex === index) {
        setSelectedIndex(null);
        resetSelection();
      }
      // One paid request: the server asks for the cost to be confirmed.
      const updated = await confirmPaid((confirmation) => regenerateAiCalendarVariation(job._id, index, confirmation));
      if (!updated) return;
      setJob(updated);
      setPollKey((k) => k + 1);
    } catch (err) {
      setError(apiMessage(err, "Could not regenerate this design"));
    }
  };

  // Same content, prompt and layout → a fresh generation.
  const tryAgain = async () => {
    setRetrying(true);
    setError("");
    try {
      const body = {
        mode: "ai",
        variantId: job.selectedVariantId,
        designId: job.designId,
        businessName: job.content.businessName,
        productList: job.content.productList,
        address: job.content.address,
        godImage: job.content.godImage,
        productImage: job.content.productImage,
        prompt: job.prompt,
        rightBoxText: job.content.rightBoxText,
        ...(job.options || {}),
      };
      const fresh = await confirmPaid((confirmation) => startAiCalendarJob({ ...body, ...confirmation }));
      if (fresh) navigate(`/calendar/designs/${fresh._id}`, { replace: true });
    } catch (err) {
      setError(apiMessage(err, "Could not start the generation"));
    } finally {
      setRetrying(false);
    }
  };

  if (error && !job) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">{error}</Alert>
        <Button sx={{ mt: 2 }} onClick={() => navigate("/layouts")}>Back to Layouts</Button>
      </Box>
    );
  }
  if (!job) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress sx={{ color: GOLD }} />
      </Box>
    );
  }

  const running = !FINISHED.includes(job.status);
  const selected = selectedIndex !== null ? job.variations[selectedIndex] : null;
  const selectedPreview = selected ? previews[previewKey(selected)] : null;
  const step = !selected ? 0 : exporting.result ? 3 : check.result ? 2 : 1;
  // Sections switched off or left empty (their space is artwork).
  const sketchJob = job.mode === "preview" && compositionMode(job.variations[0]?.variant) === "FULL_ARTWORK";
  const removedSections = disabledSections(job.variations[0]?.variant, effectiveOptions(job.variations[0]?.variant, job.options || {}, job.content || {}));

  const runCheck = async () => {
    setCheck({ loading: true, result: null, error: "" });
    setExporting({ step: "", result: null, error: "" });
    try {
      const result = await printCheckAiCalendar(job._id, selectedIndex, { textFits: selectedPreview?.fits || {}, productChoice });
      setCheck({ loading: false, result, error: "" });
    } catch (err) {
      setCheck({ loading: false, result: null, error: apiMessage(err, "Print check failed") });
    }
  };

  const runExport = async () => {
    setExporting({ step: "Starting", result: null, error: "" });
    try {
      const result = await exportVariationPdf(job, selected, { productChoice }, (s) => setExporting((e) => ({ ...e, step: s })));
      setExporting({ step: "", result, error: "" });
    } catch (err) {
      setExporting({ step: "", result: null, error: apiMessage(err, "Export failed. Your designs are kept — please try again.") });
    }
  };

  const saveLayout = async () => {
    setSaving((v) => ({ ...v, busy: true, result: null, error: "" }));
    try {
      const layout = await saveDesignAsLayout(job._id, selectedIndex, saving.name);
      setSaving((v) => ({ ...v, busy: false, result: layout }));
    } catch (err) {
      setSaving((v) => ({ ...v, busy: false, error: apiMessage(err, "Could not save the layout") }));
    }
  };

  const download = (kind) =>
    downloadAiCalendarPdf(job._id, selectedIndex, kind).catch((err) =>
      setExporting((e) => ({ ...e, error: apiMessage(err, "Download failed") })),
    );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", background: "#FAF6EC" }}>
      {costDialog}
      <AppSidebar activeKey="layouts" />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 3, py: 1.5, background: "#161616", flexWrap: "wrap" }}>
          <IconButton size="small" onClick={backToCustomise} sx={{ color: "#E9C767" }} title="Back to Customise">
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography sx={{ color: "#E9C767", fontWeight: 700 }} noWrap>
              {job.mode === "ai" ? "AI designs" : job.mode === "normal" ? "Designs · Normal Mode" : "Designs"} · {job.content.businessName || "Calendar"}
            </Typography>
            <Box sx={{ display: "flex", gap: 0.75, mt: 0.5, flexWrap: "wrap" }}>
              <Chip size="small" label={CUT_TYPE_LABELS[job.cutType]} sx={{ background: "rgba(233,199,103,0.15)", color: "#E9C767" }} />
              <Chip size="small" label={sizeLabel(job.sizeCode)} sx={{ background: "rgba(233,199,103,0.15)", color: "#E9C767" }} />
            </Box>
          </Box>
          <Button variant="outlined" onClick={backToCustomise} sx={{ color: "#E9C767", borderColor: "rgba(233,199,103,0.5)" }}>
            Edit content
          </Button>
        </Box>

        <Box sx={{ p: { xs: 2, md: 3 }, pb: 10 }}>
          <Stepper activeStep={step} alternativeLabel sx={{ mb: 3 }}>
            {["Choose a design", "Preview", "Print check", "Printable PDF"].map((label) => (
              <Step key={label}><StepLabel>{label}</StepLabel></Step>
            ))}
          </Stepper>

          {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
          {running && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ color: "#7A7266", mb: 0.5 }}>
                {job.progress} — usually about a minute. You can leave this page; the designs are saved.
              </Typography>
              <LinearProgress />
            </Box>
          )}
          {job.status === "FAILED" && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              action={
                <Button color="inherit" size="small" startIcon={<AutoAwesomeIcon />} disabled={retrying} onClick={tryAgain}>
                  Try again
                </Button>
              }
            >
              {job.error || "The designs could not be generated."} Your content is kept.
            </Alert>
          )}
          {job.adminTest && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              One-image AI test — not a customer Generate. Compare its recorded cost (AI usage ledger) with Google
              Billing and check the image quality before regular two-design AI generation is enabled.
            </Alert>
          )}
          {job.mode === "normal" && (
            <Alert severity="info" sx={{ mb: 2 }} data-testid="normal-banner">
              Normal Mode — no AI, no cost. {job.variations.length === 1 ? "This design keeps" : `These ${job.variations.length} designs keep`} the
              layout&apos;s own artwork and God picture with your text exactly as typed
              {job.variations.length > 1 ? "; they differ only in the side-box style" : ""}. Sections you switched off or left empty are
              removed with their box, border and banner.
            </Alert>
          )}
          {job.mode === "preview" && !sketchJob && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Normal mode — AI is switched off. These {job.variations.length} designs only place your content on the existing
              layout, made by the app at no cost (different colours, fonts and box styles; your God image and text are
              unchanged). They are not AI designs.
              {removedSections.length > 0 &&
                " The sections you switched off or left empty are removed and their space is filled smoothly with the surrounding layout colours — a simple app fill, not new artwork. In AI mode each design is one complete new composition instead: the deity is shown more prominently and the frame and background are extended into that space."}
            </Alert>
          )}
          {job.mode === "preview" && compositionMode(job.variations[0]?.variant) === "FULL_ARTWORK" && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Layout sketch — AI is switched off, so these are NOT designs. This Special Die-Cut layout has no fixed God
              area: its template artwork (with a sample deity) cannot be separated without AI, so it is not used here. The
              sketch only shows your God image, the approved cut shape and the text you entered. With AI, each of the{" "}
              {job.variations.length} designs is a complete new composition of your God image, frame, flowers and background
              inside this cut shape. Print Check blocks exporting a sketch.
            </Alert>
          )}
          {job.status === "PARTIAL" && (
            <Alert severity="warning" sx={{ mb: 2 }}>{job.progress}. Use “Regenerate” on the missing design.</Alert>
          )}

          {job.content.productImageEnhancedUrl && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Product photo:</Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={productChoice}
                onChange={(_, v) => {
                  if (!v) return;
                  setProductChoice(v);
                  resetSelection();
                }}
              >
                <ToggleButton value="original">Original</ToggleButton>
                <ToggleButton value="enhanced">AI enhanced</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          )}

          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {job.variations.map((v) => (
              <DesignCard
                key={v.index}
                job={job}
                variation={v}
                picture={previews[previewKey(v)]?.url}
                selected={selectedIndex === v.index}
                busy={running}
                onSelect={choose}
                onRegenerate={regenerate}
                onDownload={(index, kind) =>
                  downloadAiCalendarPdf(job._id, index, kind).catch((err) => setError(apiMessage(err, "Download failed")))
                }
              />
            ))}
          </Box>

          {selected && selectedPreview && (
            <Box sx={{ mt: 4, display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 420px" }, gap: 3, alignItems: "start" }}>
              <Box sx={{ background: "#EDE7D9", borderRadius: 2, p: 2, textAlign: "center" }}>
                <Typography sx={{ fontWeight: 700, mb: 1, textAlign: "left" }}>Preview · Design {selected.index + 1}</Typography>
                <Box
                  component="img"
                  src={selectedPreview.url}
                  alt="Selected design"
                  sx={{ maxWidth: "100%", maxHeight: "80vh", boxShadow: "0 6px 24px rgba(0,0,0,0.18)" }}
                />
              </Box>

              <Box sx={{ background: "#fff", borderRadius: 2, p: 2.5, border: "1px solid rgba(176,141,53,0.2)" }}>
                <Typography sx={{ fontWeight: 700, mb: 1 }}>Print check</Typography>
                <Button
                  variant={check.result ? "outlined" : "contained"}
                  startIcon={check.loading ? <CircularProgress size={18} color="inherit" /> : <FactCheckOutlinedIcon />}
                  disabled={check.loading || Boolean(exporting.step)}
                  onClick={runCheck}
                  fullWidth
                >
                  {check.result ? "Run print check again" : "Run print check"}
                </Button>
                {check.error && <Alert severity="error" sx={{ mt: 1.5 }}>{check.error}</Alert>}
                {check.result && (
                  <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
                    {check.result.checks.map((c) => (
                      <Box key={c.id} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                        <Chip size="small" color={STATUS_COLOR[c.status]} label={c.status} sx={{ minWidth: 76 }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.label}</Typography>
                          <Typography variant="caption" sx={{ color: "#7A7266" }}>{c.detail}</Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}

                <Typography sx={{ fontWeight: 700, mt: 3, mb: 1 }}>Save as a reusable layout</Typography>
                <Typography variant="caption" sx={{ color: "#7A7266", display: "block", mb: 1 }}>
                  {job.mode === "ai"
                    ? "Keeps this AI artwork with the layout's production geometry, so future projects reuse it without generating again."
                    : "Keeps this box style with the layout's artwork and production geometry for future projects."}{" "}
                  The original layout is not changed; the copy is a draft until it is validated and activated.
                </Typography>
                <Box sx={{ display: "flex", gap: 1 }}>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Layout name"
                    value={saving.name}
                    slotProps={{ htmlInput: { maxLength: 80, "data-testid": "save-layout-name" } }}
                    onChange={(e) => setSaving((v) => ({ ...v, name: e.target.value }))}
                  />
                  <Button
                    variant="outlined"
                    startIcon={saving.busy ? <CircularProgress size={16} color="inherit" /> : <BookmarkAddOutlinedIcon />}
                    disabled={saving.busy || !saving.name.trim() || job.mode === "preview"}
                    onClick={saveLayout}
                    data-testid="save-layout"
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    Save
                  </Button>
                </Box>
                {saving.error && <Alert severity="error" sx={{ mt: 1 }}>{saving.error}</Alert>}
                {saving.result && (
                  <Alert
                    severity="success"
                    sx={{ mt: 1 }}
                    action={
                      <Button color="inherit" size="small" onClick={() => navigate(`/calendar/production/${saving.result._id}`)}>
                        Open
                      </Button>
                    }
                  >
                    Saved as “{saving.result.name}” ({saving.result.code}) — draft, validation {saving.result.validation}.
                  </Alert>
                )}

                <Typography sx={{ fontWeight: 700, mt: 3, mb: 1 }}>Printable PDF</Typography>
                {check.result?.status === "FAIL" && (
                  <Alert severity="error" sx={{ mb: 1.5 }}>Fix the failed items before exporting.</Alert>
                )}
                <Button
                  variant="contained"
                  fullWidth
                  startIcon={exporting.step ? <CircularProgress size={18} color="inherit" /> : <PictureAsPdfOutlinedIcon />}
                  disabled={!check.result || check.result.status === "FAIL" || Boolean(exporting.step)}
                  onClick={runExport}
                >
                  {exporting.step ? `${exporting.step}…` : "Export printable PDF"}
                </Button>
                {!check.result && (
                  <Typography variant="caption" sx={{ color: "#7A7266", display: "block", mt: 0.5 }}>
                    Run the print check first.
                  </Typography>
                )}
                {exporting.error && <Alert severity="error" sx={{ mt: 1.5 }}>{exporting.error}</Alert>}
                {exporting.result && (
                  <Box sx={{ mt: 1.5 }}>
                    <Alert severity="success" sx={{ mb: 1.5 }}>
                      Ready: {exporting.result.sizeIn.width} × {exporting.result.sizeIn.height} in, PDF raster {exporting.result.artworkDpi} DPI.
                      The raster setting does not add detail to lower-resolution pictures — see the print check and notes.
                    </Alert>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => download("print")}>
                        Download print PDF
                      </Button>
                      <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => download("cutline")}>
                        Download laser cutline PDF
                      </Button>
                    </Box>
                    {[...(exporting.result.warnings || []), ...(exporting.result.pending || [])].length > 0 && (
                      <Box component="ul" sx={{ m: 0, mt: 1.5, pl: 2 }}>
                        {[...(exporting.result.warnings || []), ...(exporting.result.pending || [])].map((w) => (
                          <li key={w}><Typography variant="caption">{w}</Typography></li>
                        ))}
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default AIDesigns;
