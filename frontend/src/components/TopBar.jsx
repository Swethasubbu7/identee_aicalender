import React from "react";
import { Box, Avatar, Typography } from "@mui/material";

/**
 * Minimal placeholder TopBar.
 * Replace with real user info / actions (notifications, profile menu, etc.) later.
 */
const TopBar = () => {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
      <Avatar sx={{ width: 32, height: 32 }}>U</Avatar>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        User
      </Typography>
    </Box>
  );
};

export default TopBar;
