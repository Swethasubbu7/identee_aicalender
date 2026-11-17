// Font pairs for the 5 design recipes (backend constants/designRecipes.js
// names the pair per language). All are free Google Fonts (SIL Open Font
// Licence), loaded in index.html. Designers never pick fonts: every design
// gets a different pair automatically.
//   heading — business name;  body — product details / right-box text.

export const FONT_PAIRS = {
  // English
  "cinzel-marcellus": { heading: { family: "Cinzel", weight: 700 }, body: { family: "Marcellus", weight: 400 } },
  "playfair-lora": { heading: { family: "Playfair Display", weight: 700 }, body: { family: "Lora", weight: 600 } },
  "yeseva-josefin": { heading: { family: "Yeseva One", weight: 400 }, body: { family: "Josefin Sans", weight: 600 } },
  "cormorant-montserrat": { heading: { family: "Cormorant Garamond", weight: 700 }, body: { family: "Montserrat", weight: 600 } },
  "rozha-poppins": { heading: { family: "Rozha One", weight: 400 }, body: { family: "Poppins", weight: 600 } },
  // Tamil (each also covers Latin letters, so mixed text still renders)
  "notoserif-muktamalar": { heading: { family: "Noto Serif Tamil", weight: 700 }, body: { family: "Mukta Malar", weight: 600 } },
  "arima-catamaran": { heading: { family: "Arima", weight: 700 }, body: { family: "Catamaran", weight: 600 } },
  "hindmadurai-notosans": { heading: { family: "Hind Madurai", weight: 600 }, body: { family: "Noto Sans Tamil", weight: 600 } },
  "meerainimai-pavanam": { heading: { family: "Meera Inimai", weight: 400 }, body: { family: "Pavanam", weight: 400 } },
  "baloothambi-notoserif": { heading: { family: "Baloo Thambi 2", weight: 700 }, body: { family: "Noto Serif Tamil", weight: 600 } },
};

const TAMIL = /[஀-௿]/;
export const hasTamil = (text) => TAMIL.test(String(text || ""));

/** { heading, body } for a recipe and language, or null (= layout's own fonts). */
export const fontsForRecipe = (recipe, language = "english") => {
  if (!recipe?.fonts) return null;
  return FONT_PAIRS[recipe.fonts[language === "tamil" ? "tamil" : "english"]] || null;
};

/**
 * Loads the fonts a design needs before drawing (Google Fonts are split by
 * script, so the actual text is passed to get the Tamil part too).
 */
export const loadFontPair = async (pair, texts = []) => {
  if (!pair || !document.fonts?.load) return;
  const sample = texts.filter(Boolean).join(" ") || "Aa";
  await Promise.all(
    [pair.heading, pair.body].map((f) =>
      document.fonts.load(`${f.weight} 24px "${f.family}"`, sample).catch(() => null),
    ),
  );
};

/** True when the browser can draw the text with this font (no missing glyphs). */
export const fontCovers = (font, text) => {
  if (!document.fonts?.check || !text) return true;
  try {
    return document.fonts.check(`${font.weight} 24px "${font.family}"`, text);
  } catch {
    return true;
  }
};

