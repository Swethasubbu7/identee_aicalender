import { Alert, Box, Chip, Typography } from "@mui/material";

// What the importer found in the production PDF (and the laser PDF), and
// what still has to be mapped or confirmed by the designer. Read-only.
const STATUS = {
  AUTO: { color: "success", text: "detected" },
  CHOOSE: { color: "warning", text: "choose one" },
  LASER: { color: "warning", text: "from laser PDF" },
  CONFLICT: { color: "error", text: "files disagree" },
  MANUAL: { color: "default", text: "map manually" },
  MISSING: { color: "error", text: "missing" },
};
const LABEL = { cutline: "Cutline", cake: "Cake", text: "Text", artwork: "Artwork", godArea: "God area" };
const CONTENT = {
  vector: "vector artwork",
  mixed: "vector + images",
  flattened: "flattened (one image)",
  empty: "no artwork",
};
const VERDICT = { AUTO: "success", MANUAL: "info", DRAFT: "warning", CANNOT: "error" };

const ImportFindings = ({ summary, pageIndex }) => {
  const page = summary?.pages?.[pageIndex];
  const a = page?.analysis;
  if (!a) return null;
  const laser = summary.laser;
  // Statuses with what the laser PDF resolves (same rules as the server).
  const detected = { ...a.detected };
  const cmp = laser?.comparison;
  if (cmp?.laserChoosesCutline) detected.cutline = "AUTO";
  else if (cmp?.cutlineDeviationMm != null && cmp.cutlineDeviationMm > 2) detected.cutline = "CONFLICT";
  if (!["AUTO", "CONFLICT"].includes(detected.cutline) && laser?.analysis?.cutline && laser.analysis.cutlineSizeOk) detected.cutline = "LASER";
  if (cmp?.cakeFromLaser) detected.cake = "LASER";

  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="overline">Detected in this file</Typography>
      <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
        Page {Math.round(a.sizeMm.width)} × {Math.round(a.sizeMm.height)} mm{a.rotation ? ` (rotated ${a.rotation}°)` : ""} ·{" "}
        {CONTENT[a.content] || a.content}
        {a.artworkFlattened && a.content !== "flattened" ? " (artwork flattened)" : ""} · {a.counts.vectorPaths} paths,{" "}
        {a.counts.images} images, {a.counts.textBlocks} text
        {a.lowestDpi != null ? ` · lowest image ${a.lowestDpi} DPI` : ""}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, my: 0.75 }}>
        {Object.entries(detected).map(([key, status]) => (
          <Chip
            key={key}
            size="small"
            color={STATUS[status]?.color || "default"}
            variant={status === "AUTO" ? "filled" : "outlined"}
            label={`${LABEL[key] || key}: ${STATUS[status]?.text || status}`}
          />
        ))}
      </Box>
      {laser ? (
        <Typography variant="caption" sx={{ display: "block" }}>
          Laser PDF: cutline{" "}
          {laser.analysis.cutline
            ? `${Math.round(laser.analysis.cutline.bbox.width)} × ${Math.round(laser.analysis.cutline.bbox.height)} mm${laser.analysis.cutlineSizeOk ? "" : " (not the calendar size)"}`
            : "not found"}
          {" · "}cake {laser.analysis.cake ? "found" : "not found"}
          {cmp?.cutlineDeviationMm != null ? ` · differs from the design by ${cmp.cutlineDeviationMm} mm` : ""}
        </Typography>
      ) : (
        <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          No laser PDF yet — add one to cross-check the cutline and cake.
        </Typography>
      )}
      {a.cutline.nearMisses?.length > 0 && (
        <Typography variant="caption" sx={{ display: "block", color: "warning.dark" }}>
          Outline close to the calendar size: {a.cutline.nearMisses.map((n) => `${n.sizeMm} mm`).join(", ")} — it is used as
          drawn; confirm the size with the designer.
        </Typography>
      )}
      {a.guideLabels?.length > 0 && (
        <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          Guide labels found ({a.guideLabels.map((g) => `“${g.text}”`).join(", ")}): exclude them from print below.
        </Typography>
      )}
      {summary.verdict && (
        <Alert severity={VERDICT[summary.verdict.level] || "info"} sx={{ mt: 1, py: 0 }}>
          {summary.verdict.text}
        </Alert>
      )}
    </Box>
  );
};

export default ImportFindings;
