import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
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
import DesignCard from "../components/DesignCard";
import GeneratedDesignCard from "../components/GeneratedDesignCard";
import { flattenGeneratedDesigns } from "../utils/generatedDesigns";
import { listAiCalendarJobs } from "../services/aiCalendarService";
import { getMyDesigns } from "../services/calendarDesignService";

const Dashboard = () => {
  const navigate = useNavigate();

  const [designs, setDesigns] = useState([]);
  const [loadingDesigns, setLoadingDesigns] = useState(true);
  const [designsError, setDesignsError] = useState("");
  const [generated, setGenerated] = useState([]);

  // Read once on mount (the signed-in user does not change on this page).
  const [user] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || {};
    } catch {
      return {};
    }
  });

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
    listAiCalendarJobs({ limit: 8 })
      .then((jobs) => setGenerated(flattenGeneratedDesigns(jobs).slice(0, 8)))
      .catch(() => setGenerated([]));
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
                onClick={() => navigate("/drafts")}
              >
                View Drafts
              </Button>
            </Box>
          </Box>
        </Box>

        {/* AI designs made with Generate */}
        {generated.length > 0 && (
          <>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography variant="h6" sx={{ color: "#2A2620", fontWeight: 700 }}>
                Generated Designs
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: "#B08D35", cursor: "pointer", fontWeight: 600 }}
                onClick={() => navigate("/generated")}
              >
                View All
              </Typography>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 2.5, mb: 4 }}>
              {generated.map(({ job, variation }) => (
                <GeneratedDesignCard key={`${job._id}:${variation.index}`} job={job} variation={variation} onOpen={navigate} />
              ))}
            </Box>
          </>
        )}

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
            onClick={() => navigate("/drafts")}
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
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 2.5,
              mb: 4,
            }}
          >
            {designs.map((design) => (
              <DesignCard key={design._id} design={design} onOpen={navigate} />
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
