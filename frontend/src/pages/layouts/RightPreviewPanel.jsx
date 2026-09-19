import React, { useState } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Divider,
  Stack,
  IconButton,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
  Slider,
  Tabs,
  Tab,
} from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

const FILTERS = [
  { key: "original", label: "Original" },
  { key: "brightness", label: "Brightness" },
  { key: "contrast", label: "Contrast" },
  { key: "saturation", label: "Saturation" },
];

const STYLE_OPTIONS = [
  "Traditional Devotional",
  "Modern Minimal",
  "Elegant Border",
  "Floral Style",
  "Premium Look",
];

const RightPreviewPanel = ({
  selectedImage,
  onUpdateTransform,
  onFitToArea,
  onReset,
  onApplyFilter,
  year,
  language,
  monthStyle,
  onSettingsChange,
}) => {
  const [tab, setTab] = useState("manual");
  const [lockAspect, setLockAspect] = useState(true);
  const [activeFilter, setActiveFilter] = useState("original");

  // AI Generate tab (mock) state
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState(STYLE_OPTIONS[0]);
  const [generating, setGenerating] = useState(false);

  const currentWidth = selectedImage
    ? Math.round((selectedImage.width || 0) * (selectedImage.scaleX || 1))
    : 0;
  const currentHeight = selectedImage
    ? Math.round((selectedImage.height || 0) * (selectedImage.scaleY || 1))
    : 0;

  const handlePositionChange = (field) => (e) => {
    const value = Number(e.target.value);
    if (Number.isNaN(value)) return;
    onUpdateTransform({ [field]: value });
  };

  const handleWidthChange = (e) => {
    const newWidth = Number(e.target.value);
    if (Number.isNaN(newWidth) || !selectedImage?.width) return;
    const scaleX = newWidth / selectedImage.width;
    const scaleY = lockAspect ? scaleX : selectedImage.scaleY || 1;
    onUpdateTransform({ scaleX, scaleY });
  };

  const handleHeightChange = (e) => {
    const newHeight = Number(e.target.value);
    if (Number.isNaN(newHeight) || !selectedImage?.height) return;
    const scaleY = newHeight / selectedImage.height;
    const scaleX = lockAspect ? scaleY : selectedImage.scaleX || 1;
    onUpdateTransform({ scaleX, scaleY });
  };

  const handleRotationChange = (e, value) =>
    onUpdateTransform({ angle: value });

  const handleFilterClick = (key) => {
    setActiveFilter(key);
    onApplyFilter?.(key);
  };

  const handleMockGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      onApplyFilter?.("brightness"); // stand-in visual effect for the mock generation
    }, 1800);
  };

  return (
    <Box
      sx={{
        width: 330,
        flexShrink: 0,
        background: "#FFFFFF",
        borderLeft: "1px solid rgba(176,141,53,0.15)",
        overflowY: "auto",
        maxHeight: "calc(100vh - 65px)",
      }}
    >
      <Tabs
        value={tab}
        onChange={(e, v) => setTab(v)}
        variant="fullWidth"
        sx={{
          minHeight: 40,
          "& .MuiTab-root": {
            minHeight: 40,
            textTransform: "none",
            fontSize: 13,
          },
          "& .Mui-selected": { color: "#B08D35 !important" },
          "& .MuiTabs-indicator": { backgroundColor: "#B08D35" },
        }}
      >
        <Tab value="manual" label="Manual Adjust" />
        <Tab value="ai" label="✨ AI Generate" />
      </Tabs>

      <Box sx={{ p: 3 }}>
        {tab === "manual" ? (
          <>
            {!selectedImage ? (
              <Typography variant="body2" sx={{ color: "#7A7266" }}>
                Select an image on the canvas to adjust it.
              </Typography>
            ) : (
              <>
                <Typography
                  variant="subtitle2"
                  sx={{ color: "#2A2620", mb: 1 }}
                >
                  Position &amp; Size
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                  <TextField
                    label="X"
                    size="small"
                    type="number"
                    value={Math.round(selectedImage.left)}
                    onChange={handlePositionChange("left")}
                  />
                  <TextField
                    label="Y"
                    size="small"
                    type="number"
                    value={Math.round(selectedImage.top)}
                    onChange={handlePositionChange("top")}
                  />
                </Stack>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mb: 2 }}
                >
                  <TextField
                    label="Width"
                    size="small"
                    type="number"
                    value={currentWidth}
                    onChange={handleWidthChange}
                  />
                  <TextField
                    label="Height"
                    size="small"
                    type="number"
                    value={currentHeight}
                    onChange={handleHeightChange}
                  />
                  <Tooltip
                    title={
                      lockAspect
                        ? "Aspect ratio locked"
                        : "Aspect ratio unlocked"
                    }
                  >
                    <IconButton
                      size="small"
                      onClick={() => setLockAspect((v) => !v)}
                    >
                      {lockAspect ? (
                        <LockOutlinedIcon
                          fontSize="small"
                          sx={{ color: "#B08D35" }}
                        />
                      ) : (
                        <LockOpenOutlinedIcon
                          fontSize="small"
                          sx={{ color: "#7A7266" }}
                        />
                      )}
                    </IconButton>
                  </Tooltip>
                </Stack>

                <Typography
                  variant="subtitle2"
                  sx={{ color: "#2A2620", mb: 1 }}
                >
                  Rotation
                </Typography>
                <Stack
                  direction="row"
                  spacing={2}
                  alignItems="center"
                  sx={{ mb: 3 }}
                >
                  <Slider
                    size="small"
                    min={-180}
                    max={180}
                    value={Math.round(selectedImage.angle || 0)}
                    onChange={handleRotationChange}
                    sx={{ color: "#B08D35" }}
                  />
                  <Typography
                    variant="body2"
                    sx={{ minWidth: 40, color: "#2A2620" }}
                  >
                    {Math.round(selectedImage.angle || 0)}°
                  </Typography>
                </Stack>

                <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
                  <Button
                    fullWidth
                    variant="contained"
                    color="primary"
                    onClick={onFitToArea}
                  >
                    Fit to Area
                  </Button>
                  <Button
                    fullWidth
                    variant="outlined"
                    color="primary"
                    onClick={onReset}
                  >
                    Reset
                  </Button>
                </Stack>

                <Divider sx={{ mb: 2 }} />

                <Typography
                  variant="subtitle2"
                  sx={{ color: "#2A2620", mb: 1 }}
                >
                  Image Filters
                </Typography>
                <ToggleButtonGroup
                  value={activeFilter}
                  exclusive
                  onChange={(e, val) => val && handleFilterClick(val)}
                  size="small"
                  sx={{ flexWrap: "wrap", mb: 3 }}
                >
                  {FILTERS.map((f) => (
                    <ToggleButton
                      key={f.key}
                      value={f.key}
                      sx={{ textTransform: "none" }}
                    >
                      {f.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </>
            )}

            <Divider sx={{ mb: 2 }} />

            <Typography variant="subtitle2" sx={{ color: "#2A2620", mb: 1 }}>
              Calendar Settings
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Year"
                size="small"
                type="number"
                value={year}
                onChange={(e) =>
                  onSettingsChange?.({ year: Number(e.target.value) })
                }
              />
              <FormControl size="small" fullWidth>
                <InputLabel id="language-label">Language</InputLabel>
                <Select
                  labelId="language-label"
                  label="Language"
                  value={language}
                  onChange={(e) =>
                    onSettingsChange?.({ language: e.target.value })
                  }
                >
                  <MenuItem value="english">English</MenuItem>
                  <MenuItem value="tamil">Tamil</MenuItem>
                </Select>
              </FormControl>
              <ToggleButtonGroup
                value={monthStyle}
                exclusive
                onChange={(e, val) =>
                  val && onSettingsChange?.({ monthStyle: val })
                }
                size="small"
                fullWidth
              >
                <ToggleButton value="full" sx={{ textTransform: "none" }}>
                  Full Month
                </ToggleButton>
                <ToggleButton value="short" sx={{ textTransform: "none" }}>
                  Short Form
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          </>
        ) : (
          <>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <AutoAwesomeIcon sx={{ color: "#B08D35" }} fontSize="small" />
              <Typography variant="subtitle2" sx={{ color: "#2A2620" }}>
                AI Image Generation
              </Typography>
            </Box>
            <Typography
              variant="caption"
              sx={{ color: "#A9A296", display: "block", mb: 2 }}
            >
              Mock mode — no real AI provider connected yet. This simulates the
              flow.
            </Typography>

            <Typography
              variant="body2"
              sx={{ color: "#2A2620", fontWeight: 600, mb: 1 }}
            >
              1. Upload Image
            </Typography>
            <Box sx={{ mb: 2 }}>
              {selectedImage ? (
                <Typography variant="caption" sx={{ color: "#7A7266" }}>
                  Using the currently selected image on canvas.
                </Typography>
              ) : (
                <Typography variant="caption" sx={{ color: "#A9A296" }}>
                  Add an image first (Tools → Images) to generate from it.
                </Typography>
              )}
            </Box>

            <Typography
              variant="body2"
              sx={{ color: "#2A2620", fontWeight: 600, mb: 1 }}
            >
              2. Designer Prompt
            </Typography>
            <TextField
              multiline
              rows={4}
              fullWidth
              placeholder="Create a traditional and devotional look, keep the subject centered..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, 500))}
              sx={{ mb: 0.5 }}
            />
            <Typography
              variant="caption"
              sx={{
                color: "#A9A296",
                display: "block",
                textAlign: "right",
                mb: 2,
              }}
            >
              {prompt.length}/500
            </Typography>

            <Typography
              variant="body2"
              sx={{ color: "#2A2620", fontWeight: 600, mb: 1 }}
            >
              3. Style
            </Typography>
            <FormControl size="small" fullWidth sx={{ mb: 3 }}>
              <Select value={style} onChange={(e) => setStyle(e.target.value)}>
                {STYLE_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              fullWidth
              variant="contained"
              color="primary"
              disabled={!selectedImage || generating}
              onClick={handleMockGenerate}
              startIcon={<AutoAwesomeIcon />}
            >
              {generating ? "Generating..." : "Generate (5 credits)"}
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
};

export default RightPreviewPanel;
