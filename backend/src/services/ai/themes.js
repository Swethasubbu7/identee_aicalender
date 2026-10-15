// The 3 visual themes of one generation, decided by the app (no AI call).
//
// - The designer's prompt names colours → every design keeps those colours
//   and only the treatment changes (festive / royal / traditional).
// - No colours in the prompt → red + gold, blue + gold, green + gold.
// The designer's full prompt is always sent to the image model as well.

const COLOURS = {
  red: "#A11D1D",
  maroon: "#6B1414",
  crimson: "#8E1B2E",
  gold: "#C9A227",
  golden: "#C9A227",
  yellow: "#E8C547",
  orange: "#E8771E",
  saffron: "#F28C28",
  blue: "#1F3F7A",
  navy: "#14254A",
  green: "#1E5631",
  emerald: "#0F6B4A",
  teal: "#1F5F66",
  pink: "#D45D8A",
  purple: "#5B2A86",
  violet: "#6A3FA0",
  white: "#F7F3EA",
  cream: "#F4E9D0",
  silver: "#B9BCC2",
  copper: "#B06B3A",
  brown: "#6B4426",
  black: "#1A1A1A",
};

const TREATMENTS = [
  { label: "Festive", mood: "festive, joyful", background: "rich festive decorations, flower garlands and warm glowing lamps", godSetting: "a warm divine halo with festive temple lights" },
  { label: "Royal premium", mood: "royal, elegant", background: "elegant luxurious ornamentation with fine filigree and deep contrast", godSetting: "a majestic royal setting with soft dramatic light" },
  { label: "Traditional", mood: "calm, traditional", background: "classic temple and kolam motifs with soft textures", godSetting: "a serene temple setting with gentle natural light" },
];

const DEFAULT_THEMES = [
  { name: "Red and gold festive", mood: "divine, festive", palette: ["#7A1F1F", "#C9A227", "#F4E1A1", "#3B1E08"], background: "Rich maroon and red with fine gold temple motifs.", godSetting: "A warm golden halo with temple pillars softly in the background." },
  { name: "Blue and gold premium", mood: "royal, serene", palette: ["#14305C", "#C9A227", "#E8EEF7", "#0B1A33"], background: "Deep royal blue with subtle gold mandala patterns.", godSetting: "A glowing night sky with soft golden light around the deity." },
  { name: "Green and gold traditional", mood: "calm, auspicious", palette: ["#1E4D2B", "#C9A227", "#F2EFD9", "#0F2A17"], background: "Deep green with faint kolam and leaf motifs in gold.", godSetting: "A lush temple garden with gentle sunlight behind the deity." },
];

/** Colour words named in the prompt, in the order they appear. */
const promptColours = (prompt = "") => {
  const words = String(prompt).toLowerCase().match(/[a-z]+/g) || [];
  return [...new Set(words.filter((w) => COLOURS[w]))];
};

const capitalise = (w) => w.charAt(0).toUpperCase() + w.slice(1);

/** @returns the theme for design i (0-based) of a generation. */
const themeFor = (prompt, i) => {
  const colours = promptColours(prompt);
  if (colours.length === 0) return DEFAULT_THEMES[i % DEFAULT_THEMES.length];
  const t = TREATMENTS[i % TREATMENTS.length];
  const names = colours.slice(0, 3).join(" and ");
  return {
    name: `${colours.slice(0, 3).map(capitalise).join(" & ")} · ${t.label}`,
    mood: t.mood,
    palette: colours.slice(0, 5).map((c) => COLOURS[c]),
    background: `${capitalise(names)} colours with ${t.background}.`,
    godSetting: `${capitalise(t.godSetting)}, in ${names} tones.`,
  };
};

module.exports = { themeFor, promptColours, DEFAULT_THEMES };
