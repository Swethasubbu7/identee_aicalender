import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Box, Button, Paper, Typography } from "@mui/material";
import AppSidebar from "../components/AppSidebar";
import { currentUser } from "../utils/auth";

// Account details and sign-out. (Appearance settings are added here later.)
const Settings = () => {
  const navigate = useNavigate();
  const [user] = useState(currentUser);
  const name = user?.name || "Designer";

  const signOut = () => {
    // Only the sign-in itself is cleared; other preferences stay.
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/", { replace: true });
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", background: "var(--nc-bg)" }}>
      <AppSidebar />
      <Box sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 4 } }}>
        <Typography variant="h5" sx={{ color: "var(--nc-text)", fontWeight: 700 }}>
          Settings
        </Typography>
        <Typography variant="body2" sx={{ color: "var(--nc-text-2)", mt: 0.5, mb: 3 }}>
          Your account in the calendar studio.
        </Typography>

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, maxWidth: 560, borderRadius: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
            <Avatar sx={{ width: 48, height: 48, background: "#B08D35" }}>{name.charAt(0).toUpperCase()}</Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, color: "var(--nc-text)" }} noWrap>
                {name}
              </Typography>
              {user?.email && (
                <Typography variant="body2" sx={{ color: "var(--nc-text-2)" }} noWrap>
                  {user.email}
                </Typography>
              )}
            </Box>
          </Box>
          <Button variant="outlined" onClick={signOut}>
            Sign out
          </Button>
        </Paper>
      </Box>
    </Box>
  );
};

export default Settings;
