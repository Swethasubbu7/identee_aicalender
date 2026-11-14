import { Box, Button, IconButton, Slider, Typography } from "@mui/material";
import RemoveIcon from "@mui/icons-material/Remove";
import AddIcon from "@mui/icons-material/Add";
import { normaliseTextSizes, TEXT_SIZE_MAX, TEXT_SIZE_MIN, TEXT_SIZE_SLOTS, TEXT_SIZE_STEP, textSizeSlotOf } from "../utils/textSizes";

// Manual text sizes (70–150 % of the automatic size) for the slots this
// layout prints: business name, text lines, left / right box text.
//   variant — layout (decides which slots exist)
//   values  — content + options ({ textSizes, show… switches, rightBoxMode })
//   onChange({ textSizes })
//   fits    — optional { regionId: { capped } } from the last preview
const TextSizeControls = ({ variant, values = {}, onChange, fits = {} }) => {
  const sizes = normaliseTextSizes(values.textSizes);
  const regions = (variant?.regions || []).filter((r) => textSizeSlotOf(r));
  const shown = (key) => {
    if (key === "rightBox") {
      return values.showRightBox !== false && values.rightBoxMode === "text" && regions.some((r) => textSizeSlotOf(r) === "rightBox");
    }
    const own = regions.filter((r) => textSizeSlotOf(r) === key);
    if (!own.length) return false;
    if (key === "businessName") return values.showBusinessName !== false;
    if (key === "leftBox") return values.showLeftBox !== false;
    if (key === "textLine1") return values.showTextLine1 !== false;
    if (key === "textLine2") return values.showTextLine2 !== false;
    if (key === "textLine3") return values.showTextLine3 !== false;
    return true;
  };
  const slots = TEXT_SIZE_SLOTS.filter((s) => shown(s.key));
  if (!slots.length) return null;
  const cappedSlot = (key) => regions.some((r) => textSizeSlotOf(r) === key && fits[r.id]?.capped);
  const set = (key, value) => onChange({ textSizes: normaliseTextSizes({ ...sizes, [key]: value }) });
  const anyChanged = Object.keys(sizes).length > 0;

  return (
    <Box data-testid="text-sizes">
      <Box sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
        <Typography variant="caption" sx={{ color: "text.secondary", flexGrow: 1 }}>
          Text size (100% = automatic fit)
        </Typography>
        <Button size="small" disabled={!anyChanged} onClick={() => onChange({ textSizes: {} })} sx={{ textTransform: "none", minWidth: 0 }}>
          Reset all
        </Button>
      </Box>
      {slots.map(({ key, label }) => {
        const value = sizes[key] ?? 100;
        return (
          <Box key={key} sx={{ mb: 0.75 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography variant="body2" sx={{ width: 104, flexShrink: 0 }}>{label}</Typography>
              <IconButton size="small" aria-label={`Smaller ${label}`} disabled={value <= TEXT_SIZE_MIN} onClick={() => set(key, value - TEXT_SIZE_STEP)}>
                <RemoveIcon fontSize="small" />
              </IconButton>
              <Slider
                size="small"
                min={TEXT_SIZE_MIN}
                max={TEXT_SIZE_MAX}
                step={TEXT_SIZE_STEP}
                value={value}
                onChange={(_, v) => set(key, v)}
                aria-label={`${label} size`}
                sx={{ mx: 0.5 }}
              />
              <IconButton size="small" aria-label={`Larger ${label}`} disabled={value >= TEXT_SIZE_MAX} onClick={() => set(key, value + TEXT_SIZE_STEP)}>
                <AddIcon fontSize="small" />
              </IconButton>
              <Typography variant="caption" sx={{ width: 38, textAlign: "right", fontWeight: value !== 100 ? 700 : 400 }}>{value}%</Typography>
            </Box>
            {value > 100 && cappedSlot(key) && (
              <Typography variant="caption" sx={{ color: "var(--mui-palette-gold-text)", display: "block", ml: "108px" }}>
                Max size for this panel — the text already fills it.
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

export default TextSizeControls;
