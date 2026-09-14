import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Grid, CircularProgress, Alert } from "@mui/material";

import LeftPanel from "../layouts/LeftPanel";
import RightPreviewPanel from "../layouts/RightPreviewPanel";
import LayoutCard from "../layouts/LayoutCard";
import { getLayouts } from "../../services/layoutService";

const SELECTED_LAYOUT_STORAGE_KEY = "selectedLayoutId";

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
  const [selectedLayoutId, setSelectedLayoutId] = useState(
    localStorage.getItem(SELECTED_LAYOUT_STORAGE_KEY) || null,
  );

  const fetchLayouts = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getLayouts(filters);
      setLayouts(data.layouts || []);
    } catch (err) {
      console.error("Failed to fetch layouts:", err);
      setError(
        "Failed to load layouts. Please check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchLayouts, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const sizeOptions = useMemo(() => {
    const sizes = layouts.map((l) => l.size).filter(Boolean);
    return [...new Set(sizes)];
  }, [layouts]);

  const handleSelect = (layout) => {
    setSelectedLayoutId(layout._id);
    localStorage.setItem(SELECTED_LAYOUT_STORAGE_KEY, layout._id);
    navigate("/calendar/create", { state: { layoutId: layout._id } });
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", background: "#FAF6EC" }}>
      <LeftPanel
        filters={filters}
        sizeOptions={sizeOptions}
        onFilterChange={setFilters}
      />

      <Box sx={{ flexGrow: 1, p: 4, overflowY: "auto" }}>
        <Box sx={{ mb: 4 }}>
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
            Select a predefined template for your calendar
          </Typography>
        </Box>

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
            No layouts found. Try adjusting your filters.
          </Alert>
        ) : (
          <Grid container spacing={3}>
            {layouts.map((layout) => (
              <Grid item xs={12} sm={6} lg={4} key={layout._id}>
                <LayoutCard
                  layout={layout}
                  isSelected={selectedLayoutId === layout._id}
                  onPreview={setPreviewLayout}
                  onSelect={handleSelect}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      <RightPreviewPanel
        layout={previewLayout}
        isSelected={
          previewLayout ? selectedLayoutId === previewLayout._id : false
        }
        onSelect={handleSelect}
      />
    </Box>
  );
};

export default LayoutPage;
