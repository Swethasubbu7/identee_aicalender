// The main colours of the customer's God image, read on the server (no AI
// call): the default colour theme of AI designs, so the background, frame,
// plate and boxes follow the picture instead of a fixed red / blue / green
// theme. Mirrors frontend utils/promptSuggestions.js (colour names).
const sharp = require("sharp");

const SIZE = 48;

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

const hex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

/**
 * Up to 4 main colours [{ name, hex }], most important first; [] when the
 * picture cannot be read. A plain white / transparent background around
 * the deity is ignored; vivid colours count more than greys and shadows.
 */
const imagePalette = async (buffer) => {
  try {
    const { data, info } = await sharp(buffer).resize(SIZE, SIZE, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const groups = new Map();
    for (let i = 0; i < info.width * info.height * 4; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 128) continue;
      const [h, s, v] = hsv(r, g, b);
      if (s < 0.08 && v > 0.93) continue; // studio / removed background
      const name = colourName(h, s, v);
      const weight = s < 0.18 ? 0.5 : 0.4 + 1.6 * s * v;
      const group = groups.get(name) || { weight: 0, sum: [0, 0, 0], n: 0 };
      group.weight += weight;
      group.sum[0] += r;
      group.sum[1] += g;
      group.sum[2] += b;
      group.n += 1;
      groups.set(name, group);
    }
    return [...groups.entries()]
      .sort((a, b) => b[1].weight - a[1].weight)
      .slice(0, 4)
      .map(([name, g]) => ({ name, hex: hex(g.sum.map((c) => c / g.n)) }));
  } catch {
    return [];
  }
};

module.exports = { imagePalette, colourName };
