// Suggested mapping for an imported page — a starting point the admin
// reviews on the mapping screen (nothing is saved automatically). Every
// suggestion names the PDF objects it uses and a confidence:
//   HIGH   — found unambiguously (one cutline, the cake rectangle, …)
//   MEDIUM — a reasonable reading of the layout (e.g. the tallest text above
//            the cake is the business name); check it
// Nothing is invented: a role without matching objects is simply absent.

const MM_PER_IN = 25.4;
const SMALL_MM = 25; // letters / glyph shapes are smaller than this
const ROW_TOLERANCE_MM = 4;
const MIN_GLYPHS = 6;

const unionBox = (boxes) => {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};
const inside = (b, o, pad = 1) =>
  b.x >= o.x - pad && b.y >= o.y - pad && b.x + b.width <= o.x + o.width + pad && b.y + b.height <= o.y + o.height + pad;
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

// Where the calendar is on the page: the cutline, moved onto the artwork
// when it is drawn beside it (registration twin marks).
const trimBoxOnPage = (page, analysis) => {
  const byId = new Map(page.objects.map((o) => [o.id, o]));
  const cut = byId.get(analysis.cutline.candidates[0]);
  if (!cut) return analysis.artworkBounds || null;
  const reg = analysis.registration;
  if (!reg) return cut.bbox;
  const art = byId.get(reg.artObjectId);
  const twin = byId.get(reg.cutlineObjectId);
  return { ...cut.bbox, x: cut.bbox.x - (twin.bbox.x - art.bbox.x), y: cut.bbox.y - (twin.bbox.y - art.bbox.y) };
};

// A light, colourless fill (pale grey / beige): background patterns drawn
// as many small shapes, never the business name.
const isPaleNeutral = (hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  return Math.min(r, g, b) >= 150 && Math.max(r, g, b) - Math.min(r, g, b) <= 35;
};

// Lines of lettering drawn as shapes (text converted to curves): rows of
// many small paths, merged with the rows right below them.
const glyphBlocks = (objects, trim, exclude) => {
  const small = objects.filter(
    (o) =>
      o.type === "path" &&
      o.paint !== "clip" &&
      !exclude.has(o.id) &&
      // A letter, or a whole word drawn as one shape (wide and low).
      (o.bbox.width <= SMALL_MM || (o.bbox.height <= 12 && o.bbox.width <= 70)) &&
      o.bbox.height <= SMALL_MM &&
      o.bbox.height >= 0.8 &&
      inside(o.bbox, trim, 0),
  );
  const rows = [];
  for (const o of small.sort((a, b) => centre(a.bbox).y - centre(b.bbox).y)) {
    const row = rows.find((r) => Math.abs(r.cy - centre(o.bbox).y) <= ROW_TOLERANCE_MM && Math.abs(r.h - o.bbox.height) <= Math.max(3, r.h));
    if (row) {
      row.items.push(o);
      row.cy = (row.cy * (row.items.length - 1) + centre(o.bbox).y) / row.items.length;
    } else rows.push({ cy: centre(o.bbox).y, h: o.bbox.height, items: [o] });
  }
  const lines = rows
    // Many letters, or a few whole-word shapes forming a line.
    .filter((r) => r.items.length >= MIN_GLYPHS || (r.items.length >= 2 && unionBox(r.items.map((o) => o.bbox)).width >= 30))
    // Mostly pale grey shapes: a background pattern, not lettering.
    .filter((r) => r.items.filter((o) => isPaleNeutral(o.fillColor)).length < r.items.length * 0.7)
    .map((r) => ({ ids: r.items.map((o) => o.id), box: unionBox(r.items.map((o) => o.bbox)) }));
  // Merge rows that touch (two-line address, outline + fill copies).
  const blocks = [];
  for (const l of lines.sort((a, b) => a.box.y - b.box.y)) {
    const last = blocks[blocks.length - 1];
    const sideBySide = l.box.x < last?.box.x + last?.box.width + 5 && last?.box.x < l.box.x + l.box.width + 5;
    // Line gap: up to 5 mm, or 1.5 line heights.
    if (last && l.box.y - (last.box.y + last.box.height) <= Math.max(5, 1.5 * Math.min(l.box.height, last.box.height)) && sideBySide) {
      last.ids.push(...l.ids);
      last.box = unionBox([last.box, l.box]);
    } else blocks.push({ ...l, ids: [...l.ids] });
  }
  // Everything drawn fully inside a block belongs to it (plates, gradient strips).
  for (const b of blocks) {
    for (const o of objects) {
      if (o.type === "path" && o.paint !== "clip" && !exclude.has(o.id) && !b.ids.includes(o.id) && inside(o.bbox, b.box, 1)) b.ids.push(o.id);
    }
  }
  return blocks.map((b) => ({ kind: "shapes", ids: b.ids, box: b.box, height: b.box.height }));
};

