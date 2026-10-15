import { getDocument, GlobalWorkerOptions, OPS } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

const MM_PER_PT = 25.4 / 72;
const documents = new Map();

// Production PDFs are large; keep one loaded copy per URL.
export const loadPdf = (url) => {
  if (!documents.has(url)) {
    const task = getDocument({ url, disableAutoFetch: true, isEvalSupported: false });
    documents.set(url, task.promise.catch((err) => {
      documents.delete(url);
      throw err;
    }));
  }
  return documents.get(url);
};

/**
 * Renders a page into `canvas` so that 1 mm = `pxPerMm` canvas pixels.
 * Returns { promise, cancel }. Call cancel() before starting another render
 * into the same canvas; a cancelled render resolves to null.
 */
export const startPageRender = (url, pageIndex, canvas, pxPerMm) => {
  let cancelled = false;
  let task = null;
  const promise = (async () => {
    const doc = await loadPdf(url);
    const page = await doc.getPage(pageIndex + 1);
    if (cancelled) return null;
    const viewport = page.getViewport({ scale: pxPerMm * MM_PER_PT });
    // Draw off-screen, then copy, so a cancelled render never blanks the view.
    const buffer = document.createElement("canvas");
    buffer.width = Math.round(viewport.width);
    buffer.height = Math.round(viewport.height);
    task = page.render({ canvas: buffer, canvasContext: buffer.getContext("2d"), viewport });
    try {
      await task.promise;
    } catch (err) {
      if (cancelled || err?.name === "RenderingCancelledException") return null;
      throw err;
    }
    if (cancelled) return null;
    canvas.width = buffer.width;
    canvas.height = buffer.height;
    canvas.getContext("2d").drawImage(buffer, 0, 0);
    return { widthMm: viewport.width / pxPerMm, heightMm: viewport.height / pxPerMm };
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
};

export const renderPage = (url, pageIndex, canvas, pxPerMm) =>
  startPageRender(url, pageIndex, canvas, pxPerMm).promise;

/** PNG blob of the area inside `box` (mm, page coordinates), ~targetHeight px tall. */
export const renderCropBlob = async (url, pageIndex, box, targetHeight = 900) => {
  const pxPerMm = targetHeight / box.height;
  const full = document.createElement("canvas");
  await renderPage(url, pageIndex, full, pxPerMm);
  const crop = document.createElement("canvas");
  crop.width = Math.round(box.width * pxPerMm);
  crop.height = Math.round(box.height * pxPerMm);
  crop
    .getContext("2d")
    .drawImage(full, box.x * pxPerMm, box.y * pxPerMm, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return new Promise((resolve) => crop.toBlob(resolve, "image/png"));
};

// Operators that draw text. Skipping them removes all live text from a
// render, whichever way pdf.js would have drawn the glyphs.
const TEXT_OPS = new Set([
  OPS.showText,
  OPS.showSpacedText,
  OPS.nextLineShowText,
  OPS.nextLineSetSpacingShowText,
]);
const ADD_TO_CLIP = 4; // text rendering modes 4–7 add the glyphs to the clip

// Text used as a clipping shape (e.g. gradient-filled lettering: the glyphs
// become the clip and a shading is painted through them). Removing only the
// glyphs would leave the shading unclipped, so the whole group is removed:
// everything after such text until the graphics state that holds the clip
// is restored.
//
// eraseBoxes (page mm, top-left origin): sample text that the artwork draws
// as plain shapes or images (e.g. a CorelDRAW fountain-filled name exported
// as thousands of letter slices) is removed too — any filled shape or image
// lying entirely inside one of these boxes is skipped.
//
// eraseImageBoxes: sample pictures (god image, product photo) — images lying
// entirely inside these boxes are left out.
const FORM_BEGIN = new Set([OPS.paintFormXObjectBegin, OPS.beginGroup]);
const FORM_END = new Set([OPS.paintFormXObjectEnd, OPS.endGroup]);
const formMatrix = (fn, args) => {
  const m = fn === OPS.beginGroup ? args?.[0]?.matrix : args?.[0];
  return m && m.length === 6 ? Array.from(m) : null;
};

// overlayAfter: render only what the artwork paints ABOVE the sample god
// picture (the last image inside this box): frame, banner, boxes … in their
// original stacking order. Everything painted before it is left out.
// `view` = the page's viewport transform at scale 1 (PDF user space → page
// points as displayed: crop offset, y downwards, /Rotate) — the same frame
// the backend importer measures objects in.
// eraseSections (page mm): optional side boxes removed by the designer. The
// drawn box is often larger than its mapped region, so each area first grows
// to the box-sized shapes that cover most of it (never large backgrounds);
// then every fill, stroke (borders) and image lying inside is removed.
// eraseArtworkBoxes (page mm): artwork replaced by a new file. Its images
// are left out, and so are filled shapes painted BEFORE such an image and
// lying entirely inside it (e.g. a flat fill of the cutline shape under the
// picture): the picture hid them, but with it gone they would cover the
// replacement drawn underneath. Nothing painted above the picture changes.
const BACKDROP_TOLERANCE_MM = 0.5;
const SECTION_COVER = 0.6; // share of the mapped area a box shape must cover
const SECTION_MAX_GROWTH = 3; // a box shape is at most 3× the mapped area
const textSkipIndexes = (
  opList,
  { eraseBoxes = [], eraseImageBoxes = [], eraseArtworkBoxes = [], eraseSections = [], overlayAfter = null, view = null } = {},
) => {
  const skip = new Set();
  let depth = 0;
  let mode = 0;
  let clipText = false;
  let skipUntilDepth = null;
  let ctm = [1, 0, 0, 1, 0, 0];
  const ctmStack = [];
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  // Bounding box (page mm) of the unit-space rectangle [x0,y0,x1,y1] under ctm.
  const toPageBox = (x0, y0, x1, y1) => {
    const m = mul(view, ctm);
    const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [
      (m[0] * x + m[2] * y + m[4]) * MM_PER_PT,
      (m[1] * x + m[3] * y + m[5]) * MM_PER_PT,
    ]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  };
  const inside = (b, e) => b.x0 >= e.x && b.y0 >= e.y && b.x1 <= e.x + e.width && b.y1 <= e.y + e.height;
  const insideErase = (b) => eraseBoxes.some((e) => inside(b, e));
  const insideEraseImage = (b) => eraseImageBoxes.some((e) => inside(b, e));
  const PAINT_FILL = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const PAINT_ANY = new Set([...PAINT_FILL, OPS.stroke, OPS.closeStroke]);
  const IMAGE_OPS = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject]);

  // Every painted shape / image with its page box (ctm tracked).
  const paintedBoxes = (cb) => {
    let m = [1, 0, 0, 1, 0, 0];
    const stack = [];
    opList.fnArray.forEach((fn, i) => {
      if (fn === OPS.save) stack.push(m);
      else if (fn === OPS.restore) m = stack.length ? stack.pop() : m;
      else if (fn === OPS.transform) m = mul(m, opList.argsArray[i]);
      else if (FORM_BEGIN.has(fn)) {
        stack.push(m);
        const fm = formMatrix(fn, opList.argsArray[i]);
        if (fm) m = mul(m, fm);
      } else if (FORM_END.has(fn)) m = stack.length ? stack.pop() : m;
      else {
        const args = opList.argsArray[i];
        const unit = IMAGE_OPS.has(fn) ? [0, 0, 1, 1] : fn === OPS.constructPath && PAINT_ANY.has(args?.[0]) && args?.[2] ? args[2] : null;
        if (!unit) return;
        const keep = ctm;
        ctm = m;
        cb(toPageBox(...unit), i);
        ctm = keep;
      }
    });
  };
  // Grow each removed side box to the drawn box around it.
  const sections = eraseSections.map((e) => ({ ...e }));
  if (view && sections.length) {
    const area = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
    paintedBoxes((b) => {
      for (const e of sections) {
        const ea = e.width * e.height;
        const ox = Math.min(b.x1, e.x + e.width) - Math.max(b.x0, e.x);
        const oy = Math.min(b.y1, e.y + e.height) - Math.max(b.y0, e.y);
        if (ox <= 0 || oy <= 0 || ox * oy < SECTION_COVER * ea || area(b) > SECTION_MAX_GROWTH * ea) continue;
        const x1 = Math.max(e.x + e.width, b.x1 + 1);
        const y1 = Math.max(e.y + e.height, b.y1 + 1);
        e.x = Math.min(e.x, b.x0 - 1);
        e.y = Math.min(e.y, b.y0 - 1);
        e.width = x1 - e.x;
        e.height = y1 - e.y;
      }
    });
  }
  const insideSection = (b) => sections.some((e) => inside(b, e));

  // Replaced artwork: its images, and the hidden fills painted under them.
  const artworkSkip = new Set();
  if (view && eraseArtworkBoxes.length) {
    const fills = [];
    paintedBoxes((b, i) => {
      if (IMAGE_OPS.has(opList.fnArray[i])) {
        if (!eraseArtworkBoxes.some((e) => inside(b, e))) return;
        artworkSkip.add(i);
        const t = BACKDROP_TOLERANCE_MM;
        const img = { x: b.x0 - t, y: b.y0 - t, width: b.x1 - b.x0 + 2 * t, height: b.y1 - b.y0 + 2 * t };
        for (const f of fills) if (inside(f.b, img)) artworkSkip.add(f.i);
      } else if (PAINT_FILL.has(opList.argsArray[i]?.[0])) fills.push({ b, i });
    });
  }

  // Overlay: index of the last image inside the god area (needs ctm tracking,
  // so it is found in a first pass over the full operator list).
  let overlayStart = -1;
  if (overlayAfter && view) {
    let m = [1, 0, 0, 1, 0, 0];
    const stack = [];
    opList.fnArray.forEach((fn, i) => {
      if (fn === OPS.save) stack.push(m);
      else if (fn === OPS.restore) m = stack.length ? stack.pop() : m;
      else if (fn === OPS.transform) m = mul(m, opList.argsArray[i]);
      else if (FORM_BEGIN.has(fn)) {
        stack.push(m);
        const fm = formMatrix(fn, opList.argsArray[i]);
        if (fm) m = mul(m, fm);
      } else if (FORM_END.has(fn)) m = stack.length ? stack.pop() : m;
      else if (IMAGE_OPS.has(fn)) {
        const keep = ctm;
        ctm = m;
        const b = toPageBox(0, 0, 1, 1);
        ctm = keep;
        if (inside(b, overlayAfter)) overlayStart = i;
      }
    });
  }
  const isPaint = (fn, args) =>
    IMAGE_OPS.has(fn) ||
    fn === OPS.shadingFill ||
    TEXT_OPS.has(fn) ||
    (fn === OPS.constructPath && args?.[0] !== OPS.endPath);

  opList.fnArray.forEach((fn, i) => {
    if (FORM_BEGIN.has(fn)) {
      // Forms / groups are drawn inside save … restore with their own matrix.
      depth += 1;
      ctmStack.push(ctm);
      const fm = formMatrix(fn, opList.argsArray[i]);
      if (fm) ctm = mul(ctm, fm);
      return; // never skipped: begin/end must stay paired
    } else if (FORM_END.has(fn)) {
      depth -= 1;
      if (ctmStack.length) ctm = ctmStack.pop();
      if (skipUntilDepth !== null && depth < skipUntilDepth) skipUntilDepth = null;
      return;
    }
    if (fn === OPS.save) {
      depth += 1;
      ctmStack.push(ctm);
    } else if (fn === OPS.restore) {
      depth -= 1;
      if (ctmStack.length) ctm = ctmStack.pop();
      if (skipUntilDepth !== null && depth < skipUntilDepth) skipUntilDepth = null;
      return;
    } else if (fn === OPS.transform) {
      ctm = mul(ctm, opList.argsArray[i]);
    }
    if (overlayAfter && i <= overlayStart && isPaint(fn, opList.argsArray[i])) {
      skip.add(i);
      return;
    }
    if (artworkSkip.has(i)) {
      skip.add(i);
      return;
    }
    if (view && eraseImageBoxes.length && IMAGE_OPS.has(fn) && insideEraseImage(toPageBox(0, 0, 1, 1))) {
      skip.add(i);
      return;
    }
    if (view && sections.length) {
      const args = opList.argsArray[i];
      const unit = IMAGE_OPS.has(fn) ? [0, 0, 1, 1] : fn === OPS.constructPath && PAINT_ANY.has(args?.[0]) && args?.[2] ? args[2] : null;
      if (unit && insideSection(toPageBox(...unit))) {
        skip.add(i);
        return;
      }
    }
    if (view && eraseBoxes.length) {
      const args = opList.argsArray[i];
      // A clip shaped like the sample text (e.g. letter outlines with a
      // gradient painted through them): drop everything painted through it,
      // until the graphics state holding the clip is restored.
      const prev = opList.fnArray[i - 1];
      if (
        fn === OPS.constructPath &&
        (prev === OPS.clip || prev === OPS.eoClip) &&
        args?.[2] &&
        depth > 0 &&
        insideErase(toPageBox(...args[2]))
      ) {
        skipUntilDepth = depth;
        return;
      }
      if (fn === OPS.constructPath && PAINT_FILL.has(args?.[0]) && args?.[2]) {
        const [mx0, my0, mx1, my1] = args[2];
        if (insideErase(toPageBox(mx0, my0, mx1, my1))) {
          skip.add(i);
          return;
        }
      } else if (IMAGE_OPS.has(fn) && insideErase(toPageBox(0, 0, 1, 1))) {
        skip.add(i);
        return;
      }
    }
    if (skipUntilDepth !== null && fn !== OPS.save) {
      skip.add(i);
      return;
    }
    if (fn === OPS.setTextRenderingMode) mode = opList.argsArray[i][0];
    if (fn === OPS.beginText) clipText = false;
    if (TEXT_OPS.has(fn)) {
      skip.add(i);
      if (mode >= ADD_TO_CLIP) clipText = true;
    }
    // Clip only lasts until the enclosing restore; at the top level there is
    // none, so only the next paint is affected — skip until the next text.
    if (fn === OPS.endText && clipText) skipUntilDepth = depth > 0 ? depth : null;
  });
  return skip;
};
// pdf.js delivers large operator lists in chunks and calls the filter while
// the list is still growing, so the skip set is recomputed whenever the list
// has grown (it only depends on earlier operators, so results stay stable).
const skipCache = new WeakMap(); // opList → Map(optionsKey → { length, skip })
const skipSetFor = (opList, options) => {
  const key = JSON.stringify({ ...options, view: undefined });
  if (!skipCache.has(opList)) skipCache.set(opList, new Map());
  const perOptions = skipCache.get(opList);
  const cached = perOptions.get(key);
  if (cached && cached.length === opList.fnArray.length) return cached.skip;
  const skip = textSkipIndexes(opList, options);
  perOptions.set(key, { length: opList.fnArray.length, skip });
  return skip;
};

/**
 * Renders only the area `box` (mm, page coordinates) at `pxPerMm`.
 * eraseBoxes:  page-mm boxes of the sample text (see textSkipIndexes).
 * withoutText: true    — remove all text, including text used as a clip
 *                         (gradient lettering), so sample text disappears;
 *              "glyphs" — remove only the glyph-drawing operators (a
 *                         clip-text gradient then paints unclipped, which
 *                         reveals the fill used for that lettering).
 * recordText:  return where text would be drawn and in which colour,
 *              as runs in mm relative to the box ({ text, xMm, yMm, color, mode }).
 */
export const renderPageArea = async (
  url,
  pageIndex,
  box,
  pxPerMm,
  {
    withoutText = false,
    recordText = false,
    eraseBoxes = [],
    eraseImageBoxes = [],
    eraseArtworkBoxes = [],
    eraseSections = [],
    overlayAfter = null,
    transparent = false,
  } = {},
) => {
  const doc = await loadPdf(url);
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({
    scale: pxPerMm * MM_PER_PT,
    offsetX: -box.x * pxPerMm,
    offsetY: -box.y * pxPerMm,
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(box.width * pxPerMm);
  canvas.height = Math.round(box.height * pxPerMm);
  const ctx = canvas.getContext("2d");
  const runs = [];
  if (recordText) {
    const record = (mode) =>
      function recordRun(text, x, y) {
        const t = this.getTransform();
        runs.push({
          text,
          xMm: (t.a * x + t.c * y + t.e) / pxPerMm,
          yMm: (t.b * x + t.d * y + t.f) / pxPerMm,
          color: mode === "fill" ? this.fillStyle : this.strokeStyle,
          mode,
        });
      };
    // Record instead of drawing (only this context is patched).
    ctx.fillText = record("fill");
    ctx.strokeText = record("stroke");
  }
  // Fetch the complete operator list first: render() then reuses it, so the
  // operations filter always sees the whole list (no partial chunks).
  if (withoutText) await page.getOperatorList({ intent: "print" });
  // Pass only the (possibly patched) context so pdf.js draws through it.
  // "print" intent renders without requestAnimationFrame pacing, so asset
  // generation keeps going even if the browser tab is in the background.
  await page.render({
    canvasContext: ctx,
    viewport,
    intent: "print",
    ...(transparent && { background: "rgba(0,0,0,0)" }),
    operationsFilter:
      withoutText === "glyphs"
        ? (i, opList) => !TEXT_OPS.has(opList.fnArray[i])
        : withoutText
          ? (i, opList) =>
              !TEXT_OPS.has(opList.fnArray[i]) &&
              !skipSetFor(opList, {
                eraseBoxes,
                eraseImageBoxes,
                eraseArtworkBoxes,
                eraseSections,
                overlayAfter,
                view: page.getViewport({ scale: 1 }).transform,
              }).has(i)
          : null,
  }).promise;
  return { canvas, runs };
};

export const canvasToPngBlob = (canvas) =>
  new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
