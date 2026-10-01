import React, { useRef } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  ToggleButtonGroup,
  ToggleButton,
  Switch,
  FormControlLabel,
  Divider,
  CircularProgress,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import ChangeCircleOutlinedIcon from "@mui/icons-material/ChangeCircleOutlined";

/**
 * AIGeneratePanel
 *
 * Primary (and now only) customisation panel for the Calendar Customisation
 * page. Replaces the old manual "Manual Adjust" panel. All manual
 * text/image/element/font/colour/shape/layout/history editing tools have
 * been intentionally removed from this UI — the editor is AI-first.
 *
 * The underlying manual-edit logic (transform/filter/layer APIs) still
 * lives on CalendarWorkspace's imperative handle and is NOT deleted; this
 * panel simply no longer calls into it.
 */
const AIGeneratePanel = ({
  // Customer image
  uploadedImagePreview,
  hasCustomerImage,
  onUploadImage,
  onRemoveImage,

  // Designer prompt
  designerPrompt,
  onDesignerPromptChange,

  // Layout / cut type
  cutType,
  onCutTypeChange,

  // Year / Language / Calendar format
  year,
  onYearChange,
  language,
  onLanguageChange,
  monthStyle,
  onMonthStyleChange,

  // AI theme matching
  aiThemeMatching,
  onAiThemeMatchingChange,

  // Generate
  onGenerate,
  generating,
}) => {
  const fileInputRef = useRef(null);

  const handleFilePicked = (e) => {
    const file = e.target.files?.[0];
    if (file) onUploadImage(file);
    // reset so selecting the same file again still fires onChange
    e.target.value = "";
  };

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#FFFFFF",
      }}
    >
      <Box
        sx={{
          px: 2.5,
          py: 2,
          borderBottom: "1px solid rgba(176,141,53,0.15)",
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <AutoAwesomeIcon sx={{ color: "#B08D35" }} fontSize="small" />
        <Typography sx={{ color: "#2A2620", fontWeight: 700 }}>
          AI Generate
        </Typography>
      </Box>

      <Box sx={{ flexGrow: 1, overflowY: "auto", px: 2.5, py: 2.5 }}>
        {/* 1. Customer Image Upload */}
        <Typography
          variant="caption"
          sx={{ color: "#7A7266", fontWeight: 700, letterSpacing: 0.5 }}
        >
          CUSTOMER IMAGE
        </Typography>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleFilePicked}
        />

        {uploadedImagePreview ? (
          <Box sx={{ mt: 1.5 }}>
            <Box
              sx={{
                width: "100%",
                borderRadius: 2,
                overflow: "hidden",
                border: "1px solid rgba(176,141,53,0.25)",
              }}
            >
              <Box
                component="img"
                src={uploadedImagePreview}
                alt="Uploaded customer"
                sx={{
                  width: "100%",
                  height: 140,
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </Box>
            <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
              <Button
                size="small"
                fullWidth
                variant="outlined"
                startIcon={<ChangeCircleOutlinedIcon />}
                sx={{ color: "#B08D35", borderColor: "rgba(176,141,53,0.4)" }}
                onClick={() => fileInputRef.current?.click()}
              >
                Replace
              </Button>
              <IconButton
                size="small"
                onClick={onRemoveImage}
                sx={{
                  border: "1px solid rgba(176,141,53,0.3)",
                  color: "#c0392b",
                }}
              >
                <DeleteOutlinedIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        ) : (
          <Button
            fullWidth
            variant="outlined"
            startIcon={<CloudUploadOutlinedIcon />}
            sx={{
              mt: 1.5,
              color: "#B08D35",
              borderColor: "rgba(176,141,53,0.4)",
              borderStyle: "dashed",
              py: 1.5,
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload Image
          </Button>
        )}

        <Divider sx={{ my: 2.5, borderColor: "rgba(176,141,53,0.15)" }} />

        {/* 2. Designer Prompt */}
        <Typography
          variant="caption"
          sx={{ color: "#7A7266", fontWeight: 700, letterSpacing: 0.5 }}
        >
          DESIGNER PROMPT
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={3}
          placeholder='e.g. "Increase image resolution and add Swetha Garments text at the bottom."'
          value={designerPrompt}
          onChange={(e) => onDesignerPromptChange(e.target.value)}
          sx={{ mt: 1.5 }}
        />

        <Divider sx={{ my: 2.5, borderColor: "rgba(176,141,53,0.15)" }} />

        {/* 3. Layout Type */}
        <Typography
          variant="caption"
          sx={{ color: "#7A7266", fontWeight: 700, letterSpacing: 0.5 }}
        >
          LAYOUT TYPE
        </Typography>
        <ToggleButtonGroup
          value={cutType}
          exclusive
          fullWidth
          size="small"
          onChange={(e, val) => val && onCutTypeChange(val)}
          sx={{ mt: 1.5, flexWrap: "wrap" }}
        >
          <ToggleButton value="normal" sx={{ textTransform: "none", flex: 1 }}>
            Normal
          </ToggleButton>
          <ToggleButton value="die-cut" sx={{ textTransform: "none", flex: 1 }}>
            Die Cut
          </ToggleButton>
          <ToggleButton
            value="special-cut"
            sx={{ textTransform: "none", flex: 1 }}
          >
            Special Cut
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider sx={{ my: 2.5, borderColor: "rgba(176,141,53,0.15)" }} />

        {/* 4. Year & 5. Language */}
        <Box sx={{ display: "flex", gap: 2 }}>
          <TextField
            label="Year"
            type="number"
            fullWidth
            value={year}
            onChange={(e) => onYearChange(Number(e.target.value))}
          />
          <FormControl fullWidth>
            <InputLabel id="language-select-label">Language</InputLabel>
            <Select
              labelId="language-select-label"
              label="Language"
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
            >
              <MenuItem value="english">English</MenuItem>
              <MenuItem value="tamil">Tamil</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* 6. Calendar Format */}
        {onMonthStyleChange && (
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel id="month-style-label">Calendar Format</InputLabel>
            <Select
              labelId="month-style-label"
              label="Calendar Format"
              value={monthStyle}
              onChange={(e) => onMonthStyleChange(e.target.value)}
            >
              <MenuItem value="full">Full Month View</MenuItem>
              <MenuItem value="compact">Compact</MenuItem>
              <MenuItem value="numbers">Numbers Only</MenuItem>
            </Select>
          </FormControl>
        )}

        <Divider sx={{ my: 2.5, borderColor: "rgba(176,141,53,0.15)" }} />

        {/* 7. AI Theme Matching */}
        <FormControlLabel
          control={
            <Switch
              checked={aiThemeMatching}
              onChange={(e) => onAiThemeMatchingChange(e.target.checked)}
              sx={{
                "& .MuiSwitch-switchBase.Mui-checked": { color: "#B08D35" },
                "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                  backgroundColor: "#B08D35",
                },
              }}
            />
          }
          label={
            <Box>
              <Typography
                variant="body2"
                sx={{ color: "#2A2620", fontWeight: 600 }}
              >
                AI Theme Matching
              </Typography>
              <Typography variant="caption" sx={{ color: "#A9A296" }}>
                Let AI pick a theme based on your uploaded image
              </Typography>
            </Box>
          }
          sx={{ mt: 1, alignItems: "flex-start", ml: 0 }}
        />
      </Box>

      {/* 8. Generate button */}
      <Box sx={{ p: 2.5, borderTop: "1px solid rgba(176,141,53,0.15)" }}>
        <Button
          fullWidth
          variant="contained"
          color="primary"
          disabled={generating}
          startIcon={
            generating ? (
              <CircularProgress size={16} sx={{ color: "#fff" }} />
            ) : (
              <AutoAwesomeIcon />
            )
          }
          onClick={onGenerate}
          sx={{ py: 1.2, fontWeight: 700 }}
        >
          {generating ? "Generating…" : "Generate Design"}
        </Button>
      </Box>
    </Box>
  );
};

export default AIGeneratePanel;
