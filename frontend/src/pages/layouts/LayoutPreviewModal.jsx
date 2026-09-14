import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  IconButton,
} from "@mui/material";

const TYPE_LABELS = {
  normal: "Normal",
  "special-cut": "Special Cut",
};

const LayoutPreviewModal = ({
  layout,
  open,
  onClose,
  onSelect,
  isSelected,
}) => {
  if (!layout) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {layout.name}
        <IconButton onClick={onClose} size="small" aria-label="Close preview">
          <Typography sx={{ fontSize: 20, lineHeight: 1 }}>✕</Typography>
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Box
          component="img"
          src={
            layout.previewImage ||
            "https://placehold.co/800x600?text=No+Preview"
          }
          alt={layout.name}
          sx={{
            width: "100%",
            maxHeight: 500,
            objectFit: "contain",
            borderRadius: 1,
            mb: 2,
            backgroundColor: "grey.100",
          }}
        />

        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          <Chip label={TYPE_LABELS[layout.type] || layout.type} size="small" />
          <Chip label={layout.size} size="small" variant="outlined" />
        </Box>

        <Typography variant="body1" color="text.secondary">
          {layout.description || "No description available."}
        </Typography>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          disabled={isSelected}
          onClick={() => onSelect(layout)}
        >
          {isSelected ? "Already Selected" : "Select This Layout"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LayoutPreviewModal;
