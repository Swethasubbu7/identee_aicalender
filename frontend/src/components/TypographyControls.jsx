import { Box, ListSubheader, MenuItem, TextField, Tooltip, Typography } from "@mui/material";
import { FONT_PAIRS, FONT_STYLES, TEXT_COLOURS } from "../utils/fontSets";

// Font style + text colour for every line the app prints (business name,
// text lines, product details, box text). "" = automatic.
const TypographyControls = ({ language = "english", fontStyle = "", textColour = "", onChange }) => {
  const tamil = language === "tamil";
  const styles = FONT_STYLES.filter((f) => Boolean(f.tamil) === tamil);
  const value = styles.some((f) => f.key === fontStyle) ? fontStyle : "";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <TextField
        select
        size="small"
        label="Font style"
        value={value}
        onChange={(e) => onChange({ fontStyle: e.target.value })}
        slotProps={{
          inputLabel: { shrink: true },
          select: { displayEmpty: true, MenuProps: { slotProps: { paper: { sx: { maxHeight: 360 } } } } },
        }}
      >
        <MenuItem value="">
          <em>Automatic (each design&apos;s own)</em>
        </MenuItem>
        {styles.flatMap((f, i) => {
          const pair = FONT_PAIRS[f.key];
          // A heading before each group of looks (serif, script, bold…).
          const heading =
            f.group && f.group !== styles[i - 1]?.group
              ? [
                  <ListSubheader key={`group-${f.group}`} sx={{ lineHeight: "32px", fontWeight: 700, color: "var(--mui-palette-gold-text)" }}>
                    {f.group}
                  </ListSubheader>,
                ]
              : [];
          return [
            ...heading,
            <MenuItem key={f.key} value={f.key} sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <Box
                component="span"
                sx={{ fontFamily: `"${pair.heading.family}"`, fontWeight: pair.heading.weight, fontStyle: pair.heading.style || "normal", fontSize: 19, lineHeight: 1.25 }}
              >
                {tamil ? "வணக்கம் Business" : "BUSINESS NAME"}
              </Box>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>{f.label}</Typography>
            </MenuItem>,
          ];
        })}
      </TextField>
      <Box>
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.75 }}>Text colour</Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }} role="radiogroup" aria-label="Text colour">
          <Tooltip title="Automatic (best contrast in each box)">
            <Box
              component="button"
              type="button"
              role="radio"
              aria-checked={!textColour}
              aria-label="Automatic"
              onClick={() => onChange({ textColour: "" })}
              sx={swatchSx(!textColour, "conic-gradient(#7A1F1F 0 25%, #FFF4D6 0 50%, #1F3F8C 0 75%, #B8892B 0)")}
            >
              <Box component="span" sx={{ fontSize: 10, fontWeight: 700, color: "#111", bgcolor: "rgba(255,255,255,0.85)", px: 0.4, borderRadius: "4px" }}>
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
                aria-checked={textColour === c.key}
                aria-label={c.label}
                onClick={() => onChange({ textColour: c.key })}
                sx={swatchSx(textColour === c.key, c.key)}
              />
            </Tooltip>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

const swatchSx = (selected, background) => ({
  width: 34,
  height: 34,
  borderRadius: "8px",
  cursor: "pointer",
  background,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  p: 0,
  border: "1px solid rgba(0,0,0,0.25)",
  outline: selected ? "2px solid var(--mui-palette-primary-main)" : "none",
  outlineOffset: 2,
});

export default TypographyControls;
