// Extracts the real drawing objects (vector paths, placed images, text) from
// a production PDF (CorelDRAW, Illustrator, InDesign, Affinity, Canva, …).
// Nothing is inferred or invented: every bounding box and path below is
// computed from the PDF's own drawing operators. Coordinates are millimetres
// from the top-left of each page AS DISPLAYED (page rotation applied — the
// same frame pdf.js renders in), so nested forms, transparency groups and
// rotated pages all land where they are drawn.

const { ptToMm } = require("../../lib/units");

const MIN_OBJECT_MM = 1; // ignore specks smaller than this in both directions
// Objects listed per page for the mapping screen. Text converted to curves
// (business names, addresses) can be thousands of small shapes, so this is
// generous; beyond it only the smallest plain filled shapes are dropped.
const MAX_OBJECTS_PER_PAGE = Number(process.env.PDF_MAX_OBJECTS_PER_PAGE) || 12000;
const KEEP_PATH_MIN_MM = 10; // store full path data only for shapes this big
const MAX_PATH_SEGMENTS = 20000;

let pdfjsPromise = null;
const loadPdfjs = () => {
  // pdfjs-dist is ESM-only; load it lazily from this CommonJS module.
  pdfjsPromise ||= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
};

// --- affine helpers (PDF matrices are [a, b, c, d, e, f]) ----------------
const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const round2 = (v) => Math.round(v * 100) / 100;

const bezierPoint = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

class BoxAccumulator {
  constructor() {
    this.x0 = Infinity;
    this.y0 = Infinity;
    this.x1 = -Infinity;
    this.y1 = -Infinity;
  }
  add(x, y) {
    if (x < this.x0) this.x0 = x;
    if (y < this.y0) this.y0 = y;
    if (x > this.x1) this.x1 = x;
    if (y > this.y1) this.y1 = y;
  }
  get empty() {
    return this.x0 === Infinity;
  }
  box() {
    return {
      x: round2(this.x0),
      y: round2(this.y0),
      width: round2(this.x1 - this.x0),
      height: round2(this.y1 - this.y0),
    };
  }
}

const stripSubset = (fontName) => (fontName || "").replace(/^[A-Z]{6}\+/, "");

const PAINT_KIND = {
  stroke: "stroke",
  closeStroke: "stroke",
  fill: "fill",
  eoFill: "fill",
  fillStroke: "fillStroke",
  eoFillStroke: "fillStroke",
  closeFillStroke: "fillStroke",
  closeEOFillStroke: "fillStroke",
  endPath: "clip", // path used only for clipping (no paint)
};
const CLOSING_PAINTS = new Set(["closeStroke", "closeFillStroke", "closeEOFillStroke"]);

/**
 * Parses one page. `toPage(x, y)` converts PDF user space to page mm
 * (origin top-left, y downwards).
 */
