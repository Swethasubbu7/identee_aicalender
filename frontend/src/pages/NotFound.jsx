import { useLocation, useNavigate } from "react-router-dom";
import { Box, Button, Typography } from "@mui/material";
import AppSidebar from "../components/AppSidebar";

// Any URL the app does not know: a clear message instead of a blank page.
const NotFound = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <Box sx={{ display: "flex", minHeight: "100vh", background: "var(--nc-bg)" }}>
      <AppSidebar />
      <Box
        sx={{
          flexGrow: 1,
          minWidth: 0,
          p: { xs: 2, md: 4 },
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 1.5,
        }}
      >
        <Typography variant="h4" sx={{ color: "var(--nc-text)" }}>
          Page not found
        </Typography>
        <Typography variant="body2" sx={{ color: "var(--nc-text-2)", wordBreak: "break-all" }}>
          There is no page at {pathname}.
        </Typography>
        <Button variant="contained" onClick={() => navigate("/calendar/staff")}>
          Back to dashboard
        </Button>
      </Box>
    </Box>
  );
};

export default NotFound;