/**
 * @param page      pdfImporter page
 * @param analysis  analysePage() result for the same page
 * @param cutType   "normal" | "die-cut" | "special-die-cut"
 */
const suggestMapping = (page, analysis, cutType) => {
  const objects = page.objects || [];
  const byId = new Map(objects.map((o) => [o.id, o]));
  const out = { cutlineObjectId: null, registration: null, excludedObjectIds: [], regions: [], notes: [] };
  if (analysis.detected.cutline === "AUTO" && analysis.cutline.candidates[0]) {
    out.cutlineObjectId = analysis.cutline.candidates[0];
    out.registration = analysis.registration || null;
  }
  out.excludedObjectIds = analysis.guideLabels.map((g) => g.id);
  const trim = trimBoxOnPage(page, analysis);
  if (!trim) return out;
  const exclude = new Set([...out.excludedObjectIds, ...analysis.cutline.candidates]);
  if (analysis.registration) exclude.add(analysis.registration.cutlineObjectId);

  // Cake + calendar area.
  const cakeId = analysis.cake.onArtwork.length === 1 ? analysis.cake.onArtwork[0] : null;
  const cake = cakeId ? byId.get(cakeId) : null;
  if (cake) {
    exclude.add(cakeId);
    out.regions.push({ role: "CAKE_MOUNT", objectIds: [cakeId], confidence: "HIGH", reason: "Rectangle of the catalogue cake size" });
    out.regions.push({ role: "CALENDAR_AREA", objectIds: [cakeId], confidence: "HIGH", reason: "Same rectangle as the cake (layout convention)" });
  }

  // Background artwork (Special Die-Cut: the whole design is one artwork).
  const images = objects.filter((o) => o.type === "image" && overlaps(o.bbox, trim));
  const big = images.sort((a, b) => b.bbox.width * b.bbox.height - a.bbox.width * a.bbox.height)[0];
  if (cutType === "special-die-cut" && big && big.bbox.width * big.bbox.height >= 0.4 * trim.width * trim.height) {
    out.regions.push({ role: "BACKGROUND_AREA", objectIds: [big.id], confidence: "HIGH", reason: "Image covering most of the calendar" });
  }

  // Text: live text blocks and lettering drawn as shapes, above the cake.
  const limitY = cake ? cake.bbox.y : trim.y + trim.height;
  const live = objects
    .filter((o) => o.type === "text" && !exclude.has(o.id) && inside(o.bbox, trim, 1) && o.bbox.y < limitY)
    .map((t) => {
      // A filled bar right behind the text belongs to the line.
      const bar = objects.find(
        (o) => o.type === "path" && o.paint === "fill" && o.closed && overlaps(o.bbox, t.bbox) && o.bbox.width >= t.bbox.width * 0.8 && o.bbox.height <= 15 && o.bbox.width < trim.width * 0.95,
      );
      return { kind: "text", ids: bar ? [t.id, bar.id] : [t.id], box: bar ? unionBox([t.bbox, bar.bbox]) : t.bbox, height: t.fontSizePt * 0.3528, font: t.fontName };
    });
  const shapes = glyphBlocks(objects, trim, exclude).filter(
    (b) => b.box.y < limitY && !live.some((l) => overlaps(l.box, b.box)),
  );
  const texts = [...live, ...shapes].sort((a, b) => a.box.y - b.box.y);
  const fileFont = live.find((l) => l.font)?.font || null;
  const style = (t) => (t.kind === "shapes" ? { fontFamily: fileFont || undefined } : undefined);

  let name = null;
  if (texts.length) {
    // Real (live) text is preferred: letters drawn as shapes are only used
    // when the file has no large live text.
    const bigLive = live.filter((t) => t.height >= 5).sort((a, b) => b.height - a.height)[0];
    name = bigLive || texts.slice().sort((a, b) => b.height - a.height)[0];
    // Words of the same line drawn as separate shape groups belong to the name.
    if (name.kind === "shapes") {
      const vOverlap = (a, b) => Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)) / Math.min(a.height, b.height);
      const parts = texts.filter((t) => t !== name && t.kind === "shapes" && vOverlap(t.box, name.box) >= 0.6);
      if (parts.length) {
        const merged = { ...name, box: unionBox([name.box, ...parts.map((p) => p.box)]) };
        const original = texts.indexOf(name) >= 0 ? name : texts.find((t) => t.ids === name.ids);
        parts.forEach((p) => texts.splice(texts.indexOf(p), 1));
        name = { ...merged, ids: [...new Set([...merged.ids, ...parts.flatMap((p) => p.ids)])] };
        if (original) texts.splice(texts.indexOf(original), 1, name);
      }
    }
    out.regions.push({
      role: "NAME_TEXT",
      objectIds: name.ids,
      confidence: "MEDIUM",
      reason: `Largest lettering above the cake${name.kind === "shapes" ? " (letters drawn as shapes)" : ""}`,
      ...(style(name) && { textStyle: style(name) }),
    });
    if (cutType === "special-die-cut") {
      const below = texts.filter((t) => t !== name && t.box.y > name.box.y);
      const bindings = ["productList", "address"];
      below.slice(0, 2).forEach((t, i) =>
        out.regions.push({
          role: i === 0 ? "TEXT_LINE_1" : "TEXT_LINE_2",
          objectIds: t.ids,
          binding: bindings[i],
          confidence: "MEDIUM",
          reason: `${i === 0 ? "First" : "Second"} text line below the name${t.kind === "shapes" ? " (letters drawn as shapes)" : ""}`,
          ...(style(t) && { textStyle: style(t) }),
        }),
      );
    }
    if (texts.some((t) => t.kind === "shapes")) {
      out.notes.push(
        fileFont
          ? `Some text is drawn as letter shapes: it uses the file's font ${fileFont} as a working choice — confirm the font.`
          : "Some text is drawn as letter shapes and the file has no font: choose a font for it.",
      );
    }
  }
  if (cutType !== "special-die-cut") suggestPictureAreas({ objects, trim, cake, name, exclude, out });
  return out;
};

