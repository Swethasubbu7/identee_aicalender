import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import AppSidebar from "../components/AppSidebar";
import GeneratedDesignCard from "../components/GeneratedDesignCard";
import { flattenGeneratedDesigns } from "../utils/generatedDesigns";
import { listAiCalendarJobs } from "../services/aiCalendarService";

// Every AI design the designer generated; click one for preview, print check
// and the printable PDFs.
const GeneratedDesigns = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listAiCalendarJobs({ limit: 100 })
      .then((jobs) => !cancelled && setItems(flattenGeneratedDesigns(jobs)))
      .catch(() => !cancelled && setError("Unable to load your generated designs."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", background: "#FAF6EC" }}>
      <AppSidebar activeKey="generated" />
      <Box sx={{ flexGrow: 1, p: { xs: 2, md: 4 } }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, mb: 3, flexWrap: "wrap" }}>
          <Box>
            <Typography variant="h5" sx={{ color: "#2A2620", fontWeight: 700 }}>
              Generated Designs
            </Typography>
            <Typography variant="body2" sx={{ color: "#7A7266", mt: 0.5 }}>
              Your AI calendar designs. Open one to preview, run the print check and download the PDFs.
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddCircleOutlineIcon />} onClick={() => navigate("/layouts")}>
            Create New Project
          </Button>
        </Box>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress size={28} sx={{ color: "#B08D35" }} />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : items.length === 0 ? (
          <Alert severity="info">No generated designs yet. Open a layout in Customise and press Generate.</Alert>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 2.5 }}>
            {items.map(({ job, variation }) => (
              <GeneratedDesignCard key={`${job._id}:${variation.index}`} job={job} variation={variation} onOpen={navigate} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default GeneratedDesigns;
