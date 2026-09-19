import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Snackbar,
} from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import AppSidebar from "../../components/AppSidebar";
import LeftPanel from "../layouts/LeftPanel";
import RightPreviewPanel from "../layouts/RightPreviewPanel";
import CalendarWorkspace from "./CalendarWorkspace";
import CanvasToolbar from "./CanvasToolbar";
import { getLayoutById } from "../../services/layoutService";
import {
  createDraft,
  autosaveDesign,
} from "../../services/calendarDesignService";

const AUTOSAVE_DEBOUNCE_MS = 2500;

const CalendarCustomise = () => {
  const { layoutId } = useParams();
  const navigate = useNavigate();
  const canvasApiRef = useRef(null);
  const autosaveTimer = useRef(null);

  const [layout, setLayout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [designId, setDesignId] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: "" });
  const [autosaveStatus, setAutosaveStatus] = useState("");

  const [year, setYear] = useState(2027);
  const [language, setLanguage] = useState("english");
  const [monthStyle, setMonthStyle] = useState("full");

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

  const scheduleAutosave = useCallback(() => {
    if (!designId) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      try {
        const canvasData = canvasApiRef.current?.exportJSON();
        await autosaveDesign(designId, { canvasData });
        setAutosaveStatus(`Autosaved at ${new Date().toLocaleTimeString()}`);
      } catch (err) {
        console.error("Autosave failed", err);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [designId]);

  const handleAddImage = (file) => {
    canvasApiRef.current?.addImageFromFile(file);
    scheduleAutosave();
  };
  const handleFitToArea = () => {
    canvasApiRef.current?.fitToArea();
    scheduleAutosave();
  };
  const handleReset = () => {
    canvasApiRef.current?.resetImage();
    scheduleAutosave();
  };
  const handleUpdateTransform = (props) => {
    canvasApiRef.current?.updateTransform(props);
    setSelectedImage((prev) => (prev ? { ...prev, ...props } : prev));
    scheduleAutosave();
  };
  const handleApplyFilter = (type) => {
    canvasApiRef.current?.applyFilter(type);
  };
  const handleSettingsChange = (patch) => {
    if (patch.year !== undefined) setYear(patch.year);
    if (patch.language !== undefined) setLanguage(patch.language);
    if (patch.monthStyle !== undefined) setMonthStyle(patch.monthStyle);
    scheduleAutosave();
  };
  const handleTemplateChange = (newLayoutId) =>
    navigate(`/calendar/customise/${newLayoutId}`);

  const handleUndo = () => canvasApiRef.current?.undo();
  const handleRedo = () => canvasApiRef.current?.redo();
  const handleZoomIn = () => canvasApiRef.current?.zoomIn();
  const handleZoomOut = () => canvasApiRef.current?.zoomOut();
  const handleTogglePan = () => setPanActive(canvasApiRef.current?.togglePan());
  const handleFullscreen = () => canvasApiRef.current?.toggleFullscreen();
  const handleToggleCustomerImageVisibility = () =>
    canvasApiRef.current?.toggleCustomerImageVisibility();
  const handleRemoveCustomerImage = () =>
    canvasApiRef.current?.removeCustomerImage();
  const handleDuplicateCustomerImage = () =>
    canvasApiRef.current?.duplicateCustomerImage();

  const handleSaveDraft = async () => {
    try {
      const canvasData = canvasApiRef.current?.exportJSON();
      if (!designId) {
        const data = await createDraft({ layoutId, canvasData });
        setDesignId(data.design._id);
      } else {
        await autosaveDesign(designId, { canvasData });
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

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "#FAF6EC",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: 3,
          py: 2,
          background: "#161616",
          borderBottom: "1px solid rgba(201,162,39,0.15)",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ color: "#E9C767" }}>
            AI Customisation Page (Editor)
          </Typography>
          <Typography variant="caption" sx={{ color: "#A9A296" }}>
            Personalise your calendar with AI. Adjust, edit and make it uniquely
            yours.
          </Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            gap: 1,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {autosaveStatus && (
            <Typography variant="caption" sx={{ color: "#A9A296", mr: 1 }}>
              {autosaveStatus}
            </Typography>
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<SaveOutlinedIcon />}
            sx={{ color: "#E9C767", borderColor: "rgba(201,162,39,0.4)" }}
            onClick={handleSaveDraft}
          >
            Save Draft
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<VisibilityOutlinedIcon />}
            sx={{ color: "#A9A296", borderColor: "rgba(201,162,39,0.25)" }}
            onClick={handlePreview}
          >
            Preview
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PrintOutlinedIcon />}
            sx={{ color: "#A9A296", borderColor: "rgba(201,162,39,0.25)" }}
            onClick={handlePrintCheck}
          >
            Print Check
          </Button>
          <Button
            size="small"
            variant="contained"
            color="primary"
            startIcon={<FileUploadOutlinedIcon />}
            onClick={handleExport}
          >
            Export
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexGrow: 1 }}>
        <AppSidebar activeKey="layouts" />

        <LeftPanel
          currentLayoutId={layoutId}
          onAddImage={handleAddImage}
          onTemplateChange={handleTemplateChange}
          hasUnsavedChanges={Boolean(selectedImage)}
          hasCustomerImage={layerState.hasCustomerImage}
          customerImageVisible={layerState.customerImageVisible}
          onToggleCustomerImageVisibility={handleToggleCustomerImageVisibility}
          onRemoveCustomerImage={handleRemoveCustomerImage}
          onDuplicateCustomerImage={handleDuplicateCustomerImage}
        />

        <Box sx={{ flexGrow: 1, p: 3 }}>
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
            onSelectImage={setSelectedImage}
            onLayersChange={setLayerState}
            onZoomChange={setZoomPercent}
            onHistoryChange={setHistoryState}
          />
        </Box>

        <RightPreviewPanel
          selectedImage={selectedImage}
          onUpdateTransform={handleUpdateTransform}
          onFitToArea={handleFitToArea}
          onReset={handleReset}
          onApplyFilter={handleApplyFilter}
          year={year}
          language={language}
          monthStyle={monthStyle}
          onSettingsChange={handleSettingsChange}
        />
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ open: false, message: "" })}
      >
        <Alert severity="info" sx={{ width: "100%" }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CalendarCustomise;
