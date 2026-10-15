import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import PhotoSizeSelectLargeIcon from "@mui/icons-material/PhotoSizeSelectLarge";
import {
  getArtworkEnhancePlan,
  enhanceLayoutArtwork,
  approveArtworkCandidate,
  discardArtworkCandidate,
  getLayoutVariant,
  uploadLayoutArtwork,
} from "../../../services/layoutVariantService";
import { generateLayoutAssets } from "../../../utils/layoutAssets";
import { useCostConfirmation } from "../../../components/CostConfirmDialog";

const ACCENT = "#7d2ae8";
const verdict = (dpi) => (dpi >= 285 ? "print quality" : dpi >= 150 ? "usable, slightly soft" : "too low for print");

// Zoomed crop of an image (the same area for both, for a fair comparison).
const Crop = ({ url, label, sub }) => (
  <Box sx={{ flex: 1, minWidth: 0 }}>
    <Box
      sx={{
        height: 260,
        borderRadius: 2,
        border: "1px solid #e5e5e5",
        backgroundImage: url ? `url(${url})` : "none",
        backgroundSize: "400%",
        backgroundPosition: "50% 30%",
        backgroundColor: "#f4f4f4",
      }}
    />
    <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>{label}</Typography>
    <Typography variant="caption" sx={{ color: "text.secondary" }}>{sub}</Typography>
  </Box>
);

const Option = ({ icon, title, text, action, busy, disabled, primary, onClick }) => (
  <Box sx={{ flex: "1 1 240px", border: `1px solid ${primary ? "#d9c7fb" : "#e5e5e5"}`, borderRadius: 2.5, p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: primary ? ACCENT : "text.primary" }}>
      {icon}
      <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
    </Box>
    <Typography variant="body2" sx={{ color: "text.secondary", flexGrow: 1 }}>{text}</Typography>
    <Button
      variant={primary ? "contained" : "outlined"}
      disabled={disabled}
      onClick={onClick}
      sx={{ alignSelf: "flex-start", textTransform: "none", borderRadius: 2, ...(primary && { background: ACCENT, "&:hover": { background: "#6a1fd0" } }) }}
    >
      {busy ? "Working…" : action}
    </Button>
  </Box>
);

