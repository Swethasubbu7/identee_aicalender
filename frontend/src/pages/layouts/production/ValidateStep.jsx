import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, Chip, CircularProgress, Alert, Typography, Divider } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import {
  validateLayoutVariant,
  activateLayoutVariant,
  deactivateLayoutVariant,
  reextractLayoutVariant,
  getLayoutVariant,
} from "../../../services/layoutVariantService";
import { generateLayoutAssets } from "../../../utils/layoutAssets";
import { CUT_TYPE_LABELS } from "../../../constants/cutTypes";
import CorrectionPanel from "./CorrectionPanel";
import ArtworkPanel from "./ArtworkPanel";

const STATUS_COLOR = { PASS: "success", FAIL: "error", PENDING: "warning", WARN: "warning" };

const ResultList = ({ title, results, note }) => (
  <Box>
    <Typography variant="overline">{title}</Typography>
    {note && (
      <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mb: 1 }}>
        {note}
      </Typography>
    )}
    {results.length === 0 ? (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>No checks.</Typography>
    ) : (
      results.map((r, i) => (
        <Box key={`${r.code}-${i}`} sx={{ display: "flex", gap: 1, alignItems: "flex-start", py: 0.5 }}>
          <Chip size="small" color={STATUS_COLOR[r.status]} label={r.status} sx={{ minWidth: 76 }} />
          <Typography variant="body2">{r.message}</Typography>
        </Box>
      ))
    )}
  </Box>
);

// Step 3: run the layout checks, then activate / deactivate.
const ValidateStep = ({ variant, onChanged, onBackToMapping }) => {
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState(variant.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [details, setDetails] = useState(false);
  // Kept in a ref so a parent re-render never re-triggers validation.
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  const runValidation = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const data = await validateLayoutVariant(variant._id);
      setResult(data);
      setStatus(data.variantStatus);
      onChangedRef.current?.();
    } catch (err) {
      setError(err.response?.data?.message || "Validation failed to run.");
    } finally {
      setBusy(false);
    }
  }, [variant._id]);

  useEffect(() => {
    runValidation();
  }, [runValidation]);

  const act = async (fn) => {
    setBusy(true);
    setError("");
    try {
      const data = await fn(variant._id);
      setStatus(data.variant?.status || data.status);
      onChangedRef.current?.();
    } catch (err) {
      setError(err.response?.data?.message || "Action failed.");
      if (err.response?.data?.results) setResult((r) => ({ ...r, results: err.response.data.results, status: "FAIL" }));
    } finally {
      setBusy(false);
    }
  };

  // Re-read the production PDF and regenerate the preview, the text-free
  // plate and the text colours used by the designer's live preview.
  const refreshAssets = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const re = await reextractLayoutVariant(variant._id);
      const fresh = (await getLayoutVariant(variant._id)).variant;
      await generateLayoutAssets(fresh);
      setStatus(fresh.status);
      setNotice(`${re.message}. Preview assets regenerated.`);
      onChangedRef.current?.();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Refreshing preview assets failed.");
    } finally {
      setBusy(false);
    }
  };

  const results = result?.results || [];
  const structure = results.filter((r) => r.stage === "STRUCTURE");
  const production = results.filter((r) => r.stage === "PRODUCTION");
  const problems = structure.filter((r) => r.status === "FAIL");
  const has = (code) => problems.some((r) => r.code === code);
  const correctionActive = Boolean(variant.geometryCorrection?.active);
  const artworkOverride = variant.assets?.artworkOverride;
  const pendingPrinter = production.filter((r) => r.status === "PENDING").length;
  const ready = result?.status === "PASS";

  return (
    <Box sx={{ maxWidth: 760, mx: "auto", width: "100%", display: "flex", flexDirection: "column", gap: 2 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {busy && !result && <CircularProgress sx={{ alignSelf: "center", color: "#7d2ae8" }} />}

      {result && (
        <Box sx={{ background: "#fff", borderRadius: 3, p: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            {ready ? <CheckCircleIcon sx={{ fontSize: 40, color: "#2e7d32" }} /> : <ErrorOutlineIcon sx={{ fontSize: 40, color: "#ef6c00" }} />}
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {status === "ACTIVE" ? "Published" : ready ? "Ready to publish" : `${problems.length} thing${problems.length === 1 ? "" : "s"} to fix`}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {variant.familyId?.code} · {CUT_TYPE_LABELS[variant.cutType]} · {variant.sizeCode?.replace("x", "×")}
              </Typography>
            </Box>
            {status === "ACTIVE" ? (
              <Button variant="outlined" color="warning" onClick={() => act(deactivateLayoutVariant)} disabled={busy} sx={{ textTransform: "none", borderRadius: 2 }}>
                Unpublish
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={() => act(activateLayoutVariant)}
                disabled={busy || !ready}
                sx={{ background: "#7d2ae8", "&:hover": { background: "#6a1fd0" }, textTransform: "none", fontWeight: 700, borderRadius: 2 }}
              >
                Publish
              </Button>
            )}
          </Box>
          {problems.length > 0 && (
            <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 0.75 }}>
              {problems.map((r, i) => (
                <Box key={`${r.code}-${i}`} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: "50%", background: "#ef6c00", flexShrink: 0 }} />
                  <Typography variant="body2">{friendly(r)}</Typography>
                </Box>
              ))}
              <Button size="small" onClick={onBackToMapping} sx={{ alignSelf: "flex-start", textTransform: "none", mt: 0.5 }}>
                Go back to setup
              </Button>
            </Box>
          )}
          {pendingPrinter > 0 && (
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 1.5 }}>
              Printer settings are still to be confirmed — this doesn&apos;t stop publishing.
            </Typography>
          )}
        </Box>
      )}

      {variant.mapping && (has("TRIM_SIZE") || correctionActive) && <CorrectionPanel variant={variant} onChanged={runValidation} />}
      {variant.mapping && (has("ARTWORK_RESOLUTION") || artworkOverride || results.some((r) => r.code === "ARTWORK_RESOLUTION" && r.status === "WARN")) && (
        <ArtworkPanel variant={variant} onChanged={runValidation} />
      )}

      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
        <Button size="small" onClick={refreshAssets} disabled={busy} sx={{ textTransform: "none" }}>Refresh preview</Button>
        <Button size="small" onClick={runValidation} disabled={busy} sx={{ textTransform: "none" }}>Check again</Button>
        <Button size="small" onClick={() => setDetails((d) => !d)} sx={{ textTransform: "none", color: "text.secondary" }}>
          {details ? "Hide" : "Technical"} details
        </Button>
      </Box>
      {details && result && (
        <Box sx={{ background: "#fff", borderRadius: 2, p: 2 }}>
          <ResultList title="Layout checks" results={structure} />
          <Divider sx={{ my: 1 }} />
          <ResultList title="Printer checks" results={production} />
        </Box>
      )}
    </Box>
  );
};

