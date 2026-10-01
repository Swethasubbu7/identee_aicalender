import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  Button,
  TextField,
  InputAdornment,
  Snackbar,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import AppSidebar from "../../components/AppSidebar";
import LayoutCard from "./LayoutCard";
import LayoutPreviewModal from "./LayoutPreviewModal";
import UploadLayoutModal from "./UploadLayoutModal";
import { getLayouts, deactivateLayout } from "../../services/layoutService";
import { colors, radii } from "../../identeeColors";
import TopBar from "../../components/TopBar";

const SELECTED_LAYOUT_STORAGE_KEY = "selectedLayoutId";

// NOTE: the PDF shows a "Devotional" tab/badge alongside Normal / Special Cut / Die-Cut.
// The current backend Layout model only allows normal | special-cut | die-cut — add
// "devotional" to ALLOWED_TYPES in layout.controller.js and the Layout schema enum
// for this tab to filter real data; it's wired up client-side already.
const TABS = [
  { label: "All", value: "all" },
  { label: "Normal", value: "normal" },
  { label: "Special Cut", value: "special-cut" },
  { label: "Die-Cut", value: "die-cut" },
  { label: "Devotional", value: "devotional" },
];

const LayoutPage = () => {
  const navigate = useNavigate();

  const [layouts, setLayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ type: "all", search: "" });
  const [selectedLayoutId, setSelectedLayoutId] = useState(
    localStorage.getItem(SELECTED_LAYOUT_STORAGE_KEY) || null,
  );
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [previewLayout, setPreviewLayout] = useState(null);
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

  const selectedLayout =
    layouts.find((l) => l._id === selectedLayoutId) || null;

  const handlePick = (layout) => {
    setSelectedLayoutId(layout._id);
  };

  // Used by both the card's "Select Layout" button and the preview
  // modal's "Select This Layout" button — picking from the modal also
  // closes it, since the user has made their choice.
  const handlePickAndClosePreview = (layout) => {
    handlePick(layout);
    setPreviewLayout(null);
  };

  const handleCancel = () => {
    navigate("/dashboard");
  };

  const handleUseThis = () => {
    if (!selectedLayout) return;
    localStorage.setItem(SELECTED_LAYOUT_STORAGE_KEY, selectedLayout._id);
    navigate(`/calendar/customise/${selectedLayout._id}`, {
      state: { layoutId: selectedLayout._id },
    });
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

  // Deleting a layout only soft-deletes it (isActive: false) on the backend,
  // so it simply drops out of the (isActive-filtered) list on refetch.
  const handleDeactivate = async (layout) => {
    try {
      setDeletingId(layout._id);
      await deactivateLayout(layout._id);

      // If the deleted layout was the one currently selected, clear that
      // selection so the footer "Use This" button doesn't point at a
      // layout that's no longer in the list.
      if (selectedLayoutId === layout._id) {
        setSelectedLayoutId(null);
        localStorage.removeItem(SELECTED_LAYOUT_STORAGE_KEY);
      }

      setSnackbar({
        open: true,
        message: `"${layout.name}" removed`,
        severity: "success",
      });
      fetchLayouts();
    } catch (err) {
      console.error("Failed to remove layout:", err);
      setSnackbar({
        open: true,
        message:
          err.response?.data?.message ||
          "Failed to remove layout. Please try again.",
        severity: "error",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Box
      sx={{ display: "flex", minHeight: "100vh", background: colors.pageBg }}
    >
      <AppSidebar activeKey="layouts" />

      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
        <Box sx={{ flexGrow: 1, p: 4, pb: 12 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              mb: 3,
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            <Box>
              <Typography
                variant="h5"
                sx={{ color: colors.textPrimary, fontWeight: 700 }}
              >
                Choose a Calendar Layout
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: colors.textSecondary, mt: 0.5 }}
              >
                Select from our pre-designed templates or explore different
                styles.
              </Typography>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setUploadOpen(true)}
                sx={{
                  background: colors.primary,
                  borderRadius: `${radii.md}px`,
                  boxShadow: "none",
                  "&:hover": {
                    background: colors.primaryHover,
                    boxShadow: "none",
                  },
                }}
              >
                Upload Layout
              </Button>
              <TopBar />
            </Box>
          </Box>

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 2,
              mb: 3,
            }}
          >
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {TABS.map((tab) => {
                const isActive = filters.type === tab.value;
                return (
                  <Box
                    key={tab.value}
                    onClick={() =>
                      setFilters((f) => ({ ...f, type: tab.value }))
                    }
                    sx={{
                      px: 2,
                      py: 0.9,
                      borderRadius: 999,
                      cursor: "pointer",
                      fontSize: 13.5,
                      fontWeight: 600,
                      background: isActive ? colors.primary : colors.surface,
                      color: isActive ? "#FFFFFF" : colors.textSecondary,
                      border: `1px solid ${isActive ? colors.primary : colors.surfaceBorder}`,
                      transition: "all 0.15s ease",
                    }}
                  >
                    {tab.label}
                  </Box>
                );
              })}
            </Box>

            <TextField
              placeholder="Search layouts..."
              size="small"
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              sx={{
                minWidth: 240,
                background: colors.surface,
                "& .MuiOutlinedInput-root": { borderRadius: `${radii.md}px` },
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon
                        fontSize="small"
                        sx={{ color: colors.textMuted }}
                      />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress sx={{ color: colors.primary }} />
            </Box>
          ) : layouts.length === 0 ? (
            <Alert
              severity="info"
              sx={{ background: colors.primarySoftBg, color: colors.primary }}
            >
              No layouts found.
            </Alert>
          ) : (
            <Grid container spacing={3}>
              {layouts.map((layout) => (
                <Grid key={layout._id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <LayoutCard
                    layout={layout}
                    isSelected={selectedLayoutId === layout._id}
                    onPreview={setPreviewLayout}
                    onSelect={handlePick}
                    onDeactivate={handleDeactivate}
                    deleting={deletingId === layout._id}
                  />
                </Grid>
              ))}
            </Grid>
          )}
        </Box>

        {/* Sticky footer action bar */}
        <Box
          sx={{
            position: "sticky",
            bottom: 0,
            display: "flex",
            justifyContent: "flex-end",
            gap: 1.5,
            px: 4,
            py: 2.5,
            background: colors.surface,
            borderTop: `1px solid ${colors.surfaceBorder}`,
          }}
        >
          <Button
            variant="outlined"
            onClick={handleCancel}
            sx={{
              borderColor: colors.surfaceBorderStrong,
              color: colors.textSecondary,
              borderRadius: `${radii.md}px`,
              px: 3,
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!selectedLayout}
            onClick={handleUseThis}
            sx={{
              background: colors.primary,
              borderRadius: `${radii.md}px`,
              px: 3,
              boxShadow: "none",
              "&:hover": { background: colors.primaryHover, boxShadow: "none" },
            }}
          >
            Use This
          </Button>
        </Box>
      </Box>

      <UploadLayoutModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={handleUploadSuccess}
      />

      <LayoutPreviewModal
        layout={previewLayout}
        open={Boolean(previewLayout)}
        onClose={() => setPreviewLayout(null)}
        onSelect={handlePickAndClosePreview}
        isSelected={previewLayout?._id === selectedLayoutId}
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