// ---------------------------------------------------------------------
// Designer typography (Customise → Text style). Keys match backend
// constants/typography.js FONT_STYLE_KEYS; "" = automatic (each design's own
// pair). All free Google Fonts, loaded on demand (loadStyleFonts below).
// ---------------------------------------------------------------------
export const STYLE_FONT_PAIRS = {
  "cinzel-marcellus": { heading: { family: "Cinzel", weight: 700 }, body: { family: "Marcellus", weight: 400 } },
  "cinzeldeco-marcellus": { heading: { family: "Cinzel Decorative", weight: 700 }, body: { family: "Marcellus", weight: 400 } },
  "playfair-lora": { heading: { family: "Playfair Display", weight: 700 }, body: { family: "Lora", weight: 600 } },
  "playfairsc-lora": { heading: { family: "Playfair Display SC", weight: 700 }, body: { family: "Lora", weight: 600 } },
  "playfairitalic-lora": { heading: { family: "Playfair Display", weight: 700, style: "italic" }, body: { family: "Lora", weight: 600 } },
  "cormorant-montserrat": { heading: { family: "Cormorant Garamond", weight: 700 }, body: { family: "Montserrat", weight: 600 } },
  "cormorantsc-montserrat": { heading: { family: "Cormorant SC", weight: 700 }, body: { family: "Montserrat", weight: 600 } },
  "garamond-sourcesans": { heading: { family: "EB Garamond", weight: 700 }, body: { family: "Source Sans 3", weight: 600 } },
  "baskerville-lato": { heading: { family: "Libre Baskerville", weight: 700 }, body: { family: "Lato", weight: 700 } },
  "caslon-raleway": { heading: { family: "Libre Caslon Text", weight: 700 }, body: { family: "Raleway", weight: 600 } },
  "bodoni-jost": { heading: { family: "Bodoni Moda", weight: 700 }, body: { family: "Jost", weight: 600 } },
  "prata-raleway": { heading: { family: "Prata", weight: 400 }, body: { family: "Raleway", weight: 600 } },
  "marcellussc-marcellus": { heading: { family: "Marcellus SC", weight: 400 }, body: { family: "Marcellus", weight: 400 } },
  "italiana-tenor": { heading: { family: "Italiana", weight: 400 }, body: { family: "Tenor Sans", weight: 400 } },
  "forum-lato": { heading: { family: "Forum", weight: 400 }, body: { family: "Lato", weight: 700 } },
  "gilda-raleway": { heading: { family: "Gilda Display", weight: 400 }, body: { family: "Raleway", weight: 600 } },
  "bellefair-josefin": { heading: { family: "Bellefair", weight: 400 }, body: { family: "Josefin Sans", weight: 600 } },
  "cardo-sourcesans": { heading: { family: "Cardo", weight: 700 }, body: { family: "Source Sans 3", weight: 600 } },
  "federo-lato": { heading: { family: "Federo", weight: 400 }, body: { family: "Lato", weight: 700 } },
  "spectral-opensans": { heading: { family: "Spectral", weight: 700 }, body: { family: "Open Sans", weight: 600 } },
  "crimson-lato": { heading: { family: "Crimson Pro", weight: 700 }, body: { family: "Lato", weight: 700 } },
  "fraunces-dmsans": { heading: { family: "Fraunces", weight: 700 }, body: { family: "DM Sans", weight: 600 } },
  "unna-lora": { heading: { family: "Unna", weight: 700 }, body: { family: "Lora", weight: 600 } },
  "abhaya-lato": { heading: { family: "Abhaya Libre", weight: 800 }, body: { family: "Lato", weight: 700 } },
  "philosopher": { heading: { family: "Philosopher", weight: 700 }, body: { family: "Philosopher", weight: 400 } },
  "merriweather-sourcesans": { heading: { family: "Merriweather", weight: 900 }, body: { family: "Source Sans 3", weight: 600 } },
  "yeseva-josefin": { heading: { family: "Yeseva One", weight: 400 }, body: { family: "Josefin Sans", weight: 600 } },
  "rozha-poppins": { heading: { family: "Rozha One", weight: 400 }, body: { family: "Poppins", weight: 600 } },
  "abril-raleway": { heading: { family: "Abril Fatface", weight: 400 }, body: { family: "Raleway", weight: 600 } },
  "dmserif-dmsans": { heading: { family: "DM Serif Display", weight: 400 }, body: { family: "DM Sans", weight: 600 } },
  "alfa-nunito": { heading: { family: "Alfa Slab One", weight: 400 }, body: { family: "Nunito", weight: 700 } },
  "ultra-lato": { heading: { family: "Ultra", weight: 400 }, body: { family: "Lato", weight: 700 } },
  "archivo-montserrat": { heading: { family: "Archivo Black", weight: 400 }, body: { family: "Montserrat", weight: 600 } },
  "lilita-nunito": { heading: { family: "Lilita One", weight: 400 }, body: { family: "Nunito", weight: 700 } },
  "russo-opensans": { heading: { family: "Russo One", weight: 400 }, body: { family: "Open Sans", weight: 600 } },
  "bungee-roboto": { heading: { family: "Bungee", weight: 400 }, body: { family: "Roboto", weight: 500 } },
  "righteous-poppins": { heading: { family: "Righteous", weight: 400 }, body: { family: "Poppins", weight: 600 } },
  "rubik-heavy": { heading: { family: "Rubik", weight: 800 }, body: { family: "Rubik", weight: 500 } },
  "oswald-roboto": { heading: { family: "Oswald", weight: 700 }, body: { family: "Roboto", weight: 500 } },
  "bebas-opensans": { heading: { family: "Bebas Neue", weight: 400 }, body: { family: "Open Sans", weight: 600 } },
  "anton-barlow": { heading: { family: "Anton", weight: 400 }, body: { family: "Barlow", weight: 600 } },
  "teko-hind": { heading: { family: "Teko", weight: 600 }, body: { family: "Hind", weight: 600 } },
  "fredoka": { heading: { family: "Fredoka", weight: 700 }, body: { family: "Fredoka", weight: 500 } },
  "comfortaa": { heading: { family: "Comfortaa", weight: 700 }, body: { family: "Comfortaa", weight: 600 } },
  "poiret-raleway": { heading: { family: "Poiret One", weight: 400 }, body: { family: "Raleway", weight: 600 } },
  "greatvibes-lato": { heading: { family: "Great Vibes", weight: 400 }, body: { family: "Lato", weight: 700 } },
  "allura-cormorant": { heading: { family: "Allura", weight: 400 }, body: { family: "Cormorant Garamond", weight: 700 } },
  "parisienne-lora": { heading: { family: "Parisienne", weight: 400 }, body: { family: "Lora", weight: 600 } },
  "dancing-lato": { heading: { family: "Dancing Script", weight: 700 }, body: { family: "Lato", weight: 700 } },
  "satisfy-raleway": { heading: { family: "Satisfy", weight: 400 }, body: { family: "Raleway", weight: 600 } },
  "kaushan-montserrat": { heading: { family: "Kaushan Script", weight: 400 }, body: { family: "Montserrat", weight: 600 } },
  "lobster-opensans": { heading: { family: "Lobster", weight: 400 }, body: { family: "Open Sans", weight: 600 } },
  "pacifico-nunito": { heading: { family: "Pacifico", weight: 400 }, body: { family: "Nunito", weight: 700 } },
  "yellowtail-barlow": { heading: { family: "Yellowtail", weight: 400 }, body: { family: "Barlow", weight: 600 } },
  "sacramento-josefin": { heading: { family: "Sacramento", weight: 400 }, body: { family: "Josefin Sans", weight: 600 } },
  "playball-lato": { heading: { family: "Playball", weight: 400 }, body: { family: "Lato", weight: 700 } },
  "pinyon-cormorant": { heading: { family: "Pinyon Script", weight: 400 }, body: { family: "Cormorant Garamond", weight: 700 } },
  "alexbrush-lato": { heading: { family: "Alex Brush", weight: 400 }, body: { family: "Lato", weight: 700 } },
  "tangerine-lora": { heading: { family: "Tangerine", weight: 700 }, body: { family: "Lora", weight: 600 } },
  "italianno-raleway": { heading: { family: "Italianno", weight: 400 }, body: { family: "Raleway", weight: 600 } },
  "marck-opensans": { heading: { family: "Marck Script", weight: 400 }, body: { family: "Open Sans", weight: 600 } },
  "notosanstamil-heavy": { heading: { family: "Noto Sans Tamil", weight: 900 }, body: { family: "Noto Sans Tamil", weight: 600 } },
  "notosans-black": { heading: { family: "Noto Sans Tamil", weight: 900 }, body: { family: "Noto Sans Tamil", weight: 500 } },
  "catamaran-heavy": { heading: { family: "Catamaran", weight: 800 }, body: { family: "Catamaran", weight: 600 } },
  "catamaran-black": { heading: { family: "Catamaran", weight: 900 }, body: { family: "Catamaran", weight: 700 } },
  "catamaran-clean": { heading: { family: "Catamaran", weight: 700 }, body: { family: "Catamaran", weight: 500 } },
  "muktamalar-heavy": { heading: { family: "Mukta Malar", weight: 800 }, body: { family: "Mukta Malar", weight: 600 } },
  "muktamalar-notoserif": { heading: { family: "Mukta Malar", weight: 800 }, body: { family: "Noto Serif Tamil", weight: 600 } },
  "anektamil": { heading: { family: "Anek Tamil", weight: 800 }, body: { family: "Anek Tamil", weight: 600 } },
  "anektamil-notoserif": { heading: { family: "Anek Tamil", weight: 800 }, body: { family: "Noto Serif Tamil", weight: 600 } },
  "hindmadurai-bold": { heading: { family: "Hind Madurai", weight: 700 }, body: { family: "Hind Madurai", weight: 500 } },
  "hindmadurai-notosans": { heading: { family: "Hind Madurai", weight: 600 }, body: { family: "Noto Sans Tamil", weight: 600 } },
  "hindmadurai-muktamalar": { heading: { family: "Hind Madurai", weight: 700 }, body: { family: "Mukta Malar", weight: 600 } },
  "notoserif-black": { heading: { family: "Noto Serif Tamil", weight: 900 }, body: { family: "Noto Serif Tamil", weight: 600 } },
  "notoserif-italic": { heading: { family: "Noto Serif Tamil", weight: 700, style: "italic" }, body: { family: "Noto Serif Tamil", weight: 500, style: "italic" } },
  "notoserif-muktamalar": { heading: { family: "Noto Serif Tamil", weight: 700 }, body: { family: "Mukta Malar", weight: 600 } },
  "notoserif-catamaran": { heading: { family: "Noto Serif Tamil", weight: 800 }, body: { family: "Catamaran", weight: 600 } },
  "kavivanar-catamaran": { heading: { family: "Kavivanar", weight: 400 }, body: { family: "Catamaran", weight: 600 } },
  "kavivanar-arima": { heading: { family: "Kavivanar", weight: 400 }, body: { family: "Arima", weight: 600 } },
  "kavivanar-muktamalar": { heading: { family: "Kavivanar", weight: 400 }, body: { family: "Mukta Malar", weight: 600 } },
  "arima-catamaran": { heading: { family: "Arima", weight: 700 }, body: { family: "Catamaran", weight: 600 } },
  "arima-muktamalar": { heading: { family: "Arima", weight: 700 }, body: { family: "Mukta Malar", weight: 600 } },
  "coiny-muktamalar": { heading: { family: "Coiny", weight: 400 }, body: { family: "Mukta Malar", weight: 600 } },
  "coiny-catamaran": { heading: { family: "Coiny", weight: 400 }, body: { family: "Catamaran", weight: 600 } },
  "baloothambi-notoserif": { heading: { family: "Baloo Thambi 2", weight: 700 }, body: { family: "Noto Serif Tamil", weight: 600 } },
  "baloothambi-catamaran": { heading: { family: "Baloo Thambi 2", weight: 800 }, body: { family: "Catamaran", weight: 600 } },
  "baloo-heavy": { heading: { family: "Baloo Thambi 2", weight: 800 }, body: { family: "Baloo Thambi 2", weight: 600 } },
  "meerainimai-pavanam": { heading: { family: "Meera Inimai", weight: 400 }, body: { family: "Pavanam", weight: 400 } },
  "pavanam-hind": { heading: { family: "Pavanam", weight: 400 }, body: { family: "Hind Madurai", weight: 500 } },
  "tirotamil-notoserif": { heading: { family: "Tiro Tamil", weight: 400 }, body: { family: "Noto Serif Tamil", weight: 600 } },
  "tirotamil-italic": { heading: { family: "Tiro Tamil", weight: 400, style: "italic" }, body: { family: "Tiro Tamil", weight: 400 } },
  "tirotamil-catamaran": { heading: { family: "Tiro Tamil", weight: 400 }, body: { family: "Catamaran", weight: 600 } },
};