// Validation messages in plain words for the summary.
const ROLE_WORDS = {
  NAME_TEXT: "business name",
  TEXT_LINE_1: "text line 1",
  TEXT_LINE_2: "text line 2",
  CALENDAR_AREA: "calendar pad",
  CAKE_MOUNT: "calendar pad",
  GOD_AREA: "god picture area",
  FRAME: "frame",
  SIDE_BOX_LEFT: "left box",
  SIDE_BOX_RIGHT: "right box",
};
const friendly = (r) => {
  switch (r.code) {
    case "TRIM_SIZE":
      return "The cut shape is slightly off the calendar size — fix it below.";
    case "ARTWORK_RESOLUTION":
      return "The image quality is too low for printing — improve it below.";
    case "ARTWORK_REGION":
      return "The background artwork is mapped to a small element — select the main artwork image (Set up → Background artwork).";
    case "CUTLINE_PRESENT":
      return "The cut shape is missing.";
    case "CUTLINE_ALIGNMENT":
      return "Confirm that the cut outline sits on the design's edge.";
    case "LASER_MATCH":
      return "The cutting file doesn't match the design.";
    case "LASER_CAKE":
      return "The calendar pad in the cutting file doesn't match the design.";
    case "CAKE_MOUNT_SIZE":
      return "The calendar pad isn't the right size for this calendar.";
    case "CAKE_SIZE_CONFIRMED":
      return "The calendar pad size for this calendar isn't confirmed yet.";
    case "TEXT_STYLE":
      return "Choose a font for the text (Advanced setup).";
    case "REQUIRED_REGION": {
      const role = /Missing (\w+) region/.exec(r.message)?.[1];
      if (role && ROLE_WORDS[role]) return `Select the ${ROLE_WORDS[role]}.`;
      return /artwork/i.test(r.message) ? "Select the background artwork." : r.message;
    }
    default:
      return r.message;
  }
};

export default ValidateStep;
