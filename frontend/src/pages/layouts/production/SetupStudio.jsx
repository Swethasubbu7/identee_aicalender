import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Tooltip,
  Typography,
} from "@mui/material";
import NearMeOutlinedIcon from "@mui/icons-material/NearMeOutlined";
import AutoFixOffOutlinedIcon from "@mui/icons-material/AutoFixOffOutlined";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenOutlinedIcon from "@mui/icons-material/FitScreenOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CloseIcon from "@mui/icons-material/Close";
import UndoIcon from "@mui/icons-material/Undo";
import { ROLES_BY_CUT_TYPE } from "../../../constants/layoutRoles";
import {
  getImportedObjects,
  saveLayoutMapping,
  uploadLaserPdf,
  uploadLayoutArtwork,
  getLayoutVariant,
} from "../../../services/layoutVariantService";
import { startPageRender } from "../../../utils/pdfRender";
import { generateLayoutAssets } from "../../../utils/layoutAssets";
import EnhanceDialog from "./EnhanceDialog";

// Friendly names for the setup checklist (technical roles stay internal).
const ITEMS = {
  BACKGROUND_AREA: { label: "Background artwork", help: "Click the main artwork" },
  FRAME: { label: "Frame", help: "Click the frame artwork" },
  GOD_AREA: { label: "God picture area", help: "Drag over the area for the god picture" },
  NAME_TEXT: { label: "Business name", help: "Click or drag over the business name" },
  TEXT_LINE_1: { label: "Text line 1", help: "Click or drag over the first text line" },
  TEXT_LINE_2: { label: "Text line 2", help: "Click or drag over the second text line" },
  SIDE_BOX_LEFT: { label: "Left box", help: "Click the left box" },
  SIDE_BOX_RIGHT: { label: "Right box", help: "Click the right box" },
  CAKE_MOUNT: { label: "Calendar pad", help: "Click the calendar pad (cake) rectangle" },
  NAME_BANNER: { label: "Name strip", help: "Click the strip behind the name" },
};
const COLORS = {
  BACKGROUND_AREA: "#c9a227",
  FRAME: "#8e44ad",
  GOD_AREA: "#e67e22",
  NAME_TEXT: "#1e88e5",
  TEXT_LINE_1: "#039be5",
  TEXT_LINE_2: "#00acc1",
  SIDE_BOX_LEFT: "#43a047",
  SIDE_BOX_RIGHT: "#7cb342",
  CAKE_MOUNT: "#e53935",
  NAME_BANNER: "#16a085",
};
const DEFAULT_BINDING = { TEXT_LINE_1: "productList", TEXT_LINE_2: "address" };
const TEXT_ITEMS = new Set(["NAME_TEXT", "TEXT_LINE_1", "TEXT_LINE_2", "SIDE_BOX_LEFT"]);
const LOW_DPI = 150;

const unionBox = (boxes) => {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};
const area = (o) => o.bbox.width * o.bbox.height;

