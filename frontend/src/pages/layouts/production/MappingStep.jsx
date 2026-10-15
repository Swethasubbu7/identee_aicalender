import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Alert,
  Checkbox,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import {
  ROLE_INFO,
  ROLES_BY_CUT_TYPE,
  MULTI_ROLES,
  TEXT_ROLES,
  LINE_BINDING_OPTIONS,
} from "../../../constants/layoutRoles";
import {
  getImportedObjects,
  saveLayoutMapping,
  uploadLayoutAssets,
  uploadLaserPdf,
} from "../../../services/layoutVariantService";
import ImportFindings from "./ImportFindings";
import { startPageRender } from "../../../utils/pdfRender";
import { generateLayoutAssets } from "../../../utils/layoutAssets";

const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8];
const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1);
const area = (o) => o.bbox.width * o.bbox.height;
const unionBox = (boxes) => {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};
const describe = (o) => {
  const size = `${fmt(o.bbox.width)} × ${fmt(o.bbox.height)} mm`;
  if (o.type === "text") return `Text “${o.text.split("\n")[0].slice(0, 28)}” · ${o.fontName || "?"} ${o.fontSizePt} pt · ${size}`;
  if (o.type === "image") return `Image ${o.imageWidthPx}×${o.imageHeightPx} px · ${size}`;
  return `${o.closed ? "Closed" : "Open"} path (${o.paint}) · ${size}`;
};

let entryKey = 0;
const newEntry = (role, objectIds = [], extra = {}) => ({ key: ++entryKey, role, objectIds, ...extra });

