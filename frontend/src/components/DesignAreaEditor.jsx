// AI designs, after generation: edit ONE area of one design — its text, size
// and colour. Only that area changes; the AI picture, the layout and every
// other area stay exactly as generated (the app draws each area on its own).
import { useEffect, useRef, useState } from "react";
import { Box, Button, IconButton, ListSubheader, MenuItem, Slider, TextField, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { FONT_STYLES, STYLE_FONT_PAIRS, TEXT_COLOURS, requestStyleFonts } from "../utils/fontSets";
import { TEXT_SIZE_MAX, TEXT_SIZE_MIN, TEXT_SIZE_STEP } from "../utils/textSizes";

export const EDIT_TEXT_MAX = 300; // backend constants/typography.js

const swatchSx = (selected, background) => ({
  width: 30,
  height: 30,
  borderRadius: "8px",
  cursor: "pointer",
  background,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  p: 0,
  border: "1px solid rgba(0,0,0,0.25)",
  outline: selected ? "2px solid #B08D35" : "none",
  outlineOffset: 2,
});

// Only what differs from the generated design is kept.
const clean = (edit, originalText) => {
  const next = { ...(edit || {}) };
  if (!next.colour) delete next.colour;
  if (!next.fontStyle) delete next.fontStyle;
  if (next.size == null) delete next.size;
  if (next.text == null || !String(next.text).trim() || next.text === originalText) delete next.text;
  return Object.keys(next).length ? next : null;
};

/**
 * label:        "Business name" | "Left side" | "Right side"
 * originalText: the area's text as generated
 * multiline:    box text (line breaks allowed)
 * value:        the saved edit { text?, size?, colour?, fontStyle? } (null = as generated)
 * fontRole:     "heading" (business name) or "body" (box text): which font of a style is used
 * language:     "tamil" lists the Tamil font styles
 * capped:       the text already fills its own area
 * onChange:     (edit | null) => void
 */
const DesignAreaEditor = ({
  label,
  originalText = "",
  multiline = false,
  value,
  capped = false,
  saving = false,
  error = "",
  fontRole = "body",
  language = "english",
  onChange,
}) => {
  const size = value?.size ?? 100;
  const colour = value?.colour || "";
  const tamil = language === "tamil";
  const styles = FONT_STYLES.filter((f) => Boolean(f.tamil) === tamil);
  const fontStyle = styles.some((f) => f.key === value?.fontStyle) ? value.fontStyle : "";
  // The menu shows every style in the font this area would use.
  useEffect(() => requestStyleFonts(styles.map((f) => f.key)), [tamil]); // eslint-disable-line react-hooks/exhaustive-deps
  const sample = (originalText || label).split(/\n/)[0].slice(0, 28);
  const [draft, setDraft] = useState(value?.text ?? originalText);
  const typing = useRef(null);
  const set = (patch) => onChange(clean({ ...(value || {}), ...patch }, originalText));
  const setSize = (v) => set({ size: Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, v)) });
  // Typed text is applied after a short pause (the design is drawn again).
  const changeText = (text) => {
    setDraft(text);
    clearTimeout(typing.current);
    typing.current = setTimeout(() => set({ text }), 450);
  };
  const reset = () => {
    clearTimeout(typing.current);
    setDraft(originalText);
    onChange(null);
  };
  const empty = !String(draft || "").trim();

  return (
    <Box data-testid={`edit-${label}`}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
        <Typography sx={{ fontWeight: 700, flexGrow: 1 }}>{label}</Typography>
        <Button size="small" disabled={!value && draft === originalText} onClick={reset} sx={{ textTransform: "none", minWidth: 0 }}>
          Reset
        </Button>
      </Box>

      <TextField
        label="Text"
        size="small"
        fullWidth
        multiline={multiline}
        minRows={multiline ? 2 : 1}
        maxRows={6}
        value={draft}
        onChange={(e) => changeText(e.target.value.slice(0, EDIT_TEXT_MAX))}
        error={empty}
        helperText={empty ? "Empty text keeps the generated text." : multiline ? "Long text wraps inside the box." : " "}
        sx={{ mt: 0.5 }}
      />

      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>Size (100% = as generated)</Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <IconButton size="small" aria-label={`Smaller ${label}`} disabled={size <= TEXT_SIZE_MIN} onClick={() => setSize(size - TEXT_SIZE_STEP)}>
          <RemoveIcon fontSize="small" />
        </IconButton>
        <Slider
          size="small"
          min={TEXT_SIZE_MIN}
          max={TEXT_SIZE_MAX}
          step={TEXT_SIZE_STEP}
          value={size}
          onChange={(_, v) => setSize(v)}
          aria-label={`${label} size`}
          sx={{ mx: 0.5 }}
        />
        <IconButton size="small" aria-label={`Larger ${label}`} disabled={size >= TEXT_SIZE_MAX} onClick={() => setSize(size + TEXT_SIZE_STEP)}>
          <AddIcon fontSize="small" />
        </IconButton>
        <Typography variant="caption" sx={{ width: 40, textAlign: "right", fontWeight: 700 }}>{size}%</Typography>
      </Box>
      {capped && (
        <Typography variant="caption" sx={{ color: "var(--nc-gold-text)", display: "block" }}>
          Max size for this area — the text already fills it (it never grows over other parts).
        </Typography>
      )}

      <TextField
        select
        size="small"
        fullWidth
        label="Font"
        value={fontStyle}
        onChange={(e) => set({ fontStyle: e.target.value })}
        sx={{ mt: 1.5 }}
        slotProps={{
          inputLabel: { shrink: true },
          select: { displayEmpty: true, MenuProps: { slotProps: { paper: { sx: { maxHeight: 360 } } } } },
        }}
      >
        <MenuItem value="">
          <em>As generated</em>
        </MenuItem>
        {styles.flatMap((f, i) => {
          const font = STYLE_FONT_PAIRS[f.key]?.[fontRole] || STYLE_FONT_PAIRS[f.key]?.heading;
          const heading =
            f.group && f.group !== styles[i - 1]?.group
              ? [
                  <ListSubheader key={`group-${f.group}`} sx={{ lineHeight: "30px", fontWeight: 700, color: "var(--nc-gold-text)" }}>
                    {f.group}
                  </ListSubheader>,
                ]
              : [];
          return [
            ...heading,
            <MenuItem key={f.key} value={f.key} sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <Box
                component="span"
                sx={{ fontFamily: `"${font.family}"`, fontWeight: font.weight, fontStyle: font.style || "normal", fontSize: 18, lineHeight: 1.25 }}
              >
                {sample}
              </Box>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>{f.label}</Typography>
            </MenuItem>,
          ];
        })}
      </TextField>

      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1.5, mb: 0.75 }}>Colour</Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, alignItems: "center" }} role="radiogroup" aria-label={`${label} colour`}>
        <Tooltip title="As generated">
          <Box
            component="button"
            type="button"
            role="radio"
            aria-checked={!colour}
            aria-label="As generated"
            onClick={() => set({ colour: "" })}
            sx={swatchSx(!colour, "conic-gradient(#7A1F1F 0 25%, #FFF4D6 0 50%, #1F3F8C 0 75%, #B8892B 0)")}
          >
            <Box component="span" sx={{ fontSize: 9, fontWeight: 700, color: "#2A2620", bgcolor: "rgba(255,255,255,0.85)", px: 0.3, borderRadius: "4px" }}>
              Auto
            </Box>
          </Box>
        </Tooltip>
        {TEXT_COLOURS.map((c) => (
          <Tooltip key={c.key} title={c.label}>
            <Box
              component="button"
              type="button"
              role="radio"
              aria-checked={colour === c.key}
              aria-label={c.label}
              onClick={() => set({ colour: c.key })}
              sx={swatchSx(colour === c.key, c.key)}
            />
          </Tooltip>
        ))}
        <Tooltip title="Any colour">
          <Box
            component="input"
            type="color"
            aria-label={`Custom ${label} colour`}
            value={colour || "#7A1F1F"}
            onChange={(e) => set({ colour: e.target.value.toUpperCase() })}
            sx={{ width: 34, height: 32, p: 0, border: "none", background: "none", cursor: "pointer" }}
          />
        </Tooltip>
      </Box>
      {(saving || error) && (
        <Typography variant="caption" sx={{ display: "block", mt: 1, color: error ? "error.main" : "var(--nc-text-2)" }}>
          {error || "Saving…"}
        </Typography>
      )}
    </Box>
  );
};

export default DesignAreaEditor;
