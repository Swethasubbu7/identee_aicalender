import React, { useState } from "react";
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
} from "@mui/material";
import { uploadLayout } from "../../services/layoutService";

const TYPE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "special-cut", label: "Special Cut" },
  { value: "die-cut", label: "Die Cut" },
];

const SIZE_OPTIONS = ["A4", "A3", "12 x 18 inch", "Custom"];

const initialState = { name: "", type: "normal", size: "A4", description: "" };

const UploadLayoutModal = ({ open, onClose, onSuccess }) => {
  const [form, setForm] = useState(initialState);
  const [previewImage, setPreviewImage] = useState(null);
  const [layoutFile, setLayoutFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (field) => (e) =>
    setForm({ ...form, [field]: e.target.value });

  const resetAndClose = () => {
    setForm(initialState);
    setPreviewImage(null);
    setLayoutFile(null);
    setError("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!form.name || !form.type || !form.size) {
      setError("Name, type and size are required.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const formData = new FormData();
      formData.append("name", form.name);
      formData.append("type", form.type);
      formData.append("size", form.size);
      formData.append("description", form.description);
      if (previewImage) formData.append("previewImage", previewImage);
      if (layoutFile) formData.append("layoutFile", layoutFile);

      await uploadLayout(formData);
      resetAndClose();
      onSuccess();
    } catch (err) {
      console.error("Upload failed:", err);
      setError(
        err.response?.data?.message ||
          "Failed to upload layout. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={resetAndClose} maxWidth="sm" fullWidth>
      <DialogTitle>Upload New Layout</DialogTitle>
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
            Preview Image
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
            Layout File
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
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={resetAndClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? "Uploading..." : "Upload Layout"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UploadLayoutModal;