const MappingStep = ({ variant, onSaved }) => {
  const summary = variant.importSummary || {};
  const roles = ROLES_BY_CUT_TYPE[variant.cutType] || { required: [], optional: [] };

  const [pageIndex, setPageIndex] = useState(variant.mapping?.pageIndex ?? summary.suggestedPageIndex ?? 0);
  const [page, setPage] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const [zoomIndex, setZoomIndex] = useState(0);
  const [baseScale, setBaseScale] = useState(1);
  const [show, setShow] = useState({ path: true, image: true, text: true, clip: false });

  const [hoverId, setHoverId] = useState(null);
  const [selected, setSelected] = useState([]);
  const [pointObjects, setPointObjects] = useState([]);

  const [cutlineId, setCutlineId] = useState(variant.mapping?.cutlineObjectId || null);
  // Same mark drawn on the artwork and next to the cutline (when the cutline
  // is drawn beside the artwork). Its exact offset places the cutline.
  const [registration, setRegistration] = useState(variant.mapping?.registration || null);
  // Objects that must never print (guide labels such as "4X5 INCHES").
  const [excluded, setExcluded] = useState(variant.mapping?.excludedObjectIds || []);
  // Where the cutline comes from: this PDF (one path or joined pieces), the
  // laser PDF (placed on the artwork), or none yet (draft from the artwork).
  const saved = variant.mapping || {};
  const laserSummary = summary.laser || null;
  const [cutlineSource, setCutlineSource] = useState(saved.cutlineSource || "design");
  const [joinIds, setJoinIds] = useState(saved.cutlineObjectIds || []);
  const [laserPage, setLaserPage] = useState(null);
  const [laserCutId] = useState(saved.laserCutlineObjectIds?.[0] || laserSummary?.analysis?.cutline?.id || null);
  const [laserAlign, setLaserAlign] = useState(() => {
    if (saved.laserAlignment) return { ...saved.laserAlignment };
    const s = laserSummary?.comparison?.suggestedAlignment;
    return s
      ? { method: s.method, designObjectId: s.designObjectId, laserObjectId: s.laserObjectId, offsetMm: s.offsetMm, confirmed: false }
      : { method: "manual", offsetMm: { x: 0, y: 0 }, confirmed: false };
  });
  const [artworkIds, setArtworkIds] = useState(saved.artworkObjectIds || []);
  const [laserBusy, setLaserBusy] = useState(false);
  const [entries, setEntries] = useState(() =>
    (variant.mapping?.regions || []).map((r) =>
      newEntry(r.role, r.objectIds, { binding: r.binding, textStyle: r.textStyle || {}, source: r.source || null }),
    ),
  );
  const [frameInfo, setFrameInfo] = useState(
    variant.assets?.frame ? { width: variant.assets.frameWidthPx, height: variant.assets.frameHeightPx } : null,
  );
  const [saving, setSaving] = useState(false);
  // An existing mapping is the fixed production foundation: shown read-only
  // until a designer deliberately unlocks it.
  const [locked, setLocked] = useState(Boolean(variant.mapping));
  const unlock = () => {
    if (
      window.confirm(
        "Unlocking lets you change which PDF objects form the production regions. " +
          "Saving a changed mapping sends the layout back to Draft and it must be validated again. Continue?",
      )
    ) {
      setLocked(false);
    }
  };

  const canvasRef = useRef(null);
  const scrollRef = useRef(null);

  const changePage = (index) => {
    setLoading(true);
    setError("");
    setSelected([]);
    setPointObjects([]);
    setPageIndex(index);
  };

  // Load the extracted objects for the selected page.
  useEffect(() => {
    let cancelled = false;
    getImportedObjects(variant._id, pageIndex)
      .then((data) => {
        if (cancelled) return;
        setPage(data.page);
        setPdfUrl(data.productionFile);
        setLaserPage(data.laserPage || null);
        // Largest image = the artwork (default for "artwork bounds" / draft trim).
        const biggest = data.page.objects
          .filter((o) => o.type === "image")
          .sort((a, b) => b.bbox.width * b.bbox.height - a.bbox.width * a.bbox.height)[0];
        if (biggest) {
          setArtworkIds((cur) => (cur.length ? cur : [biggest.id]));
          setLaserAlign((cur) =>
            cur.method === "artwork-bounds" && !cur.designObjectIds?.length ? { ...cur, designObjectIds: [biggest.id] } : cur,
          );
        }
        const candidates = summary.pages?.[pageIndex]?.cutlineCandidates || [];
        const suggestedRegistration = summary.pages?.[pageIndex]?.registration || null;
        const has = (id) => data.page.objects.some((o) => o.id === id);
        setRegistration((current) =>
          current && has(current.artObjectId) && has(current.cutlineObjectId)
            ? current
            : suggestedRegistration,
        );
        // Pre-select the cutline when it is clear: one candidate, detected
        // automatically, or the only candidate drawn as a line (a filled shape
        // of the same size is the artwork's die-shaped backing).
        const paintOf = (id) => data.page.objects.find((o) => o.id === id)?.paint;
        const strokeCandidates = candidates.filter((id) => ["stroke", "fillStroke"].includes(paintOf(id)));
        const autoCutline =
          candidates.length === 1
            ? candidates[0]
            : summary.pages?.[pageIndex]?.analysis?.detected?.cutline === "AUTO"
              ? candidates[0]
              : strokeCandidates.length === 1
                ? strokeCandidates[0]
                : null;
        setCutlineId((current) => (current && data.page.objects.some((o) => o.id === current) ? current : autoCutline));
      })
      .catch((err) => !cancelled && setError(err.response?.data?.message || "Could not load the PDF objects."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [variant._id, pageIndex, summary.pages]);

  // Everything to show: the PDF page plus objects drawn outside it (CorelDRAW
  // production files often place the cutline next to the page).
  const bounds = useMemo(() => {
    if (!page) return null;
    const boxes = [
      { x: 0, y: 0, width: page.widthMm, height: page.heightMm },
      ...page.objects.filter((o) => o.paint !== "clip").map((o) => o.bbox),
    ];
    const b = unionBox(boxes);
    const pad = 5;
    return { x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad };
  }, [page]);

  // Fit the whole content width into the viewer.
  useEffect(() => {
    if (!bounds || !scrollRef.current) return;
    setBaseScale((scrollRef.current.clientWidth - 24) / bounds.width);
  }, [bounds]);

  const pxPerMm = baseScale * ZOOMS[zoomIndex];

  useEffect(() => {
    if (!page || !pdfUrl || !canvasRef.current) return;
    let cancelled = false;
    const job = startPageRender(pdfUrl, pageIndex, canvasRef.current, pxPerMm);
    // Defer the spinner so state is not set synchronously inside the effect.
    Promise.resolve().then(() => !cancelled && setRendering(true));
    job.promise
      .catch((err) => !cancelled && setError(`Could not render the PDF: ${err.message}`))
      .finally(() => !cancelled && setRendering(false));
    return () => {
      cancelled = true;
      job.cancel();
    };
  }, [page, pdfUrl, pageIndex, pxPerMm]);

  const objectsById = useMemo(() => new Map((page?.objects || []).map((o) => [o.id, o])), [page]);
  // Objects drawn outside the PDF page (CorelDRAW often places the cutline
  // and a copy of the cake there): the PDF renderer does not show them, so
  // they are outlined on top of the viewer.
  const offPageObjects = useMemo(() => {
    if (!page) return [];
    const inside = (b) => b.x >= -1 && b.y >= -1 && b.x + b.width <= page.widthMm + 1 && b.y + b.height <= page.heightMm + 1;
    return page.objects.filter((o) => o.paint !== "clip" && !inside(o.bbox)).slice(0, 400);
  }, [page]);
  const visibleObjects = useMemo(
    () =>
      (page?.objects || []).filter((o) =>
        o.type === "path" ? (o.paint === "clip" ? show.clip : show.path) : show[o.type],
      ),
    [page, show],
  );

  const objectsAt = useCallback(
    (x, y) => {
      const pad = 1; // mm, so thin strokes are clickable
      return visibleObjects
        .filter(
          (o) =>
            x >= o.bbox.x - pad &&
            x <= o.bbox.x + o.bbox.width + pad &&
            y >= o.bbox.y - pad &&
            y <= o.bbox.y + o.bbox.height + pad,
        )
        .sort((a, b) => area(a) - area(b));
    },
    [visibleObjects],
  );

  const toMm = (evt) => {
    const rect = evt.currentTarget.getBoundingClientRect();
    return [
      bounds.x + ((evt.clientX - rect.left) / rect.width) * bounds.width,
      bounds.y + ((evt.clientY - rect.top) / rect.height) * bounds.height,
    ];
  };

  const handleMove = (evt) => setHoverId(objectsAt(...toMm(evt))[0]?.id || null);
  const handleClick = (evt) => {
    if (locked) return;
    const hits = objectsAt(...toMm(evt));
    setPointObjects(hits.slice(0, 10));
    const id = hits[0]?.id;
    if (!id) return;
    setSelected((cur) =>
      evt.shiftKey ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id],
    );
  };

  const selectedObjects = selected.map((id) => objectsById.get(id)).filter(Boolean);
  const selectionIsCutline =
    selectedObjects.length === 1 &&
    selectedObjects[0].type === "path" &&
    selectedObjects[0].closed &&
    selectedObjects[0].path;

  const assign = (role) => {
    if (!selected.length) return;
    setEntries((cur) => {
      if (MULTI_ROLES.includes(role)) return [...cur, newEntry(role, selected, { textStyle: {} })];
      const existing = cur.find((e) => e.role === role);
      return existing
        ? cur.map((e) => (e === existing ? { ...e, objectIds: [...selected] } : e))
        : [...cur, newEntry(role, selected, { textStyle: {} })];
    });
    setSelected([]);
    setPointObjects([]);
  };
  const removeEntry = (key) => setEntries((cur) => cur.filter((e) => e.key !== key));
  const updateEntry = (key, patch) =>
    setEntries((cur) => cur.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  const uploadFrame = async (file) => {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append("frame", file);
      const data = await uploadLayoutAssets(variant._id, fd);
      setFrameInfo({ width: data.assets.frameWidthPx, height: data.assets.frameHeightPx });
    } catch (err) {
      setError(err.response?.data?.message || "Frame upload failed.");
    }
  };

  const save = async () => {
    // Saving with required regions missing is allowed (work in progress),
    // but never silently — a layout cannot pass validation without them.
    const missing = roles.required.filter((role) => !entries.some((e) => e.role === role));
    if (
      missing.length &&
      !window.confirm(
        `These required regions are not assigned yet:\n\n${missing.map((r) => `• ${ROLE_INFO[r].label}`).join("\n")}\n\n` +
          "Click an object on the artwork, then press Assign next to each one. Save anyway?",
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const data = await saveLayoutMapping(variant._id, {
        pageIndex,
        cutlineSource,
        cutlineObjectId: cutlineSource === "design" && !joinIds.length ? cutlineId : null,
        cutlineObjectIds: cutlineSource === "design" && joinIds.length ? joinIds : null,
        laserCutlineObjectIds: cutlineSource === "laser" && laserCutId ? [laserCutId] : null,
        laserAlignment: cutlineSource === "laser" ? laserAlign : null,
        artworkObjectIds: cutlineSource === "none" ? artworkIds : null,
        registration: cutlineSource === "design" ? registration : null,
        excludedObjectIds: excluded,
        regions: entries.map(({ role, objectIds, binding, textStyle, source }) => ({
          role,
          objectIds,
          binding,
          textStyle,
          ...(source && { source }),
        })),
      });
      // Card preview, text-free plate and text colours for the live preview.
      await generateLayoutAssets({ ...data.variant, assets: { ...data.variant.assets, productionFile: pdfUrl } });
      onSaved(data.variant);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Saving the mapping failed.");
    } finally {
      setSaving(false);
    }
  };

  const fontPx = 12 / pxPerMm; // label size in mm that renders ~12px
  const cutObj = cutlineId ? objectsById.get(cutlineId) : null;
  const artMark = registration ? objectsById.get(registration.artObjectId) : null;
  const cutMark = registration ? objectsById.get(registration.cutlineObjectId) : null;
  const shift =
    artMark && cutMark
      ? { x: cutMark.bbox.x - artMark.bbox.x, y: cutMark.bbox.y - artMark.bbox.y }
      : { x: 0, y: 0 };
  const selectionIsMark =
    selectedObjects.length === 1 && selectedObjects[0].type === "path" && selectedObjects[0].closed;
  const setMark = (key) => {
    setRegistration((cur) => ({ ...(cur || {}), [key]: selected[0] }));
    setSelected([]);
    setPointObjects([]);
  };
  const hoverObj = hoverId ? objectsById.get(hoverId) : null;
  const candidates = summary.pages?.[pageIndex]?.cutlineCandidates || [];
  const analysis = summary.pages?.[pageIndex]?.analysis || null;

  // Laser PDF objects and where its cutline lands on the artwork.
  const laserById = new Map((laserPage?.objects || []).map((o) => [o.id, o]));
  const laserCut = laserCutId ? laserById.get(laserCutId) : null;
  const laserCake = laserSummary?.analysis?.cake ? laserById.get(laserSummary.analysis.cake.id) : null;
  const laserTarget = (() => {
    if (!laserCut) return null;
    if (laserAlign.method === "cake") {
      const dm = objectsById.get(laserAlign.designObjectId);
      const lm = laserById.get(laserAlign.laserObjectId);
      return dm && lm ? { x: laserCut.bbox.x - (lm.bbox.x - dm.bbox.x), y: laserCut.bbox.y - (lm.bbox.y - dm.bbox.y) } : null;
    }
    if (laserAlign.method === "artwork-bounds") {
      const b = unionBox((laserAlign.designObjectIds || []).map((id) => objectsById.get(id)?.bbox).filter(Boolean));
      return b ? { x: b.x + (b.width - laserCut.bbox.width) / 2, y: b.y + (b.height - laserCut.bbox.height) / 2 } : null;
    }
    const o = laserAlign.offsetMm || {};
    return Number.isFinite(Number(o.x)) && Number.isFinite(Number(o.y)) ? { x: Number(o.x), y: Number(o.y) } : null;
  })();
  const laserShift = laserTarget && laserCut ? { x: laserTarget.x - laserCut.bbox.x, y: laserTarget.y - laserCut.bbox.y } : null;
  const cakeFromLaser = entries.some((e) => e.role === "CAKE_MOUNT" && e.source === "laser");
  const toggleCakeFromLaser = (on) =>
    setEntries((cur) => [
      ...cur.filter((e) => e.role !== "CAKE_MOUNT"),
      ...(on && laserCake ? [newEntry("CAKE_MOUNT", [laserCake.id], { source: "laser" })] : []),
    ]);
  const selectedPaths = selectedObjects.filter((o) => o.type === "path" && o.path);
  // Detected mapping for this page (cutline, cake, artwork, text, labels).
  const suggestion = summary.pages?.[pageIndex]?.suggestedMapping || null;
  const applySuggestion = () => {
    if (!suggestion) return;
    if (entries.length && !window.confirm("Replace the current regions with the suggested mapping?")) return;
    if (suggestion.cutlineObjectId) {
      setCutlineSource("design");
      setCutlineId(suggestion.cutlineObjectId);
      setJoinIds([]);
      setRegistration(suggestion.registration || null);
    }
    setExcluded(suggestion.excludedObjectIds || []);
    setEntries(
      suggestion.regions.map((r) =>
        newEntry(r.role, r.objectIds, { binding: r.binding, textStyle: r.textStyle || {}, confidence: r.confidence, reason: r.reason }),
      ),
    );
  };
  const canSave =
    cutlineSource === "design"
      ? Boolean(cutlineId || joinIds.length)
      : cutlineSource === "laser"
        ? Boolean(laserCut && laserTarget)
        : artworkIds.length > 0;
  const addLaserPdf = async (file) => {
    if (!file) return;
    setLaserBusy(true);
    setError("");
    try {
      await uploadLaserPdf(variant._id, file);
      window.location.reload(); // re-read the analysis with the laser file
    } catch (err) {
      setError(err.response?.data?.message || "Adding the laser PDF failed.");
      setLaserBusy(false);
    }
  };

  const renderRoleRow = (role, required) => {
    const info = ROLE_INFO[role];
    const roleEntries = entries.filter((e) => e.role === role);
    return (
      <Box key={role} sx={{ py: 1, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: "50%", background: info.color, flexShrink: 0 }} />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
              {info.label}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {info.policy} · {roleEntries.length ? `${roleEntries.reduce((n, e) => n + e.objectIds.length, 0)} object(s)` : required ? "Required — not mapped" : "Optional"}
            </Typography>
          </Box>
          <Button size="small" disabled={!selected.length} onClick={() => assign(role)}>
            {MULTI_ROLES.includes(role) ? "Add" : roleEntries.length ? "Replace" : "Assign"}
          </Button>
        </Box>
        {roleEntries.map((entry) => {
          const firstText = entry.objectIds.map((id) => objectsById.get(id)).find((o) => o?.type === "text");
          return (
            <Box key={entry.key} sx={{ pl: 2.5, pt: 0.5, display: "flex", flexDirection: "column", gap: 1 }}>
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <Typography variant="caption" sx={{ flexGrow: 1, color: "text.secondary" }}>
                  {(() => {
                    const b = unionBox(entry.objectIds.map((id) => objectsById.get(id)?.bbox).filter(Boolean));
                    return b ? `${fmt(b.width)} × ${fmt(b.height)} mm` : "objects not on this page";
                  })()}
                </Typography>
                <IconButton size="small" onClick={() => removeEntry(entry.key)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
              {TEXT_ROLES.includes(role) && (
                <Box sx={{ display: "flex", gap: 1 }}>
                  <TextField
                    size="small"
                    label="Font"
                    value={entry.textStyle?.fontFamily ?? ""}
                    placeholder={firstText?.fontName || "Font family"}
                    onChange={(e) => updateEntry(entry.key, { textStyle: { ...entry.textStyle, fontFamily: e.target.value } })}
                    sx={{ flex: 2 }}
                  />
                  <TextField
                    size="small"
                    label="Min pt"
                    type="number"
                    value={entry.textStyle?.minPt ?? ""}
                    placeholder={firstText ? String(firstText.fontSizePt) : ""}
                    onChange={(e) => updateEntry(entry.key, { textStyle: { ...entry.textStyle, minPt: e.target.value } })}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Max pt"
                    type="number"
                    value={entry.textStyle?.maxPt ?? ""}
                    placeholder={firstText ? String(firstText.fontSizePt) : ""}
                    onChange={(e) => updateEntry(entry.key, { textStyle: { ...entry.textStyle, maxPt: e.target.value } })}
                    sx={{ flex: 1 }}
                  />
                </Box>
              )}
              {["TEXT_LINE_1", "TEXT_LINE_2"].includes(role) && (
                <TextField
                  select
                  size="small"
                  label="Content"
                  value={entry.binding || ""}
                  onChange={(e) => updateEntry(entry.key, { binding: e.target.value })}
                >
                  {LINE_BINDING_OPTIONS.map((o) => (
                    <MenuItem key={o.value} value={o.value}>
                      {o.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Box>
          );
        })}
      </Box>
    );
  };

  if (loading && !page) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", gap: 2, height: "100%", minHeight: 0 }}>
      {/* Viewer */}
      <Box sx={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <IconButton size="small" onClick={() => setZoomIndex((z) => Math.max(0, z - 1))} disabled={zoomIndex === 0}>
            <ZoomOutIcon />
          </IconButton>
          <Typography variant="body2">{Math.round(ZOOMS[zoomIndex] * 100)}%</Typography>
          <IconButton size="small" onClick={() => setZoomIndex((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoomIndex === ZOOMS.length - 1}>
            <ZoomInIcon />
          </IconButton>
          {rendering && <CircularProgress size={16} />}
          <Box sx={{ flexGrow: 1 }} />
          {["path", "image", "text", "clip"].map((k) => (
            <FormControlLabel
              key={k}
              control={<Checkbox size="small" checked={show[k]} onChange={(e) => setShow((s) => ({ ...s, [k]: e.target.checked }))} />}
              label={<Typography variant="caption">{k === "clip" ? "clip paths" : `${k}s`}</Typography>}
            />
          ))}
        </Box>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Click an object to select it, Shift+click to add more. Overlapping objects are listed on the right.
          {offPageObjects.length > 0 && " Grey outlines = objects drawn outside the PDF page (e.g. the cutline beside the artwork)."}
        </Typography>
        <Box ref={scrollRef} sx={{ flexGrow: 1, overflow: "auto", background: "#e9e5dc", borderRadius: 1, p: 1.5 }}>
          {page && (
            <Box sx={{ position: "relative", width: bounds.width * pxPerMm, height: bounds.height * pxPerMm, background: "#f6f3ec" }}>
              <canvas
                ref={canvasRef}
                style={{
                  position: "absolute",
                  left: -bounds.x * pxPerMm,
                  top: -bounds.y * pxPerMm,
                  width: page.widthMm * pxPerMm,
                  height: page.heightMm * pxPerMm,
                  background: "#fff",
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.15)",
                }}
              />
              <svg
                viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
                preserveAspectRatio="none"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "crosshair" }}
                onMouseMove={handleMove}
                onMouseLeave={() => setHoverId(null)}
                onClick={handleClick}
              >
                {offPageObjects.map((o) =>
                  o.type === "path" && o.path ? (
                    <path key={`off-${o.id}`} d={o.path} fill="none" stroke="#5f6368" strokeWidth={1.2 / pxPerMm} pointerEvents="none" />
                  ) : (
                    <rect key={`off-${o.id}`} x={o.bbox.x} y={o.bbox.y} width={o.bbox.width} height={o.bbox.height} fill="none" stroke="#9aa0a6" strokeWidth={1 / pxPerMm} pointerEvents="none" />
                  ),
                )}
                {cutlineSource === "design" &&
                  candidates
                    .filter((id) => id !== cutlineId)
                    .map((id) => objectsById.get(id))
                    .filter((o) => o?.path)
                    .map((o) => (
                      <path key={`cand-${o.id}`} d={o.path} fill="none" stroke="#e53935" strokeOpacity={0.6} strokeWidth={1.5 / pxPerMm} strokeDasharray={`${3 / pxPerMm} ${3 / pxPerMm}`} pointerEvents="none" />
                    ))}
                {entries.map((entry) => {
                  const b = unionBox(entry.objectIds.map((id) => objectsById.get(id)?.bbox).filter(Boolean));
                  if (!b) return null;
                  const color = ROLE_INFO[entry.role].color;
                  return (
                    <g key={entry.key} pointerEvents="none">
                      <rect x={b.x} y={b.y} width={b.width} height={b.height} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={2 / pxPerMm} />
                      <text x={b.x + 1} y={b.y + fontPx * 1.1} fontSize={fontPx} fill={color} fontWeight="bold">
                        {ROLE_INFO[entry.role].label}
                      </text>
                    </g>
                  );
                })}
                {cutlineSource === "design" && cutObj?.path && (
                  <path d={cutObj.path} fill="none" stroke="#e53935" strokeWidth={2.5 / pxPerMm} strokeDasharray={`${6 / pxPerMm} ${4 / pxPerMm}`} pointerEvents="none" />
                )}
                {cutlineSource === "design" &&
                  joinIds.map((id) => objectsById.get(id)).filter((o) => o?.path).map((o) => (
                    <path key={`join-${o.id}`} d={o.path} fill="none" stroke="#e53935" strokeWidth={2.5 / pxPerMm} pointerEvents="none" />
                  ))}
                {cutlineSource === "laser" && laserCut?.path && laserShift && (
                  // The laser cutline (and cake) where they land on the artwork.
                  <g transform={`translate(${laserShift.x} ${laserShift.y})`} pointerEvents="none">
                    <path d={laserCut.path} fill="none" stroke="#8e24aa" strokeWidth={2.5 / pxPerMm} />
                    {laserCake && (
                      <rect x={laserCake.bbox.x} y={laserCake.bbox.y} width={laserCake.bbox.width} height={laserCake.bbox.height} fill="none" stroke="#8e24aa" strokeWidth={2 / pxPerMm} strokeDasharray={`${4 / pxPerMm} ${3 / pxPerMm}`} />
                    )}
                  </g>
                )}
                {cutlineSource === "design" && cutObj?.path && (shift.x || shift.y) ? (
                  // Where the cutline lands on the artwork after alignment.
                  <path d={cutObj.path} transform={`translate(${-shift.x} ${-shift.y})`} fill="none" stroke="#e53935" strokeOpacity={0.85} strokeWidth={2 / pxPerMm} pointerEvents="none" />
                ) : null}
                {[artMark, cutMark].filter(Boolean).map((m) => (
                  <rect key={`mark-${m.id}`} x={m.bbox.x} y={m.bbox.y} width={m.bbox.width} height={m.bbox.height} fill="none" stroke="#fb8c00" strokeWidth={2.5 / pxPerMm} strokeDasharray={`${3 / pxPerMm} ${2 / pxPerMm}`} pointerEvents="none" />
                ))}
                {hoverObj && (
                  <rect x={hoverObj.bbox.x} y={hoverObj.bbox.y} width={hoverObj.bbox.width} height={hoverObj.bbox.height} fill="none" stroke="#1e88e5" strokeWidth={1.5 / pxPerMm} strokeDasharray={`${4 / pxPerMm} ${3 / pxPerMm}`} pointerEvents="none" />
                )}
                {selectedObjects.map((o) => (
                  <rect key={o.id} x={o.bbox.x} y={o.bbox.y} width={o.bbox.width} height={o.bbox.height} fill="#1e88e5" fillOpacity={0.1} stroke="#1e88e5" strokeWidth={2.5 / pxPerMm} pointerEvents="none" />
                ))}
              </svg>
            </Box>
          )}
        </Box>
      </Box>

      {/* Mapping panel */}
      <Box sx={{ width: 380, flexShrink: 0, overflowY: "auto", pr: 0.5 }}>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        <ImportFindings summary={summary} pageIndex={pageIndex} />
        {!locked && (
          <Button size="small" component="label" disabled={laserBusy} sx={{ mb: 1 }}>
            {laserBusy ? "Reading laser PDF…" : laserSummary ? "Replace laser PDF" : "Add laser PDF"}
            <input type="file" accept="application/pdf,.pdf,.cdr" hidden onChange={(e) => addLaserPdf(e.target.files?.[0])} />
          </Button>
        )}

        {(summary.pages?.length || 0) > 1 && (
          <TextField select size="small" fullWidth label="PDF page" value={pageIndex} onChange={(e) => changePage(Number(e.target.value))} sx={{ mb: 1.5 }}>
            {summary.pages.map((p) => (
              <MenuItem key={p.index} value={p.index}>
                Page {p.index + 1} · {fmt(p.widthMm)} × {fmt(p.heightMm)} mm · {p.objectCount} objects
                {p.cutlineCandidates?.length ? " · cutline found" : ""}
              </MenuItem>
            ))}
          </TextField>
        )}
        {summary.pages?.[pageIndex]?.truncated && (
          <Alert severity="info" sx={{ mb: 1 }}>
            This page has {summary.pages[pageIndex].objectCount.toLocaleString()} objects — usually a colour gradient
            that CorelDRAW exported as thousands of thin strips. To keep this screen fast, the smallest plain shapes
            {summary.pages[pageIndex].hiddenFills ? ` (${summary.pages[pageIndex].hiddenFills.toLocaleString()})` : ""} are
            not listed. The cutline, images, text and box outlines are always kept, so mapping is not affected.
          </Alert>
        )}

        {locked ? (
          <Box>
            <Alert severity="info" sx={{ mb: 1.5 }}>
              These production regions are fixed. Designers change only the content inside them
              (Layouts → Customise).
            </Alert>
            <Typography variant="overline">Fixed production regions</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {cutlineSource === "laser"
                ? `Cutline from the laser PDF${laserCut ? ` (${fmt(laserCut.bbox.width)} × ${fmt(laserCut.bbox.height)} mm)` : ""}, placed by ${saved.laserAlignment?.method || "—"}${saved.cutlineAlignment?.confirmed ? " · confirmed" : " · not confirmed"}`
                : cutlineSource === "none"
                  ? "No cutline yet (draft from the artwork bounds)"
                  : `Cutline ${cutObj ? `${fmt(cutObj.bbox.width)} × ${fmt(cutObj.bbox.height)} mm` : joinIds.length ? `joined from ${joinIds.length} pieces` : "not set"}`}
              {cutlineSource === "design" && artMark && cutMark ? ` · aligned (offset ${fmt(shift.x)}, ${fmt(shift.y)} mm)` : ""}
            </Typography>
            {entries.map((entry) => {
              const info = ROLE_INFO[entry.role];
              const b = unionBox(entry.objectIds.map((id) => objectsById.get(id)?.bbox).filter(Boolean));
              return (
                <Box key={entry.key} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", background: info.color, flexShrink: 0 }} />
                  <Typography variant="body2" sx={{ flexGrow: 1 }}>{info.label}</Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {b ? `${fmt(b.width)} × ${fmt(b.height)} mm` : "—"} · {info.policy}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        ) : (
          <>
        {suggestion && (suggestion.regions.length > 0 || suggestion.cutlineObjectId) && (
          <Box sx={{ mb: 1.5, p: 1, borderRadius: 1, background: "rgba(176,141,53,0.08)" }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Suggested mapping</Typography>
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
              {[suggestion.cutlineObjectId && "cutline", ...suggestion.regions.map((r) => `${ROLE_INFO[r.role]?.label || r.role} (${r.confidence === "HIGH" ? "sure" : "check"})`), suggestion.excludedObjectIds?.length && `${suggestion.excludedObjectIds.length} label(s) excluded`]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
            {suggestion.notes?.map((n) => (
              <Typography key={n} variant="caption" sx={{ display: "block", color: "warning.dark" }}>{n}</Typography>
            ))}
            <Button size="small" variant="outlined" sx={{ mt: 0.5 }} onClick={applySuggestion}>
              Apply suggested mapping
            </Button>
          </Box>
        )}
        <Typography variant="overline">Selection</Typography>
        {selectedObjects.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>Nothing selected.</Typography>
        ) : (
          selectedObjects.map((o) => (
            <Typography key={o.id} variant="caption" sx={{ display: "block" }}>
              {describe(o)}
            </Typography>
          ))
        )}
        {pointObjects.length > 1 && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>Objects at this point</Typography>
            {pointObjects.map((o) => (
              <Typography
                key={o.id}
                variant="caption"
                onClick={(e) => setSelected((cur) => (e.shiftKey ? [...new Set([...cur, o.id])] : [o.id]))}
                sx={{ display: "block", cursor: "pointer", color: selected.includes(o.id) ? "primary.main" : "text.primary", "&:hover": { textDecoration: "underline" } }}
              >
                {describe(o)}
              </Typography>
            ))}
          </Box>
        )}

        <Divider sx={{ my: 1.5 }} />
        <Typography variant="overline">Cutline</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          fullWidth
          value={cutlineSource}
          onChange={(_e, v) => v && setCutlineSource(v)}
          sx={{ mb: 1 }}
        >
          <ToggleButton value="design">This PDF</ToggleButton>
          <ToggleButton value="laser" disabled={!laserSummary}>Laser PDF</ToggleButton>
          <ToggleButton value="none">None yet</ToggleButton>
        </ToggleButtonGroup>

        {cutlineSource === "laser" && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="body2">
              {laserCut ? `Laser cutline ${fmt(laserCut.bbox.width)} × ${fmt(laserCut.bbox.height)} mm (purple on the artwork)` : "No closed cutline in the laser PDF."}
            </Typography>
            <TextField
              select
              size="small"
              fullWidth
              label="Place it on the artwork by"
              value={laserAlign.method}
              onChange={(e) => setLaserAlign((a) => ({ ...a, method: e.target.value, confirmed: false }))}
              sx={{ mt: 1 }}
            >
              <MenuItem value="cake" disabled={!laserCake}>The cake rectangle drawn in both files (exact)</MenuItem>
              <MenuItem value="artwork-bounds">The artwork&apos;s outer bounds</MenuItem>
              <MenuItem value="manual">A manual offset</MenuItem>
            </TextField>
            {laserAlign.method === "cake" && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                <Typography variant="caption" sx={{ flexGrow: 1 }}>
                  Cake on the artwork: {objectsById.get(laserAlign.designObjectId) ? describe(objectsById.get(laserAlign.designObjectId)) : "select it"}
                </Typography>
                <Button size="small" disabled={!selectionIsMark || !laserCake} onClick={() => setLaserAlign((a) => ({ ...a, designObjectId: selected[0], laserObjectId: laserCake.id }))}>
                  Use selection
                </Button>
              </Box>
            )}
            {laserAlign.method === "artwork-bounds" && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                <Typography variant="caption" sx={{ flexGrow: 1 }}>
                  Artwork: {(laserAlign.designObjectIds || []).length} object(s)
                </Typography>
                <Button size="small" disabled={!selected.length} onClick={() => setLaserAlign((a) => ({ ...a, designObjectIds: [...selected], confirmed: false }))}>
                  Use selection
                </Button>
              </Box>
            )}
            {laserAlign.method === "manual" && (
              <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                {["x", "y"].map((k) => (
                  <TextField
                    key={k}
                    size="small"
                    type="number"
                    label={`${k.toUpperCase()} (mm)`}
                    value={laserAlign.offsetMm?.[k] ?? 0}
                    onChange={(e) => setLaserAlign((a) => ({ ...a, offsetMm: { ...(a.offsetMm || {}), [k]: e.target.value }, confirmed: false }))}
                    slotProps={{ htmlInput: { step: 0.1 } }}
                  />
                ))}
              </Box>
            )}
            {laserAlign.method !== "cake" && (
              <FormControlLabel
                control={
                  <Checkbox size="small" checked={Boolean(laserAlign.confirmed)} disabled={!laserTarget} onChange={(e) => setLaserAlign((a) => ({ ...a, confirmed: e.target.checked }))} />
                }
                label={<Typography variant="caption">I checked the purple outline: it sits exactly on the artwork edge.</Typography>}
              />
            )}
            {laserCake && (
              <FormControlLabel
                control={<Checkbox size="small" checked={cakeFromLaser} onChange={(e) => toggleCakeFromLaser(e.target.checked)} />}
                label={<Typography variant="caption">Take the cake rectangle from the laser PDF</Typography>}
              />
            )}
          </Box>
        )}

        {cutlineSource === "none" && (
          <Box sx={{ mb: 1 }}>
            <Alert severity="warning" sx={{ py: 0, mb: 0.5 }}>
              Draft only: the trim is taken from the artwork&apos;s bounds and the layout cannot be activated until a real
              cutline is mapped (this PDF or the laser PDF).
            </Alert>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="caption" sx={{ flexGrow: 1 }}>Artwork: {artworkIds.length} object(s)</Typography>
              <Button size="small" disabled={!selected.length} onClick={() => setArtworkIds([...selected])}>Use selection</Button>
            </Box>
          </Box>
        )}

        {cutlineSource === "design" && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography variant="body2" sx={{ flexGrow: 1 }}>
            {cutObj ? `${fmt(cutObj.bbox.width)} × ${fmt(cutObj.bbox.height)} mm` : joinIds.length ? `Joined from ${joinIds.length} pieces` : "Not set"}
          </Typography>
          <Button size="small" disabled={!selectionIsCutline} onClick={() => { setCutlineId(selected[0]); setJoinIds([]); setSelected([]); }}>
            Use selection
          </Button>
          <Button
            size="small"
            disabled={selectedPaths.length < 2}
            onClick={() => { setJoinIds(selectedPaths.map((o) => o.id)); setCutlineId(null); setSelected([]); }}
            title="Shift+click every piece of the outline, then join them"
          >
            Join selected pieces
          </Button>
        </Box>
        )}
        {cutlineSource === "design" && !cutObj && !joinIds.length && analysis?.cutline?.pieces?.length > 0 && (
          <Chip size="small" sx={{ mt: 0.5 }} label={`Suggested: join ${analysis.cutline.pieces.length} pieces`} onClick={() => setJoinIds(analysis.cutline.pieces)} />
        )}
        {cutlineSource === "design" && !cutObj && !joinIds.length && analysis?.cutline?.nearMisses?.length > 0 && (
          <Box sx={{ mt: 0.5, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {analysis.cutline.nearMisses.map((n) => (
              <Chip key={n.id} size="small" color="warning" variant="outlined" label={`Near-size outline ${n.sizeMm} mm`} onClick={() => setCutlineId(n.id)} onMouseEnter={() => setHoverId(n.id)} />
            ))}
          </Box>
        )}
        {cutlineSource === "design" && !cutObj && !joinIds.length && candidates.length > 0 && (
          <Box sx={{ mt: 0.5, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {candidates.map((id, i) => (
              <Chip key={id} size="small" label={`Suggested cutline ${i + 1}`} onClick={() => setCutlineId(id)} onMouseEnter={() => setHoverId(id)} />
            ))}
          </Box>
        )}
        {cutlineSource === "design" && !cutObj && !joinIds.length && candidates.length === 0 && (analysis?.cutline?.pieces?.length || 0) === 0 && (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            No closed path matching {summary.expectedTrimMm ? `${fmt(summary.expectedTrimMm.width)} × ${fmt(summary.expectedTrimMm.height)} mm` : "the calendar size"} was found on this page.
          </Typography>
        )}

        <Divider sx={{ my: 1.5 }} />
        <Typography variant="overline">Cutline alignment</Typography>
        {artMark && cutMark ? (
          <Typography variant="body2">
            Aligned by a mark drawn in both places ({fmt(artMark.bbox.width)} × {fmt(artMark.bbox.height)} mm);
            cutline offset {fmt(shift.x)}, {fmt(shift.y)} mm.
          </Typography>
        ) : (
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
            Only needed when the cutline is drawn beside the artwork: select the same mark (e.g. the cake rectangle) on the artwork and next to the cutline.
          </Typography>
        )}
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
          <Button size="small" disabled={!selectionIsMark} onClick={() => setMark("artObjectId")}>Mark on artwork</Button>
          <Button size="small" disabled={!selectionIsMark} onClick={() => setMark("cutlineObjectId")}>Mark by cutline</Button>
          <Button size="small" disabled={!registration} onClick={() => setRegistration(null)}>Clear</Button>
        </Box>

        <Divider sx={{ my: 1.5 }} />
        <Typography variant="overline">Excluded from print</Typography>
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
          Guide labels and notes (e.g. “4X5 INCHES”) that must never be printed.
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5, alignItems: "center" }}>
          <Button
            size="small"
            disabled={!selected.length}
            onClick={() => setExcluded((cur) => [...new Set([...cur, ...selected])])}
          >
            Exclude selected
          </Button>
          {excluded.map((id) => (
            <Chip
              key={id}
              size="small"
              label={objectsById.get(id)?.text ? `“${objectsById.get(id).text.slice(0, 20)}”` : id}
              onDelete={() => setExcluded((cur) => cur.filter((x) => x !== id))}
            />
          ))}
        </Box>

        <Divider sx={{ my: 1.5 }} />
        <Typography variant="overline">Regions</Typography>
        {roles.required.map((r) => renderRoleRow(r, true))}
        {roles.optional.map((r) => renderRoleRow(r, false))}

        <Divider sx={{ my: 1.5 }} />
        <Typography variant="overline">Frame artwork (transparent PNG)</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button size="small" variant="outlined" component="label">
            {frameInfo ? "Replace frame PNG" : "Upload frame PNG"}
            <input type="file" accept="image/png" hidden onChange={(e) => uploadFrame(e.target.files?.[0])} />
          </Button>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {frameInfo ? `${frameInfo.width} × ${frameInfo.height} px` : "Not uploaded"}
          </Typography>
        </Box>

          </>
        )}

        <Box sx={{ position: "sticky", bottom: 0, background: "#fff", pt: 1.5, pb: 0.5 }}>
          {locked ? (
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button variant="outlined" onClick={unlock} sx={{ flex: 1 }}>
                Unlock mapping (advanced)
              </Button>
              <Button variant="contained" onClick={() => onSaved(variant)} sx={{ flex: 1 }}>
                Continue
              </Button>
            </Box>
          ) : (
            <Button fullWidth variant="contained" onClick={save} disabled={saving || !canSave}>
              {saving ? "Saving…" : "Save mapping & continue"}
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default MappingStep;
