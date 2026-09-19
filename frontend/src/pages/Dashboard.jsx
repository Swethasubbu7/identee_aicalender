import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Chip,
  Badge,
  Avatar,
  CircularProgress,
} from "@mui/material";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import AppSidebar from "../components/AppSidebar";
import { getMyDesigns } from "../services/calendarDesignService";

const formatDate = (isoString) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const Dashboard = () => {
  const navigate = useNavigate();

  const [designs, setDesigns] = useState([]);
  const [loadingDesigns, setLoadingDesigns] = useState(true);
  const [designsError, setDesignsError] = useState("");

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || {};
    } catch {
      return {};
    }
  }, []);

  const displayName = user?.name || "Designer";
  const initial = displayName.charAt(0).toUpperCase();

  useEffect(() => {
    const fetchDesigns = async () => {
      try {
        setLoadingDesigns(true);
        setDesignsError("");
        const data = await getMyDesigns();
        setDesigns(data.designs || []);
      } catch (err) {
        console.error("Failed to fetch recent projects:", err);
        setDesignsError("Unable to load your recent projects.");
      } finally {
        setLoadingDesigns(false);
      }
    };
    fetchDesigns();
  }, []);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", background: "#FAF6EC" }}>
      <AppSidebar activeKey="dashboard" />

      <Box sx={{ flexGrow: 1, p: 4 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            mb: 4,
          }}
        >
          <Box>
            <Typography variant="h5" sx={{ color: "#2A2620", fontWeight: 700 }}>
              Good Morning, {displayName}! 👋
            </Typography>
            <Typography variant="body2" sx={{ color: "#7A7266", mt: 0.5 }}>
              Create beautiful calendars with AI assistance.
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Badge color="error" variant="dot">
              <NotificationsNoneOutlinedIcon sx={{ color: "#7A7266" }} />
            </Badge>
            <Avatar sx={{ width: 32, height: 32, background: "#B08D35" }}>
              {initial}
            </Avatar>
            <Typography variant="body2" sx={{ color: "#2A2620" }}>
              {displayName}
            </Typography>
          </Box>
        </Box>

        {/* Top two cards */}
        <Box sx={{ display: "flex", gap: 3, mb: 4, flexWrap: "wrap" }}>
          <Box
            sx={{
              flex: "1 1 320px",
              background: "#FFFFFF",
              border: "1px solid rgba(176,141,53,0.15)",
              borderRadius: 3,
              p: 3,
              display: "flex",
              alignItems: "flex-start",
              gap: 2,
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
            }}
          >
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                background: "rgba(176,141,53,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AddCircleOutlineIcon sx={{ color: "#B08D35" }} />
            </Box>
            <Box sx={{ flexGrow: 1 }}>
              <Typography sx={{ color: "#2A2620", fontWeight: 700 }}>
                Create New Project
              </Typography>
              <Typography variant="body2" sx={{ color: "#7A7266", mb: 2 }}>
                Start a new calendar design
              </Typography>
              <Button
                variant="contained"
                color="primary"
                startIcon={<AddCircleOutlineIcon />}
                onClick={() => navigate("/layouts")}
              >
                Create
              </Button>
            </Box>
          </Box>

          <Box
            sx={{
              flex: "1 1 320px",
              background: "#FFFFFF",
              border: "1px solid rgba(176,141,53,0.15)",
              borderRadius: 3,
              p: 3,
              display: "flex",
              alignItems: "flex-start",
              gap: 2,
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
            }}
          >
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                background: "rgba(176,141,53,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <DescriptionOutlinedIcon sx={{ color: "#B08D35" }} />
            </Box>
            <Box sx={{ flexGrow: 1 }}>
              <Typography sx={{ color: "#2A2620", fontWeight: 700 }}>
                Draft Projects
              </Typography>
              <Typography variant="body2" sx={{ color: "#7A7266", mb: 2 }}>
                Continue working on your designs
              </Typography>
              <Button
                variant="outlined"
                color="primary"
                endIcon={<ArrowForwardIcon />}
                onClick={() => navigate("/layouts")}
              >
                View Drafts
              </Button>
            </Box>
          </Box>
        </Box>

        {/* Recent Projects — real data */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Typography variant="h6" sx={{ color: "#2A2620", fontWeight: 700 }}>
            Recent Projects
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "#B08D35", cursor: "pointer", fontWeight: 600 }}
            onClick={() => navigate("/layouts")}
          >
            View All
          </Typography>
        </Box>

        {loadingDesigns ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6, mb: 4 }}>
            <CircularProgress size={28} sx={{ color: "#B08D35" }} />
          </Box>
        ) : designsError ? (
          <Typography variant="body2" sx={{ color: "#c0392b", mb: 4 }}>
            {designsError}
          </Typography>
        ) : designs.length === 0 ? (
          <Box
            sx={{
              background: "#FFFFFF",
              border: "1px dashed rgba(176,141,53,0.3)",
              borderRadius: 3,
              p: 4,
              textAlign: "center",
              mb: 4,
            }}
          >
            <Typography variant="body2" sx={{ color: "#7A7266", mb: 2 }}>
              No projects yet. Create your first calendar to see it here.
            </Typography>
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate("/layouts")}
            >
              Create New Project
            </Button>
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 2.5,
              mb: 4,
            }}
          >
            {designs.map((design) => (
              <Box
                key={design._id}
                sx={{
                  background: "#FFFFFF",
                  border: "1px solid rgba(176,141,53,0.15)",
                  borderRadius: 3,
                  overflow: "hidden",
                  cursor: "pointer",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: "0 8px 20px rgba(176,141,53,0.15)",
                  },
                }}
                onClick={() =>
                  navigate(`/calendar/customise/${design.layoutId?._id}`)
                }
              >
                <Box
                  component="img"
                  src={
                    design.layoutId?.previewImage ||
                    "https://placehold.co/300x300?text=No+Preview"
                  }
                  alt={design.layoutId?.name || "Calendar design"}
                  sx={{
                    width: "100%",
                    height: 140,
                    objectFit: "cover",
                    display: "block",
                  }}
                />
                <Box sx={{ p: 1.5 }}>
                  <Typography
                    variant="body2"
                    sx={{ color: "#2A2620", fontWeight: 600 }}
                    noWrap
                  >
                    {design.layoutId?.name || "Untitled Calendar"}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "#A9A296", display: "block", mb: 1 }}
                  >
                    Last edited: {formatDate(design.updatedAt)}
                  </Typography>
                  <Chip
                    label={design.status === "saved" ? "Completed" : "Draft"}
                    size="small"
                    sx={{
                      background:
                        design.status === "saved"
                          ? "rgba(56,142,60,0.12)"
                          : "rgba(176,141,53,0.12)",
                      color: design.status === "saved" ? "#2e7d32" : "#8a6d1f",
                      fontWeight: 600,
                    }}
                  />
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {/* Bottom banner */}
        <Box
          sx={{
            background:
              "linear-gradient(135deg, rgba(201,162,39,0.12), rgba(176,141,53,0.06))",
            border: "1px solid rgba(176,141,53,0.2)",
            borderRadius: 3,
            p: 3,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <AutoAwesomeIcon sx={{ color: "#B08D35" }} />
            <Box>
              <Typography sx={{ color: "#2A2620", fontWeight: 700 }}>
                Turn your ideas into beautiful calendars
              </Typography>
              <Typography variant="body2" sx={{ color: "#7A7266" }}>
                Use AI to create stunning, custom calendars in minutes.
              </Typography>
            </Box>
          </Box>
          <Button
            variant="contained"
            color="primary"
            endIcon={<ArrowForwardIcon />}
            onClick={() => navigate("/layouts")}
          >
            Get Started
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default Dashboard;