export const FONT_STYLES = [
  { key: "cinzel-marcellus", label: "Cinzel · Marcellus", group: "Classic" },
  { key: "cinzeldeco-marcellus", label: "Cinzel Decorative · Marcellus", group: "Classic" },
  { key: "playfair-lora", label: "Playfair · Lora", group: "Classic" },
  { key: "playfairsc-lora", label: "Playfair SC · Lora", group: "Classic" },
  { key: "playfairitalic-lora", label: "Playfair Italic · Lora", group: "Classic" },
  { key: "cormorant-montserrat", label: "Cormorant · Montserrat", group: "Classic" },
  { key: "cormorantsc-montserrat", label: "Cormorant SC · Montserrat", group: "Classic" },
  { key: "garamond-sourcesans", label: "EB Garamond · Source Sans", group: "Classic" },
  { key: "baskerville-lato", label: "Baskerville · Lato", group: "Classic" },
  { key: "caslon-raleway", label: "Caslon · Raleway", group: "Classic" },
  { key: "bodoni-jost", label: "Bodoni · Jost", group: "Classic" },
  { key: "prata-raleway", label: "Prata · Raleway", group: "Classic" },
  { key: "marcellussc-marcellus", label: "Marcellus SC · Marcellus", group: "Classic" },
  { key: "italiana-tenor", label: "Italiana · Tenor Sans", group: "Classic" },
  { key: "forum-lato", label: "Forum · Lato", group: "Classic" },
  { key: "gilda-raleway", label: "Gilda · Raleway", group: "Classic" },
  { key: "bellefair-josefin", label: "Bellefair · Josefin", group: "Classic" },
  { key: "cardo-sourcesans", label: "Cardo · Source Sans", group: "Classic" },
  { key: "federo-lato", label: "Federo · Lato", group: "Classic" },
  { key: "spectral-opensans", label: "Spectral · Open Sans", group: "Classic" },
  { key: "crimson-lato", label: "Crimson · Lato", group: "Classic" },
  { key: "fraunces-dmsans", label: "Fraunces · DM Sans", group: "Classic" },
  { key: "unna-lora", label: "Unna · Lora", group: "Classic" },
  { key: "abhaya-lato", label: "Abhaya · Lato", group: "Classic" },
  { key: "philosopher", label: "Philosopher", group: "Classic" },
  { key: "merriweather-sourcesans", label: "Merriweather · Source Sans", group: "Classic" },
  { key: "yeseva-josefin", label: "Yeseva · Josefin", group: "Bold display" },
  { key: "rozha-poppins", label: "Rozha · Poppins", group: "Bold display" },
  { key: "abril-raleway", label: "Abril Fatface · Raleway", group: "Bold display" },
  { key: "dmserif-dmsans", label: "DM Serif · DM Sans", group: "Bold display" },
  { key: "alfa-nunito", label: "Alfa Slab · Nunito", group: "Bold display" },
  { key: "ultra-lato", label: "Ultra · Lato", group: "Bold display" },
  { key: "archivo-montserrat", label: "Archivo Black · Montserrat", group: "Bold display" },
  { key: "lilita-nunito", label: "Lilita · Nunito", group: "Bold display" },
  { key: "russo-opensans", label: "Russo · Open Sans", group: "Bold display" },
  { key: "bungee-roboto", label: "Bungee · Roboto", group: "Bold display" },
  { key: "righteous-poppins", label: "Righteous · Poppins", group: "Bold display" },
  { key: "rubik-heavy", label: "Rubik Heavy", group: "Bold display" },
  { key: "oswald-roboto", label: "Oswald · Roboto", group: "Condensed" },
  { key: "bebas-opensans", label: "Bebas Neue · Open Sans", group: "Condensed" },
  { key: "anton-barlow", label: "Anton · Barlow", group: "Condensed" },
  { key: "teko-hind", label: "Teko · Hind", group: "Condensed" },
  { key: "fredoka", label: "Fredoka", group: "Rounded" },
  { key: "comfortaa", label: "Comfortaa", group: "Rounded" },
  { key: "poiret-raleway", label: "Poiret · Raleway", group: "Rounded" },
  { key: "greatvibes-lato", label: "Great Vibes · Lato", group: "Script" },
  { key: "allura-cormorant", label: "Allura · Cormorant", group: "Script" },
  { key: "parisienne-lora", label: "Parisienne · Lora", group: "Script" },
  { key: "dancing-lato", label: "Dancing Script · Lato", group: "Script" },
  { key: "satisfy-raleway", label: "Satisfy · Raleway", group: "Script" },
  { key: "kaushan-montserrat", label: "Kaushan · Montserrat", group: "Script" },
  { key: "lobster-opensans", label: "Lobster · Open Sans", group: "Script" },
  { key: "pacifico-nunito", label: "Pacifico · Nunito", group: "Script" },
  { key: "yellowtail-barlow", label: "Yellowtail · Barlow", group: "Script" },
  { key: "sacramento-josefin", label: "Sacramento · Josefin", group: "Script" },
  { key: "playball-lato", label: "Playball · Lato", group: "Script" },
  { key: "pinyon-cormorant", label: "Pinyon · Cormorant", group: "Script" },
  { key: "alexbrush-lato", label: "Alex Brush · Lato", group: "Script" },
  { key: "tangerine-lora", label: "Tangerine · Lora", group: "Script" },
  { key: "italianno-raleway", label: "Italianno · Raleway", group: "Script" },
  { key: "marck-opensans", label: "Marck Script · Open Sans", group: "Script" },
  { key: "notosanstamil-heavy", label: "Noto Sans Tamil Heavy", group: "Tamil", tamil: true },
  { key: "notosans-black", label: "Noto Sans Tamil Black", group: "Tamil", tamil: true },
  { key: "catamaran-heavy", label: "Catamaran Heavy", group: "Tamil", tamil: true },
  { key: "catamaran-black", label: "Catamaran Black", group: "Tamil", tamil: true },
  { key: "catamaran-clean", label: "Catamaran Clean", group: "Tamil", tamil: true },
  { key: "muktamalar-heavy", label: "Mukta Malar Heavy", group: "Tamil", tamil: true },
  { key: "muktamalar-notoserif", label: "Mukta Malar · Noto Serif", group: "Tamil", tamil: true },
  { key: "anektamil", label: "Anek Tamil", group: "Tamil", tamil: true },
  { key: "anektamil-notoserif", label: "Anek Tamil · Noto Serif", group: "Tamil", tamil: true },
  { key: "hindmadurai-bold", label: "Hind Madurai Bold", group: "Tamil", tamil: true },
  { key: "hindmadurai-notosans", label: "Hind Madurai · Noto Sans", group: "Tamil", tamil: true },
  { key: "hindmadurai-muktamalar", label: "Hind Madurai · Mukta Malar", group: "Tamil", tamil: true },
  { key: "notoserif-black", label: "Noto Serif Tamil Black", group: "Tamil", tamil: true },
  { key: "notoserif-italic", label: "Noto Serif Tamil Italic", group: "Tamil", tamil: true },
  { key: "notoserif-muktamalar", label: "Noto Serif · Mukta Malar", group: "Tamil", tamil: true },
  { key: "notoserif-catamaran", label: "Noto Serif · Catamaran", group: "Tamil", tamil: true },
  { key: "kavivanar-catamaran", label: "Kavivanar · Catamaran", group: "Tamil", tamil: true },
  { key: "kavivanar-arima", label: "Kavivanar · Arima", group: "Tamil", tamil: true },
  { key: "kavivanar-muktamalar", label: "Kavivanar · Mukta Malar", group: "Tamil", tamil: true },
  { key: "arima-catamaran", label: "Arima · Catamaran", group: "Tamil", tamil: true },
  { key: "arima-muktamalar", label: "Arima · Mukta Malar", group: "Tamil", tamil: true },
  { key: "coiny-muktamalar", label: "Coiny · Mukta Malar", group: "Tamil", tamil: true },
  { key: "coiny-catamaran", label: "Coiny · Catamaran", group: "Tamil", tamil: true },
  { key: "baloothambi-notoserif", label: "Baloo Thambi · Noto Serif", group: "Tamil", tamil: true },
  { key: "baloothambi-catamaran", label: "Baloo Thambi · Catamaran", group: "Tamil", tamil: true },
  { key: "baloo-heavy", label: "Baloo Thambi Heavy", group: "Tamil", tamil: true },
  { key: "meerainimai-pavanam", label: "Meera Inimai · Pavanam", group: "Tamil", tamil: true },
  { key: "pavanam-hind", label: "Pavanam · Hind Madurai", group: "Tamil", tamil: true },
  { key: "tirotamil-notoserif", label: "Tiro Tamil · Noto Serif", group: "Tamil", tamil: true },
  { key: "tirotamil-italic", label: "Tiro Tamil Italic", group: "Tamil", tamil: true },
  { key: "tirotamil-catamaran", label: "Tiro Tamil · Catamaran", group: "Tamil", tamil: true },
];