// Improve image quality: the real resolution, a free smooth enlargement or
// an AI enhancement (cost confirmed first), a side-by-side comparison and an
// explicit approval. Nothing replaces the artwork until it is approved.
const EnhanceDialog = ({ open, variantId, onClose, onApproved }) => {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // server message after a change
  const { confirmPaid, dialog } = useCostConfirmation();

  const load = () =>
    getArtworkEnhancePlan(variantId)
      .then(setData)
      .catch((err) => setError(err.response?.data?.message || "Could not read the image."));
  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, variantId]);

  const run = async (label, fn) => {
    setBusy(label);
    setError("");
    setResult(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "That did not work.");
    } finally {
      setBusy("");
    }
  };
  const enhance = (method) =>
    run(method, async () => {
      if (method === "ai") await confirmPaid((confirmation) => enhanceLayoutArtwork(variantId, "ai", confirmation));
      else await enhanceLayoutArtwork(variantId, "smooth");
    });
  // After any change the preview layers are rendered again and the stored
  // validation (refreshed by the server) is shown.
  const refreshLayout = async (data) => {
    const fresh = (await getLayoutVariant(variantId)).variant;
    await generateLayoutAssets(fresh).catch(() => {});
    setResult({ text: data?.message, status: data?.validation?.status || fresh.validation?.status });
    onApproved?.(fresh);
  };
  const approve = () => run("approve", async () => refreshLayout(await approveArtworkCandidate(variantId)));
  const uploadSource = (file) =>
    file && run("upload", async () => refreshLayout(await uploadLayoutArtwork(variantId, file)));

  const p = data?.plan;
  const c = data?.candidate;
  const candidateUrl = c?.url || c?.path || null;
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", fontWeight: 800 }}>
        <Box sx={{ flexGrow: 1 }}>Improve image quality</Box>
        <IconButton onClick={onClose} disabled={Boolean(busy)}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {result && (
          <Alert severity={result.status === "PASS" ? "success" : "warning"} sx={{ mb: 2 }}>
            {result.text} {result.status ? `Layout validation now: ${result.status}.` : ""}
          </Alert>
        )}
        {!p ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress sx={{ color: ACCENT }} /></Box>
        ) : (
          <>
            <Box sx={{ display: "flex", gap: 4, mb: 2, flexWrap: "wrap" }}>
              <Box>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>Now</Typography>
                <Typography sx={{ fontWeight: 700 }}>{p.source.widthPx} × {p.source.heightPx} px · {p.source.dpi} DPI</Typography>
                <Typography variant="caption" sx={{ color: p.source.dpi < 150 ? "#c62828" : "text.secondary" }}>{verdict(p.source.dpi)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>Needed for {p.target.dpi} DPI</Typography>
                <Typography sx={{ fontWeight: 700 }}>{p.target.widthPx} × {p.target.heightPx} px</Typography>
              </Box>
            </Box>

            {p.needsSource && (
              // No genuine enhancement without AI: say so plainly.
              <Alert severity="error" sx={{ mb: 2 }}>
                Genuine enhancement is not available: it needs AI, which is switched off on this server. Enlarging the
                {` ${p.source.dpi} DPI`} image cannot add real detail, so it will not fix the print-quality error. Upload a
                high-resolution export of the same artwork ({p.target.widthPx} × {p.target.heightPx} px or more, same
                proportions) instead.
              </Alert>
            )}
            <Box sx={{ mb: 2 }}>
              <Button variant="contained" component="label" disabled={Boolean(busy)} sx={{ textTransform: "none", borderRadius: 2 }}>
                {busy === "upload" ? "Uploading…" : "Upload high-resolution source"}
                <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => uploadSource(e.target.files?.[0])} />
              </Button>
            </Box>
            {!c ? (
              <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                <Option
                  icon={<PhotoSizeSelectLargeIcon />}
                  title="Smooth enlarge"
                  text={`Free, preview only: smoother on screen but no new detail (real detail stays ${p.smooth.detailDpi} DPI) — it does not fix the print-quality error.`}
                  action="Make preview"
                  busy={busy === "smooth"}
                  disabled={Boolean(busy)}
                  onClick={() => enhance("smooth")}
                />
                <Option
                  icon={<AutoAwesomeIcon />}
                  title="AI enhance"
                  text={
                    p.ai.available
                      ? `Rebuilds detail with AI — about ${p.ai.detailDpi} DPI of real detail. Est. ₹${p.ai.estimate.totalInr} incl. GST; you confirm first.`
                      : `Rebuilds detail with AI (about ${p.ai.detailDpi} DPI of real detail). Not available while AI is switched off.`
                  }
                  action="Enhance with AI"
                  busy={busy === "ai"}
                  disabled={Boolean(busy) || !p.ai.available}
                  primary
                  onClick={() => enhance("ai")}
                />
              </Box>
            ) : (
              <>
                <Box sx={{ display: "flex", gap: 2 }}>
                  <Crop url={data.sourceUrl} label="Original" sub={`${c.sourcePx} px · ${c.sourceDpi} DPI`} />
                  <Crop
                    url={candidateUrl}
                    label={c.kind === "ai-enhanced" ? "AI enhanced" : "Smooth enlarged"}
                    sub={`${c.widthPx} × ${c.heightPx} px · real detail ≈ ${c.detailDpi} DPI ${c.kind === "ai-enhanced" ? "(AI-reconstructed)" : "(no new detail)"}`}
                  />
                </Box>
                <Alert severity={c.detailDpi >= 285 ? "success" : "warning"} sx={{ mt: 2 }}>
                  {c.kind === "ai-enhanced"
                    ? c.detailDpi >= 285
                      ? "Meets print quality."
                      : `Better, but the real detail is about ${c.detailDpi} DPI — below the ${p.target.dpi} DPI print target.`
                    : "For preview only — this does not make the print sharper. Upload the original artwork for print quality."}
                </Alert>
                <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end", mt: 2 }}>
                  <Button onClick={() => run("discard", () => discardArtworkCandidate(variantId))} disabled={Boolean(busy)} sx={{ textTransform: "none" }}>
                    Discard
                  </Button>
                  <Button
                    variant="contained"
                    onClick={approve}
                    disabled={Boolean(busy)}
                    sx={{ background: ACCENT, "&:hover": { background: "#6a1fd0" }, textTransform: "none", fontWeight: 700, borderRadius: 2 }}
                  >
                    {busy === "approve" ? "Applying…" : "Use enhanced image"}
                  </Button>
                </Box>
              </>
            )}
          </>
        )}
      </DialogContent>
      {dialog}
    </Dialog>
  );
};

export default EnhanceDialog;