async function extractPage(pdfjs, doc, pageNumber, ocgNames) {
  const page = await doc.getPage(pageNumber);
  // The page as displayed: crop box offset, y downwards and /Rotate applied.
  const viewport = page.getViewport({ scale: 1 });
  const toPage = (x, y) => {
    const [px, py] = viewport.convertToViewportPoint(x, y);
    return [ptToMm(px), ptToMm(py)];
  };

  const OPS = pdfjs.OPS;
  const opName = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]));
  // pdf.js path op codes (DrawOPS — not exported by the package).
  const D = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 };

  const opList = await page.getOperatorList();
  const objects = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let strokeColor = null;
  let fillColor = null;
  let lineWidth = 1; // PDF default, in user-space units
  const ocgStack = [];
  let seq = 0;

  const currentLayer = () => {
    for (let i = ocgStack.length - 1; i >= 0; i -= 1) {
      if (ocgStack[i]) return ocgStack[i];
    }
    return null;
  };

  for (let i = 0; i < opList.fnArray.length; i += 1) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];
    switch (fn) {
      case OPS.save:
        stack.push({ ctm, strokeColor, fillColor, lineWidth });
        break;
      case OPS.restore:
        if (stack.length) ({ ctm, strokeColor, fillColor, lineWidth } = stack.pop());
        break;
      case OPS.transform:
        ctm = multiply(ctm, args);
        break;
      // Form XObjects and transparency groups carry their own matrix
      // (Illustrator / InDesign / Affinity exports nest artwork in them).
      case OPS.paintFormXObjectBegin:
        stack.push({ ctm, strokeColor, fillColor, lineWidth });
        if (Array.isArray(args?.[0]) || ArrayBuffer.isView(args?.[0])) ctm = multiply(ctm, Array.from(args[0]));
        break;
      case OPS.beginGroup:
        stack.push({ ctm, strokeColor, fillColor, lineWidth });
        if (args?.[0]?.matrix) ctm = multiply(ctm, Array.from(args[0].matrix));
        break;
      case OPS.paintFormXObjectEnd:
      case OPS.endGroup:
        if (stack.length) ({ ctm, strokeColor, fillColor, lineWidth } = stack.pop());
        break;
      case OPS.setStrokeRGBColor:
        strokeColor = args[0];
        break;
      case OPS.setLineWidth:
        lineWidth = args[0];
        break;
      case OPS.setFillRGBColor:
        fillColor = args[0];
        break;
      case OPS.beginMarkedContentProps:
        ocgStack.push(args?.[0] === "OC" && args[1]?.id ? ocgNames.get(args[1].id) || null : null);
        break;
      case OPS.beginMarkedContent:
        ocgStack.push(null);
        break;
      case OPS.endMarkedContent:
        ocgStack.pop();
        break;
      case OPS.constructPath: {
        const paint = opName[args[0]];
        const data = args[1]?.[0];
        if (!data) break;
        const acc = new BoxAccumulator();
        const svg = [];
        let segments = 0;
        let closed = CLOSING_PAINTS.has(paint);
        let cur = [0, 0];
        let start = null;
        const pt = (x, y) => toPage(...apply(ctm, x, y));
        for (let k = 0; k < data.length; ) {
          const op = data[k++];
          if (op === D.moveTo || op === D.lineTo) {
            const p = pt(data[k++], data[k++]);
            acc.add(p[0], p[1]);
            svg.push(`${op === D.moveTo ? "M" : "L"}${round2(p[0])} ${round2(p[1])}`);
            if (op === D.moveTo) start = p;
            cur = p;
          } else if (op === D.curveTo) {
            const c1 = pt(data[k++], data[k++]);
            const c2 = pt(data[k++], data[k++]);
            const p = pt(data[k++], data[k++]);
            for (let s = 1; s <= 8; s += 1) {
              const t = s / 8;
              acc.add(
                bezierPoint(cur[0], c1[0], c2[0], p[0], t),
                bezierPoint(cur[1], c1[1], c2[1], p[1], t),
              );
            }
            svg.push(
              `C${round2(c1[0])} ${round2(c1[1])} ${round2(c2[0])} ${round2(c2[1])} ${round2(p[0])} ${round2(p[1])}`,
            );
            cur = p;
          } else if (op === D.quadraticCurveTo) {
            const c = pt(data[k++], data[k++]);
            const p = pt(data[k++], data[k++]);
            acc.add(c[0], c[1]);
            acc.add(p[0], p[1]);
            svg.push(`Q${round2(c[0])} ${round2(c[1])} ${round2(p[0])} ${round2(p[1])}`);
            cur = p;
          } else if (op === D.closePath) {
            svg.push("Z");
            closed = true;
            if (start) cur = start;
          } else {
            break; // unknown op code — stop rather than misread the data
          }
          segments += 1;
        }
        if (acc.empty) break;
        // A path that ends where it started is closed even without a Z.
        if (!closed && start && Math.hypot(cur[0] - start[0], cur[1] - start[1]) < 0.05) {
          closed = true;
        }
        const bbox = acc.box();
        if (bbox.width < MIN_OBJECT_MM && bbox.height < MIN_OBJECT_MM) break;
        const kind = PAINT_KIND[paint] || "clip";
        const keepPath =
          Math.max(bbox.width, bbox.height) >= KEEP_PATH_MIN_MM && segments <= MAX_PATH_SEGMENTS;
        objects.push({
          id: `p${pageNumber}-${seq++}`,
          type: "path",
          paint: kind,
          closed,
          bbox,
          segments,
          strokeColor: kind === "stroke" || kind === "fillStroke" ? strokeColor : null,
          // Stroke width on the page (line width scaled by the current transform).
          strokeWidthMm:
            kind === "stroke" || kind === "fillStroke"
              ? round2(ptToMm(lineWidth * Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]))))
              : null,
          fillColor: kind === "fill" || kind === "fillStroke" ? fillColor : null,
          path: keepPath ? svg.join(" ") : null,
          layer: currentLayer(),
        });
        break;
      }
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageMaskXObject: {
        const acc = new BoxAccumulator();
        for (const [ux, uy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const p = toPage(...apply(ctm, ux, uy));
          acc.add(p[0], p[1]);
        }
        const bbox = acc.box();
        if (bbox.width < MIN_OBJECT_MM && bbox.height < MIN_OBJECT_MM) break;
        const img = fn === OPS.paintImageXObject ? { w: args[1], h: args[2] } : { w: args[0]?.width, h: args[0]?.height };
        objects.push({
          id: `p${pageNumber}-${seq++}`,
          type: "image",
          bbox,
          imageWidthPx: img.w || null,
          imageHeightPx: img.h || null,
          layer: currentLayer(),
        });
        break;
      }
      default:
        break;
    }
  }

  // Text: one object per text block (consecutive lines of the same font/size).
  const text = await page.getTextContent();
  const blocks = [];
  for (const item of text.items) {
    if (!item.str || !item.str.trim()) continue;
    const [a, b, c, d, e, f] = item.transform;
    const size = Math.hypot(c, d) || Math.hypot(a, b);
    const font = page.commonObjs.has(item.fontName) ? page.commonObjs.get(item.fontName) : null;
    const ascent = font?.ascent ?? 0.8;
    const descent = font?.descent ?? -0.2;
    const acc = new BoxAccumulator();
    for (const [x, y] of [
      [e, f + descent * size],
      [e + item.width, f + descent * size],
      [e, f + ascent * size],
      [e + item.width, f + ascent * size],
    ]) {
      const p = toPage(x, y);
      acc.add(p[0], p[1]);
    }
    const line = {
      text: item.str,
      fontName: stripSubset(font?.name) || null,
      fontSizePt: round2(size),
      // Horizontal stretch applied in the artwork (CorelDRAW often uses it).
      horizontalScale: round2(Math.hypot(a, b) / (size || 1)),
      acc,
    };
    const prev = blocks[blocks.length - 1];
    const gapOk =
      prev &&
      prev.fontName === line.fontName &&
      Math.abs(prev.fontSizePt - line.fontSizePt) < 0.05 &&
      acc.y0 - prev.acc.y1 < ptToMm(size) * 0.8 &&
      acc.y0 >= prev.acc.y0 &&
      acc.x0 < prev.acc.x1 &&
      acc.x1 > prev.acc.x0;
    if (gapOk) {
      prev.text += `\n${line.text}`;
      prev.lines += 1;
      prev.acc.add(acc.x0, acc.y0);
      prev.acc.add(acc.x1, acc.y1);
    } else {
      blocks.push({ ...line, lines: 1 });
    }
  }
  for (const blk of blocks) {
    objects.push({
      id: `p${pageNumber}-${seq++}`,
      type: "text",
      bbox: blk.acc.box(),
      text: blk.text,
      lines: blk.lines,
      fontName: blk.fontName,
      fontSizePt: blk.fontSizePt,
      horizontalScale: blk.horizontalScale,
      layer: null,
    });
  }

  // Very busy pages (e.g. a colour gradient exported as thousands of thin
  // filled strips) are capped for the mapping screen. Images, text, strokes
  // (cutlines, box borders) and clips are always kept; only the smallest
  // plain filled shapes are left out.
  let truncated = false;
  let hiddenFills = 0;
  let kept = objects;
  if (objects.length > MAX_OBJECTS_PER_PAGE) {
    truncated = true;
    const isPlainFill = (o) => o.type === "path" && o.paint === "fill";
    const essential = objects.filter((o) => !isPlainFill(o));
    const room = Math.max(0, MAX_OBJECTS_PER_PAGE - essential.length);
    const keptFills = new Set(
      objects
        .filter(isPlainFill)
        .sort((p, q) => q.bbox.width * q.bbox.height - p.bbox.width * p.bbox.height)
        .slice(0, room)
        .map((o) => o.id),
    );
    kept = objects.filter((o) => !isPlainFill(o) || keptFills.has(o.id));
    hiddenFills = objects.length - kept.length;
  }

  page.cleanup();
  return {
    index: pageNumber - 1,
    widthMm: round2(ptToMm(viewport.width)),
    heightMm: round2(ptToMm(viewport.height)),
    rotation: page.rotate || 0,
    objectCount: objects.length,
    truncated,
    hiddenFills,
    objects: kept,
  };
}

