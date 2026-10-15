import { useRef } from "react";
import { Box, Button, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";

// Content inputs shared by Customise and AI Generate.
export const SectionLabel = ({ children }) => (
  <Typography variant="caption" sx={{ color: "#7A7266", fontWeight: 700, letterSpacing: 0.5, display: "block", mb: 1 }}>
    {children}
  </Typography>
);

export const ImageSlot = ({ slot, value, uploading, onPick, onRemove }) => {
  const inputRef = useRef(null);
  return (
    <Box>
      <SectionLabel>{slot.label.toUpperCase()}</SectionLabel>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
      {value ? (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <Box
            component="img"
            src={value.url}
            alt={slot.label}
            sx={{ width: 64, height: 64, objectFit: "cover", borderRadius: 1.5, border: "1px solid rgba(176,141,53,0.3)" }}
          />
          <Button size="small" variant="outlined" onClick={() => inputRef.current?.click()} disabled={uploading}>
            Change
          </Button>
          <Tooltip title="Remove">
            <span>
              <IconButton size="small" onClick={onRemove} disabled={uploading}>
                <DeleteOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          {uploading && <CircularProgress size={18} />}
        </Box>
      ) : (
        <Button
          fullWidth
          variant="outlined"
          startIcon={<CloudUploadOutlinedIcon />}
          onClick={() => inputRef.current?.click()}
          sx={{ borderStyle: "dashed", py: 1.25 }}
        >
          {slot.button}
        </Button>
      )}
    </Box>
  );
};
