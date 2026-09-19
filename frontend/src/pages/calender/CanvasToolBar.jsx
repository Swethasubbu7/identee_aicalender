import React from "react";
import { Box, IconButton, Tooltip, Typography, Divider } from "@mui/material";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import PanToolOutlinedIcon from "@mui/icons-material/PanToolOutlined";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";

const CanvasToolbar = ({
  canUndo,
  canRedo,
  zoomPercent,
  panActive,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onTogglePan,
  onFullscreen,
}) => {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        background: "#FFFFFF",
        border: "1px solid rgba(176,141,53,0.15)",
        borderRadius: 2,
        px: 1,
        py: 0.5,
        mb: 2,
        width: "fit-content",
      }}
    >
      <Tooltip title="Undo">
        <span>
          <IconButton size="small" onClick={onUndo} disabled={!canUndo}>
            <UndoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Redo">
        <span>
          <IconButton size="small" onClick={onRedo} disabled={!canRedo}>
            <RedoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      <Tooltip title="Zoom out">
        <IconButton size="small" onClick={onZoomOut}>
          <ZoomOutIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Typography
        variant="caption"
        sx={{ minWidth: 40, textAlign: "center", color: "#2A2620" }}
      >
        {zoomPercent}%
      </Typography>
      <Tooltip title="Zoom in">
        <IconButton size="small" onClick={onZoomIn}>
          <ZoomInIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      <Tooltip title={panActive ? "Pan mode on" : "Pan tool"}>
        <IconButton
          size="small"
          onClick={onTogglePan}
          sx={{
            background: panActive ? "rgba(176,141,53,0.15)" : "transparent",
          }}
        >
          <PanToolOutlinedIcon
            fontSize="small"
            sx={{ color: panActive ? "#B08D35" : "inherit" }}
          />
        </IconButton>
      </Tooltip>
      <Tooltip title="Fullscreen">
        <IconButton size="small" onClick={onFullscreen}>
          <FullscreenIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default CanvasToolbar;
