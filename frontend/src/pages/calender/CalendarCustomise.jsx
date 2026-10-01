import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  IconButton,
  Drawer,
  CircularProgress,
  Alert,
  Snackbar,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AppSidebar from "../../components/AppSidebar";
import AIGeneratePanel from "./AIGeneratePanel";
import LayoutSwitcher from "./LayoutSwitcher";
import CalendarWorkspace from "./CalendarWorkspace";
import CanvasToolbar from "./CanvasToolbar";
import { getLayoutById, getLayouts } from "../../services/layoutService";
import {
  createDraft,
  autosaveDesign,
} from "../../services/calendarDesignService";
import { generateAIDesigns } from "../../services/aiGenerationService";

// NOTE: LeftPanel (the manual Tools/Text/Images/Calendar/Elements/Fonts/
// Colors/Cut-Shape/Layout/History toolbar) and the old RightPreviewPanel
// ("Manual Adjust") are intentionally NOT imported here anymore. Those
// components still exist in the codebase (untouched) in case any reusable
// logic inside them is needed elsewhere later, but they are no longer part
// of the visible Calendar Customisation UI. The editor is now AI-first:
// the only customisation surface is the AIGeneratePanel below.

const AUTOSAVE_DEBOUNCE_MS = 2500;
const RIGHT_PANEL_WIDTH = 340;

