import { useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, Typography } from "@mui/material";
import {
  getLayoutCorrection,
  applyLayoutCorrection,
  undoLayoutCorrection,
  getLayoutVariant,
} from "../../../services/layoutVariantService";
import { generateLayoutAssets } from "../../../utils/layoutAssets";

const mm = (v) => `${Number(v).toFixed(2)} mm`;
const pct = (v) => `${v > 0 ? "+" : ""}${v}%`;

// Cutline size check and the confirmed correction (Validate step).
// Shows the outline as drawn against the nominal size, previews the
// proposed scale and applies / undoes it. The source file is never changed.
const CorrectionPanel = ({ variant, onChanged }) => {
  const [data, setData] = useState(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () =>
    getLayoutCorrection(variant._id)
      .then(setData)
      .catch((err) => setError(err.response?.data?.message || "Could not read the layout size."));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant._id]);

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn(variant._id);
      // The preview images must follow the new geometry.
      const fresh = (await getLayoutVariant(variant._id)).variant;
      await generateLayoutAssets(fresh).catch((e) => console.error("Asset refresh failed:", e));
      setChecked(false);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || "The correction failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <Alert severity="warning">{error}</Alert> : null;
  const { proposal: p, active } = data;
  const exact = Math.abs(p.diffMm.width) < 0.01 && Math.abs(p.diffMm.height) < 0.01;
  if (exact && !active) return null;

  // Both outlines in the nominal frame: as drawn (grey, dashed) and corrected (red).
  const pad = 6;
  const view = `${-pad} ${-pad} ${p.targetTrim.widthMm + 2 * pad} ${p.targetTrim.heightMm + 2 * pad}`;
  return (
    <Box sx={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 1, p: 2 }}>
      <Typography variant="overline">Cutline size</Typography>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", flexWrap: "wrap" }}>
        <svg viewBox={view} style={{ width: 150, height: 220, background: "#faf8f2", flexShrink: 0 }}>
          <rect x={0} y={0} width={p.targetTrim.widthMm} height={p.targetTrim.heightMm} fill="none" stroke="#1e88e5" strokeWidth={0.6} strokeDasharray="3 2" />
          {data.sourceCutline && <path d={data.sourceCutline} fill="none" stroke="#757575" strokeWidth={1} strokeDasharray="4 3" />}
          {data.correctedCutline && <path d={data.correctedCutline} fill="none" stroke="#e53935" strokeWidth={0.8} />}
        </svg>
        <Box sx={{ flex: 1, minWidth: 260 }}>
          <Typography variant="body2">
            As drawn in the file: <strong>{mm(p.sourceTrim.widthMm)} × {mm(p.sourceTrim.heightMm)}</strong>
          </Typography>
          <Typography variant="body2">
            Nominal size: <strong>{mm(p.targetTrim.widthMm)} × {mm(p.targetTrim.heightMm)}</strong>
          </Typography>
          <Typography variant="body2">
            Difference: {mm(p.diffMm.width)} × {mm(p.diffMm.height)} ({pct(p.percent.x)} / {pct(p.percent.y)})
          </Typography>
          <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 0.5 }}>
            Grey dashed = as drawn · red = corrected · blue = nominal size.
            {data.laserCheck?.cutlineDeviationMm != null &&
              ` The laser PDF matches the outline as drawn within ${data.laserCheck.cutlineDeviationMm} mm.`}
          </Typography>
          {active ? (
            <Box sx={{ mt: 1 }}>
              <Alert severity="success" sx={{ mb: 1 }}>
                Corrected to the nominal size (×{active.scaleX} wide, ×{active.scaleY} tall) on{" "}
                {new Date(active.confirmedAt).toLocaleString()}. Print and laser files use the corrected outline; the
                cake keeps its exact size.
              </Alert>
              <Button size="small" variant="outlined" disabled={busy} onClick={() => run(undoLayoutCorrection)}>
                Undo correction
              </Button>
            </Box>
          ) : p.allowed ? (
            <Box sx={{ mt: 1 }}>
              <Alert severity="warning" sx={{ mb: 1 }}>
                Proposed: scale the whole layout (cutline, artwork and text areas together) ×{p.scaleX} wide and ×
                {p.scaleY} tall to the nominal size. The cake keeps its exact size; only its position follows. The
                source PDF is kept and the correction can be undone.
              </Alert>
              <FormControlLabel
                control={<Checkbox size="small" checked={checked} onChange={(e) => setChecked(e.target.checked)} />}
                label={<Typography variant="body2">I checked the preview and confirm this correction.</Typography>}
              />
              <Button size="small" variant="contained" disabled={!checked || busy} onClick={() => run(applyLayoutCorrection)}>
                {busy ? "Applying…" : "Apply correction"}
              </Button>
            </Box>
          ) : (
            <Alert severity="error" sx={{ mt: 1 }}>{p.reason}</Alert>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default CorrectionPanel;
