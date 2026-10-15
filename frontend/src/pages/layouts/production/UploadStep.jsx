import { useEffect, useState } from "react";
import { Box, Button, TextField, Typography, Alert, LinearProgress, Chip } from "@mui/material";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import CloseIcon from "@mui/icons-material/Close";
import { CUT_TYPE_OPTIONS } from "../../../constants/cutTypes";
import { getCalendarFormats } from "../../../services/calendarFormatService";
import { importProductionPdf } from "../../../services/layoutVariantService";

const ACCENT = "#7d2ae8";
const codeFrom = (name) =>
  name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9/]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

// Step 1: name, cut type, size and the design file. Any readable PDF works;
// a separate cutting (laser) file is optional and can be added later.
const UploadStep = ({ onImported }) => {
  const [name, setName] = useState("");
  const [cutType, setCutType] = useState("die-cut");
  const [sizeCode, setSizeCode] = useState("");
  const [formats, setFormats] = useState([]);
  const [file, setFile] = useState(null);
  const [laserFile, setLaserFile] = useState(null);
  const [showLaser, setShowLaser] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [existingVariantId, setExistingVariantId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getCalendarFormats(cutType)
      .then((data) => {
        if (cancelled) return;
        const list = data?.formats || [];
        setFormats(list);
        setSizeCode((s) => (list.some((x) => x.sizeCode === s) ? s : ""));
      })
      .catch(() => !cancelled && setFormats([]));
    return () => {
      cancelled = true;
    };
  }, [cutType]);

  const submit = async (replace = false) => {
    if (!name.trim() || !sizeCode || !file) {
      setError("Add a name, choose the size and upload the design.");
      return;
    }
    setError("");
    setExistingVariantId(null);
    setProgress(0);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("familyCode", codeFrom(name));
      fd.append("familyName", name.trim());
      fd.append("cutType", cutType);
      fd.append("sizeCode", sizeCode);
      if (replace) fd.append("replace", "true");
      fd.append("productionPdf", file);
      if (laserFile) fd.append("laserPdf", laserFile);
      const data = await importProductionPdf(fd, (evt) => setProgress(evt.total ? Math.round((evt.loaded / evt.total) * 100) : null));
      onImported(data.variantId);
    } catch (err) {
      setProgress(null);
      setBusy(false);
      setError(err.response?.data?.message || "Upload failed.");
      if (err.response?.status === 409) setExistingVariantId(err.response.data.variantId);
    }
  };

  const drop = (evt) => {
    evt.preventDefault();
    setDragging(false);
    const f = evt.dataTransfer.files?.[0];
    if (f) setFile(f);
  };
  const chip = (selected) => ({
    borderRadius: 2,
    fontWeight: 600,
    ...(selected ? { background: ACCENT, color: "#fff", "&:hover": { background: "#6a1fd0" } } : {}),
  });

  return (
    <Box sx={{ maxWidth: 620, mx: "auto", width: "100%", display: "flex", flexDirection: "column", gap: 3, py: 2 }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>New calendar layout</Typography>
        <Typography sx={{ color: "text.secondary" }}>Upload a design — we&apos;ll find the cut shape, calendar pad and text for you.</Typography>
      </Box>

      {error && (
        <Alert
          severity="error"
          action={
            existingVariantId && (
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button color="inherit" size="small" onClick={() => onImported(existingVariantId)}>Open it</Button>
                <Button color="inherit" size="small" onClick={() => submit(true)}>Replace</Button>
              </Box>
            )
          }
        >
          {error}
        </Alert>
      )}

      <TextField label="Layout name" placeholder="e.g. Perumal special" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} fullWidth />

      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Cut type</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {CUT_TYPE_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} clickable disabled={busy} onClick={() => setCutType(o.value)} sx={chip(cutType === o.value)} />
          ))}
        </Box>
      </Box>

      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Size (inches)</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {formats.map((f) => (
            <Chip key={f._id} label={f.label} clickable disabled={busy} onClick={() => setSizeCode(f.sizeCode)} sx={chip(sizeCode === f.sizeCode)} />
          ))}
        </Box>
      </Box>

      <Box
        component="label"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        sx={{
          border: `2px dashed ${dragging ? ACCENT : "#d6d6d6"}`,
          borderRadius: 3,
          background: dragging ? "rgba(125,42,232,0.05)" : "#fafafa",
          p: 4,
          textAlign: "center",
          cursor: busy ? "default" : "pointer",
          transition: "all .15s",
        }}
      >
        <input type="file" accept="application/pdf,.pdf,.cdr" hidden disabled={busy} onChange={(e) => setFile(e.target.files?.[0] || null)} />
        {file ? (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
            <InsertDriveFileOutlinedIcon sx={{ color: ACCENT }} />
            <Typography sx={{ fontWeight: 600 }}>{file.name}</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>({(file.size / 1024 / 1024).toFixed(1)} MB)</Typography>
          </Box>
        ) : (
          <>
            <CloudUploadOutlinedIcon sx={{ fontSize: 44, color: ACCENT }} />
            <Typography sx={{ fontWeight: 700, mt: 1 }}>Drop your design here</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>or click to browse · PDF</Typography>
          </>
        )}
      </Box>

      {showLaser || laserFile ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button size="small" component="label" disabled={busy} sx={{ textTransform: "none" }}>
            {laserFile ? laserFile.name : "Choose cutting file"}
            <input type="file" accept="application/pdf,.pdf,.cdr" hidden onChange={(e) => setLaserFile(e.target.files?.[0] || null)} />
          </Button>
          <Button size="small" sx={{ minWidth: 0 }} onClick={() => { setLaserFile(null); setShowLaser(false); }}><CloseIcon fontSize="small" /></Button>
        </Box>
      ) : (
        <Button size="small" onClick={() => setShowLaser(true)} sx={{ alignSelf: "flex-start", textTransform: "none", color: "text.secondary" }}>
          + Have a separate cutting file? (optional)
        </Button>
      )}

      {busy && (
        <Box>
          <LinearProgress variant={progress === null || progress >= 100 ? "indeterminate" : "determinate"} value={progress || 0} sx={{ borderRadius: 2, "& .MuiLinearProgress-bar": { background: ACCENT } }} />
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {progress === null || progress >= 100 ? "Reading your design…" : `Uploading… ${progress}%`}
          </Typography>
        </Box>
      )}

      <Button
        variant="contained"
        size="large"
        onClick={() => submit(false)}
        disabled={busy || !file || !sizeCode || !name.trim()}
        sx={{ background: ACCENT, "&:hover": { background: "#6a1fd0" }, borderRadius: 2, textTransform: "none", fontWeight: 700, py: 1.25 }}
      >
        Continue
      </Button>
    </Box>
  );
};

export default UploadStep;
