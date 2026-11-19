// Phase 2 home for the three new sign-in areas (shop customer, shop staff,
// calendar customer). It proves the separate sign-in works end to end and
// shows what each area will contain; the real panels arrive in later phases.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Avatar, Badge, Box, Button, Chip, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import logo from "../assets/nauticrew-logo.png";
import logoDark from "../assets/nauticrew-logo-dark.png";
import { useColorMode } from "../colorMode";
import { apiUrl } from "../config";
import { AUDIENCES, loginPath } from "./auth/audiences";
import { authClient, saveProfile, savedProfile } from "./auth/authClient";
import { forgetSession } from "./auth/sessionCache";

const ROADMAP = {
  "shop-customer": {
    phase: "Phase 5",
    items: ["Your orders and order tracking", "Saved addresses (with GSTIN)", "Wishlist", "Invoices and payments", "Profile and support"],
  },
  "shop-staff": {
    phase: "Phase 6",
    items: ["Dashboard: orders, revenue, low stock", "Products, categories and inventory", "Orders, customers and refunds", "Coupons, shipping and site content", "Reports and staff management"],
  },
  "calendar-customer": {
    phase: "Phase 8",
    items: ["Your calendar design previews", "Approve, reject or request changes", "Your calendar orders and their status"],
  },
};

const ROLE_LABELS = { SUPER_ADMIN: "Super Admin", ECOM_ADMIN: "E-commerce Admin", SALES: "Sales", INVENTORY: "Inventory", ACCOUNTS: "Accounts" };

const PortalHome = ({ audience }) => {
  const meta = AUDIENCES[audience];
  const navigate = useNavigate();
  const { mode, toggleMode } = useColorMode();
  const [user] = useState(() => savedProfile(audience) || {});
  const [notes, setNotes] = useState({ notifications: [], unread: 0 });
  const roadmap = ROADMAP[audience];
  const roles = Object.values(user.roles || {}).filter(Boolean);

  useEffect(() => {
    axios
      .get(apiUrl(`/api/notifications/${audience}`))
      .then((r) => setNotes(r.data))
      .catch(() => {});
  }, [audience]);

  const signOut = async () => {
    await authClient(audience).logout().catch(() => {});
    saveProfile(audience, null);
    forgetSession(audience);
    navigate(loginPath(audience), { replace: true });
  };

  return (
    <Box sx={{ minHeight: "100vh", background: "var(--nc-bg)", color: "var(--nc-text)" }}>
      <Box
        component="header"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          px: { xs: 2, md: 4 },
          py: 1.5,
          borderBottom: "1px solid var(--nc-border)",
          background: "var(--nc-paper)",
        }}
      >
        <Box component="img" src={mode === "dark" ? logoDark : logo} alt="Nauticrew" sx={{ height: 34 }} />
        <Typography variant="body2" sx={{ color: "var(--nc-text-2)", display: { xs: "none", sm: "block" } }}>
          {meta.title}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title={mode === "dark" ? "Light mode" : "Dark mode"}>
          <IconButton onClick={toggleMode} aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"} sx={{ color: "var(--nc-text)" }}>
            {mode === "dark" ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Notifications">
          <IconButton aria-label={`${notes.unread} unread notifications`} sx={{ color: "var(--nc-text)" }}>
            <Badge badgeContent={notes.unread} color="warning">
              <NotificationsOutlinedIcon />
            </Badge>
          </IconButton>
        </Tooltip>
        <Button variant="outlined" size="small" onClick={signOut}>
          Sign out
        </Button>
      </Box>

      <Box sx={{ maxWidth: 880, mx: "auto", px: { xs: 2, md: 4 }, py: { xs: 3, md: 5 } }}>
        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 3, mb: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ width: 52, height: 52, background: "#B08D35" }}>{(user.name || "?").charAt(0).toUpperCase()}</Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }} noWrap>
                Welcome, {user.name || "there"}
              </Typography>
              <Typography variant="body2" sx={{ color: "var(--nc-text-2)" }} noWrap>
                {user.email} · {meta.label}
              </Typography>
            </Box>
          </Stack>
          {roles.length > 0 && (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
              {roles.map((r) => (
                <Chip key={r} size="small" label={ROLE_LABELS[r] || r} />
              ))}
            </Box>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 3, mb: 3 }}>
          <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Coming in {roadmap.phase}</Typography>
          <Typography variant="body2" sx={{ color: "var(--nc-text-2)", mb: 2 }}>
            Your sign-in for this area is ready. These sections are being built next:
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, display: "grid", gap: 0.75 }}>
            {roadmap.items.map((item) => (
              <li key={item}>
                <Typography variant="body2">{item}</Typography>
              </li>
            ))}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 3 }}>
          <Typography sx={{ fontWeight: 700, mb: 1.5 }}>Notifications</Typography>
          {notes.notifications.length === 0 ? (
            <Typography variant="body2" sx={{ color: "var(--nc-text-2)" }}>
              Nothing yet.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {notes.notifications.map((n) => (
                <Box key={n._id} sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                  {!n.readAt && <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", background: "#C9A227", flexShrink: 0 }} />}
                  <Typography variant="body2" sx={{ fontWeight: n.readAt ? 400 : 600 }}>
                    {n.title}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "var(--nc-text-2)", ml: "auto" }}>
                    {new Date(n.createdAt).toLocaleDateString()}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Paper>
      </Box>
    </Box>
  );
};

export default PortalHome;