// Normal / Die-Cut: frame artwork, God picture area and the two side boxes,
// read from the pictures and boxes in the file. Every suggestion is MEDIUM:
// the designer confirms it on the review screen (nothing is saved unseen).
const suggestPictureAreas = ({ objects, trim, cake, name, exclude, out }) => {
  const trimArea = trim.width * trim.height;
  const images = objects.filter((o) => o.type === "image" && !exclude.has(o.id) && overlaps(o.bbox, trim));
  const used = new Set();

  // Frame: one picture spanning (almost) the full width over a large part of
  // the height — the decorated arch / border the God picture sits in.
  const frame = images
    .filter((o) => o.bbox.width >= trim.width * 0.8 && o.bbox.height >= trim.height * 0.35 && o.bbox.width * o.bbox.height < trimArea * 0.98)
    .sort((a, b) => b.bbox.width * b.bbox.height - a.bbox.width * a.bbox.height)[0];
  if (frame) {
    used.add(frame.id);
    out.regions.push({ role: "FRAME", objectIds: [frame.id], confidence: "MEDIUM", reason: "Large artwork picture across the top of the calendar" });
  }

  // God picture: the largest other picture above the business name (or the
  // calendar pad), plus a strip drawn directly on top of it (same width).
  const topLimit = name ? name.box.y + name.box.height * 0.5 : cake ? cake.bbox.y : trim.y + trim.height * 0.6;
  const god = images
    .filter((o) => !used.has(o.id) && centre(o.bbox).y < topLimit && o.bbox.width * o.bbox.height >= trimArea * 0.05 && o.bbox.width * o.bbox.height < trimArea * 0.85)
    .sort((a, b) => b.bbox.width * b.bbox.height - a.bbox.width * a.bbox.height)[0];
  if (god) {
    const ids = [god.id];
    let box = god.bbox;
    for (const o of images) {
      if (o.id === god.id || used.has(o.id)) continue;
      const sameColumn = Math.abs(o.bbox.x - box.x) <= 2 && Math.abs(o.bbox.width - box.width) <= 2;
      const touching = Math.abs(o.bbox.y + o.bbox.height - box.y) <= 2 || Math.abs(box.y + box.height - o.bbox.y) <= 2;
      if (sameColumn && touching) {
        ids.push(o.id);
        box = unionBox([box, o.bbox]);
      }
    }
    ids.forEach((id) => used.add(id));
    out.regions.push({ role: "GOD_AREA", objectIds: ids, confidence: "MEDIUM", reason: "Largest picture above the business name — check it is the God picture" });
  }

  // Side boxes: below the name, in the left / right part of the calendar.
  const lowY = name ? name.box.y + name.box.height : cake ? cake.bbox.y - 5 : trim.y + trim.height * 0.55;
  const leftEdge = trim.x + trim.width * 0.4;
  const rightEdge = trim.x + trim.width * 0.6;
  // The filled / outlined shape a box's content sits on (not the whole page).
  const boxBehind = (bbox) =>
    objects
      .filter(
        (o) =>
          o.type === "path" &&
          o.paint !== "clip" &&
          o.closed &&
          !exclude.has(o.id) &&
          !used.has(o.id) &&
          inside(bbox, o.bbox, 1) &&
          o.bbox.width <= trim.width * 0.45 &&
          o.bbox.width * o.bbox.height <= (bbox.width + 40) * (bbox.height + 40),
      )
      .sort((a, b) => a.bbox.width * a.bbox.height - b.bbox.width * b.bbox.height)[0] || null;

  // Any live text in the calendar (side boxes sit beside the calendar pad,
  // so the "above the pad" limit used for the name does not apply here).
  const nameIds = new Set(name?.ids || []);
  const boxTexts = objects
    .filter((o) => o.type === "text" && !exclude.has(o.id) && !nameIds.has(o.id) && inside(o.bbox, trim, 1))
    .map((t) => ({ ids: [t.id], box: t.bbox }));
  const leftText = boxTexts
    .filter((t) => centre(t.box).y > lowY && centre(t.box).x < leftEdge)
    .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)[0];
  if (leftText) {
    const shape = boxBehind(leftText.box);
    const ids = [...(shape ? [shape.id] : []), ...leftText.ids];
    ids.forEach((id) => used.add(id));
    out.regions.push({ role: "SIDE_BOX_LEFT", objectIds: ids, confidence: "MEDIUM", reason: "Text block in the lower left (product details)" });
  }
  const rightPicture = images
    .filter((o) => !used.has(o.id) && centre(o.bbox).y > lowY && centre(o.bbox).x > rightEdge)
    .sort((a, b) => b.bbox.width * b.bbox.height - a.bbox.width * a.bbox.height)[0];
  if (rightPicture) {
    const shape = boxBehind(rightPicture.bbox);
    const ids = [rightPicture.id, ...(shape ? [shape.id] : [])];
    ids.forEach((id) => used.add(id));
    out.regions.push({ role: "SIDE_BOX_RIGHT", objectIds: ids, confidence: "MEDIUM", reason: "Picture in the lower right (product photo)" });
  }
};

