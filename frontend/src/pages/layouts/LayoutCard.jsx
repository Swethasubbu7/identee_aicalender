import React, { useState } from "react";
import {
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Typography,
  Chip,
  Button,
  IconButton,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";

const TYPE_LABELS = {
  normal: "Normal",
  "special-cut": "Special Cut",
  "die-cut": "Die Cut",
};

const LayoutCard = ({
  layout,
  isSelected,
  onPreview,
  onSelect,
  onEdit,
  onDeactivate,
  deleting,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    setConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    onDeactivate(layout);
    setConfirmOpen(false);
  };

  const handleCancelDelete = () => {
    setConfirmOpen(false);
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit(layout);
  };

  return (
    <>
      <Card
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          background: "#FFFFFF",
          border: isSelected
            ? "1px solid #B08D35"
            : "1px solid rgba(176,141,53,0.15)",
          boxShadow: isSelected
            ? "0 0 0 1px rgba(176,141,53,0.3), 0 8px 24px rgba(176,141,53,0.15)"
            : "0 2px 12px rgba(0,0,0,0.06)",
          transition:
            "transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease",
          "&:hover": {
            transform: "translateY(-6px)",
            borderColor: "rgba(176,141,53,0.5)",
            boxShadow: "0 10px 28px rgba(176,141,53,0.15)",
          },
        }}
      >
        <Box sx={{ position: "relative" }}>
          <CardMedia
            component="img"
            height="220"
            image={
              layout.previewImage ||
              "https://placehold.co/600x400?text=No+Preview"
            }
            alt={layout.name}
            sx={{ objectFit: "cover", cursor: "pointer" }}
            onClick={() => onPreview?.(layout)}
          />

          {isSelected && (
            <Chip
              label="Selected"
              size="small"
              sx={{
                position: "absolute",
                top: 12,
                left: 12,
                background: "linear-gradient(135deg, #C9A227, #B08D35)",
                color: "#FFFFFF",
                fontWeight: 600,
              }}
            />
          )}

          {onEdit && (
            <IconButton
              size="small"
              onClick={handleEdit}
              sx={{
                position: "absolute",
                // FIX: previously set both `top: 8` and `bottom: 8`
                // unconditionally when isSelected was true, which stretches
                // an absolutely-positioned element with no explicit height
                // instead of just repositioning it. Now only one of
                // top/bottom is ever set at a time.
                ...(isSelected ? { bottom: 8, left: 8 } : { top: 8, left: 8 }),
                background: "rgba(255,255,255,0.9)",
                "&:hover": { background: "#FFFFFF" },
              }}
            >
              <EditIcon fontSize="small" sx={{ color: "#B08D35" }} />
            </IconButton>
          )}

          {onDeactivate && (
            <IconButton
              size="small"
              onClick={handleDeleteClick}
              disabled={deleting}
              aria-label={`Remove ${layout.name}`}
              sx={{
                position: "absolute",
                top: 8,
                right: 8,
                width: 28,
                height: 28,
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(0,0,0,0.06)",
                "&:hover": {
                  background: "#FDECEA",
                  borderColor: "rgba(192,57,43,0.4)",
                },
              }}
            >
              {deleting ? (
                <CircularProgress size={14} sx={{ color: "#C0392B" }} />
              ) : (
                <CloseIcon fontSize="small" sx={{ color: "#C0392B" }} />
              )}
            </IconButton>
          )}
        </Box>

        <CardContent sx={{ flexGrow: 1 }}>
          <Typography
            variant="h6"
            component="h3"
            gutterBottom
            sx={{ color: "#2A2620" }}
          >
            {layout.name}
          </Typography>

          <Box sx={{ display: "flex", gap: 1, mb: 1.5 }}>
            <Chip
              label={TYPE_LABELS[layout.type] || layout.type}
              size="small"
              variant="outlined"
            />
            <Chip label={layout.size} size="small" variant="outlined" />
          </Box>

          <Typography variant="body2" sx={{ color: "#7A7266" }}>
            {layout.description || "No description available."}
          </Typography>
        </CardContent>

        <CardActions sx={{ justifyContent: "space-between", px: 2, pb: 2 }}>
          <Button
            size="small"
            color="primary"
            variant="outlined"
            onClick={() => onPreview?.(layout)}
          >
            Preview
          </Button>

          <Button
            size="small"
            variant={isSelected ? "outlined" : "contained"}
            color="primary"
            onClick={() => onSelect(layout)}
          >
            {isSelected ? "Selected" : "Select Layout"}
          </Button>
        </CardActions>
      </Card>

      {/* Custom confirmation popup — replaces the native browser
          window.confirm(), which can't be restyled and always shows the
          "localhost says" prefix. */}
      <Dialog
        open={confirmOpen}
        onClose={handleCancelDelete}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, color: "#2A2620" }}>
          Remove Layout
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "#7A7266" }}>
            Remove <strong>&ldquo;{layout.name}&rdquo;</strong>? It will no
            longer appear in the layout list.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={handleCancelDelete} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmDelete}
            disabled={deleting}
            sx={{
              background: "#C0392B",
              "&:hover": { background: "#A5301F" },
            }}
          >
            {deleting ? "Removing..." : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default LayoutCard;
