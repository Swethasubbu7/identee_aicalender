import { Box, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { CUT_TYPE_LABELS } from "../constants/cutTypes";

const formatDate = (isoString) => {
  if (!isoString) return "";
  return new Date(isoString).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Where a saved design opens, and how its card looks. Two kinds exist:
 * production-layout designs (Customise page, variantId) and older
 * preview-only designs (layoutId). A design whose layout was deleted has no
 * link and is shown as unavailable.
 * Picture: the saved design itself; for drafts saved before thumbnails
 * existed, the customer's god image; otherwise the layout's preview.
 */
const describeDesign = (design) => {
  const variant = design.variantId;
  if (variant?._id) {
    const family = variant.familyId || {};
    return {
      link: `/calendar/production/${variant._id}?design=${design._id}`,
      title: design.content?.businessName?.trim() || family.code || "Untitled calendar",
      subtitle: `${CUT_TYPE_LABELS[variant.cutType] || ""} ${variant.sizeCode?.replace("x", "×") || ""} · ${family.code || "layout"}`.trim(),
      preview: design.thumbnailUrl || design.content?.godImageUrl || variant.assets?.preview || null,
    };
  }
  if (design.layoutId?._id) {
    return {
      link: `/calendar/customise/${design.layoutId._id}`,
      title: design.layoutId.name || "Untitled calendar",
      subtitle: "Preview layout",
      preview: design.thumbnailUrl || design.layoutId.previewImage || null,
    };
  }
  return {
    link: null,
    title: design.content?.businessName?.trim() || "Untitled calendar",
    subtitle: "Layout no longer available",
    preview: design.thumbnailUrl || design.content?.godImageUrl || null,
  };
};

const DesignCard = ({ design, onOpen, onDelete, deleting = false }) => {
  const { link, title, subtitle, preview } = describeDesign(design);
  const saved = design.status === "saved";
  return (
    <Box
      onClick={() => link && !deleting && onOpen(link)}
      sx={{
        position: "relative",
        background: "#FFFFFF",
        border: "1px solid rgba(176,141,53,0.15)",
        borderRadius: 3,
        overflow: "hidden",
        cursor: link ? "pointer" : "default",
        opacity: deleting ? 0.5 : link ? 1 : 0.7,
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        "&:hover": link ? { transform: "translateY(-4px)", boxShadow: "0 8px 20px rgba(176,141,53,0.15)" } : {},
      }}
    >
      {onDelete && (
        <Tooltip title="Delete project">
          <span style={{ position: "absolute", top: 8, right: 8, zIndex: 1 }}>
            <IconButton
              size="small"
              disabled={deleting}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(design, title);
              }}
              sx={{ background: "rgba(255,255,255,0.9)", "&:hover": { background: "#fff", color: "#c62828" } }}
            >
              <DeleteOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      )}
      {preview ? (
        <Box
          component="img"
          src={preview}
          alt={title}
          sx={{ width: "100%", height: 180, objectFit: "contain", display: "block", background: "#F3EEE2" }}
        />
      ) : (
        <Box sx={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", background: "#EEE9DD", color: "#A9A296" }}>
          <Typography variant="body2">No preview</Typography>
        </Box>
      )}
      <Box sx={{ p: 1.5 }}>
        <Typography variant="body2" sx={{ color: "#2A2620", fontWeight: 600 }} noWrap title={title}>
          {title}
        </Typography>
        <Typography variant="caption" sx={{ color: "#7A7266", display: "block" }} noWrap title={subtitle}>
          {subtitle}
        </Typography>
        <Typography variant="caption" sx={{ color: "#A9A296", display: "block", mb: 1 }}>
          Last edited: {formatDate(design.updatedAt)}
        </Typography>
        <Chip
          label={saved ? "Completed" : "Draft"}
          size="small"
          sx={{
            background: saved ? "rgba(56,142,60,0.12)" : "rgba(176,141,53,0.12)",
            color: saved ? "#2e7d32" : "#8a6d1f",
            fontWeight: 600,
          }}
        />
      </Box>
    </Box>
  );
};

export default DesignCard;
