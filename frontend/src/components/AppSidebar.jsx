import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Avatar,
  Divider,
  Tooltip,
  CircularProgress,
} from "@mui/material";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import logo from "../assets/identeelogo.jpeg";

const NAV_ITEMS = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: DashboardOutlinedIcon,
    path: "/dashboard",
  },
  {
    key: "create",
    label: "Create New Project",
    icon: AddCircleOutlineIcon,
    // New project: choose ONE approved layout on the Layouts page, then
    // Customise → Generate AI designs (see handleCreateNewProject).
    path: "/layouts",
  },
  {
    key: "generated",
    label: "Generated Designs",
    icon: AutoAwesomeOutlinedIcon,
    path: "/generated",
  },
  {
    key: "drafts",
    label: "Draft Projects",
    icon: DescriptionOutlinedIcon,
    path: "/drafts",
  },
  {
    key: "layouts",
    label: "Layouts",
    icon: GridViewOutlinedIcon,
    path: "/layouts",
  },
  {
    key: "settings",
    label: "Settings",
    icon: SettingsOutlinedIcon,
    path: "/dashboard",
  },
];

const AppSidebar = ({ activeKey = "dashboard" }) => {
  const navigate = useNavigate();
  const [creatingProject, setCreatingProject] = useState(false);

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

  const handleNavClick = (path) => {
    navigate(path);
  };

  // Create New Project → Layouts: the designer selects ONE approved layout
  // (its cut type and size), then customises it and generates the AI designs.
  const handleCreateNewProject = () => {
    if (creatingProject) return;
    setCreatingProject(true);
    navigate("/layouts");
  };

  return (
    <Box
      sx={{
        width: { xs: 64, sm: 76, md: 200, lg: 220 },
        flexShrink: 0,
        minHeight: "100vh",
        // Pin the sidebar to the viewport so its black background always
        // fills exactly the visible screen height, even when the page's
        // main content is taller than one screen and scrolls further down.
        // Without this, the sidebar's height only matches its own content
        // and the black background visibly "runs out" partway down the page.
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        background: "#161616",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid rgba(201,162,39,0.15)",
        transition: "width 0.2s ease",
      }}
    >
      <Box
        sx={{
          p: { xs: 1.5, md: 2.5 },
          display: "flex",
          alignItems: "center",
          justifyContent: { xs: "center", md: "flex-start" },
          gap: 1.5,
        }}
      >
        <Box
          component="img"
          src={logo}
          alt="IDENTEE"
          sx={{ width: { xs: 28, md: 36 }, borderRadius: 1 }}
        />
        <Box sx={{ display: { xs: "none", md: "block" } }}>
          <Typography
            sx={{
              color: "#F5F1E6",
              fontWeight: 700,
              lineHeight: 1.2,
              fontSize: 14,
            }}
          >
            Identee
          </Typography>
          <Typography variant="caption" sx={{ color: "#E9C767", fontSize: 10 }}>
            AI Calendar Studio
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ borderColor: "rgba(201,162,39,0.15)" }} />

      <Box
        sx={{
          flexGrow: 1,
          p: { xs: 1, md: 1.5 },
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
        }}
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === activeKey;
          const isCreateItem = item.key === "create";
          const isBusy = isCreateItem && creatingProject;
          return (
            <Tooltip key={item.key} title={item.label} placement="right">
              <Box
                onClick={() =>
                  isCreateItem
                    ? handleCreateNewProject()
                    : handleNavClick(item.path)
                }
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: { xs: "center", md: "flex-start" },
                  gap: 1.25,
                  px: { xs: 1, md: 1.5 },
                  py: 1,
                  borderRadius: 2,
                  cursor: isBusy ? "default" : "pointer",
                  opacity: isBusy ? 0.7 : 1,
                  background: isActive
                    ? "linear-gradient(135deg, #C9A227, #B08D35)"
                    : "transparent",
                  color: isActive ? "#161616" : "#A9A296",
                  fontWeight: isActive ? 700 : 500,
                  "&:hover": {
                    background: isActive
                      ? "linear-gradient(135deg, #C9A227, #B08D35)"
                      : "rgba(201,162,39,0.08)",
                  },
                }}
              >
                {isBusy ? (
                  <CircularProgress size={16} sx={{ color: "#E9C767" }} />
                ) : (
                  <Icon fontSize="small" />
                )}
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: "inherit",
                    color: "inherit",
                    fontSize: 13,
                    display: { xs: "none", md: "block" },
                  }}
                >
                  {item.label}
                </Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      <Divider sx={{ borderColor: "rgba(201,162,39,0.15)" }} />
      <Box
        sx={{
          p: { xs: 1, md: 2 },
          display: "flex",
          alignItems: "center",
          justifyContent: { xs: "center", md: "flex-start" },
          gap: 1.5,
        }}
      >
        <Avatar sx={{ width: 32, height: 32, background: "#B08D35" }}>
          {initial}
        </Avatar>
        <Box sx={{ display: { xs: "none", md: "block" } }}>
          <Typography variant="body2" sx={{ color: "#F5F1E6", fontSize: 13 }}>
            {displayName}
          </Typography>
          <Typography variant="caption" sx={{ color: "#A9A296", fontSize: 11 }}>
            Designer
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default AppSidebar;
