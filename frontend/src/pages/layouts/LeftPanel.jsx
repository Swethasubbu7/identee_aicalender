import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Typography,
  Divider,
  Tooltip,
  CircularProgress,
  IconButton,
} from "@mui/material";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import TextFieldsOutlinedIcon from "@mui/icons-material/TextFieldsOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import AutoAwesomeMosaicOutlinedIcon from "@mui/icons-material/AutoAwesomeMosaicOutlined";
import FontDownloadOutlinedIcon from "@mui/icons-material/FontDownloadOutlined";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import ContentCutOutlinedIcon from "@mui/icons-material/ContentCutOutlined";
import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import { getLayouts } from "../../services/layoutService";

const TOOLS = [
  { key: "tools", label: "Tools", icon: BuildOutlinedIcon, enabled: true },
  { key: "text", label: "Text", icon: TextFieldsOutlinedIcon, enabled: false },
  { key: "images", label: "Images", icon: ImageOutlinedIcon, enabled: true },
  {
    key: "calendar",
    label: "Calendar",
    icon: CalendarMonthOutlinedIcon,
    enabled: false,
  },
  {
    key: "elements",
    label: "Elements",
    icon: AutoAwesomeMosaicOutlinedIcon,
    enabled: false,
  },
  {
    key: "fonts",
    label: "Fonts",
    icon: FontDownloadOutlinedIcon,
    enabled: false,
  },
  { key: "colors", label: "Colors", icon: PaletteOutlinedIcon, enabled: false },
  {
    key: "cutshape",
    label: "Cut / Shape",
    icon: ContentCutOutlinedIcon,
    enabled: false,
  },
  {
    key: "layout",
    label: "Layout",
    icon: DashboardCustomizeOutlinedIcon,
    enabled: true,
  },
  {
    key: "history",
    label: "History",
    icon: HistoryOutlinedIcon,
    enabled: false,
  },
];