// Setup: a clean editor — the design in the middle, a short checklist on the
// right. Starts from what the app detected; the designer fixes what is missing
// by clicking (or dragging over) elements, and removes unwanted elements.
const SetupStudio = ({ variant, onSaved, onAdvanced }) => {
  const summary = variant.importSummary || {};
  const saved = variant.mapping || null;
  const [pageIndex, setPageIndex] = useState(saved?.pageIndex ?? summary.suggestedPageIndex ?? 0);
  const pageSummary = summary.pages?.[pageIndex];
  const suggestion = pageSummary?.suggestedMapping || null;
  const laserSummary = summary.laser || null;
  const roles = ROLES_BY_CUT_TYPE[variant.cutType] || { required: [], optional: [] };

  const start = saved || suggestion || {};
  const [page, setPage] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [laserPage, setLaserPage] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState("");
  const [cutlineId, setCutlineId] = useState(start.cutlineObjectId || null);
  const [registration, setRegistration] = useState(start.registration || null);
  const [useLaser, setUseLaser] = useState(saved?.cutlineSource === "laser");
  const [laserConfirmed, setLaserConfirmed] = useState(Boolean(saved?.laserAlignment?.confirmed));
  const [excluded, setExcluded] = useState(start.excludedObjectIds || []);
  const [items, setItems] = useState(() => {
    const out = {};
    for (const r of start.regions || []) {
      if (r.role === "CALENDAR_AREA") continue; // follows the calendar pad
      out[r.role] = { objectIds: r.objectIds, binding: r.binding, textStyle: r.textStyle || {}, source: r.source || null };
    }
    return out;
  });
  const [tool, setTool] = useState({ mode: "select" }); // select | remove | pick(role) | cutline
  const [selected, setSelected] = useState([]);
  const [hoverId, setHoverId] = useState(null);
  const [drag, setDrag] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    getImportedObjects(variant._id, pageIndex)
      .then((data) => {
        if (cancelled) return;
        setPage(data.page);
        setPdfUrl(data.productionFile);
        setLaserPage(data.laserPage || null);
      })
      .catch((err) => !cancelled && setError(err.response?.data?.message || "Could not open the design."));
    return () => {
      cancelled = true;
    };
  }, [variant._id, pageIndex]);

  const byId = useMemo(() => new Map((page?.objects || []).map((o) => [o.id, o])), [page]);
  const cut = cutlineId ? byId.get(cutlineId) : null;
  const regA = registration ? byId.get(registration.artObjectId) : null;
  const regB = registration ? byId.get(registration.cutlineObjectId) : null;
  const shift = regA && regB ? { x: regB.bbox.x - regA.bbox.x, y: regB.bbox.y - regA.bbox.y } : { x: 0, y: 0 };

  // Cutline from the cutting file when the design has none.
  const laserCut = laserSummary?.analysis?.cutline ? laserPage?.objects.find((o) => o.id === laserSummary.analysis.cutline.id) : null;
  const laserAlign = laserSummary?.comparison?.suggestedAlignment || null;
  const laserShift = useMemo(
    () => (laserCut && laserAlign ? { x: laserAlign.offsetMm.x - laserCut.bbox.x, y: laserAlign.offsetMm.y - laserCut.bbox.y } : null),
    [laserCut, laserAlign],
  );
  const cutSource = !cut && laserCut && laserShift ? "laser" : cut ? "design" : null;
  const showLaser = useLaser || cutSource === "laser";

  // The calendar on the page (where the cutline lands on the artwork).
  const trimBox = useMemo(() => {
    if (cut && !useLaser) return { ...cut.bbox, x: cut.bbox.x - shift.x, y: cut.bbox.y - shift.y };
    if (laserCut && laserShift) return { ...laserCut.bbox, x: laserCut.bbox.x + laserShift.x, y: laserCut.bbox.y + laserShift.y };
    const a = pageSummary?.analysis?.artworkBounds;
    return a || (page ? { x: 0, y: 0, width: page.widthMm, height: page.heightMm } : null);
  }, [cut, useLaser, shift.x, shift.y, laserCut, laserShift, pageSummary, page]);
  const view = trimBox ? { x: trimBox.x - 6, y: trimBox.y - 6, width: trimBox.width + 12, height: trimBox.height + 12 } : null;

  // Fit the design to the editor (again whenever the editor is resized).
  const ready = Boolean(page);
  useEffect(() => {
    const el = boxRef.current;
    if (!view || !el) return undefined;
    const fit = () => {
      const s = Math.min((el.clientHeight - 32) / view.height, (el.clientWidth - 32) / view.width);
      if (s > 0) setFitScale(s);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ready, view?.width, view?.height]); // eslint-disable-line react-hooks/exhaustive-deps
  const pxPerMm = fitScale * zoom;

  useEffect(() => {
    if (!page || !pdfUrl || !canvasRef.current) return;
    const job = startPageRender(pdfUrl, pageIndex, canvasRef.current, pxPerMm * (window.devicePixelRatio || 1));
    job.promise.catch((err) => setError(`Could not show the design: ${err.message}`));
    return () => job.cancel();
  }, [page, pdfUrl, pageIndex, pxPerMm]);

  // ---- picking ---------------------------------------------------------------
  const pickable = (o) => o.paint !== "clip" && o.id !== cutlineId && o.id !== registration?.cutlineObjectId;
  const objectsAt = (x, y) =>
    (page?.objects || [])
      .filter((o) => pickable(o) && x >= o.bbox.x - 0.8 && x <= o.bbox.x + o.bbox.width + 0.8 && y >= o.bbox.y - 0.8 && y <= o.bbox.y + o.bbox.height + 0.8)
      .sort((a, b) => area(a) - area(b));
  const objectsIn = (r) =>
    (page?.objects || []).filter(
      (o) => pickable(o) && o.bbox.x >= r.x && o.bbox.y >= r.y && o.bbox.x + o.bbox.width <= r.x + r.width && o.bbox.y + o.bbox.height <= r.y + r.height,
    );
  const toMm = (evt) => {
    const rect = evt.currentTarget.getBoundingClientRect();
    return { x: view.x + ((evt.clientX - rect.left) / rect.width) * view.width, y: view.y + ((evt.clientY - rect.top) / rect.height) * view.height };
  };
  const applyPick = (ids, additive) => {
    if (!ids.length) return;
    if (tool.mode === "remove") {
      setExcluded((cur) => {
        const set = new Set(cur);
        ids.forEach((id) => (set.has(id) && ids.length === 1 ? set.delete(id) : set.add(id)));
        return [...set];
      });
    } else if (tool.mode === "pick") {
      setItems((cur) => {
        const prev = cur[tool.role];
        const objectIds = additive && prev ? [...new Set([...prev.objectIds, ...ids])] : ids;
        const fileFont = (page.objects.find((o) => o.type === "text" && o.fontName) || {}).fontName || "Arial";
        const hasText = objectIds.some((id) => byId.get(id)?.type === "text");
        return {
          ...cur,
          [tool.role]: {
            objectIds,
            binding: DEFAULT_BINDING[tool.role],
            textStyle: TEXT_ITEMS.has(tool.role) && !hasText ? { fontFamily: fileFont } : prev?.textStyle || {},
            source: null,
          },
        };
      });
      if (!additive) setTool({ mode: "select" });
    } else if (tool.mode === "cutline") {
      const o = byId.get(ids[0]);
      if (o?.type === "path" && o.closed && o.path) {
        setCutlineId(o.id);
        setRegistration(null);
        setUseLaser(false);
        setTool({ mode: "select" });
      } else setNotice({ severity: "warning", text: "That is not a closed outline. Use Advanced to join cutline pieces." });
    } else setSelected(additive ? [...new Set([...selected, ...ids])] : ids);
  };
  const onDown = (evt) => setDrag({ start: toMm(evt), end: toMm(evt), shift: evt.shiftKey });
  const onMove = (evt) => {
    const p = toMm(evt);
    if (drag) setDrag((d) => ({ ...d, end: p }));
    else setHoverId(objectsAt(p.x, p.y)[0]?.id || null);
  };
  const onUp = () => {
    if (!drag) return;
    const { start: a, end: b, shift: additive } = drag;
    setDrag(null);
    if (Math.hypot(a.x - b.x, a.y - b.y) > 2) {
      const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
      applyPick(objectsIn(r).map((o) => o.id), additive);
    } else {
      const hit = objectsAt(a.x, a.y)[0];
      if (hit) applyPick([hit.id], additive);
      else setSelected([]);
    }
  };

  // ---- checklist -------------------------------------------------------------
  const list = [...roles.required, ...roles.optional].filter((r) => ITEMS[r] && r !== "CALENDAR_AREA");
  const required = new Set(roles.required);
  if (variant.cutType === "special-die-cut") required.add("BACKGROUND_AREA");
  const missing = list.filter((r) => required.has(r) && !items[r]?.objectIds?.length);
  const cutlineOk = (cut && !useLaser) || (showLaser && laserCut && laserShift && (laserAlign?.exact || laserConfirmed));
  const lowestDpi = variant.assets?.artworkOverride?.kind === "replacement" ? variant.assets.artworkOverride.dpi : pageSummary?.analysis?.lowestDpi;
  const improved = variant.assets?.artworkOverride?.kind === "upscaled";

  const body = () => {
    const regions = Object.entries(items)
      .filter(([, v]) => v.objectIds?.length)
      .map(([role, v]) => ({ role, objectIds: v.objectIds, binding: v.binding, textStyle: v.textStyle, ...(v.source && { source: v.source }) }));
    const cake = items.CAKE_MOUNT;
    if (cake?.objectIds?.length) regions.push({ role: "CALENDAR_AREA", objectIds: cake.objectIds, ...(cake.source && { source: cake.source }) });
    if (showLaser && laserCut && laserAlign) {
      return {
        pageIndex,
        cutlineSource: "laser",
        laserCutlineObjectIds: [laserCut.id],
        laserAlignment: { ...laserAlign, designObjectIds: laserAlign.method === "artwork-bounds" ? items.BACKGROUND_AREA?.objectIds || [] : undefined, confirmed: laserConfirmed },
        excludedObjectIds: excluded,
        regions,
      };
    }
    return { pageIndex, cutlineSource: "design", cutlineObjectId: cutlineId, registration, excludedObjectIds: excluded, regions };
  };

  const persist = async () => {
    const data = await saveLayoutMapping(variant._id, body());
    await generateLayoutAssets({ ...data.variant, assets: { ...data.variant.assets, productionFile: pdfUrl } });
    return data.variant;
  };
  const save = async () => {
    setBusy("save");
    setError("");
    try {
      onSaved(await persist());
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Saving failed.");
      setBusy("");
    }
  };
  // The quality dialog works on the saved layout: save the setup first.
  const improveQuality = async () => {
    setBusy("improve");
    setError("");
    try {
      await persist();
      setEnhanceOpen(true);
    } catch (err) {
      setError(err.response?.data?.message || "Save the setup first (select the background artwork).");
    } finally {
      setBusy("");
    }
  };
  const uploadOriginal = async (file) => {
    if (!file) return;
    setBusy("upload");
    try {
      await persist();
      const data = await uploadLayoutArtwork(variant._id, file);
      const fresh = (await getLayoutVariant(variant._id)).variant;
      await generateLayoutAssets(fresh).catch(() => {});
      setNotice({ severity: "success", text: data.message });
      onSaved(fresh, { stay: true });
    } catch (err) {
      setError(err.response?.data?.message || "Upload failed.");
    } finally {
      setBusy("");
    }
  };
  const addCuttingFile = async (file) => {
    if (!file) return;
    setBusy("laser");
    try {
      await uploadLaserPdf(variant._id, file);
      window.location.reload();
    } catch (err) {
      setError(err.response?.data?.message || "Could not add the cutting file.");
      setBusy("");
    }
  };

  if (!page || !view) {
    return error ? <Alert severity="error">{error}</Alert> : <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}><CircularProgress /></Box>;
  }

  const sw = (px) => px / pxPerMm; // stroke width in mm for `px` screen pixels
  const boxOf = (ids) => unionBox(ids.map((id) => byId.get(id)?.bbox).filter(Boolean));
  const activeRole = tool.mode === "pick" ? tool.role : null;

  return (
    <Box sx={{ display: "flex", height: "100%", minHeight: 0, background: "#f2f3f5", borderRadius: 2, overflow: "hidden" }}>
      {/* Tool rail */}
      <Box sx={{ width: 64, background: "#fff", borderRight: "1px solid #e6e6e6", display: "flex", flexDirection: "column", alignItems: "center", py: 1.5, gap: 1 }}>
        {[
          { mode: "select", icon: <NearMeOutlinedIcon />, tip: "Select" },
          { mode: "remove", icon: <AutoFixOffOutlinedIcon />, tip: "Remove elements" },
        ].map((t) => (
          <Tooltip key={t.mode} title={t.tip} placement="right">
            <IconButton
              onClick={() => setTool({ mode: t.mode })}
              sx={{ borderRadius: 2, background: tool.mode === t.mode ? "rgba(125,42,232,0.12)" : "transparent", color: tool.mode === t.mode ? "#7d2ae8" : "inherit" }}
            >
              {t.icon}
            </IconButton>
          </Tooltip>
        ))}
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title="Zoom in" placement="right"><IconButton onClick={() => setZoom((z) => Math.min(4, z * 1.25))}><ZoomInIcon /></IconButton></Tooltip>
        <Tooltip title="Zoom out" placement="right"><IconButton onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}><ZoomOutIcon /></IconButton></Tooltip>
        <Tooltip title="Fit" placement="right"><IconButton onClick={() => setZoom(1)}><FitScreenOutlinedIcon /></IconButton></Tooltip>
      </Box>

      {/* Canvas */}
      <Box sx={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {lowestDpi != null && lowestDpi < LOW_DPI && !improved && (
          <Alert
            severity="warning"
            sx={{ borderRadius: 0 }}
            action={
              <Button color="inherit" size="small" variant="outlined" disabled={Boolean(busy)} onClick={improveQuality}>
                {busy === "improve" ? "Saving…" : "Improve image quality"}
              </Button>
            }
          >
            Image quality is low for printing.
          </Alert>
        )}
        <EnhanceDialog
          open={enhanceOpen}
          variantId={variant._id}
          onClose={() => setEnhanceOpen(false)}
          onApproved={(fresh) => onSaved(fresh, { stay: true })}
        />
        {improved && (
          <Alert
            severity="warning"
            sx={{ borderRadius: 0 }}
            action={
              <Button color="inherit" size="small" component="label" disabled={Boolean(busy)}>
                Upload original
                <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => uploadOriginal(e.target.files?.[0])} />
              </Button>
            }
          >
            A smooth enlargement is used for previews only — it adds no real detail, so the print-quality check still uses
            {` ${variant.assets?.artworkOverride?.sourceDpi ?? lowestDpi} DPI`} and the layout cannot be activated. Upload the
            original high-resolution artwork.
          </Alert>
        )}
        {(tool.mode !== "select" || notice) && (
          <Box sx={{ px: 2, py: 0.75, background: "#fff", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" sx={{ flexGrow: 1 }}>
              {notice
                ? notice.text
                : tool.mode === "remove"
                  ? "Click or drag over elements you don't want printed."
                  : tool.mode === "cutline"
                    ? "Click the outer cut outline."
                    : ITEMS[tool.role]?.help}
            </Typography>
            <Button size="small" onClick={() => { setTool({ mode: "select" }); setNotice(null); }}>Done</Button>
          </Box>
        )}
        <Box ref={boxRef} sx={{ flexGrow: 1, overflow: "auto", display: "flex", p: 2 }}>
          <Box sx={{ position: "relative", m: "auto", width: view.width * pxPerMm, height: view.height * pxPerMm, flexShrink: 0, background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.12)" }}>
            <Box sx={{ position: "absolute", inset: 0, overflow: "hidden" }}>
              <canvas
                ref={canvasRef}
                style={{ position: "absolute", left: -view.x * pxPerMm, top: -view.y * pxPerMm, width: page.widthMm * pxPerMm, height: page.heightMm * pxPerMm }}
              />
            </Box>
            <svg
              viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: tool.mode === "select" ? "default" : "crosshair" }}
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={onUp}
              onMouseLeave={() => { setHoverId(null); setDrag(null); }}
            >
              {/* cut outline */}
              {cut?.path && !useLaser && <path d={cut.path} transform={`translate(${-shift.x} ${-shift.y})`} fill="none" stroke="#e53935" strokeWidth={sw(2)} pointerEvents="none" />}
              {showLaser && laserCut?.path && laserShift && <path d={laserCut.path} transform={`translate(${laserShift.x} ${laserShift.y})`} fill="none" stroke="#e53935" strokeWidth={sw(2)} pointerEvents="none" />}
              {/* mapped items */}
              {Object.entries(items).map(([role, v]) => {
                const b = v.source === "laser" ? null : boxOf(v.objectIds || []);
                if (!b) return null;
                const on = activeRole === role;
                return (
                  <g key={role} pointerEvents="none">
                    <rect x={b.x} y={b.y} width={b.width} height={b.height} rx={sw(4)} fill={COLORS[role]} fillOpacity={on ? 0.18 : 0.06} stroke={COLORS[role]} strokeWidth={sw(on ? 2.5 : 1.5)} strokeDasharray={on ? "none" : `${sw(5)} ${sw(4)}`} />
                    {on && role !== "BACKGROUND_AREA" && (
                      <text x={b.x + sw(4)} y={b.y - sw(4)} fontSize={sw(11)} fill={COLORS[role]} fontWeight="600">{ITEMS[role]?.label}</text>
                    )}
                  </g>
                );
              })}
              {/* removed elements */}
              {excluded.map((id) => {
                const b = byId.get(id)?.bbox;
                return b ? (
                  <g key={`x-${id}`} pointerEvents="none">
                    <rect x={b.x} y={b.y} width={b.width} height={b.height} fill="#fff" fillOpacity={0.75} stroke="#9e9e9e" strokeWidth={sw(1)} strokeDasharray={`${sw(3)} ${sw(3)}`} />
                    <line x1={b.x} y1={b.y} x2={b.x + b.width} y2={b.y + b.height} stroke="#9e9e9e" strokeWidth={sw(1)} />
                  </g>
                ) : null;
              })}
              {/* hover / selection / drag */}
              {hoverId && tool.mode !== "select" && byId.get(hoverId) && (() => {
                const b = byId.get(hoverId).bbox;
                return <rect x={b.x} y={b.y} width={b.width} height={b.height} fill="none" stroke="#7d2ae8" strokeWidth={sw(1.5)} pointerEvents="none" />;
              })()}
              {selected.map((id) => {
                const b = byId.get(id)?.bbox;
                return b ? <rect key={`s-${id}`} x={b.x} y={b.y} width={b.width} height={b.height} fill="rgba(125,42,232,0.08)" stroke="#7d2ae8" strokeWidth={sw(2)} pointerEvents="none" /> : null;
              })}
              {drag && (
                <rect
                  x={Math.min(drag.start.x, drag.end.x)}
                  y={Math.min(drag.start.y, drag.end.y)}
                  width={Math.abs(drag.start.x - drag.end.x)}
                  height={Math.abs(drag.start.y - drag.end.y)}
                  fill="rgba(125,42,232,0.08)"
                  stroke="#7d2ae8"
                  strokeWidth={sw(1)}
                  strokeDasharray={`${sw(4)} ${sw(3)}`}
                  pointerEvents="none"
                />
              )}
            </svg>
            {/* floating toolbar for a selection */}
            {tool.mode === "select" && selected.length > 0 && (() => {
              const b = boxOf(selected);
              return (
                <Box
                  sx={{ position: "absolute", left: Math.max(0, (b.x - view.x) * pxPerMm), top: Math.max(0, (b.y - view.y) * pxPerMm - 44), display: "flex", gap: 0.5, background: "#fff", borderRadius: 2, boxShadow: "0 2px 10px rgba(0,0,0,0.18)", p: 0.5 }}
                >
                  <Button size="small" color="error" onClick={() => { setExcluded((c) => [...new Set([...c, ...selected])]); setSelected([]); }}>Remove</Button>
                  <Select size="small" value="" displayEmpty onChange={(e) => applyPickAs(e.target.value)} renderValue={() => "Use as…"} sx={{ fontSize: 13, minWidth: 110 }}>
                    {list.map((r) => <MenuItem key={r} value={r}>{ITEMS[r].label}</MenuItem>)}
                  </Select>
                  <IconButton size="small" onClick={() => setSelected([])}><CloseIcon fontSize="small" /></IconButton>
                </Box>
              );
            })()}
          </Box>
        </Box>
      </Box>

      {/* Checklist */}
      <Box sx={{ width: 300, flexShrink: 0, background: "#fff", borderLeft: "1px solid #e6e6e6", display: "flex", flexDirection: "column" }}>
        <Box sx={{ p: 2, pb: 1, display: "flex", alignItems: "center" }}>
          <Typography sx={{ fontWeight: 700, flexGrow: 1 }}>Set up</Typography>
          {suggestion && (
            <Tooltip title="Use what the app detected">
              <IconButton size="small" onClick={() => window.confirm("Reset to the detected setup?") && resetToSuggestion()}>
                <AutoAwesomeIcon fontSize="small" sx={{ color: "#7d2ae8" }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        {(summary.pages?.length || 0) > 1 && (
          <Box sx={{ px: 2, pb: 1 }}>
            <Select size="small" fullWidth value={pageIndex} onChange={(e) => setPageIndex(Number(e.target.value))}>
              {summary.pages.map((p) => <MenuItem key={p.index} value={p.index}>Page {p.index + 1}</MenuItem>)}
            </Select>
          </Box>
        )}
        <Box sx={{ flexGrow: 1, overflowY: "auto", px: 1.5 }}>
          {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
          <Card
            ok={cutlineOk}
            label="Cut shape"
            sub={cutlineOk ? null : showLaser && laserCut ? "Check the red outline sits on the edge" : "Not found"}
            onClick={() => setTool({ mode: "cutline" })}
          >
            {showLaser && laserCut && laserAlign && !laserAlign.exact && (
              <FormControlLabel
                control={<Checkbox size="small" checked={laserConfirmed} onChange={(e) => setLaserConfirmed(e.target.checked)} />}
                label={<Typography variant="caption">The red outline matches the edge</Typography>}
              />
            )}
            {!cut && !laserCut && (
              <Button size="small" component="label" disabled={Boolean(busy)}>
                Add cutting file
                <input type="file" accept="application/pdf,.pdf,.cdr" hidden onChange={(e) => addCuttingFile(e.target.files?.[0])} />
              </Button>
            )}
          </Card>
          {list.map((role) => {
            const set = Boolean(items[role]?.objectIds?.length);
            return (
              <Card
                key={role}
                ok={set}
                optional={!required.has(role)}
                active={activeRole === role}
                label={ITEMS[role].label}
                color={COLORS[role]}
                onClick={() => setTool({ mode: "pick", role })}
                onClear={set ? () => setItems((cur) => { const n = { ...cur }; delete n[role]; return n; }) : null}
              />
            );
          })}
          {excluded.length > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 1.25, color: "text.secondary" }}>
              <AutoFixOffOutlinedIcon fontSize="small" />
              <Typography variant="body2" sx={{ flexGrow: 1 }}>{excluded.length} element{excluded.length > 1 ? "s" : ""} removed</Typography>
              <Tooltip title="Bring them back"><IconButton size="small" onClick={() => setExcluded([])}><UndoIcon fontSize="small" /></IconButton></Tooltip>
            </Box>
          )}
        </Box>
        <Box sx={{ p: 2, borderTop: "1px solid #eee" }}>
          {missing.length > 0 && (
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mb: 1 }}>
              Still to select: {missing.map((r) => ITEMS[r].label).join(", ")}
            </Typography>
          )}
          <Button fullWidth variant="contained" size="large" disabled={Boolean(busy) || !(cut || (showLaser && laserCut))} onClick={save} sx={{ background: "#7d2ae8", "&:hover": { background: "#6a1fd0" }, borderRadius: 2, textTransform: "none", fontWeight: 700 }}>
            {busy === "save" ? "Saving…" : "Save & continue"}
          </Button>
          <Button fullWidth size="small" sx={{ mt: 1, textTransform: "none", color: "text.secondary" }} onClick={onAdvanced}>
            Advanced setup
          </Button>
        </Box>
      </Box>
    </Box>
  );

  function applyPickAs(role) {
    setItems((cur) => {
      const fileFont = (page.objects.find((o) => o.type === "text" && o.fontName) || {}).fontName || "Arial";
      const hasText = selected.some((id) => byId.get(id)?.type === "text");
      return {
        ...cur,
        [role]: { objectIds: [...selected], binding: DEFAULT_BINDING[role], textStyle: TEXT_ITEMS.has(role) && !hasText ? { fontFamily: fileFont } : {}, source: null },
      };
    });
    setSelected([]);
    setTool({ mode: "select" });
  }

  function resetToSuggestion() {
    if (!suggestion) return;
    setCutlineId(suggestion.cutlineObjectId || null);
    setRegistration(suggestion.registration || null);
    setUseLaser(false);
    setExcluded(suggestion.excludedObjectIds || []);
    const out = {};
    for (const r of suggestion.regions || []) {
      if (r.role === "CALENDAR_AREA") continue;
      out[r.role] = { objectIds: r.objectIds, binding: r.binding, textStyle: r.textStyle || {}, source: r.source || null };
    }
    setItems(out);
  }
};

