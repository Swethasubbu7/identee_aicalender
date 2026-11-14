import { useState } from "react";
import { Box, Chip, CircularProgress, Typography } from "@mui/material";
import ImageNotSupportedOutlinedIcon from "@mui/icons-material/ImageNotSupportedOutlined";
import { CUT_TYPE_LABELS } from "../constants/cutTypes";

const formatDate = (isoString) =>
  isoString ? new Date(isoString).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "";

// A design made by AI Generate. Clicking opens its designs page (preview,
// print check, PDFs).
const Placeholder = ({ busy, text }) => (
  <Box sx={{ height: 200, display: "flex", flexDirection: "column", gap: 1, alignItems: "center", justifyContent: "center", background: "#EEE9DD", color: "#7A7266", textAlign: "center", px: 2 }}>
    {busy ? <CircularProgress size={22} sx={{ color: "#B08D35" }} /> : <ImageNotSupportedOutlinedIcon sx={{ color: "#B5AC9C" }} />}
    <Typography variant="caption">{text}</Typography>
  </Box>
);

const GeneratedDesignCard = ({ job, variation, onOpen }) => {
  const ready = variation.status === "DONE";
  const picture = variation.previewUrl || variation.godImageUrl;
  // The picture link can fail (file not on shared storage yet, or removed).
  const [failedSrc, setFailedSrc] = useState(null);
  const broken = Boolean(picture) && failedSrc === picture;
  const creator = job.createdBy?.isMe ? "You" : job.createdBy?.name || "Unknown";
  return (
    <Box
      onClick={() => onOpen(`/calendar/designs/${job._id}`)}
      sx={{
        background: "#FFFFFF",
        border: "1px solid rgba(176,141,53,0.15)",
        borderRadius: 3,
        overflow: "hidden",
        cursor: "pointer",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        "&:hover": { transform: "translateY(-4px)", boxShadow: "0 8px 20px rgba(176,141,53,0.15)" },
      }}
    >
      {!ready ? (
        <Placeholder busy text="AI is designing…" />
      ) : !picture ? (
        <Placeholder text="No preview yet — open the design to create it" />
      ) : broken ? (
        <Placeholder text="Image unavailable" />
      ) : (
        <Box
          component="img"
          src={picture}
          alt={job.businessName}
          loading="lazy"
          onError={() => setFailedSrc(picture)}
          sx={{ width: "100%", height: 200, objectFit: "contain", display: "block", background: "#F3EEE2" }}
        />
      )}
      <Box sx={{ p: 1.5 }}>
        <Typography variant="body2" sx={{ color: "#2A2620", fontWeight: 600 }} noWrap title={job.businessName}>
          {job.businessName || "Untitled calendar"}
        </Typography>
        <Typography variant="caption" sx={{ color: "#7A7266", display: "block" }} noWrap>
          Design {variation.index + 1} · {variation.layoutCode || "layout"} · {CUT_TYPE_LABELS[job.cutType]} {job.sizeCode?.replace("x", "×")}
        </Typography>
        <Typography variant="caption" sx={{ color: "#7A7266", display: "block" }} noWrap title={`Created by ${creator}`}>
          Created by: {creator}
        </Typography>
        <Typography variant="caption" sx={{ color: "#A9A296", display: "block", mb: 1 }}>
          Generated: {formatDate(job.createdAt)}
        </Typography>
        <Chip
          size="small"
          label={variation.pdfReady ? "PDF ready" : ready ? "AI design" : "Generating"}
          sx={{
            background: variation.pdfReady ? "rgba(56,142,60,0.12)" : "rgba(176,141,53,0.12)",
            color: variation.pdfReady ? "#2e7d32" : "#8a6d1f",
            fontWeight: 600,
          }}
        />
      </Box>
    </Box>
  );
};

export default GeneratedDesignCard;
