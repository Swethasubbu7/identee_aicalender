import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Avatar,
  Divider,
  Drawer,
  IconButton,
  Tooltip,
} from "@mui/material";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
// The sidebar is dark in both modes, so it uses the light-on-dark logo.
import logoFull from "../assets/nauticrew-logo-dark.png";
import logoMark from "../assets/nauticrew-mark-dark.png";
import { currentUser } from "../utils/auth";
import { useColorMode } from "../colorMode";

// "Create New Project" opens the Layouts page in "new project" mode: the
// designer selects ONE approved layout, then customises it and generates.
const CREATE_PATH = "/layouts?new=1";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: DashboardOutlinedIcon, path: "/dashboard" },
  { key: "create", label: "Create New Project", icon: AddCircleOutlineIcon, path: CREATE_PATH },
  { key: "generated", label: "Generated Designs", icon: AutoAwesomeOutlinedIcon, path: "/generated" },
  { key: "drafts", label: "Draft Projects", icon: DescriptionOutlinedIcon, path: "/drafts" },
  { key: "layouts", label: "Layouts", icon: GridViewOutlinedIcon, path: "/layouts" },
  { key: "settings", label: "Settings", icon: SettingsOutlinedIcon, path: "/settings" },
];

// The signed-in member's calendar role, as shown under their name.
const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  CAL_ADMIN: "Calendar Admin",
  CAL_MANAGER: "Calendar Manager",
  DESIGNER: "Designer",
  PRODUCTION: "Production",
};
const roleLabel = (user) => ROLE_LABELS[user?.roles?.platform] || ROLE_LABELS[user?.roles?.calendar] || "Designer";

// The highlighted item comes from the URL, so it is right after a refresh,
// a direct link or the browser's back button.
const activeNavKey = ({ pathname, search = "" }) => {
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/generated") || pathname.startsWith("/calendar/designs")) return "generated";
  if (pathname.startsWith("/drafts")) return "drafts";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/layouts")) return new URLSearchParams(search).get("new") === "1" ? "create" : "layouts";
  if (pathname.startsWith("/calendar/")) return "layouts";
  return null;
};

