import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Snackbar,
  Typography,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import AppSidebar from "../components/AppSidebar";
import DesignCard from "../components/DesignCard";
import { getMyDesigns, deleteDesign } from "../services/calendarDesignService";

// All of the designer's saved projects; clicking one reopens it in Customise.
const DraftProjects = () => {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(null); // { design, title }
  const [deletingId, setDeletingId] = useState(null);
  const [snackbar, setSnackbar] = useState("");

  useEffect(() => {
    let cancelled = false;
    getMyDesigns({ limit: 200 })
      .then((data) => !cancelled && setDesigns(data.designs || []))
      .catch(() => !cancelled && setError("Unable to load your projects."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const confirmDelete = async () => {
    const { design } = confirm;
    setConfirm(null);
    setDeletingId(design._id);
    try {
      await deleteDesign(design._id);
      setDesigns((all) => all.filter((d) => d._id !== design._id));
      setSnackbar("Project deleted");
    } catch (err) {
      setSnackbar(err.response?.data?.message || "Could not delete the project");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", background: "#FAF6EC" }}>
      <AppSidebar activeKey="drafts" />
      <Box sx={{ flexGrow: 1, p: { xs: 2, md: 4 } }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, mb: 3, flexWrap: "wrap" }}>
          <Box>
            <Typography variant="h5" sx={{ color: "#2A2620", fontWeight: 700 }}>
              Draft Projects
            </Typography>
            <Typography variant="body2" sx={{ color: "#7A7266", mt: 0.5 }}>
              Open a project to continue customising it.
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
        ) : designs.length === 0 ? (
          <Alert severity="info">No projects yet. Choose a layout and save a draft to see it here.</Alert>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 2.5 }}>
            {designs.map((design) => (
              <DesignCard
                key={design._id}
                design={design}
                onOpen={navigate}
                onDelete={(d, title) => setConfirm({ design: d, title })}
                deleting={deletingId === design._id}
              />
            ))}
          </Box>
        )}
      </Box>

      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)}>
        <DialogTitle>Delete this project?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            “{confirm?.title}” and its AI designs will be deleted. This cannot be undone.
            The production layout itself is not affected.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={Boolean(snackbar)}
        autoHideDuration={3000}
        onClose={() => setSnackbar("")}
        message={snackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
};

export default DraftProjects;
