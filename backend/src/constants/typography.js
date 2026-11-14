// Designer typography choices (keys match frontend utils/fontSets.js
// FONT_STYLES / TEXT_COLOURS). "" = automatic.
const FONT_STYLE_KEYS = [
  "cinzel-marcellus", "cinzeldeco-marcellus", "playfair-lora", "playfairsc-lora", "cormorant-montserrat",
  "garamond-sourcesans", "baskerville-lato", "bodoni-jost", "prata-raleway", "marcellussc-marcellus",
  "philosopher", "yeseva-josefin", "rozha-poppins", "abril-raleway", "dmserif-dmsans",
  "merriweather-sourcesans", "alfa-nunito", "ultra-lato", "archivo-montserrat", "lilita-nunito",
  "russo-opensans", "bungee-roboto", "righteous-poppins", "greatvibes-lato", "allura-cormorant",
  "parisienne-lora", "dancing-lato", "satisfy-raleway", "kaushan-montserrat", "lobster-opensans",
  "pacifico-nunito", "yellowtail-barlow", "sacramento-josefin", "playball-lato", "oswald-roboto",
  "bebas-opensans", "anton-barlow", "teko-hind", "fredoka", "comfortaa",
  "poiret-raleway", "notosanstamil-heavy", "catamaran-heavy", "catamaran-black", "muktamalar-heavy",
  "anektamil", "hindmadurai-bold", "notoserif-black", "kavivanar-catamaran", "kavivanar-arima",
  "arima-catamaran", "coiny-muktamalar", "baloothambi-notoserif", "baloo-heavy", "meerainimai-pavanam",
  "notoserif-muktamalar", "notoserif-italic", "tirotamil-notoserif", "tirotamil-italic", "hindmadurai-notosans",
  "pavanam-hind",
  // More styles (2026-10-30).
  "italiana-tenor",
  "forum-lato",
  "gilda-raleway",
  "cormorantsc-montserrat",
  "bellefair-josefin",
  "cardo-sourcesans",
  "caslon-raleway",
  "federo-lato",
  "playfairitalic-lora",
  "spectral-opensans",
  "crimson-lato",
  "fraunces-dmsans",
  "unna-lora",
  "abhaya-lato",
  "rubik-heavy",
  "pinyon-cormorant",
  "alexbrush-lato",
  "tangerine-lora",
  "italianno-raleway",
  "marck-opensans",
  "notosans-black",
  "notoserif-catamaran",
  "muktamalar-notoserif",
  "hindmadurai-muktamalar",
  "anektamil-notoserif",
  "baloothambi-catamaran",
  "coiny-catamaran",
  "kavivanar-muktamalar",
  "arima-muktamalar",
  "tirotamil-catamaran",
  "catamaran-clean",
];
const TEXT_COLOUR_KEYS = ["#7A1F1F", "#B8892B", "#FFD966", "#FFF4D6", "#FFFFFF", "#1A1A1A", "#1F3F8C", "#0F5C4A", "#C2410C", "#5B2C83"];

// Text sizes per slot, percent of the automatic size (frontend
// utils/textSizes.js). 100 = automatic, so it is never stored.
const TEXT_SIZE_KEYS = ["businessName", "textLine1", "textLine2", "textLine3", "leftBox", "rightBox"];
const TEXT_SIZE_MIN = 70;
const TEXT_SIZE_MAX = 150;

const fontStyleOf = (value) => (FONT_STYLE_KEYS.includes(value) ? value : "");
const textSizesOf = (value) => {
  let sizes = value;
  if (typeof sizes === "string") {
    try {
      sizes = JSON.parse(sizes);
    } catch {
      sizes = null;
    }
  }
  const out = {};
  if (!sizes || typeof sizes !== "object") return out;
  for (const key of TEXT_SIZE_KEYS) {
    const v = Math.round(Number(sizes[key]));
    if (Number.isFinite(v) && v !== 100) out[key] = Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, v));
  }
  return out;
};
const textColourOf = (value) => (TEXT_COLOUR_KEYS.includes(value) ? value : "");

module.exports = { FONT_STYLE_KEYS, TEXT_COLOUR_KEYS, TEXT_SIZE_KEYS, TEXT_SIZE_MIN, TEXT_SIZE_MAX, fontStyleOf, textColourOf, textSizesOf };
