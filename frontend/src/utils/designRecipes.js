// Turns a design recipe (from the server: constants/designRecipes.js) and
// the designer's options into the `design` argument of drawLayoutPreview.
import { fontsForRecipe } from "./fontSets";

export const DEFAULT_SECTIONS = {
  showBusinessName: true,
  showLeftBox: true,
  showRightBox: true,
  showTextLine1: true,
  showTextLine2: true,
  rightBoxMode: "image",
};

// Tamil text needs Tamil fonts even before any recipe is chosen (Customise
// live preview): the first recipe's Tamil pair.
const TAMIL_PREVIEW_RECIPE = { fonts: { english: null, tamil: "notoserif-muktamalar" } };

/**
 * @param recipe   job variation recipe, or null for the layout's own look
 * @param options  { language, showBusinessName, showLeftBox, showRightBox, rightBoxMode }
 */
export const designFromRecipe = (recipe, options = {}) => {
  const language = options.language === "tamil" ? "tamil" : "english";
  const sections = {
    showBusinessName: options.showBusinessName !== false,
    showLeftBox: options.showLeftBox !== false,
    showRightBox: options.showRightBox !== false,
    showTextLine1: options.showTextLine1 !== false,
    showTextLine2: options.showTextLine2 !== false,
    rightBoxMode: options.rightBoxMode === "text" ? "text" : "image",
  };
  if (!recipe) {
    return {
      theme: "original",
      palette: [],
      boxStyle: "layout",
      fonts: language === "tamil" ? fontsForRecipe(TAMIL_PREVIEW_RECIPE, "tamil") : null,
      sections,
    };
  }
  return {
    theme: recipe.theme || "original",
    palette: recipe.palette || [],
    boxStyle: recipe.boxStyle || "layout",
    fonts: fontsForRecipe(recipe, language),
    sections,
  };
};