const LeftPanel = ({
  currentLayoutId,
  onAddImage,
  onTemplateChange,
  hasUnsavedChanges,
  hasCustomerImage,
  customerImageVisible,
  onToggleCustomerImageVisibility,
  onRemoveCustomerImage,
  onDuplicateCustomerImage,
}) => {
  const [activeTool, setActiveTool] = useState("tools");
  const [layouts, setLayouts] = useState([]);
  const [loadingLayouts, setLoadingLayouts] = useState(true);

  const addImageInputRef = useRef(null);

  useEffect(() => {
    const fetchLayouts = async () => {
      try {
        setLoadingLayouts(true);
        const data = await getLayouts({});
        setLayouts(data.layouts || []);
      } catch (err) {
        console.error("Failed to load layouts for sidebar:", err);
      } finally {
        setLoadingLayouts(false);
      }
    };
    fetchLayouts();
  }, []);

  const handleToolClick = (tool) => {
    if (!tool.enabled) return;
    setActiveTool(tool.key);
    if (tool.key === "images") {
      addImageInputRef.current?.click();
    }
  };

  const handleAddImageFile = (e) => {
    const file = e.target.files?.[0];
    if (file) onAddImage(file);
    e.target.value = "";
  };

  const handleTemplateClick = (layout) => {
    if (layout._id === currentLayoutId) return;
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        "Changing the template may remove current customizations. Continue?",
      );
      if (!confirmed) return;
    }
    onTemplateChange?.(layout._id);
  };

  return (
    <Box
      sx={{
        width: 260,
        flexShrink: 0,
        background: "#161616",
        color: "#F5F1E6",
        p: 2.5,
        overflowY: "auto",
        maxHeight: "calc(100vh - 65px)",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <Box>
        <Typography
          variant="overline"
          sx={{ color: "#E9C767", letterSpacing: 1 }}
        >
          Tools
        </Typography>
        <Divider sx={{ my: 1, borderColor: "rgba(201,162,39,0.15)" }} />
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeTool === tool.key;
            const row = (
              <Box
                key={tool.key}
                onClick={() => handleToolClick(tool)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.5,
                  py: 1,
                  borderRadius: 1.5,
                  cursor: tool.enabled ? "pointer" : "not-allowed",
                  opacity: tool.enabled ? 1 : 0.35,
                  background: isActive
                    ? "rgba(201,162,39,0.15)"
                    : "transparent",
                  "&:hover": tool.enabled
                    ? { background: "rgba(201,162,39,0.1)" }
                    : {},
                }}
              >
                <Icon
                  fontSize="small"
                  sx={{ color: isActive ? "#E9C767" : "#A9A296" }}
                />
                <Typography
                  variant="body2"
                  sx={{ color: isActive ? "#E9C767" : "#A9A296" }}
                >
                  {tool.label}
                </Typography>
              </Box>
            );
            return tool.enabled ? (
              row
            ) : (
              <Tooltip
                key={tool.key}
                title="Coming in a later phase"
                placement="right"
              >
                <span>{row}</span>
              </Tooltip>
            );
          })}
        </Box>
      </Box>

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        ref={addImageInputRef}
        onChange={handleAddImageFile}
      />

      <Box>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 1,
          }}
        >
          <Typography
            variant="overline"
            sx={{ color: "#E9C767", letterSpacing: 1 }}
          >
            Layouts
          </Typography>
        </Box>
        {loadingLayouts ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <CircularProgress size={20} sx={{ color: "#B08D35" }} />
          </Box>
        ) : (
          <Box
            sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}
          >
            {layouts.slice(0, 6).map((l) => (
              <Box
                key={l._id}
                onClick={() => handleTemplateClick(l)}
                sx={{
                  borderRadius: 1.5,
                  overflow: "hidden",
                  cursor: "pointer",
                  border:
                    l._id === currentLayoutId
                      ? "2px solid #E9C767"
                      : "1px solid rgba(201,162,39,0.2)",
                }}
              >
                <Box
                  component="img"
                  src={l.previewImage || "https://placehold.co/100x130?text=?"}
                  alt={l.name}
                  sx={{
                    width: "100%",
                    height: 60,
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Box>
        <Typography
          variant="overline"
          sx={{ color: "#E9C767", letterSpacing: 1 }}
        >
          Layers
        </Typography>
        <Divider sx={{ my: 1, borderColor: "rgba(201,162,39,0.15)" }} />

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            py: 1,
            px: 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <VisibilityOutlinedIcon
              fontSize="small"
              sx={{ color: "#A9A296" }}
            />
            <Typography variant="body2" sx={{ color: "#A9A296" }}>
              Calendar Template
            </Typography>
          </Box>
          <LockOutlinedIcon fontSize="small" sx={{ color: "#736C5F" }} />
        </Box>

        {hasCustomerImage && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              py: 1,
              px: 1,
              borderRadius: 1,
              background: "rgba(201,162,39,0.08)",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <IconButton
                size="small"
                onClick={onToggleCustomerImageVisibility}
              >
                {customerImageVisible ? (
                  <VisibilityOutlinedIcon
                    fontSize="small"
                    sx={{ color: "#E9C767" }}
                  />
                ) : (
                  <VisibilityOffOutlinedIcon
                    fontSize="small"
                    sx={{ color: "#736C5F" }}
                  />
                )}
              </IconButton>
              <Typography variant="body2" sx={{ color: "#F5F1E6" }}>
                Customer Image
              </Typography>
            </Box>
          </Box>
        )}

        <Box sx={{ display: "flex", gap: 0.5, mt: 1.5 }}>
          <Tooltip title="Add Image">
            <IconButton
              size="small"
              onClick={() => addImageInputRef.current?.click()}
              sx={{ color: "#A9A296" }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete selected layer">
            <span>
              <IconButton
                size="small"
                onClick={onRemoveCustomerImage}
                disabled={!hasCustomerImage}
                sx={{ color: "#A9A296" }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Duplicate selected layer">
            <span>
              <IconButton
                size="small"
                onClick={onDuplicateCustomerImage}
                disabled={!hasCustomerImage}
                sx={{ color: "#A9A296" }}
              >
                <ContentCopyOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );
};

export default LeftPanel;
