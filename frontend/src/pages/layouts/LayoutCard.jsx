import React from "react";
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
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
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
}) => {
  const handleDelete = (e) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Remove "${layout.name}"? It will no longer appear in the layout list.`,
    );
    if (confirmed) {
      onDeactivate(layout);
    }
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit(layout);
  };

  return (
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
          onClick={() => onPreview(layout)}
        />

        {isSelected && (
          <Chip
            label="Selected"
            size="small"
            sx={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "linear-gradient(135deg, #C9A227, #B08D35)",
              color: "#FFFFFF",
              fontWeight: 600,
            }}
          />
        )}

        <Box
          sx={{
            position: "absolute",
            top: 12,
            left: 12,
            display: "flex",
            gap: 0.5,
          }}
        >
          {onEdit && (
            <IconButton
              size="small"
              onClick={handleEdit}
              sx={{
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
              onClick={handleDelete}
              sx={{
                background: "rgba(255,255,255,0.9)",
                "&:hover": { background: "#FFF0F0" },
              }}
            >
              <DeleteIcon fontSize="small" sx={{ color: "#C0392B" }} />
            </IconButton>
          )}
        </Box>
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
          onClick={() => onPreview(layout)}
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
  );
};

export default LayoutCard;
