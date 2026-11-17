import { useEffect, useState } from "react";
import { Dialog, IconButton, Box, CircularProgress, Alert, Typography, Button } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import UploadStep from "./UploadStep";
import SetupStudio from "./SetupStudio";
import { getLayoutVariant } from "../../../services/layoutVariantService";

// Two steps only: upload the Production PDF + Laser PDF (analysed
// automatically), then review what was detected and save. The print checks
// run automatically after saving, on the review screen.
const STEPS = ["Upload PDFs", "Review & save"];
const ACCENT = "#7d2ae8";

// Add / edit a production layout without leaving the Layouts page.
// variantId = null → start at upload; otherwise open the existing layout.
// The parent mounts a fresh instance (keyed by variantId) each time it opens.
const fetchVariant = (id) => getLayoutVariant(id).then((data) => data.variant);

const ProductionLayoutDialog = ({ open, variantId, onClose, onChanged }) => {
  const [step, setStep] = useState(variantId ? 1 : 0);
  const [variant, setVariant] = useState(null);
  const [loadingId, setLoadingId] = useState(variantId || null);
  const [error, setError] = useState("");
  // A layout just uploaded is finished automatically (saved, checked, published).
  const [justImported, setJustImported] = useState(false);

  const applyError = (err) => setError(err.response?.data?.message || "Could not load the layout.");

  const loadVariant = (id) => {
    setLoadingId(id);
    setError("");
    fetchVariant(id)
      .then((loaded) => {
        setVariant(loaded);
        setStep(1);
      })
      .catch(applyError)
      .finally(() => setLoadingId(null));
  };

  useEffect(() => {
    if (!variantId) return;
    let cancelled = false;
    fetchVariant(variantId)
      .then((loaded) => !cancelled && setVariant(loaded))
      .catch((err) => !cancelled && applyError(err))
      .finally(() => !cancelled && setLoadingId(null));
    return () => {
      cancelled = true;
    };
  }, [variantId]);

  const handleImported = (id, { fresh = true } = {}) => {
    setJustImported(fresh);
    onChanged?.();
    loadVariant(id);
  };
  const handleSaved = (saved) => {
    onChanged?.();
    setVariant(saved);
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen slotProps={{ paper: { sx: { background: "var(--nc-surface-2)" } } }}>
      {/* Top bar */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 2.5, py: 1.25, background: "var(--nc-paper)", borderBottom: "1px solid var(--nc-border-neutral)", flexWrap: "wrap" }}>
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
                disabled
                startIcon={done ? <CheckIcon fontSize="small" /> : null}
                sx={{
                  borderRadius: 5,
                  px: 2,
                  textTransform: "none",
                  fontWeight: 700,
                  color: current ? "#fff !important" : done ? `${ACCENT} !important` : "text.secondary",
                  background: current ? ACCENT : done ? "rgba(125,42,232,0.08)" : "transparent",
                }}
              >
                {i + 1}. {label}
              </Button>
            );
          })}
        </Box>
        <IconButton onClick={onClose} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column", p: step === 1 ? 1.5 : 3, overflow: step === 1 ? "hidden" : "auto" }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loadingId ? (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, py: 8 }}>
            <CircularProgress sx={{ color: ACCENT }} />
            <Typography variant="body2" sx={{ color: "text.secondary" }}>Analysing the layout…</Typography>
          </Box>
        ) : (
          <>
            {step === 0 && <UploadStep onImported={handleImported} />}
            {step === 1 && variant && (
              <Box sx={{ flexGrow: 1, minHeight: 0 }}>
                {/* Keyed by layout only: saving keeps this screen (and its check result). */}
                <SetupStudio key={variant._id} variant={variant} onSaved={handleSaved} onChanged={onChanged} auto={justImported} />
              </Box>
            )}
          </>
        )}
      </Box>
    </Dialog>
  );
};

export default ProductionLayoutDialog;
