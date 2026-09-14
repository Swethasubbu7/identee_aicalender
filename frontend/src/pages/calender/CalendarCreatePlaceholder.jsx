import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Container, Paper, Typography, Box, Button, Chip } from "@mui/material";

const SELECTED_LAYOUT_STORAGE_KEY = "selectedLayoutId";

// Placeholder screen only. Module 3 — Calendar Creation — is not built yet.
// This exists purely so Module 2's "Select Layout" action has somewhere to go.
const CalendarCreatePlaceholder = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [layoutId, setLayoutId] = useState(null);

  useEffect(() => {
    const idFromNav = location.state?.layoutId;
    const idFromStorage = localStorage.getItem(SELECTED_LAYOUT_STORAGE_KEY);

    setLayoutId(idFromNav || idFromStorage);
  }, [location.state]);

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="h5" gutterBottom>
          Layout Selected ✅
        </Typography>

        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          Calendar Creation (Module 3) isn't built yet. Your layout selection
          has been saved and will be picked up automatically once that module is
          ready.
        </Typography>

        {layoutId ? (
          <Chip label={`Selected Layout ID: ${layoutId}`} sx={{ mb: 3 }} />
        ) : (
          <Typography variant="body2" color="error" sx={{ mb: 3 }}>
            No layout selection found.
          </Typography>
        )}

        <Box>
          <Button variant="outlined" onClick={() => navigate("/layouts")}>
            Back to Choose Layout
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default CalendarCreatePlaceholder;
