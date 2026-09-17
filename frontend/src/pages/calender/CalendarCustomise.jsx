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
 import LeftPanel from "../../pages/layouts/LeftPanel";
 import RightPreviewPanel from "../../pages/layouts/RightPreviewPanel";
import CanvasWorkspace from "../../pages/calender/CalendarWorkspace";
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
        }}
      >
        <Typography variant="h6" sx={{ color: "#E9C767" }}>
          AI Calendar Studio — {layout?.name}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          {autosaveStatus && (
            <Typography variant="caption" sx={{ color: "#A9A296", mr: 2 }}>
              {autosaveStatus}
            </Typography>
          )}
          <Button
            variant="outlined"
            sx={{ color: "#E9C767", borderColor: "rgba(201,162,39,0.4)" }}
            onClick={handleSaveDraft}
          >
            Save Draft
          </Button>
          <Button variant="contained" color="primary" disabled>
            Next →
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexGrow: 1 }}>
        <LeftPanel onAddImage={handleAddImage} />

        <Box sx={{ flexGrow: 1, p: 3 }}>
          <CanvasWorkspace
            ref={canvasApiRef}
            layout={layout}
            onSelectImage={setSelectedImage}
          />
        </Box>

        <RightPreviewPanel
          selectedImage={selectedImage}
          onUpdateTransform={handleUpdateTransform}
          onFitToArea={handleFitToArea}
          onReset={handleReset}
        />
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ open: false, message: "" })}
      >
        <Alert severity="success" sx={{ width: "100%" }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CalendarCustomise;
