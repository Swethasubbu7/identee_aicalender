import React from "react";
import { Box, Typography, CircularProgress, Tooltip } from "@mui/material";

/**
 * LayoutSwitcher
 *
 * A minimal, thumbnails-only layout picker. This is the one piece of the
 * old manual LeftPanel that is intentionally kept (per "preserve Layout
 * selection"), stripped of every other manual-editing tool. Clicking a
 * thumbnail re-routes to /calendar/customise/:layoutId for that layout.
 *
 * orientation="vertical"   -> narrow fixed column (desktop)
 * orientation="horizontal" -> scrollable strip (mobile/tablet)
 */
const LayoutSwitcher = ({
  layouts,
  loading,
  currentLayoutId,
  onSelect,
  orientation = "vertical",
}) => {
  const isVertical = orientation === "vertical";

  if (loading) {
    return (
      <Box
        sx={{
          width: isVertical ? 108 : "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          py: isVertical ? 4 : 2,
        }}
      >
        <CircularProgress size={20} sx={{ color: "#B08D35" }} />
      </Box>
    );
  }

  if (!layouts || layouts.length === 0) {
    return null;
  }

  return (
    <Box
      sx={
        isVertical
          ? {
              width: 108,
              flexShrink: 0,
              height: "100%",
              overflowY: "auto",
              background: "#FFFFFF",
              borderRight: "1px solid rgba(176,141,53,0.15)",
              p: 1.25,
              display: "flex",
              flexDirection: "column",
              gap: 1.25,
            }
          : {
              width: "100%",
              overflowX: "auto",
              display: "flex",
              gap: 1,
              pb: 1,
              mb: 1,
            }
      }
    >
      {isVertical && (
        <Typography
          variant="caption"
          sx={{
            color: "#7A7266",
            fontWeight: 700,
            letterSpacing: 0.5,
            px: 0.25,
          }}
        >
          LAYOUTS
        </Typography>
      )}

      {layouts.map((item) => {
        const isActive = item._id === currentLayoutId;
        return (
          <Tooltip
            key={item._id}
            title={item.name || "Layout"}
            placement={isVertical ? "right" : "top"}
          >
            <Box
              onClick={() => !isActive && onSelect(item._id)}
              sx={{
                flexShrink: 0,
                width: isVertical ? "100%" : 72,
                cursor: isActive ? "default" : "pointer",
                borderRadius: 2,
                overflow: "hidden",
                border: isActive
                  ? "2px solid #B08D35"
                  : "2px solid transparent",
                outline: isActive ? "none" : "1px solid rgba(176,141,53,0.2)",
                transition: "transform 0.15s ease, outline-color 0.15s ease",
                "&:hover": {
                  outline: isActive ? "none" : "1px solid rgba(176,141,53,0.5)",
                },
              }}
            >
              <Box
                component="img"
                src={
                  item.previewImage ||
                  "https://placehold.co/120x150?text=No+Preview"
                }
                alt={item.name || "Layout"}
                sx={{
                  width: "100%",
                  height: isVertical ? 90 : 90,
                  objectFit: "cover",
                  display: "block",
                  background: "#EDE7D9",
                }}
              />
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
};

export default LayoutSwitcher;