// Why a file could not be opened, in words an admin can act on.
class PdfReadError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const openError = (err) => {
  const name = err?.name || "";
  if (name === "PasswordException") {
    return new PdfReadError("PDF_PASSWORD", "The PDF is password-protected. Export it again without a password.");
  }
  if (name === "InvalidPDFException" || name === "MissingPDFException") {
    return new PdfReadError("PDF_INVALID", "This file is not a valid PDF (damaged or another format, e.g. a .cdr renamed to .pdf).");
  }
  return new PdfReadError("PDF_UNREADABLE", `The PDF could not be read (${String(err?.message || err).slice(0, 120)}).`);
};

async function extractPdfLayout(buffer) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    fontExtraProperties: true,
    verbosity: 0,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    await task.destroy().catch(() => {});
    throw openError(err);
  }
  try {
    const ocgNames = new Map();
    const occ = await doc.getOptionalContentConfig();
    for (const [id, group] of occ) ocgNames.set(id, group.name);

    const pages = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      pages.push(await extractPage(pdfjs, doc, n, ocgNames));
    }
    return { pageCount: doc.numPages, layers: [...new Set(ocgNames.values())], pages };
  } finally {
    await task.destroy();
  }
}

/**
 * Pixels of the raster image drawn at `bbox` (page mm, as extracted) on a
 * page: { width, height, channels, data } — the image exactly as embedded
 * (no resampling). Used to make a clearly-labelled upscaled preview.
 */
