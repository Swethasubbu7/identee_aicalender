import { useState } from "react";
import { Alert, Box, Button, Typography } from "@mui/material";
import {
  uploadLayoutArtwork,
  removeLayoutArtwork,
  getLayoutVariant,
} from "../../../services/layoutVariantService";
import { generateLayoutAssets } from "../../../utils/layoutAssets";
import EnhanceDialog from "./EnhanceDialog";

const TARGET_DPI = 300;
const MIN_DPI = 150;
const px = (mm) => Math.round((mm / 25.4) * TARGET_DPI);

// Artwork quality check (Validate step): is the layout's artwork sharp
// enough for its print size, and the ways to get better artwork in the app.
const ArtworkPanel = ({ variant, onChanged }) => {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(null);
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const raster = (variant.artworkRasters || []).slice().sort((a, b) => a.dpi - b.dpi)[0] || null;
  const override = variant.assets?.artworkOverride || null;
  const region = (variant.regions || []).find((r) => r.role === "BACKGROUND_AREA") || (variant.regions || []).find((r) => r.role === "FRAME");
  if (!raster && !override) return null;

  const run = async (label, fn) => {
    setBusy(label);
    setMessage(null);
    try {
      const data = await fn();
      const fresh = (await getLayoutVariant(variant._id)).variant;
      await generateLayoutAssets(fresh).catch((e) => console.error("Asset refresh failed:", e));
      setMessage({ severity: "success", text: data.message });
      onChanged?.();
    } catch (err) {
      setMessage({ severity: "error", text: err.response?.data?.message || "The artwork update failed." });
    } finally {
      setBusy("");
    }
  };

  const verdict = (dpi) =>
    dpi >= TARGET_DPI * 0.95
      ? { severity: "success", text: `meets the ${TARGET_DPI} DPI print target` }
      : dpi >= MIN_DPI
        ? { severity: "warning", text: `below the ${TARGET_DPI} DPI target (usable, slightly soft)` }
        : { severity: "error", text: `too low for print (minimum ${MIN_DPI} DPI)` };
  const target = region ? `${px(region.box.width)} × ${px(region.box.height)} px` : `${TARGET_DPI} DPI`;

  return (
    <Box sx={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 1, p: 2 }}>
      <Typography variant="overline">Artwork quality</Typography>
      {raster && (
        <Typography variant="body2">
          Artwork in the PDF: {raster.widthPx} × {raster.heightPx} px over {raster.widthMm} × {raster.heightMm} mm ={" "}
          <strong>{raster.dpi} DPI</strong> — {verdict(raster.dpi).text}.
        </Typography>
      )}
      <Typography variant="body2">For {TARGET_DPI} DPI this area needs <strong>{target}</strong>.</Typography>
      {override?.kind === "replacement" && (
        <Alert severity={verdict(override.dpi).severity} sx={{ mt: 1 }}>
          Replacement artwork {override.widthPx} × {override.heightPx} px = {override.dpi} DPI — {verdict(override.dpi).text}.
          {override.aspectMismatchPercent > 1 ? ` Its proportions differ by ${override.aspectMismatchPercent}% (stretched to fit).` : ""}
        </Alert>
      )}
      {override?.kind === "ai-enhanced" && (
        <Alert severity={override.detailDpi >= 285 ? "success" : "warning"} sx={{ mt: 1 }}>
          AI-enhanced artwork in use ({override.widthPx} × {override.heightPx} px). Real detail about {override.detailDpi} DPI,
          reconstructed by AI from {override.sourcePx} px.
        </Alert>
      )}
      {override?.kind === "upscaled" && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          <strong>Upscaled preview</strong> ({override.sourcePx} → {override.widthPx} × {override.heightPx} px). This is the same
          {` ${override.sourceDpi} DPI`} detail enlarged: it looks smoother on screen but is NOT genuine {TARGET_DPI}-DPI artwork and
          does not pass the print-quality check.
        </Alert>
      )}
      <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 1 }}>
        Better artwork: upload a high-resolution export of the same design (same artboard), or — once AI is enabled — let
        Generate paint new artwork for this die-cut shape.
      </Typography>
      {message && <Alert severity={message.severity} sx={{ mt: 1 }}>{message.text}</Alert>}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
        <Button size="small" variant="contained" component="label" disabled={Boolean(busy) || !region}>
          {busy === "upload" ? "Uploading…" : "Upload high-resolution artwork"}
          <input
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(e) => e.target.files?.[0] && run("upload", () => uploadLayoutArtwork(variant._id, e.target.files[0]))}
          />
        </Button>
        {raster && (
          <Button size="small" variant="outlined" disabled={Boolean(busy)} onClick={() => setEnhanceOpen(true)}>
            Improve image quality
          </Button>
        )}
        {override && (
          <Button size="small" disabled={Boolean(busy)} onClick={() => run("remove", () => removeLayoutArtwork(variant._id))}>
            Use the PDF&apos;s artwork again
          </Button>
        )}
      </Box>
      <EnhanceDialog open={enhanceOpen} variantId={variant._id} onClose={() => setEnhanceOpen(false)} onApproved={() => onChanged?.()} />
    </Box>
  );
};

export default ArtworkPanel;
