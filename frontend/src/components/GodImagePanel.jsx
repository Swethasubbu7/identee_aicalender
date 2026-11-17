import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import SearchIcon from "@mui/icons-material/Search";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import AddIcon from "@mui/icons-material/Add";
import { imageQuality, GOOD_DPI } from "../utils/imageQuality";
import { searchGodImages } from "../services/godImageService";
import { processGodImage } from "../services/calendarDesignService";
import GodLibraryDialog from "./GodLibraryDialog";

const SEARCH_DEBOUNCE_MS = 250;
const TARGET_DPI = 200; // what "Enhance" aims for (it enlarges at most ×2 per use)

const checker = "repeating-conic-gradient(var(--nc-surface-2) 0 25%, var(--nc-paper) 0 50%) 0 0 / 14px 14px";

const QUALITY_TEXT = {
  ok: (q) => `Good for print (about ${q.dpi} DPI at this size).`,
  low: (q) => `Low resolution: about ${q.dpi} DPI at this size, so it may print slightly soft. Try Enhance, or upload a larger image.`,
  poor: (q) => `Very low resolution: about ${q.dpi} DPI at this size, so it will print blurry. Upload a larger image; Enhance can only help a little.`,
};

// God image for Customise (Normal and AI Mode): upload, pick from the
// default library (search by name / alias), quality check, and free
// background removal / enhancement — always previewed before applying, the
// original is kept. Choosing an image never calls an AI service.
//   value    — { path, url, widthPx, heightPx, libraryName? } | null
//   original — the image before background removal / enhancement, or null
//   onChange({ godImage, godImageOriginal })
const GodImagePanel = ({ slot, variant, value, original, uploading, onUpload, onChange, emptyHint }) => {
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null); // null = not searched yet
  const [searching, setSearching] = useState(false);
  const [libraryDialog, setLibraryDialog] = useState(null); // { image } | { add: true }
  const [pendingPick, setPendingPick] = useState(null); // library image waiting for "replace?" confirmation
  const [tool, setTool] = useState({ busy: null, error: "" });
  const [candidate, setCandidate] = useState(null); // { op, path, url, widthPx, heightPx, note }

  // Search the library as the designer types.
  useEffect(() => {
    const q = query.trim();
    if (!q) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      searchGodImages(q)
        .then((images) => !cancelled && setResults(images))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Results are shown only while something is typed.
  const shownResults = query.trim() ? results : null;
  const quality = value ? imageQuality(slot, value, variant) : null;
  const busy = Boolean(uploading || tool.busy);

  const applyLibraryImage = (image) => {
    onChange({
      godImage: { path: image.path, url: image.url, widthPx: image.widthPx, heightPx: image.heightPx, libraryName: image.name, fromLibrary: true },
      godImageOriginal: null,
    });
    setQuery("");
    setResults(null);
  };
  // A designer's own upload is never replaced without asking.
  const pickLibraryImage = (image) => {
    if (value && !value.fromLibrary) setPendingPick(image);
    else applyLibraryImage(image);
  };

  const runTool = async (op) => {
    if (!value?.path) return;
    setTool({ busy: op, error: "" });
    try {
      const longPx = Math.max(value.widthPx || 0, value.heightPx || 0);
      const targetLongPx = quality?.dpi && longPx ? Math.round((longPx * TARGET_DPI) / quality.dpi) : null;
      const result = await processGodImage({ source: value.path, op, targetLongPx });
      let note = "";
      if (op === "remove-background") {
        if (result.alreadyTransparent) note = "This image already has a transparent background.";
        else if (!result.plainBackground || result.removedShare < 0.05)
          note = "The background is not plain, so it could only be partly removed. Check the result carefully, or use an image with a plain background.";
      } else if (result.scale <= 1.01) {
        note = "This image is already as large as Enhance makes it.";
      }
      setCandidate({ op, ...result, note });
      setTool({ busy: null, error: "" });
    } catch (err) {
      setTool({ busy: null, error: err.response?.data?.message || "The image could not be processed." });
    }
  };

  const applyCandidate = () => {
    const { path, url, widthPx, heightPx } = candidate;
    onChange({
      godImage: { path, url, widthPx, heightPx, edited: true },
      // The first version is kept, so the edits can be undone.
      godImageOriginal: original || value,
    });
    setCandidate(null);
  };

  return (
    <Box data-testid="god-image-panel">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />

      {/* Current image */}
      {value ? (
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
          <Box
            component="img"
            src={value.url}
            alt="God image"
            sx={{ width: 84, height: 84, objectFit: "contain", borderRadius: 1.5, border: "1px solid rgba(176,141,53,0.3)", background: checker, flexShrink: 0 }}
          />
          <Box sx={{ minWidth: 0, flexGrow: 1, display: "flex", flexDirection: "column", gap: 0.75 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
              {value.fromLibrary
                ? value.libraryName
                  ? `Library: ${value.libraryName}`
                  : "From the God image library"
                : value.edited
                  ? "Edited image (original kept)"
                  : "Your uploaded image"}
            </Typography>
            {value.widthPx && (
              <Typography variant="caption" sx={{ color: "var(--nc-text-2)" }}>
                {value.widthPx} × {value.heightPx} px
              </Typography>
            )}
            <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
              <Button size="small" variant="outlined" onClick={() => inputRef.current?.click()} disabled={busy}>
                Change
              </Button>
              <Tooltip title="Remove">
                <span>
                  <IconButton size="small" onClick={() => onChange({ godImage: null, godImageOriginal: null })} disabled={busy}>
                    <DeleteOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              {uploading && <CircularProgress size={18} sx={{ alignSelf: "center" }} />}
            </Box>
          </Box>
        </Box>
      ) : (
        <Button
          fullWidth
          variant="outlined"
          startIcon={uploading ? <CircularProgress size={16} /> : <CloudUploadOutlinedIcon />}
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          sx={{ borderStyle: "dashed", py: 1.25 }}
        >
          Upload God Image
        </Button>
      )}
      {!value && emptyHint && (
        <Typography variant="caption" sx={{ color: "var(--nc-text-2)", display: "block", mt: 0.75 }}>
          {emptyHint}
        </Typography>
      )}

      {/* Quality check */}
      {value && quality && (
        <Alert
          severity={quality.level === "ok" ? "success" : quality.level === "low" ? "warning" : "error"}
          sx={{ mt: 1.25, py: 0, "& .MuiAlert-message": { fontSize: 12.5 } }}
        >
          {QUALITY_TEXT[quality.level](quality)}
        </Alert>
      )}

      {/* Free tools (preview first) */}
      {value && (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.25 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => runTool("remove-background")}
            disabled={busy || !value.path}
            startIcon={tool.busy === "remove-background" ? <CircularProgress size={14} /> : null}
          >
            Remove background
          </Button>
          <Button
            size="small"
            variant={quality && quality.level !== "ok" ? "contained" : "outlined"}
            onClick={() => runTool("enhance")}
            disabled={busy || !value.path}
            startIcon={tool.busy === "enhance" ? <CircularProgress size={14} color="inherit" /> : null}
          >
            Enhance image
          </Button>
          {original && (
            <Button size="small" onClick={() => onChange({ godImage: original, godImageOriginal: null })} disabled={busy}>
              Restore original
            </Button>
          )}
        </Box>
      )}
      {value && (
        <Typography variant="caption" sx={{ color: "var(--nc-text-3)", display: "block", mt: 0.5 }}>
          Free tools on our server (no AI, no cost). You see the result before it is used.
        </Typography>
      )}
      {tool.error && (
        <Alert severity="error" sx={{ mt: 1, py: 0 }}>
          {tool.error}
        </Alert>
      )}

      {/* Library search */}
      <TextField
        fullWidth
        size="small"
        placeholder="Search saved God images (e.g. Vinayagar)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{ mt: 1.75 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: searching ? (
              <InputAdornment position="end">
                <CircularProgress size={14} />
              </InputAdornment>
            ) : null,
          },
          htmlInput: { "aria-label": "Search the God image library" },
        }}
      />
      {shownResults && (
        <Box sx={{ mt: 1 }}>
          {shownResults.length === 0 ? (
            <Box sx={{ p: 1.25, borderRadius: 2, background: "var(--nc-surface-2)" }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                No saved image for “{query.trim()}”.
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button size="small" variant="outlined" startIcon={<CloudUploadOutlinedIcon />} onClick={() => inputRef.current?.click()}>
                  Upload your own
                </Button>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setLibraryDialog({ add: true })}>
                  Add to library
                </Button>
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 1, maxHeight: 260, overflowY: "auto", pr: 0.5 }}>
              {shownResults.map((image) => {
                const selected = value?.path === image.path;
                return (
                  <Box
                    key={image._id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Use ${image.name}`}
                    onClick={() => pickLibraryImage(image)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pickLibraryImage(image))}
                    sx={{
                      position: "relative",
                      borderRadius: 2,
                      border: selected ? "2px solid #B08D35" : "1px solid var(--nc-border)",
                      background: "var(--nc-paper)",
                      cursor: "pointer",
                      overflow: "hidden",
                      "&:hover": { borderColor: "#B08D35" },
                      "&:focus-visible": { outline: "2px solid #B08D35", outlineOffset: 2 },
                    }}
                  >
                    <Box component="img" src={image.thumbUrl} alt={image.name} loading="lazy" sx={{ width: "100%", height: 84, objectFit: "contain", display: "block", background: checker }} />
                    <Typography variant="caption" sx={{ display: "block", px: 0.75, py: 0.5, fontWeight: 600 }} noWrap title={[image.name, ...image.aliases].join(", ")}>
                      {image.name}
                    </Typography>
                    <IconButton
                      size="small"
                      aria-label={`Edit ${image.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLibraryDialog({ image });
                      }}
                      sx={{ position: "absolute", top: 2, right: 2, p: 0.25, background: "rgba(255,255,255,0.85)", "&:hover": { background: "#fff" } }}
                    >
                      <EditOutlinedIcon sx={{ fontSize: 14, color: "#2A2620" }} />
                    </IconButton>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      )}
      <Button size="small" startIcon={<AddIcon />} onClick={() => setLibraryDialog({ add: true })} sx={{ mt: 0.75 }}>
        Add an image to the library
      </Button>

      <GodLibraryDialog
        open={Boolean(libraryDialog)}
        image={libraryDialog?.image || null}
        initialName={query.trim()}
        onClose={() => setLibraryDialog(null)}
        onDone={(image) => {
          const adding = libraryDialog?.add;
          setLibraryDialog(null);
          if (adding && image) pickLibraryImage(image);
          // Edited or hidden: update the shown results in place.
          if (!adding) {
            const id = libraryDialog?.image?._id;
            setResults((list) => (list ? list.flatMap((i) => (i._id !== id ? [i] : image ? [image] : [])) : list));
          }
        }}
      />

      {/* Replace the designer's own upload? */}
      <Dialog open={Boolean(pendingPick)} onClose={() => setPendingPick(null)} maxWidth="xs">
        <DialogTitle>Replace your uploaded image?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Your uploaded God image will be replaced with “{pendingPick?.name}” from the library.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingPick(null)}>Keep mine</Button>
          <Button
            variant="contained"
            onClick={() => {
              applyLibraryImage(pendingPick);
              setPendingPick(null);
            }}
          >
            Replace
          </Button>
        </DialogActions>
      </Dialog>

      {/* Before / after preview of a tool result */}
      <Dialog open={Boolean(candidate)} onClose={() => setCandidate(null)} maxWidth="md" fullWidth>
        <DialogTitle>{candidate?.op === "remove-background" ? "Background removal: preview" : "Enhancement: preview"}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            {[
              ["Before", value?.url, value],
              ["After", candidate?.url, candidate],
            ].map(([label, url, info]) => (
              <Box key={label}>
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 0.75 }}>
                  <Typography sx={{ fontWeight: 700 }}>{label}</Typography>
                  {info?.widthPx && (
                    <Typography variant="caption" sx={{ color: "var(--nc-text-2)" }}>
                      {info.widthPx} × {info.heightPx} px
                    </Typography>
                  )}
                </Box>
                <Box sx={{ height: { xs: 220, sm: 340 }, borderRadius: 2, background: checker, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--nc-border)" }}>
                  {url && <Box component="img" src={url} alt={label} sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />}
                </Box>
              </Box>
            ))}
          </Box>
          {candidate?.note && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {candidate.note}
            </Alert>
          )}
          {candidate?.op === "enhance" && (
            <Typography variant="caption" sx={{ color: "var(--nc-text-2)", display: "block", mt: 1.5 }}>
              Enhance enlarges the picture and sharpens it gently ({GOOD_DPI} DPI or more prints well). It cannot add detail
              that the original does not have.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Chip label="Original is kept" size="small" sx={{ mr: "auto", ml: 1 }} />
          <Button onClick={() => setCandidate(null)}>Discard</Button>
          <Button variant="contained" onClick={applyCandidate}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GodImagePanel;
