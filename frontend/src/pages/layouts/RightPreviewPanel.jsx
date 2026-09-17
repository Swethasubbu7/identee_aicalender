import React from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Divider,
  Stack,
} from "@mui/material";

const RightPanel = ({
  selectedImage,
  onUpdateTransform,
  onFitToArea,
  onReset,
}) => {
  const handleChange = (field) => (e) => {
    const value = Number(e.target.value);
    if (Number.isNaN(value)) return;
    onUpdateTransform({ [field]: value });
  };

  return (
    <Box
      sx={{
        width: 300,
        flexShrink: 0,
        background: "#FFFFFF",
        borderLeft: "1px solid rgba(176,141,53,0.15)",
        p: 3,
      }}
    >
      <Typography variant="overline" sx={{ color: "#B08D35" }}>
        Adjustments
      </Typography>
      <Divider sx={{ my: 2 }} />

      {!selectedImage ? (
        <Typography variant="body2" sx={{ color: "#7A7266" }}>
          Select an image on the canvas to adjust it.
        </Typography>
      ) : (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1}>
            <TextField
              label="X"
              size="small"
              type="number"
              value={Math.round(selectedImage.left)}
              onChange={handleChange("left")}
            />
            <TextField
              label="Y"
              size="small"
              type="number"
              value={Math.round(selectedImage.top)}
              onChange={handleChange("top")}
            />
          </Stack>

          <TextField
            label="Rotation"
            size="small"
            type="number"
            value={Math.round(selectedImage.angle || 0)}
            onChange={handleChange("angle")}
          />

          <Button variant="contained" color="primary" onClick={onFitToArea}>
            Fit to Area
          </Button>
          <Button variant="outlined" color="primary" onClick={onReset}>
            Reset Image
          </Button>
        </Stack>
      )}

      <Divider sx={{ my: 3 }} />
      <Typography variant="overline" sx={{ color: "#B08D35" }}>
        Layers
      </Typography>
      <Box sx={{ mt: 1 }}>
        <Typography variant="body2" sx={{ color: "#7A7266" }}>
          🔒 Template (locked)
        </Typography>
        {selectedImage && (
          <Typography variant="body2" sx={{ color: "#2A2620", mt: 0.5 }}>
            🖼 Customer Image
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default RightPanel;
