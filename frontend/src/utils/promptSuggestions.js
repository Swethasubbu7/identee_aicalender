// Ready-made AI prompts that match the uploaded God image and the selected
// layout. The image's main colours are read in the browser (nothing is sent
// anywhere); each suggestion is a complete prompt the designer can use as is
// or edit. Every suggestion keeps the deity unchanged and asks for a matching
// name plate, text ribbons and identical side boxes.

const MAX_PROMPT = 1000;

// Name of a colour (h 0–360, s and v 0–1) as a designer would say it.
const colourName = (h, s, v) => {
  if (s < 0.18) return v > 0.8 ? "ivory" : v < 0.25 ? "deep black" : "silver";
  if (h < 15 || h >= 345) return v < 0.45 ? "deep maroon" : "crimson red";
  if (h < 40) return v < 0.5 ? "bronze" : "saffron orange";
  if (h < 65) return v < 0.55 ? "antique gold" : "golden yellow";
  if (h < 160) return v < 0.45 ? "deep emerald" : "emerald green";
  if (h < 200) return "peacock teal";
  if (h < 255) return v < 0.4 ? "midnight blue" : "royal blue";
  if (h < 290) return "royal purple";
  return "magenta pink";
};

const hsv = (r, g, b) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, max ? d / max : 0, max / 255];
};

/**
 * The main colours of a picture: { colours: [up to 3 names], dark, warm }.
 * Transparent pixels (a removed background) are ignored.
 */
export const analyseImageColours = (img) => {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const counts = new Map();
  let lum = 0;
  let warm = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const [h, s, v] = hsv(data[i], data[i + 1], data[i + 2]);
    const name = colourName(h, s, v);
    // Bright, vivid colours count more than greys and shadows: they set the theme.
    counts.set(name, (counts.get(name) || 0) + (s < 0.18 ? 0.5 : 0.4 + 1.6 * s * v));
    lum += v;
    if (s >= 0.18) warm += h < 65 || h >= 290 ? 1 : -1;
    n += 1;
  }
  if (!n) return null;
  const colours = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name).slice(0, 3);
  return { colours, dark: lum / n < 0.42, warm: warm > 0 };
};

const SHAPE = {
  "special-die-cut": "this special die-cut shape",
  "special-cut": "this special die-cut shape",
  "die-cut": "this die-cut calendar",
  normal: "this calendar layout",
};

const join = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0] || "");
const clip = (text) => (text.length > MAX_PROMPT ? `${text.slice(0, MAX_PROMPT - 1).replace(/\s+\S*$/, "")}.` : text);

/**
 * 4 prompt suggestions [{ title, prompt }] for the analysed image and layout.
 *   products — what the business sells (kept out of the background)
 */
export const promptSuggestions = (analysis, { cutType, products = "" } = {}) => {
  if (!analysis?.colours?.length) return [];
  const [c1, c2 = "antique gold", c3 = "ivory"] = analysis.colours;
  const palette = join([...new Set([c1, c2, c3])]);
  const shape = SHAPE[cutType] || "this calendar layout";
  // The business's products belong in the product box only, never in the
  // background (cloth / garments there look cluttered, not devotional).
  const motif = String(products || "").trim() ? " No fabrics, cloth or garments in the background." : "";
  const keep = "Keep the uploaded God image exactly as it is: same face, eyes, hair, pose, ornaments, weapons and clothing; never redraw or recolour the deity.";
  const boxes =
    "Business-name plate: wide and prominent, in a rich tone from this palette with an ornate gold border and a smooth plain centre. Text ribbons in matching tones. Left and right boxes the same shape, frame and colours. Everything centred, symmetric and aligned.";
  const finish =
    "The design covers the whole shape right to the edge with a rich ornamental border along the outline — no empty margin; garlands, drapes and the arch crown are complete, never sliced by the edge. Polished, professional, sharp and print-ready.";

  const items = [
    {
      title: "Matches the image",
      prompt: `${keep} Design ONE consistent theme from top to bottom using the image's own colours: ${palette}. A soft divine glow and halo behind the deity, a rich background in ${c1} tones, and an elegant ${c2 === "antique gold" ? "gold" : "antique-gold"} frame filling ${shape}. ${boxes}${motif} ${finish}`,
    },
    {
      title: "Royal temple",
      prompt: `${keep} A grand temple setting in ${palette}${/gold/.test(palette) ? "" : " with antique gold"}: carved temple arch and pillars, hanging brass lamps, marigold and jasmine garlands, and a radiant halo behind the deity, all filling ${shape}. ${boxes}${motif} Majestic and traditional. ${finish}`,
    },
    analysis.dark
      ? {
          title: "Divine night sky",
          prompt: `${keep} A mystical night theme in ${palette}: starry sky, glowing moon, soft clouds and gentle rays of divine light around the deity, with a fine gold filigree frame filling ${shape}. ${boxes}${motif} Serene and powerful. ${finish}`,
        }
      : {
          title: "Festive floral",
          prompt: `${keep} A bright festive theme in ${palette}: lotus and marigold flowers, mango leaves, diyas and soft golden light around the deity, with a floral gold frame filling ${shape}. ${boxes}${motif} Joyful and auspicious. ${finish}`,
        },
    {
      title: "Modern premium",
      prompt: `${keep} A modern premium look in ${palette}: a smooth rich ${c1} background with a subtle glow, fine gold line-art ornaments and a slim elegant frame filling ${shape}, with generous calm space. ${boxes}${motif} Clean, luxurious and minimal. ${finish}`,
    },
  ];
  return items.map((s) => ({ ...s, prompt: clip(s.prompt) }));
};
