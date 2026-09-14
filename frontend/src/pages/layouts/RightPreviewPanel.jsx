import React from "react";
import { Box, Typography, Chip, Button, Divider } from "@mui/material";

const TYPE_LABELS = { normal: "Normal", "special-cut": "Special Cut" };

const RightPreviewPanel = ({ layout, isSelected, onSelect }) => {
  return (
    <Box
      sx={{
        width: 320,
        flexShrink: 0,
        height: "100vh",
        position: "sticky",
        top: 0,
        borderLeft: "1px solid rgba(176,141,53,0.2)",
        background: "#FFFFFF",
        p: 3,
        overflowY: "auto",
      }}
    >
      {!layout ? (
        <Box sx={{ mt: 10, textAlign: "center" }}>
          <Typography variant="body2" sx={{ color: "#B7AE9C" }}>
            Click a layout's Preview to see details here.
          </Typography>
        </Box>
      ) : (
        <>
          <Box
            component="img"
            src={
              layout.previewImage ||
              "https://placehold.co/500x600?text=No+Preview"
            }
            alt={layout.name}
            sx={{ width: "100%", borderRadius: 2, mb: 2, objectFit: "cover" }}
          />

          <Typography variant="h6" sx={{ color: "#2A2620", mb: 1 }}>
            {layout.name}
          </Typography>

          <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
            <Chip
              label={TYPE_LABELS[layout.type] || layout.type}
              size="small"
              variant="outlined"
            />
            <Chip label={layout.size} size="small" variant="outlined" />
          </Box>

          <Divider sx={{ borderColor: "rgba(176,141,53,0.2)", mb: 2 }} />

          <Typography variant="body2" sx={{ color: "#7A7266", mb: 3 }}>
            {layout.description || "No description available."}
          </Typography>

          <Button
            fullWidth
            variant="contained"
            color="primary"
            disabled={isSelected}
            onClick={() => onSelect(layout)}
          >
            {isSelected ? "Already Selected" : "Select This Layout"}
          </Button>
        </>
      )}
    </Box>
  );
};

export default RightPreviewPanel;
