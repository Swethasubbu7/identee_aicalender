import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Snackbar,
  Typography,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import AppSidebar from "../components/AppSidebar";
import DesignCard from "../components/DesignCard";
import { getMyDesigns, bulkDeleteDesigns } from "../services/calendarDesignService";

const draftTitle = (d) =>
  d.content?.businessName?.trim() || d.variantId?.familyId?.code || d.layoutId?.name || "Untitled calendar";

const MAX_LISTED = 8; // names shown in the confirmation; the rest as "+ n more"

// All of the designer's saved projects; clicking one reopens it in Customise.
// Drafts can be selected (one, several or all) and deleted together. Only the
// drafts are deleted: generated designs and production files are kept.
const DraftProjects = () => {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null); // [design, …] awaiting confirmation
  const [deleting, setDeleting] = useState(() => new Set());
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

  const allSelected = designs.length > 0 && selected.size === designs.length;
  const someSelected = selected.size > 0 && !allSelected;
  const selectedDesigns = useMemo(() => designs.filter((d) => selected.has(d._id)), [designs, selected]);
  const busy = deleting.size > 0;

  const toggle = (design) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(design._id)) next.delete(design._id);
      else next.add(design._id);
      return next;
    });

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(designs.map((d) => d._id)));

  const confirmDelete = async () => {
    const targets = confirm;
    setConfirm(null);
    const ids = targets.map((d) => d._id);
    setDeleting(new Set(ids));
    try {
      const { deleted = [], notFound = [] } = await bulkDeleteDesigns(ids);
      const gone = new Set([...deleted, ...notFound]);
      setDesigns((all) => all.filter((d) => !gone.has(d._id)));
      setSelected((s) => new Set([...s].filter((id) => !gone.has(id))));
      setSnackbar(`${deleted.length} draft${deleted.length === 1 ? "" : "s"} deleted`);
    } catch (err) {
      setSnackbar(err.response?.data?.message || "Could not delete the selected drafts");
    } finally {
      setDeleting(new Set());
    }
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", background: "var(--nc-bg)" }}>
      <AppSidebar />
      <Box sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 4 } }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, mb: 2, flexWrap: "wrap" }}>
          <Box>
            <Typography variant="h5" sx={{ color: "var(--nc-text)", fontWeight: 700 }}>
              Draft Projects
            </Typography>
            <Typography variant="body2" sx={{ color: "var(--nc-text-2)", mt: 0.5 }}>
              Open a project to continue customising it.
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddCircleOutlineIcon />} onClick={() => navigate("/calendar/staff/layouts?new=1")}>
            Create New Project
          </Button>
        </Box>

        {!loading && !error && designs.length > 0 && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              flexWrap: "wrap",
              mb: 2.5,
              px: 1.5,
              py: 0.75,
              borderRadius: 2,
              background: selected.size ? "rgba(176,141,53,0.10)" : "transparent",
              border: "1px solid rgba(176,141,53,0.2)",
              position: "sticky",
              top: 8,
              zIndex: 2,
              backdropFilter: "blur(6px)",
            }}
          >
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={allSelected}
                  indeterminate={someSelected}
                  disabled={busy}
                  onChange={toggleAll}
                />
              }
              label={<Typography variant="body2">Select all</Typography>}
            />
            <Typography variant="body2" sx={{ color: "var(--nc-text-2)", flexGrow: 1 }}>
              {selected.size ? `${selected.size} of ${designs.length} selected` : `${designs.length} drafts`}
            </Typography>
            {selected.size > 0 && (
              <>
                <Button size="small" onClick={() => setSelected(new Set())} disabled={busy}>
                  Clear
                </Button>
                <Button
                  size="small"
                  color="error"
                  variant="contained"
                  startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <DeleteOutlinedIcon />}
                  disabled={busy}
                  onClick={() => setConfirm(selectedDesigns)}
                >
                  Delete selected ({selected.size})
                </Button>
              </>
            )}
          </Box>
        )}

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
                onDelete={(d) => setConfirm([d])}
                deleting={deleting.has(design._id)}
                selected={selected.has(design._id)}
                onToggleSelect={busy ? undefined : toggle}
                selectionMode={selected.size > 0}
              />
            ))}
          </Box>
        )}
      </Box>

      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {confirm?.length === 1 ? "Delete this draft?" : `Delete ${confirm?.length || 0} drafts?`}
        </DialogTitle>
        <DialogContent>
          <Box component="ul" sx={{ m: 0, mb: 1.5, pl: 2.5 }}>
            {(confirm || []).slice(0, MAX_LISTED).map((d) => (
              <Typography component="li" variant="body2" key={d._id} sx={{ fontWeight: 600 }}>
                {draftTitle(d)}
              </Typography>
            ))}
            {confirm?.length > MAX_LISTED && (
              <Typography component="li" variant="body2" sx={{ color: "var(--nc-text-2)" }}>
                + {confirm.length - MAX_LISTED} more
              </Typography>
            )}
          </Box>
          <DialogContentText variant="body2">
            Only {confirm?.length === 1 ? "this draft is" : "these drafts are"} deleted, and this cannot be undone.
            Generated designs, their PDFs and the production layouts are kept.
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
