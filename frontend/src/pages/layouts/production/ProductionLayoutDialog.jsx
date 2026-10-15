import { useEffect, useState } from "react";
import { Dialog, IconButton, Box, CircularProgress, Alert, Typography, Button } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import UploadStep from "./UploadStep";
import SetupStudio from "./SetupStudio";
import MappingStep from "./MappingStep";
import ValidateStep from "./ValidateStep";
import { getLayoutVariant } from "../../../services/layoutVariantService";

const STEPS = ["Upload", "Set up", "Check & publish"];
const ACCENT = "#7d2ae8";

// Add / edit a production layout without leaving the Layouts page.
// variantId = null → start at upload; otherwise open the existing layout.
// The parent mounts a fresh instance (keyed by variantId) each time it opens.
const fetchVariant = (id) => getLayoutVariant(id).then((data) => data.variant);

const ProductionLayoutDialog = ({ open, variantId, onClose, onChanged }) => {
  const [step, setStep] = useState(0);
  const [variant, setVariant] = useState(null);
  const [loadingId, setLoadingId] = useState(variantId || null);
  const [error, setError] = useState("");
  const [advanced, setAdvanced] = useState(false);

  const applyLoaded = (loaded, nextStep) => {
    setVariant(loaded);
    setStep(nextStep ?? (loaded.mapping ? 2 : 1));
  };
  const applyError = (err) => setError(err.response?.data?.message || "Could not load the layout.");

  const loadVariant = (id, nextStep) => {
    setLoadingId(id);
    setError("");
    fetchVariant(id)
      .then((loaded) => applyLoaded(loaded, nextStep))
      .catch(applyError)
      .finally(() => setLoadingId(null));
  };

  useEffect(() => {
    if (!variantId) return;
    let cancelled = false;
    fetchVariant(variantId)
      .then((loaded) => !cancelled && applyLoaded(loaded))
      .catch((err) => !cancelled && applyError(err))
      .finally(() => !cancelled && setLoadingId(null));
    return () => {
      cancelled = true;
    };
  }, [variantId]);

  const handleImported = (id) => {
    onChanged?.();
    loadVariant(id, 1);
  };
  const handleSaved = (saved, { stay = false } = {}) => {
    onChanged?.();
    if (stay) setVariant(saved);
    else loadVariant(saved._id, 2);
  };
  const canGo = (i) => variant && (i === 1 || (i === 2 && variant.mapping));

  return (
    <Dialog open={open} onClose={onClose} fullScreen slotProps={{ paper: { sx: { background: "#f7f7f8" } } }}>
      {/* Top bar */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 2.5, py: 1.25, background: "#fff", borderBottom: "1px solid #ececec" }}>
        <Typography sx={{ fontWeight: 800, minWidth: 180 }} noWrap>
          {variant?.familyId?.name || variant?.familyId?.code || "New layout"}
        </Typography>
        <Box sx={{ flexGrow: 1, display: "flex", justifyContent: "center", gap: 1 }}>
          {STEPS.map((label, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <Button
                key={label}
                size="small"
                disabled={!canGo(i) || i === step}
                onClick={() => setStep(i)}
                startIcon={done ? <CheckIcon fontSize="small" /> : null}
                sx={{
                  borderRadius: 5,
                  px: 2,
                  textTransform: "none",
                  fontWeight: 700,
                  color: current ? "#fff !important" : done ? ACCENT : "text.secondary",
                  background: current ? ACCENT : done ? "rgba(125,42,232,0.08)" : "transparent",
                }}
              >
                {i + 1}. {label}
              </Button>
            );
          })}
        </Box>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column", p: step === 1 ? 1.5 : 3, overflow: step === 1 ? "hidden" : "auto" }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loadingId ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress sx={{ color: ACCENT }} />
          </Box>
        ) : (
          <>
            {step === 0 && <UploadStep onImported={handleImported} />}
            {step === 1 && variant && !advanced && (
              <Box sx={{ flexGrow: 1, minHeight: 0 }}>
                <SetupStudio key={`${variant._id}-${variant.version}`} variant={variant} onSaved={handleSaved} onAdvanced={() => setAdvanced(true)} />
              </Box>
            )}
            {step === 1 && variant && advanced && (
              <Box sx={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                <Button size="small" onClick={() => setAdvanced(false)} sx={{ alignSelf: "flex-start", textTransform: "none", mb: 1 }}>
                  ← Back to simple setup
                </Button>
                <Box sx={{ flexGrow: 1, minHeight: 0 }}>
                  <MappingStep key={`${variant._id}-${variant.version}`} variant={variant} onSaved={handleSaved} />
                </Box>
              </Box>
            )}
            {step === 2 && variant && (
              <ValidateStep key={`${variant._id}-${variant.version}`} variant={variant} onChanged={onChanged} onBackToMapping={() => setStep(1)} />
            )}
          </>
        )}
      </Box>
    </Dialog>
  );
};

export default ProductionLayoutDialog;