module.exports = { suggestMapping, MM_PER_IN };

/**
 * A text line drawn as shapes is often split into many shapes (words, rows,
 * an outline copy). Starting from the selected shapes, adds every nearby
 * shape painted in the same colours — so the WHOLE original line is removed
 * from the artwork and its area is the real extent of the line.
 * Only shapes of the exact same fill + stroke colour, touching the growing
 * line (±12 mm sideways, ±1.5 line heights up / down), are added.
 * @returns ids (the selection plus what was added)
 */
const growTextShapes = (page, ids, { taken = new Set() } = {}) => {
  const byId = new Map((page.objects || []).map((o) => [o.id, o]));
  const selected = ids.map((id) => byId.get(id)).filter(Boolean);
  const seeds = selected.filter((o) => o.type === "path" && o.paint !== "clip" && (o.fillColor || o.strokeColor));
  if (!seeds.length) return ids;
  const key = (o) => `${o.fillColor || "-"}|${o.strokeColor || "-"}`;
  const colours = new Set(seeds.map(key));
  const heights = seeds.map((o) => o.bbox.height).sort((a, b) => a - b);
  const lineH = heights[Math.floor(heights.length / 2)] || 1;
  const out = new Set(ids);
  let box = unionBox(selected.map((o) => o.bbox));
  for (let round = 0; round < 12; round += 1) {
    const grow = { x: box.x - 12, y: box.y - lineH * 1.5, width: box.width + 24, height: box.height + lineH * 3 };
    const added = (page.objects || []).filter(
      (o) =>
        !out.has(o.id) &&
        !taken.has(o.id) &&
        o.type === "path" &&
        o.paint !== "clip" &&
        colours.has(key(o)) &&
        o.bbox.height <= lineH * 4 &&
        o.bbox.width <= grow.width &&
        overlaps(o.bbox, grow),
    );
    if (!added.length) break;
    added.forEach((o) => out.add(o.id));
    box = unionBox([box, ...added.map((o) => o.bbox)]);
  }
  return [...out];
};

module.exports.growTextShapes = growTextShapes;
