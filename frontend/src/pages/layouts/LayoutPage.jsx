import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Button,
  Snackbar,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";

import LeftPanel from "../../pages/layouts/LeftPanel";
import LayoutCard from "../../pages/layouts/LayoutCard";
import LayoutPreviewModal from "../../pages/layouts/LayoutPreviewModal";
import UploadLayoutModal from "../../pages/layouts/UploadLayoutModal";
import EditLayoutModal from "../../pages/layouts/EditLayoutModal";
import { getLayouts, deactivateLayout } from "../../services/layoutService";

const SELECTED_LAYOUT_STORAGE_KEY = "selectedLayoutId";

const TABS = [
  { label: "All", value: "all" },
  { label: "Normal", value: "normal" },
  { label: "Special Cut", value: "special-cut" },
  { label: "Die Cut", value: "die-cut" },
];

const LayoutPage = () => {
  const navigate = useNavigate();

  const [layouts, setLayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filters, setFilters] = useState({
    type: "all",
    size: "all",
    search: "",
  });
  const [previewLayout, setPreviewLayout] = useState(null);
  const [editLayout, setEditLayout] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [selectedLayoutId, setSelectedLayoutId] = useState(
    localStorage.getItem(SELECTED_LAYOUT_STORAGE_KEY) || null,
  );

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  const fetchLayouts = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getLayouts(filters);
      setLayouts(data.layouts || []);
    } catch (err) {
      console.error("Failed to fetch layouts:", err);
      setError("Unable to load layouts. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchLayouts, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const handleTabChange = (e, newValue) => {
    setFilters((prev) => ({ ...prev, type: newValue }));
  };

  const handleSelect = (layout) => {
    setSelectedLayoutId(layout._id);
    localStorage.setItem(SELECTED_LAYOUT_STORAGE_KEY, layout._id);
    navigate(`/calendar/customise/${layout._id}`, {
      state: { layoutId: layout._id },
    });
  };

  const handleDeactivate = async (layout) => {
    try {
      await deactivateLayout(layout._id);
      setSnackbar({
        open: true,
        message: "Layout deactivated",
        severity: "success",
      });
      fetchLayouts();
    } catch (err) {
      console.error(err);
      setSnackbar({
        open: true,
        message: "Failed to deactivate layout",
        severity: "error",
      });
    }
  };

  const handleUploadSuccess = () => {
    setUploadOpen(false);
    setSnackbar({
      open: true,
      message: "Layout uploaded successfully",
      severity: "success",
    });
    fetchLayouts();
  };

  const handleEditSuccess = () => {
    setEditLayout(null);
    setSnackbar({
      open: true,
      message: "Layout updated successfully",
      severity: "success",
    });
    fetchLayouts();
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", background: "#FAF6EC" }}>
      <LeftPanel filters={filters} onFilterChange={setFilters} />

      <Box sx={{ flexGrow: 1, p: 4 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 2,
            mb: 3,
          }}
        >
          <Box>
            <Typography
              variant="h4"
              sx={{
                background: "linear-gradient(135deg, #C9A227, #8a6d1f)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Choose Calendar Layout
            </Typography>
            <Typography variant="body1" sx={{ color: "#7A7266" }}>
              Select a fixed designer template for your calendar
            </Typography>
          </Box>

          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => setUploadOpen(true)}
          >
            Upload Layout
          </Button>
        </Box>

        <Tabs
          value={filters.type}
          onChange={handleTabChange}
          sx={{
            mb: 3,
            minHeight: 36,
            "& .MuiTab-root": {
              minHeight: 36,
              color: "#7A7266",
              textTransform: "none",
            },
            "& .Mui-selected": { color: "#B08D35 !important" },
            "& .MuiTabs-indicator": { backgroundColor: "#B08D35" },
          }}
        >
          {TABS.map((tab) => (
            <Tab key={tab.value} label={tab.label} value={tab.value} />
          ))}
        </Tabs>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress sx={{ color: "#B08D35" }} />
          </Box>
        ) : layouts.length === 0 ? (
          <Alert
            severity="info"
            sx={{ background: "rgba(176,141,53,0.08)", color: "#8a6d1f" }}
          >
            No layouts found.
          </Alert>
        ) : (
          <Grid container spacing={3}>
            {layouts.map((layout) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={layout._id}>
                <LayoutCard
                  layout={layout}
                  isSelected={selectedLayoutId === layout._id}
                  onPreview={setPreviewLayout}
                  onSelect={handleSelect}
                  onEdit={setEditLayout}
                  onDeactivate={handleDeactivate}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      <LayoutPreviewModal
        layout={previewLayout}
        open={Boolean(previewLayout)}
        onClose={() => setPreviewLayout(null)}
        onSelect={handleSelect}
        isSelected={
          previewLayout ? selectedLayoutId === previewLayout._id : false
        }
      />

      <UploadLayoutModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={handleUploadSuccess}
      />

      <EditLayoutModal
        layout={editLayout}
        open={Boolean(editLayout)}
        onClose={() => setEditLayout(null)}
        onSuccess={handleEditSuccess}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3500}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snackbar.severity} sx={{ width: "100%" }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default LayoutPage;