export const TEXT_COLOURS = [
  { key: "#7A1F1F", label: "Maroon" },
  { key: "#B8892B", label: "Antique gold" },
  { key: "#FFD966", label: "Bright gold" },
  { key: "#FFF4D6", label: "Cream" },
  { key: "#FFFFFF", label: "White" },
  { key: "#1A1A1A", label: "Black" },
  { key: "#1F3F8C", label: "Royal blue" },
  { key: "#0F5C4A", label: "Emerald" },
  { key: "#C2410C", label: "Saffron" },
  { key: "#5B2C83", label: "Purple" },
];

// Google Fonts stylesheets requested so far (one per family / weight / style).
const requestedFonts = new Set();
export const requestGoogleFont = ({ family, weight, style }) => {
  const id = `${family}:${style === "italic" ? 1 : 0},${weight}`;
  if (requestedFonts.has(id) || typeof document === "undefined") return;
  requestedFonts.add(id);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:ital,wght@${style === "italic" ? 1 : 0},${weight}&display=swap`;
  document.head.appendChild(link);
};

/** Adds the stylesheets for these styles (all styles when keys is omitted). */
export const requestStyleFonts = (keys = Object.keys(STYLE_FONT_PAIRS)) => {
  for (const key of keys) {
    const pair = STYLE_FONT_PAIRS[key];
    if (pair) [pair.heading, pair.body].forEach(requestGoogleFont);
  }
};

/** The font pair a chosen style uses, or null (automatic). */
export const fontPairForStyle = (key) => STYLE_FONT_PAIRS[key] || null;
