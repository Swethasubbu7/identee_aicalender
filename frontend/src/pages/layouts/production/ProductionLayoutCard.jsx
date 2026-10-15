import { Box, Typography, Chip, Button } from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { colors, radii } from "../../../identeeColors";
import { CUT_TYPE_LABELS } from "../../../constants/cutTypes";
import { VARIANT_STATUS } from "../../../constants/layoutRoles";

const ProductionLayoutCard = ({ variant, canEdit, onEdit, onCustomise, onDelete, deleting }) => {
  const family = variant.familyId || {};
  const status = VARIANT_STATUS[variant.status] || { label: variant.status, color: "default" };
  const isActive = variant.status === "ACTIVE";

  return (
    <Box
      sx={{
        background: "#FFFFFF",
        border: `1px solid ${colors.surfaceBorder}`,
        borderRadius: `${radii.lg}px`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <Box
        sx={{
          height: 220,
          background: "#F4F1EA",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {variant.assets?.preview ? (
          <Box
            component="img"
            src={variant.assets.preview}
            alt={family.name || "Production layout"}
            sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        ) : (
          <Typography variant="caption" sx={{ color: colors.textMuted }}>
            No preview yet
          </Typography>
        )}
      </Box>

      <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1, flexGrow: 1 }}>
        <Box>
          <Typography sx={{ fontWeight: 700, color: colors.textPrimary }} noWrap>
            {family.code || "—"}
          </Typography>
          <Typography variant="body2" sx={{ color: colors.textMuted }} noWrap>
            {family.name}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
          <Chip size="small" label={CUT_TYPE_LABELS[variant.cutType] || variant.cutType} />
          <Chip size="small" label={variant.sizeCode?.replace("x", "×")} />
          <Chip size="small" color={status.color} label={status.label} />
          {/* A reusable layout saved from a chosen design (Normal or AI Mode). */}
          {variant.design && (
            <Chip
              size="small"
              color="secondary"
              variant="outlined"
              label={variant.design.mode === "ai" ? "Saved AI design" : "Saved design"}
            />
          )}
          <Chip
            size="small"
            variant="outlined"
            color={isActive ? "success" : "default"}
            label={isActive ? "Active" : "Inactive"}
          />
        </Box>

        <Box sx={{ mt: "auto", display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            size="small"
            variant="contained"
            startIcon={<BrushOutlinedIcon />}
            onClick={() => onCustomise(variant)}
          >
            Customise
          </Button>
          {canEdit && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<EditOutlinedIcon />}
              onClick={() => onEdit(variant)}
            >
              Layout setup
            </Button>
          )}
          {/* Every layout can be deleted; approved ones ask for the layout code. */}
          {canEdit && (
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<DeleteOutlineIcon />}
              disabled={deleting}
              onClick={() => onDelete(variant)}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default ProductionLayoutCard;