const SidebarContent = ({ expanded, onNavigate, onClose }) => {
  const location = useLocation();
  const activeKey = activeNavKey(location);
  const [user] = useState(currentUser);
  const displayName = user?.name || "Designer";
  // In the phone drawer the labels are always shown; on the rail they appear
  // from the md breakpoint.
  const label = expanded ? "block" : { xs: "none", md: "block" };
  const iconOnly = expanded ? "none" : { xs: "block", md: "none" };
  const align = expanded ? "flex-start" : { xs: "center", md: "flex-start" };
  const { mode, toggleMode } = useColorMode();
  const dark = mode === "dark";
  const ModeIcon = dark ? LightModeOutlinedIcon : DarkModeOutlinedIcon;
  const modeLabel = dark ? "Light mode" : "Dark mode";

  return (
    <>
      <Box sx={{ p: { xs: 1.5, md: 2 }, display: "flex", alignItems: "center", justifyContent: align, gap: 1.5 }}>
        <Box component="img" src={logoMark} alt="Nauticrew" sx={{ width: 34, display: iconOnly }} />
        <Box sx={{ display: label, flexGrow: 1, minWidth: 0 }}>
          <Box component="img" src={logoFull} alt="Nauticrew" sx={{ width: "100%", maxWidth: 150, display: "block" }} />
          <Typography variant="caption" sx={{ color: "#E9C767", fontSize: 10, display: "block", mt: 0.5 }}>
            AI Calendar Studio
          </Typography>
        </Box>
        {onClose && (
          <IconButton size="small" onClick={onClose} aria-label="Close menu" sx={{ color: "#A9A296" }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      <Divider sx={{ borderColor: "rgba(201,162,39,0.15)" }} />

      <Box
        component="nav"
        aria-label="Main"
        sx={{ flexGrow: 1, p: { xs: 1, md: 1.5 }, display: "flex", flexDirection: "column", gap: 0.5, overflowY: "auto" }}
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === activeKey;
          return (
            <Tooltip key={item.key} title={expanded ? "" : item.label} placement="right">
              <Box
                component="a"
                href={item.path}
                aria-current={isActive ? "page" : undefined}
                onClick={(e) => {
                  // Ordinary click: in-app navigation. Ctrl/middle-click
                  // still opens the page in a new tab (it is a real link).
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  onNavigate(item.path);
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: align,
                  gap: 1.25,
                  px: { xs: 1, md: 1.5 },
                  py: 1,
                  borderRadius: 2,
                  cursor: "pointer",
                  textDecoration: "none",
                  background: isActive ? "linear-gradient(135deg, #C9A227, #B08D35)" : "transparent",
                  color: isActive ? "#161616" : "#A9A296",
                  fontWeight: isActive ? 700 : 500,
                  "&:hover": {
                    background: isActive ? "linear-gradient(135deg, #C9A227, #B08D35)" : "rgba(201,162,39,0.08)",
                    color: isActive ? "#161616" : "#F5F1E6",
                  },
                  "&:focus-visible": { outline: "2px solid #E9C767", outlineOffset: 2 },
                }}
              >
                <Icon fontSize="small" />
                <Typography
                  variant="body2"
                  sx={{ fontWeight: "inherit", color: "inherit", fontSize: 13, display: label }}
                >
                  {item.label}
                </Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      {/* Light / dark mode for the whole tool (remembered in this browser). */}
      <Box sx={{ px: { xs: 1, md: 1.5 }, pb: 1 }}>
        <Tooltip title={expanded ? "" : modeLabel} placement="right">
          <Box
            component="button"
            type="button"
            onClick={toggleMode}
            aria-label={`Switch to ${modeLabel.toLowerCase()}`}
            sx={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: align,
              gap: 1.25,
              px: { xs: 1, md: 1.5 },
              py: 1,
              border: "1px solid rgba(201,162,39,0.25)",
              borderRadius: 2,
              background: "transparent",
              color: "#E9C767",
              cursor: "pointer",
              font: "inherit",
              "&:hover": { background: "rgba(201,162,39,0.08)" },
              "&:focus-visible": { outline: "2px solid #E9C767", outlineOffset: 2 },
            }}
          >
            <ModeIcon fontSize="small" />
            <Typography variant="body2" sx={{ fontSize: 13, color: "inherit", display: label }}>
              {modeLabel}
            </Typography>
          </Box>
        </Tooltip>
      </Box>

      <Divider sx={{ borderColor: "rgba(201,162,39,0.15)" }} />
      <Box sx={{ p: { xs: 1, md: 2 }, display: "flex", alignItems: "center", justifyContent: align, gap: 1.5 }}>
        <Avatar sx={{ width: 32, height: 32, background: "#B08D35" }}>{displayName.charAt(0).toUpperCase()}</Avatar>
        <Box sx={{ display: label, minWidth: 0 }}>
          <Typography variant="body2" sx={{ color: "#F5F1E6", fontSize: 13 }} noWrap>
            {displayName}
          </Typography>
          <Typography variant="caption" sx={{ color: "#A9A296", fontSize: 11 }}>
            {roleLabel(user)}
          </Typography>
        </Box>
      </Box>
    </>
  );
};

const AppSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const go = (path) => {
    setDrawerOpen(false);
    if (`${location.pathname}${location.search}` !== path) navigate(path);
  };

  return (
    <>
      <Box
        sx={{
          width: { xs: 56, sm: 76, md: 200, lg: 220 },
          flexShrink: 0,
          // Pinned to the viewport so the dark background always fills the
          // visible screen height, even when the page scrolls.
          height: "100vh",
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
        {/* Phones: a menu button opens the full menu with labels. */}
        <Box sx={{ display: { xs: "flex", sm: "none" }, justifyContent: "center", pt: 1 }}>
          <IconButton aria-label="Open menu" onClick={() => setDrawerOpen(true)} sx={{ color: "#E9C767" }}>
            <MenuIcon />
          </IconButton>
        </Box>
        <SidebarContent expanded={false} onNavigate={go} />
      </Box>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{ display: { xs: "block", sm: "none" } }}
        slotProps={{ paper: { sx: { width: 240, background: "#161616", display: "flex", flexDirection: "column" } } }}
      >
        <SidebarContent expanded onNavigate={go} onClose={() => setDrawerOpen(false)} />
      </Drawer>
    </>
  );
};

export default AppSidebar;
