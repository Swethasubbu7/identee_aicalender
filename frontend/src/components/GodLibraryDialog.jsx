import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { addGodImage, updateGodImage } from "../services/godImageService";

// Add a picture to the God-image library, or rename / re-tag / hide one.
//   image  — null: add a new picture; a library image: edit it
//   onDone(image) — the added / updated image (null when hidden)
const GodLibraryDialog = ({ open, image = null, initialName = "", onClose, onDone }) => (
  <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
    {/* Mounted fresh each time it opens, so the form starts from the image. */}
    {open && <LibraryForm image={image} initialName={initialName} onClose={onClose} onDone={onDone} />}
  </Dialog>
);

const LibraryForm = ({ image, initialName, onClose, onDone }) => {
  const editing = Boolean(image);
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [name, setName] = useState(image?.name || initialName || "");
  const [aliases, setAliases] = useState((image?.aliases || []).join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  const pick = (f) => {
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const saved = editing
        ? await updateGodImage(image._id, { name, aliases })
        : await addGodImage({ file, name, aliases });
      onDone(saved);
    } catch (err) {
      // The same picture is already saved: offer that one instead.
      if (err.response?.status === 409 && err.response.data?.image) {
        setError(err.response.data.message);
      } else {
        setError(err.response?.data?.message || "Could not save to the library.");
      }
    } finally {
      setBusy(false);
    }
  };

  const hide = async () => {
    setBusy(true);
    try {
      await updateGodImage(image._id, { active: false });
      onDone(null);
    } catch (err) {
      setError(err.response?.data?.message || "Could not hide the image.");
    } finally {
      setBusy(false);
    }
  };

  const shown = previewUrl || image?.thumbUrl || null;
  const canSave = name.trim() && (editing || file) && !busy;

  return (
    <>
      <DialogTitle>{editing ? "Edit library image" : "Add to God image library"}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Box
          sx={{
            height: 180,
            borderRadius: 2,
            border: "1px dashed rgba(176,141,53,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "repeating-conic-gradient(var(--nc-surface-2) 0 25%, var(--nc-paper) 0 50%) 0 0 / 16px 16px",
            overflow: "hidden",
          }}
        >
          {shown ? (
            <Box component="img" src={shown} alt={name || "God image"} sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          ) : (
            <Button variant="outlined" onClick={() => inputRef.current?.click()}>
              Choose image
            </Button>
          )}
        </Box>
        {!editing && shown && (
          <Button size="small" onClick={() => inputRef.current?.click()} sx={{ alignSelf: "flex-start", mt: -1 }}>
            Choose a different image
          </Button>
        )}
        <TextField
          label="Name"
          placeholder="e.g. Vinayagar"
          value={name}
          onChange={(e) => setName(e.target.value)}
          size="small"
          autoFocus={editing}
          slotProps={{ htmlInput: { maxLength: 80 } }}
        />
        <TextField
          label="Other names (search aliases)"
          placeholder="e.g. Pillaiyar, Ganesha, Ganapathi"
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          size="small"
          multiline
          minRows={2}
          helperText="Separate with commas. Searching any of these names finds this image."
        />
        {!editing && (
          <Typography variant="caption" sx={{ color: "var(--nc-text-2)" }}>
            The picture is saved once, in its original quality and shape, and can be reused in any layout.
          </Typography>
        )}
        {error && <Alert severity="warning">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ justifyContent: editing ? "space-between" : "flex-end" }}>
        {editing && (
          <Button color="error" onClick={hide} disabled={busy}>
            Hide from library
          </Button>
        )}
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={save} disabled={!canSave} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}>
            {editing ? "Save" : "Add & use"}
          </Button>
        </Box>
      </DialogActions>
    </>
  );
};

export default GodLibraryDialog;
