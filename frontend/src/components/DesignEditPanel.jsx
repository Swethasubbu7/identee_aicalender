// AI designs, after generation: "Edit design" — the business name, the left
// side and the right side of ONE design, each edited on its own (text, size,
// colour, reset). Areas without text (a picture) are explained, not edited.
import { useState } from "react";
import { Alert, Box, Tab, Tabs, Typography } from "@mui/material";
import DesignAreaEditor from "./DesignAreaEditor";

const AREAS = [
  { key: "name", label: "Business name" },
  { key: "left", label: "Left side" },
  { key: "right", label: "Right side" },
  { key: "line1", label: "Text line 1" },
  { key: "line2", label: "Text line 2" },
];

/** Which areas this AI design has, and whether each holds text. */
const editableAreas = (job, variation) => {
  const regions = variation?.variant?.regions || [];
  const options = job.options || {};
  const content = job.content || {};
  const out = {};
  if (regions.some((r) => r.binding === "businessName") && options.showBusinessName !== false && String(content.businessName || "").trim()) {
    out.name = { text: content.businessName, multiline: false };
  }
  if (regions.some((r) => r.role === "SIDE_BOX_LEFT") && options.showLeftBox !== false) {
    out.left =
      options.leftBoxMode === "image"
        ? { picture: "The left side shows a picture — there is no text to edit." }
        : String(content.productList || "").trim()
          ? { text: content.productList, multiline: true }
          : null;
  }
  if (regions.some((r) => r.role === "SIDE_BOX_RIGHT") && options.showRightBox !== false) {
    out.right =
      options.rightBoxMode === "text"
        ? String(content.rightBoxText || "").trim()
          ? { text: content.rightBoxText, multiline: true }
          : null
        : {
            picture: content.productImage
              ? "The right side shows your product photo — there is no text to edit."
              : "The right side shows the product picture painted by the AI. It is part of the AI artwork and is not edited here.",
          };
  }
  // Text lines (e.g. the address and phone number of a layout without side boxes).
  for (const [key, role, section] of [["line1", "TEXT_LINE_1", "showTextLine1"], ["line2", "TEXT_LINE_2", "showTextLine2"]]) {
    const region = regions.find((r) => r.role === role);
    const text = region?.binding ? content[region.binding] : "";
    if (region && options[section] !== false && String(text || "").trim()) out[key] = { text, multiline: true };
  }
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
};

const regionIdsOf = (variation, area) =>
  (variation?.variant?.regions || [])
    .filter((r) =>
      area === "name"
        ? r.binding === "businessName"
        : r.role === { left: "SIDE_BOX_LEFT", right: "SIDE_BOX_RIGHT", line1: "TEXT_LINE_1", line2: "TEXT_LINE_2" }[area],
    )
    .map((r) => r.id);

const DesignEditPanel = ({ job, variation, edits, fits = {}, saving = {}, errors = {}, onChange }) => {
  const areas = editableAreas(job, variation);
  const shown = AREAS.filter((a) => areas[a.key]);
  const [tab, setTab] = useState(shown[0]?.key || "name");
  if (!shown.length) return null;
  const current = areas[tab] ? tab : shown[0].key;
  const area = areas[current];
  const capped = regionIdsOf(variation, current).some((id) => fits[id]?.capped);

  return (
    <Box data-testid="design-edit-panel">
      <Typography sx={{ fontWeight: 700 }}>Edit design</Typography>
      <Typography variant="caption" sx={{ color: "var(--nc-text-2)", display: "block", mb: 1 }}>
        Each part is edited on its own: the God image, artwork, layout and the other parts stay exactly as generated. No AI
        request.
      </Typography>
      <Tabs value={current} onChange={(_, v) => setTab(v)} variant={shown.length > 3 ? "scrollable" : "fullWidth"} scrollButtons="auto" sx={{ minHeight: 36, mb: 1.5 }}>
        {shown.map((a) => (
          <Tab key={a.key} value={a.key} label={a.label} sx={{ minHeight: 36, textTransform: "none", fontSize: 13, px: 0.5 }} />
        ))}
      </Tabs>
      {area.picture ? (
        <Alert severity="info">{area.picture}</Alert>
      ) : (
        <DesignAreaEditor
          // A fresh editor per design and area (its text box starts from the saved text).
          key={`${variation.index}:${current}`}
          label={AREAS.find((a) => a.key === current).label}
          originalText={area.text}
          multiline={area.multiline}
          value={edits?.[current] || null}
          capped={capped}
          saving={Boolean(saving[current])}
          error={errors[current] || ""}
          // The business name uses a style's heading font, the boxes its text font.
          fontRole={current === "name" ? "heading" : "body"}
          language={job.options?.language === "tamil" ? "tamil" : "english"}
          onChange={(edit) => onChange(current, edit)}
        />
      )}
    </Box>
  );
};

export default DesignEditPanel;
