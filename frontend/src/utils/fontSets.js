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
