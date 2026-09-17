import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Button,
  Box,
  Typography,
  Alert,
  FormControlLabel,
  Switch,
} from "@mui/material";
import { updateLayout } from "../../services/layoutService";

const TYPE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "special-cut", label: "Special Cut" },
  { value: "die-cut", label: "Die Cut" },
];

const SIZE_OPTIONS = ["A4", "A3", "12 x 18 inch", "Custom"];

const EditLayoutModal = ({ layout, open, onClose, onSuccess }) => {
  const [form, setForm] = useState({
    name: "",
    type: "normal",
    size: "A4",
    description: "",
    isActive: true,
  });
  const [previewImage, setPreviewImage] = useState(null);
  const [layoutFile, setLayoutFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (layout) {
      setForm({
        name: layout.name || "",
        type: layout.type || "normal",
        size: layout.size || "A4",
        description: layout.description || "",
        isActive: layout.isActive !== undefined ? layout.isActive : true,
      });
      setPreviewImage(null);
      setLayoutFile(null);
      setError("");
    }
  }, [layout]);

  if (!layout) return null;

  const handleChange = (field) => (e) =>
    setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError("");

      const formData = new FormData();
      formData.append("name", form.name);
      formData.append("type", form.type);
      formData.append("size", form.size);
      formData.append("description", form.description);
      formData.append("isActive", form.isActive);
      if (previewImage) formData.append("previewImage", previewImage);
      if (layoutFile) formData.append("layoutFile", layoutFile);

      await updateLayout(layout._id, formData);
      onSuccess();
    } catch (err) {
      console.error("Update failed:", err);
      setError(
        err.response?.data?.message ||
          "Failed to update layout. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Layout</DialogTitle>
      <DialogContent
        dividers
        sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}
      >
        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          label="Layout Name"
          fullWidth
          value={form.name}
          onChange={handleChange("name")}
        />

        <TextField
          select
          label="Layout Type"
          fullWidth
          value={form.type}
          onChange={handleChange("type")}
        >
          {TYPE_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          label="Size"
          fullWidth
          value={form.size}
          onChange={handleChange("size")}
        >
          {SIZE_OPTIONS.map((size) => (
            <MenuItem key={size} value={size}>
              {size}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="Description"
          fullWidth
          multiline
          rows={3}
          value={form.description}
          onChange={handleChange("description")}
        />

        <Box>
          <Typography
            variant="caption"
            sx={{ color: "#7A7266", display: "block", mb: 0.5 }}
          >
            Replace Preview Image (optional)
          </Typography>
          <Button variant="outlined" component="label" color="primary">
            Choose Image
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => setPreviewImage(e.target.files[0])}
            />
          </Button>
          {previewImage && (
            <Typography variant="caption" sx={{ ml: 2 }}>
              {previewImage.name}
            </Typography>
          )}
        </Box>

        <Box>
          <Typography
            variant="caption"
            sx={{ color: "#7A7266", display: "block", mb: 0.5 }}
          >
            Replace Layout File (optional)
          </Typography>
          <Button variant="outlined" component="label" color="primary">
            Choose File
            <input
              type="file"
              hidden
              onChange={(e) => setLayoutFile(e.target.files[0])}
            />
          </Button>
          {layoutFile && (
            <Typography variant="caption" sx={{ ml: 2 }}>
              {layoutFile.name}
            </Typography>
          )}
        </Box>

        <FormControlLabel
          control={
            <Switch
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
          }
          label="Active"
        />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? "Saving..." : "Save Changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditLayoutModal;
