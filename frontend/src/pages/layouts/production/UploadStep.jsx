import { useEffect, useRef, useState } from "react";
import { Box, Button, TextField, Typography, Alert, LinearProgress, Chip, CircularProgress } from "@mui/material";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { CUT_TYPE_OPTIONS } from "../../../constants/cutTypes";
import { getCalendarFormats } from "../../../services/calendarFormatService";
import { detectLayoutFormat, importProductionPdf } from "../../../services/layoutVariantService";

const ACCENT = "#7d2ae8";
const codeFrom = (name) =>
  name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9/]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
// "12x18-1 production.pdf" → "12x18-1 production"
const nameFromFile = (file) => (file?.name || "").replace(/\.(pdf|cdr)$/i, "").replace(/[_]+/g, " ").trim().slice(0, 60);

// One drop zone for a PDF.
const FileDrop = ({ label, hint, file, onFile, disabled }) => {
  const [dragging, setDragging] = useState(false);
  return (
    <Box
      component="label"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(evt) => {
        evt.preventDefault();
        setDragging(false);
        const f = evt.dataTransfer.files?.[0];
        if (f && !disabled) onFile(f);
      }}
      sx={{
        flex: 1,
        minWidth: 220,
        border: `2px dashed ${dragging ? ACCENT : file ? "rgba(46,125,50,0.6)" : "var(--nc-border-neutral)"}`,
        borderRadius: 3,
        background: dragging ? "rgba(125,42,232,0.05)" : "var(--nc-surface-2)",
        p: 3,
        textAlign: "center",
        cursor: disabled ? "default" : "pointer",
        transition: "all .15s",
      }}
    >
      <input type="file" accept="application/pdf,.pdf,.cdr" hidden disabled={disabled} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <Typography sx={{ fontWeight: 800, mb: 0.5 }}>{label}</Typography>
      {file ? (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, flexWrap: "wrap" }}>
          <InsertDriveFileOutlinedIcon sx={{ color: ACCENT }} />
          <Typography sx={{ fontWeight: 600, wordBreak: "break-all" }}>{file.name}</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>({(file.size / 1024 / 1024).toFixed(1)} MB)</Typography>
        </Box>
      ) : (
        <>
          <CloudUploadOutlinedIcon sx={{ fontSize: 40, color: ACCENT }} />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>{hint}</Typography>
        </>
      )}
    </Box>
  );
};

