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
import CloseIcon from "@mui/icons-material/Close";

const TYPE_LABELS = {
  normal: "Normal",
  "special-cut": "Special Cut",
  "die-cut": "Die Cut",
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
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {layout.name}
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
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
            maxHeight: 420,
            objectFit: "contain",
            borderRadius: 1,
            mb: 2,
            backgroundColor: "#FAF6EC",
          }}
        />
        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
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
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          color="primary"
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
