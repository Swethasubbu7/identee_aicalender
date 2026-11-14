import { Box, FormControlLabel, Switch, Typography } from "@mui/material";
import { getContentSlots } from "../../utils/contentSlots";
import { layoutSections, SECTION_LABELS } from "../../utils/sectionAreas";
import TypographyControls from "../../components/TypographyControls";
import TamilTypingField from "../../components/TamilTypingField";
import TextSizeControls from "../../components/TextSizeControls";
import { readablePt } from "../../utils/textSizes";

const MAX_LENGTH = { businessName: 200, productList: 2000, address: 500, textLine3: 200, rightBoxText: 1000 };

// Business details of an already-generated design: the text, font style,
// text colour and which optional sections show. The design itself (deity,
// frame, background, composition) never changes; edits re-render live.
//   values — job content + options with the designer's edits
const DesignDetailsPanel = ({ variant, values, onChange, status, fits = {} }) => {
  // The smallest size a field's text came out at on this design (pt).
  const smallest = (slot) => {
    const sizes = (slot.regions || []).map((r) => fits[r.id]?.fittedPt).filter((v) => v > 0);
    return sizes.length ? Math.min(...sizes) : null;
  };
  const slots = getContentSlots(variant).filter((s) => s.kind === "text");
  const sections = layoutSections(variant);
  const shown = (slot) => !slot.section || values[slot.section] !== false;
  const rightText = sections.includes("showRightBox") && values.showRightBox !== false && values.rightBoxMode === "text";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75 }} data-testid="design-details">
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography sx={{ fontWeight: 700, flexGrow: 1 }}>Business details</Typography>
        <Typography variant="caption" sx={{ color: "var(--mui-palette-text-secondary)" }}>{status}</Typography>
      </Box>
      <Typography variant="caption" sx={{ color: "var(--mui-palette-text-secondary)", mt: -1 }}>
        Change the customer&apos;s details on this design — free, no new AI image. The artwork stays exactly as generated.
      </Typography>
      {slots.filter(shown).map((slot) => (
        <Box key={slot.key}>
        <TamilTypingField
          tamil={values.language === "tamil"}
          size="small"
          label={slot.label}
          fullWidth
          multiline={slot.multiline}
          minRows={slot.multiline ? 3 : undefined}
          value={values[slot.key] || ""}
          onChange={(v) => onChange({ [slot.key]: v })}
          slotProps={{ htmlInput: { maxLength: MAX_LENGTH[slot.key] || 2000 } }}
        />
        {smallest(slot) !== null && smallest(slot) < readablePt(slot.key) && (
          <Typography variant="caption" sx={{ color: "var(--mui-palette-error-main)", display: "block", mt: 0.5 }}>
            Too long to read clearly ({smallest(slot).toFixed(1)} pt) — shorten this text or put it on one line.
          </Typography>
        )}
        </Box>
      ))}
      {rightText && (
        <TamilTypingField
          tamil={values.language === "tamil"}
          size="small"
          label="Right box · Text"
          fullWidth
          multiline
          minRows={3}
          value={values.rightBoxText || ""}
          onChange={(v) => onChange({ rightBoxText: v })}
          slotProps={{ htmlInput: { maxLength: MAX_LENGTH.rightBoxText } }}
        />
      )}
      <TypographyControls language={values.language} fontStyle={values.fontStyle || ""} textColour={values.textColour || ""} onChange={onChange} />
      <TextSizeControls variant={variant} values={values} onChange={onChange} fits={fits} />
      {sections.length > 0 && (
        <Box>
          <Typography variant="caption" sx={{ color: "var(--mui-palette-text-secondary)", display: "block" }}>Show on the calendar</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 1 }}>
            {sections.map((key) => (
              <FormControlLabel
                key={key}
                control={<Switch size="small" checked={values[key] !== false} onChange={(e) => onChange({ [key]: e.target.checked })} />}
                label={<Typography variant="body2">{SECTION_LABELS[key]}</Typography>}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default DesignDetailsPanel;
