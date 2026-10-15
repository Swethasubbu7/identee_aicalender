// The design recipes of a Generate (2 per Generate since 2026-10-12):
// every recipe uses the SAME selected production layout; only colours,
// fonts and side-box styles change. Geometry (size, cutline, cake and
// calendar positions) is never part of a recipe.
//
// Rendering lives in the frontend (utils/designRecipes.js, fontSets.js,
// sideBoxStyles.js); the ids below must match those files.
//   theme    — colour treatment of the layout artwork ("original" = untouched)
//   fonts    — font pair id per language (heading = business name, body = lists)
//   boxStyle — side-box style ("layout" = the layout's own boxes)

const DESIGN_RECIPES = [
  {
    id: "classic",
    name: "Classic (layout colours)",
    theme: "original",
    palette: [],
    fonts: { english: "cinzel-marcellus", tamil: "notoserif-muktamalar" },
    boxStyle: "layout",
  },
  {
    id: "royal-maroon",
    name: "Royal maroon & gold",
    theme: "maroon",
    palette: ["#5E0B15", "#9E1B32", "#D4AF37", "#FFF4D6"],
    fonts: { english: "playfair-lora", tamil: "arima-catamaran" },
    boxStyle: "arched",
  },
  {
    id: "peacock-blue",
    name: "Peacock blue & gold",
    theme: "blue",
    palette: ["#0B2545", "#13315C", "#D4AF37", "#EEF4FF"],
    fonts: { english: "yeseva-josefin", tamil: "hindmadurai-notosans" },
    boxStyle: "scalloped",
  },
  {
    id: "emerald",
    name: "Emerald green & gold",
    theme: "green",
    palette: ["#0B3D2E", "#14593F", "#D4AF37", "#F1FAEE"],
    fonts: { english: "cormorant-montserrat", tamil: "meerainimai-pavanam" },
    boxStyle: "double",
  },
  {
    id: "saffron",
    name: "Saffron festive",
    theme: "saffron",
    palette: ["#7A2E00", "#E8771E", "#F9C74F", "#FFF8E7"],
    fonts: { english: "rozha-poppins", tamil: "baloothambi-notoserif" },
    boxStyle: "ribbon",
  },
];

const recipeFor = (index) => DESIGN_RECIPES[index % DESIGN_RECIPES.length];

// Normal Mode (no AI): five variations of the SAME layout that differ only in
// the app-drawn side-box style. The layout's artwork, God picture, colours
// and fonts stay as designed (Tamil text uses a Tamil font pair).
const NORMAL_FONTS = { english: null, tamil: "notoserif-muktamalar" };
const NORMAL_BOX_RECIPES = [
  { id: "normal-layout", name: "Original boxes", boxStyle: "layout" },
  { id: "normal-rounded", name: "Rounded decorative boxes", boxStyle: "rounded" },
  { id: "normal-arched", name: "Arched boxes", boxStyle: "arched" },
  { id: "normal-scalloped", name: "Scalloped-edge boxes", boxStyle: "scalloped" },
  { id: "normal-double", name: "Double-border ornamental boxes", boxStyle: "double" },
].map((r) => ({ ...r, theme: "original", palette: [], fonts: NORMAL_FONTS }));

/**
 * Normal Mode recipes for a layout: five box styles for Normal Cut / Die-Cut
 * (a saved layout's own style first), one design for Special Die-Cut (it has
 * no side boxes: only its name and text lines are customised).
 */
const normalRecipes = (variant) => {
  if (variant?.cutType === "special-die-cut") return [{ ...NORMAL_BOX_RECIPES[0], name: "Layout design" }];
  const saved = variant?.design?.boxStyle;
  const first = NORMAL_BOX_RECIPES.find((r) => r.boxStyle === saved);
  return first ? [first, ...NORMAL_BOX_RECIPES.filter((r) => r !== first)] : NORMAL_BOX_RECIPES;
};

// Colour words in the designer's prompt → the recipe whose theme matches.
const RECIPE_BY_COLOUR = [
  { words: ["red", "maroon", "crimson", "royal"], id: "royal-maroon" },
  { words: ["blue", "navy", "peacock", "teal"], id: "peacock-blue" },
  { words: ["green", "emerald"], id: "emerald" },
  { words: ["saffron", "orange", "yellow", "festive"], id: "saffron" },
];

/**
 * Recipes for one Generate: related but visibly different designs.
 * Design 1 follows the prompt's colours (or the layout's own colours);
 * the next designs use other recipes, so colours, fonts and side boxes differ.
 */
const pickRecipes = (prompt = "", count = 2) => {
  const words = String(prompt).toLowerCase().match(/[a-z]+/g) || [];
  const matched = RECIPE_BY_COLOUR.find((m) => m.words.some((w) => words.includes(w)));
  const first = DESIGN_RECIPES.find((r) => r.id === matched?.id) || DESIGN_RECIPES[0];
  const others = DESIGN_RECIPES.filter((r) => r.id !== first.id);
  return [first, ...others].slice(0, count);
};

module.exports = { DESIGN_RECIPES, NORMAL_BOX_RECIPES, recipeFor, pickRecipes, normalRecipes };