async function extractRasterAt(buffer, pageIndex, bbox, toleranceMm = 0.6) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, verbosity: 0 });
  const doc = await task.promise.catch((err) => {
    throw openError(err);
  });
  try {
    const page = await doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1 });
    const OPS = pdfjs.OPS;
    const ops = await page.getOperatorList();
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    let found = null;
    for (let i = 0; i < ops.fnArray.length && !found; i += 1) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      if (fn === OPS.save || fn === OPS.paintFormXObjectBegin || fn === OPS.beginGroup) {
        stack.push(ctm);
        const m = fn === OPS.paintFormXObjectBegin ? args?.[0] : fn === OPS.beginGroup ? args?.[0]?.matrix : null;
        if (m && m.length === 6) ctm = multiply(ctm, Array.from(m));
      } else if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd || fn === OPS.endGroup) {
        if (stack.length) ctm = stack.pop();
      } else if (fn === OPS.transform) {
        ctm = multiply(ctm, args);
      } else if (fn === OPS.paintImageXObject) {
        const acc = new BoxAccumulator();
        for (const [ux, uy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const [px, py] = viewport.convertToViewportPoint(...apply(ctm, ux, uy));
          acc.add(ptToMm(px), ptToMm(py));
        }
        const b = acc.box();
        const near = (u, v) => Math.abs(u - v) <= toleranceMm;
        if (near(b.x, bbox.x) && near(b.y, bbox.y) && near(b.width, bbox.width) && near(b.height, bbox.height)) found = args[0];
      }
    }
    if (!found) return null;
    const img = await new Promise((resolve) => page.objs.get(found, resolve));
    if (!img?.data) return null;
    // pdf.js image kinds: 1 = 1-bit grey, 2 = RGB, 3 = RGBA.
    const channels = img.kind === 3 ? 4 : img.kind === 2 ? 3 : null;
    if (!channels) return null;
    return { width: img.width, height: img.height, channels, data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength) };
  } finally {
    await task.destroy();
  }
}

module.exports = { extractPdfLayout, extractRasterAt, PdfReadError };