// One checklist row: status, name, and a click to (re)select it on the design.
const Card = ({ ok, optional, active, label, sub, color, onClick, onClear, children }) => (
  <Box
    onClick={onClick}
    sx={{
      display: "flex",
      flexDirection: "column",
      gap: 0.5,
      px: 1.25,
      py: 1,
      mb: 0.75,
      borderRadius: 2,
      cursor: "pointer",
      border: `1px solid ${active ? "#7d2ae8" : "#ececec"}`,
      background: active ? "rgba(125,42,232,0.06)" : "#fff",
      "&:hover": { borderColor: "#c9b3f5" },
    }}
  >
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      {ok ? (
        <CheckCircleIcon fontSize="small" sx={{ color: "#2e7d32" }} />
      ) : optional ? (
        <RadioButtonUncheckedIcon fontSize="small" sx={{ color: "#bdbdbd" }} />
      ) : (
        <ErrorOutlineIcon fontSize="small" sx={{ color: "#ef6c00" }} />
      )}
      {color && <Box sx={{ width: 8, height: 8, borderRadius: "50%", background: color }} />}
      <Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1 }}>{label}</Typography>
      {ok && onClear ? (
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onClear(); }}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
      ) : (
        <Typography variant="caption" sx={{ color: ok ? "text.secondary" : "#7d2ae8", fontWeight: 600 }}>{ok ? "Change" : optional ? "Add" : "Select"}</Typography>
      )}
    </Box>
    {sub && <Typography variant="caption" sx={{ color: "text.secondary", pl: 3.5 }}>{sub}</Typography>}
    <Box onClick={(e) => e.stopPropagation()}>{children}</Box>
  </Box>
);

export default SetupStudio;
