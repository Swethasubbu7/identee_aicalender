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

// Lines of lettering drawn as shapes (text converted to curves): rows of
// many small paths, merged with the rows right below them.
const glyphBlocks = (objects, trim, exclude) => {
  const small = objects.filter(
    (o) =>
      o.type === "path" &&
      o.paint !== "clip" &&
      !exclude.has(o.id) &&
      o.bbox.width <= SMALL_MM &&
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
  const lines = rows.filter((r) => r.items.length >= MIN_GLYPHS).map((r) => ({ ids: r.items.map((o) => o.id), box: unionBox(r.items.map((o) => o.bbox)) }));
  // Merge rows that touch (two-line address, outline + fill copies).
  const blocks = [];
  for (const l of lines.sort((a, b) => a.box.y - b.box.y)) {
    const last = blocks[blocks.length - 1];
    const sideBySide = l.box.x < last?.box.x + last?.box.width + 5 && last?.box.x < l.box.x + l.box.width + 5;
    if (last && l.box.y - (last.box.y + last.box.height) <= 4.5 && sideBySide) {
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

  if (texts.length) {
    const name = texts.slice().sort((a, b) => b.height - a.height)[0];
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
  return out;
};

module.exports = { suggestMapping, MM_PER_IN };