const CalendarCustomise = () => {
  const { layoutId } = useParams();
  const navigate = useNavigate();
  const canvasApiRef = useRef(null);
  const autosaveTimer = useRef(null);
  const theme = useTheme();

  // md and below = mobile/tablet layout (stacked, drawers)
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  // xs only = collapse header buttons to icon-only
  const isCompact = useMediaQuery(theme.breakpoints.down("sm"));

  const [layout, setLayout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [allLayouts, setAllLayouts] = useState([]);
  const [layoutsLoading, setLayoutsLoading] = useState(true);
  const [designId, setDesignId] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: "" });
  const [autosaveStatus, setAutosaveStatus] = useState("");

  // Calendar settings (still shared with the backend, same as before)
  const [year, setYear] = useState(2027);
  const [language, setLanguage] = useState("english");
  const [monthStyle, setMonthStyle] = useState("full");

  // New AI Generate panel state
  const [uploadedImageFile, setUploadedImageFile] = useState(null);
  const [uploadedImagePreview, setUploadedImagePreview] = useState(null);
  const [designerPrompt, setDesignerPrompt] = useState("");
  const [cutType, setCutType] = useState("normal");
  const [aiThemeMatching, setAiThemeMatching] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [layerState, setLayerState] = useState({
    hasCustomerImage: false,
    customerImageVisible: true,
  });
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
  const [zoomPercent, setZoomPercent] = useState(100);
  const [panActive, setPanActive] = useState(false);

  // Drawer visibility (mobile only)
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  useEffect(() => {
    const fetchLayout = async () => {
      try {
        setLoading(true);
        const data = await getLayoutById(layoutId);
        setLayout(data.layout);
      } catch (err) {
        console.error(err);
        setError("Could not load the selected layout.");
      } finally {
        setLoading(false);
      }
    };
    fetchLayout();
  }, [layoutId]);

  // Fetch the layout list once (not re-fetched on every layoutId change)
  // to power the left-side layout picker.
  useEffect(() => {
    const fetchAllLayouts = async () => {
      try {
        setLayoutsLoading(true);
        const data = await getLayouts();
        setAllLayouts(data?.layouts || []);
      } catch (err) {
        console.error("Failed to load layouts list:", err);
      } finally {
        setLayoutsLoading(false);
      }
    };
    fetchAllLayouts();
  }, []);

  const handleTemplateChange = (newLayoutId) => {
    if (newLayoutId === layoutId) return;
    navigate(`/calendar/customise/${newLayoutId}`);
  };

  const scheduleAutosave = useCallback(() => {
    if (!designId) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      try {
        const canvasData = canvasApiRef.current?.exportJSON();
        await autosaveDesign(designId, {
          canvasData,
          year,
          language,
          aiMetadata: { designerPrompt, cutType, aiThemeMatching, monthStyle },
        });
        setAutosaveStatus(`Autosaved at ${new Date().toLocaleTimeString()}`);
      } catch (err) {
        console.error("Autosave failed", err);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [
    designId,
    year,
    language,
    designerPrompt,
    cutType,
    aiThemeMatching,
    monthStyle,
  ]);

  // --- Customer image (Upload / Replace / Remove) ---------------------
  const handleUploadImage = (file) => {
    // Push the actual image onto the fabric canvas (existing logic,
    // preserved from CalendarWorkspace's imperative handle).
    canvasApiRef.current?.addImageFromFile(file);

    // Keep the raw File so it can be sent to the AI generate endpoint,
    // plus a lightweight preview for the AI panel's thumbnail.
    setUploadedImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setUploadedImagePreview(e.target.result);
    reader.readAsDataURL(file);

    scheduleAutosave();
  };

  const handleRemoveImage = () => {
    canvasApiRef.current?.removeCustomerImage();
    setUploadedImageFile(null);
    setUploadedImagePreview(null);
    scheduleAutosave();
  };

  // --- Calendar settings -----------------------------------------------
  const handleYearChange = (val) => {
    setYear(val);
    scheduleAutosave();
  };
  const handleLanguageChange = (val) => {
    setLanguage(val);
    scheduleAutosave();
  };
  const handleMonthStyleChange = (val) => {
    setMonthStyle(val);
    scheduleAutosave();
  };
  const handleCutTypeChange = (val) => {
    setCutType(val);
    scheduleAutosave();
  };

  // --- Canvas toolbar (undo/redo/zoom/pan/fullscreen) — unchanged -----
  const handleUndo = () => canvasApiRef.current?.undo();
  const handleRedo = () => canvasApiRef.current?.redo();
  const handleZoomIn = () => canvasApiRef.current?.zoomIn();
  const handleZoomOut = () => canvasApiRef.current?.zoomOut();
  const handleTogglePan = () => setPanActive(canvasApiRef.current?.togglePan());
  const handleFullscreen = () => canvasApiRef.current?.toggleFullscreen();

  const handleSaveDraft = async () => {
    try {
      const canvasData = canvasApiRef.current?.exportJSON();
      const aiMetadata = {
        designerPrompt,
        cutType,
        aiThemeMatching,
        monthStyle,
      };
      if (!designId) {
        const data = await createDraft({
          layoutId,
          canvasData,
          year,
          language,
          aiMetadata,
        });
        setDesignId(data.design._id);
      } else {
        await autosaveDesign(designId, {
          canvasData,
          year,
          language,
          aiMetadata,
        });
      }
      setSnackbar({ open: true, message: "Draft saved successfully" });
    } catch (err) {
      console.error(err);
      setSnackbar({ open: true, message: "Failed to save draft" });
    }
  };

  const handlePreview = () => {
    setSnackbar({
      open: true,
      message: "Preview isn't wired up yet — coming in a later phase.",
    });
  };
  const handlePrintCheck = () => {
    setSnackbar({
      open: true,
      message: "Print Check isn't wired up yet — coming in a later phase.",
    });
  };
  const handleExport = () => {
    setSnackbar({
      open: true,
      message: "Export isn't wired up yet — coming in a later phase.",
    });
  };

  // --- AI Generate ("Generate Design") — single image per click for now,
  // matches the confirmed decision to keep this at one generation per
  // click rather than looping multiple Gemini calls. -------------------
  const handleGenerateDesigns = async () => {
    if (!uploadedImageFile) {
      setSnackbar({
        open: true,
        message: "Upload a customer image first.",
      });
      return;
    }

    setGenerating(true);
    try {
      const formData = new FormData();
      formData.append("customerImage", uploadedImageFile);
      formData.append("designerPrompt", designerPrompt);
      formData.append("cutType", cutType);
      formData.append("year", year);
      formData.append("language", language);
      formData.append("monthStyle", monthStyle);
      formData.append("aiThemeMatching", aiThemeMatching);
      formData.append("layoutId", layoutId);

      // Currently hits a stub backend endpoint (see
      // aiGeneration.controller.js) that saves the uploaded image and
      // echoes the settings back — no Gemini call happens yet. This
      // verifies the full upload -> backend -> response flow ahead of
      // the real AI integration.
      const data = await generateAIDesigns(formData);
      setSnackbar({
        open: true,
        message:
          data?.message ||
          "Received by backend — AI generation isn't wired up yet.",
      });
    } catch (err) {
      console.error("AI generate request failed:", err);
      setSnackbar({
        open: true,
        message:
          err.response?.data?.message ||
          "Failed to reach the AI generation endpoint.",
      });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress sx={{ color: "#B08D35" }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">{error}</Alert>
        <Button sx={{ mt: 2 }} onClick={() => navigate("/layouts")}>
          Back to Choose Layout
        </Button>
      </Box>
    );
  }

  const headerActions = [
    {
      key: "save",
      icon: <SaveOutlinedIcon />,
      label: "Save Draft",
      onClick: handleSaveDraft,
      variant: "outlined",
      sx: { color: "#E9C767", borderColor: "rgba(201,162,39,0.4)" },
    },
    {
      key: "preview",
      icon: <VisibilityOutlinedIcon />,
      label: "Preview",
      onClick: handlePreview,
      variant: "outlined",
      sx: { color: "#A9A296", borderColor: "rgba(201,162,39,0.25)" },
    },
    {
      key: "print",
      icon: <PrintOutlinedIcon />,
      label: "Print Check",
      onClick: handlePrintCheck,
      variant: "outlined",
      sx: { color: "#A9A296", borderColor: "rgba(201,162,39,0.25)" },
    },
    {
      key: "export",
      icon: <FileUploadOutlinedIcon />,
      label: "Export",
      onClick: handleExport,
      variant: "contained",
      color: "primary",
    },
  ];

  const aiPanelContent = (
    <AIGeneratePanel
      uploadedImagePreview={uploadedImagePreview}
      hasCustomerImage={layerState.hasCustomerImage}
      onUploadImage={handleUploadImage}
      onRemoveImage={handleRemoveImage}
      designerPrompt={designerPrompt}
      onDesignerPromptChange={setDesignerPrompt}
      cutType={cutType}
      onCutTypeChange={handleCutTypeChange}
      year={year}
      onYearChange={handleYearChange}
      language={language}
      onLanguageChange={handleLanguageChange}
      monthStyle={monthStyle}
      onMonthStyleChange={handleMonthStyleChange}
      aiThemeMatching={aiThemeMatching}
      onAiThemeMatchingChange={setAiThemeMatching}
      onGenerate={handleGenerateDesigns}
      generating={generating}
    />
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: "#FAF6EC",
      }}
    >
      {/* HEADER */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: { xs: 1.5, sm: 3 },
          py: { xs: 1, sm: 2 },
          background: "#161616",
          borderBottom: "1px solid rgba(201,162,39,0.15)",
          flexWrap: "wrap",
          gap: 1,
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <Box
          sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}
        >
          {isMobile && (
            <IconButton
              size="small"
              onClick={() => setSidebarOpen(true)}
              sx={{ color: "#E9C767" }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="h6"
              sx={{
                color: "#E9C767",
                fontSize: { xs: "1rem", sm: "1.25rem" },
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              AI Customisation Page (Editor)
            </Typography>
            {!isCompact && (
              <Typography variant="caption" sx={{ color: "#A9A296" }}>
                Personalise your calendar with AI. Adjust, edit and make it
                uniquely yours.
              </Typography>
            )}
          </Box>
        </Box>

        <Box
          sx={{
            display: "flex",
            gap: 1,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {autosaveStatus && !isCompact && (
            <Typography variant="caption" sx={{ color: "#A9A296", mr: 1 }}>
              {autosaveStatus}
            </Typography>
          )}

          {headerActions.map((action) =>
            isCompact ? (
              <IconButton
                key={action.key}
                size="small"
                onClick={action.onClick}
                sx={{
                  color: action.color === "primary" ? "#fff" : "#E9C767",
                  background:
                    action.color === "primary" ? "primary.main" : "transparent",
                  border: "1px solid rgba(201,162,39,0.3)",
                }}
              >
                {action.icon}
              </IconButton>
            ) : (
              <Button
                key={action.key}
                size="small"
                variant={action.variant}
                color={action.color}
                startIcon={action.icon}
                sx={action.sx}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ),
          )}

          {isMobile && (
            <IconButton
              size="small"
              onClick={() => setAiPanelOpen(true)}
              sx={{
                color: "#E9C767",
                border: "1px solid rgba(201,162,39,0.3)",
              }}
            >
              <AutoAwesomeIcon />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* BODY */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          flexGrow: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: { xs: "auto", md: "hidden" },
        }}
      >
        {isMobile ? (
          <Drawer
            anchor="left"
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          >
            <Box sx={{ width: 240 }}>
              <AppSidebar activeKey="layouts" />
            </Box>
          </Drawer>
        ) : (
          <AppSidebar activeKey="layouts" />
        )}

        {/* The old manual editing toolbar (Tools / Text / Images / Calendar /
            Elements / Fonts / Colors / Cut-Shape / Layout / History) has been
            removed from this page. Only layout selection was preserved,
            via the slim LayoutSwitcher below — everything else in that
            space now belongs to the canvas. */}
        {!isMobile && (
          <LayoutSwitcher
            layouts={allLayouts}
            loading={layoutsLoading}
            currentLayoutId={layoutId}
            onSelect={handleTemplateChange}
            orientation="vertical"
          />
        )}

        <Box
          sx={{
            flexGrow: 1,
            minWidth: 0,
            minHeight: 0,
            height: { xs: "auto", md: "100%" },
            overflow: { xs: "visible", md: "hidden" },
            p: { xs: 1.5, sm: 3 },
            display: "flex",
            flexDirection: "column",
          }}
        >
          {isMobile && (
            <>
              <LayoutSwitcher
                layouts={allLayouts}
                loading={layoutsLoading}
                currentLayoutId={layoutId}
                onSelect={handleTemplateChange}
                orientation="horizontal"
              />
              <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AutoAwesomeIcon />}
                  onClick={() => setAiPanelOpen(true)}
                  sx={{ flexGrow: 1 }}
                >
                  AI Generate
                </Button>
              </Box>
            </>
          )}
          <CanvasToolbar
            canUndo={historyState.canUndo}
            canRedo={historyState.canRedo}
            zoomPercent={zoomPercent}
            panActive={panActive}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onTogglePan={handleTogglePan}
            onFullscreen={handleFullscreen}
          />
          <CalendarWorkspace
            ref={canvasApiRef}
            layout={layout}
            onSelectImage={() => {}}
            onLayersChange={setLayerState}
            onZoomChange={setZoomPercent}
            onHistoryChange={setHistoryState}
          />
        </Box>

        {isMobile ? (
          <Drawer
            anchor="right"
            open={aiPanelOpen}
            onClose={() => setAiPanelOpen(false)}
            PaperProps={{
              sx: { width: { xs: "85vw", sm: RIGHT_PANEL_WIDTH } },
            }}
          >
            {aiPanelContent}
          </Drawer>
        ) : (
          <Box
            sx={{
              width: RIGHT_PANEL_WIDTH,
              flexShrink: 0,
              height: "100%",
              overflow: "hidden",
              borderLeft: "1px solid rgba(176,141,53,0.15)",
            }}
          >
            {aiPanelContent}
          </Box>
        )}
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ open: false, message: "" })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="info" sx={{ width: "100%" }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CalendarCustomise;