// Step 1: the designer uploads the Production PDF and the Laser PDF. The
// calendar size and cut type are read from the laser PDF's cutline and the
// name from the file name — all pre-filled; the designer only confirms what
// the app is not sure about. Both files are then analysed automatically.
const UploadStep = ({ onImported }) => {
  const [name, setName] = useState("");
  const [cutType, setCutType] = useState("die-cut");
  const [sizeCode, setSizeCode] = useState("");
  const [formats, setFormats] = useState([]);
  const [file, setFile] = useState(null);
  const [laserFile, setLaserFile] = useState(null);
  const [detection, setDetection] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [existingVariantId, setExistingVariantId] = useState(null);
  const detectRun = useRef(0);
  const detectionRef = useRef(null);
  // Fields are only shown when the size could not be recognised automatically.
  const [manual, setManual] = useState(false); // the detected size, applied once its cut type's sizes load

  useEffect(() => {
    let cancelled = false;
    getCalendarFormats(cutType)
      .then((data) => {
        if (cancelled) return;
        const list = data?.formats || [];
        setFormats(list);
        const found = detectionRef.current;
        const detected = found?.cutType === cutType && list.some((x) => x.sizeCode === found.sizeCode) ? found.sizeCode : "";
        setSizeCode((s) => detected || (list.some((x) => x.sizeCode === s) ? s : ""));
      })
      .catch(() => !cancelled && setFormats([]));
    return () => {
      cancelled = true;
    };
  }, [cutType]);

  const pickProduction = (f) => {
    setFile(f);
    setName((n) => n || nameFromFile(f));
  };

  // Laser PDF chosen (manual mode only): read size + cut type from its cutline.
  const pickLaser = async (f) => {
    setLaserFile(f);
    if (!manual) return;
    setDetection(null);
    const run = ++detectRun.current;
    setDetecting(true);
    try {
      const found = await detectLayoutFormat(f);
      if (run !== detectRun.current) return;
      setDetection(found);
      detectionRef.current = found;
      if (found.cutType) setCutType(found.cutType);
      // Same cut type as shown: its sizes are already loaded.
      if (found.sizeCode && formats.some((x) => x.sizeCode === found.sizeCode) && found.cutType === cutType) setSizeCode(found.sizeCode);
    } catch (err) {
      if (run === detectRun.current) setDetection({ confident: false, reason: err.response?.data?.message || "The laser PDF could not be read." });
    } finally {
      if (run === detectRun.current) setDetecting(false);
    }
  };

  const submit = async (replace = false) => {
    if (!manual) return submitAuto();
    if (!name.trim() || !sizeCode || !file || !laserFile) {
      setError("Upload both PDFs and check the name, cut type and size.");
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
      fd.append("laserPdf", laserFile);
      const data = await importProductionPdf(fd, (evt) => setProgress(evt.total ? Math.round((evt.loaded / evt.total) * 100) : null));
      onImported(data.variantId);
    } catch (err) {
      setProgress(null);
      setBusy(false);
      setError(err.response?.data?.message || "Upload failed.");
      if (err.response?.status === 409) setExistingVariantId(err.response.data.variantId);
    }
  };

  // Automatic: only the two PDFs; the server reads name, size and cut type.
  const submitAuto = async () => {
    if (!file || !laserFile) return setError("Upload both PDFs.");
    setError("");
    setProgress(0);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("auto", "true");
      fd.append("familyName", nameFromFile(file) || "Layout");
      fd.append("productionPdf", file);
      fd.append("laserPdf", laserFile);
      const data = await importProductionPdf(fd, (evt) => setProgress(evt.total ? Math.round((evt.loaded / evt.total) * 100) : null));
      onImported(data.variantId);
    } catch (err) {
      setProgress(null);
      setBusy(false);
      // Size not recognised: show the fields (pre-filled where possible).
      if (err.response?.status === 422) {
        const found = err.response.data.detection || null;
        setManual(true);
        setDetection(found);
        detectionRef.current = found;
        if (found?.cutType) setCutType(found.cutType);
        setName((n) => n || nameFromFile(file));
      }
      setError(err.response?.data?.message || "Upload failed.");
    }
  };

  const chip = (selected) => ({
    borderRadius: 2,
    fontWeight: 600,
    ...(selected ? { background: ACCENT, color: "#fff", "&:hover": { background: "#6a1fd0" } } : {}),
  });
  const needsConfirm = detection && !detection.confident;

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", width: "100%", display: "flex", flexDirection: "column", gap: 3, py: 2 }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>New calendar layout</Typography>
        <Typography sx={{ color: "text.secondary" }}>
          Upload the two files — that is all. The tool reads the size, cut type, cut shape, God picture area, business name,
          side boxes and calendar pad, saves the layout, checks it for print and publishes it. You are only asked if something
          cannot be found.
        </Typography>
      </Box>

      {error && (
        <Alert
          severity="error"
          action={
            existingVariantId && (
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button color="inherit" size="small" onClick={() => onImported(existingVariantId, { fresh: false })}>Open it</Button>
                <Button color="inherit" size="small" onClick={() => submit(true)}>Replace</Button>
              </Box>
            )
          }
        >
          {error}
        </Alert>
      )}

      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        <FileDrop label="1. Production PDF" hint="The printing artwork · PDF" file={file} onFile={pickProduction} disabled={busy} />
        <FileDrop label="2. Laser PDF" hint="The cutting file · PDF" file={laserFile} onFile={pickLaser} disabled={busy} />
      </Box>

      {(detecting || detection) && (
        <Alert
          severity={detecting ? "info" : detection.confident ? "success" : "warning"}
          icon={detecting ? <CircularProgress size={18} /> : <AutoAwesomeIcon fontSize="small" />}
        >
          {detecting ? "Reading the laser PDF…" : detection.reason}
          {!detecting && detection.cutType && detection.confident && " Size and cut type are filled in below."}
        </Alert>
      )}

      {manual && file && laserFile && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, p: 2.5, borderRadius: 3, background: "var(--nc-paper)", border: "1px solid var(--nc-border)" }}>
          <TextField label="Layout name" placeholder="e.g. Perumal special" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} fullWidth size="small" />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              Cut type {needsConfirm && <Typography component="span" variant="caption" sx={{ color: "#ef6c00", fontWeight: 700 }}>· please confirm</Typography>}
            </Typography>
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
        </Box>
      )}

      {busy && (
        <Box>
          <LinearProgress variant={progress === null || progress >= 100 ? "indeterminate" : "determinate"} value={progress || 0} sx={{ borderRadius: 2, "& .MuiLinearProgress-bar": { background: ACCENT } }} />
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {progress === null || progress >= 100 ? "Reading both PDFs (size, cut type, areas)…" : `Uploading… ${progress}%`}
          </Typography>
        </Box>
      )}

      <Button
        variant="contained"
        size="large"
        onClick={() => submit(false)}
        disabled={busy || detecting || !file || !laserFile || (manual && (!sizeCode || !name.trim()))}
        sx={{ background: ACCENT, "&:hover": { background: "#6a1fd0" }, borderRadius: 2, textTransform: "none", fontWeight: 700, py: 1.25 }}
      >
        {manual ? "Analyse & set up" : "Upload & set up automatically"}
      </Button>
    </Box>
  );
};

export default UploadStep;
