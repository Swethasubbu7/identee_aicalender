// Flat color & radius tokens for pages that want simple `colors.x` / `radii.x`
// lookups instead of pulling everything through the MUI theme object.
// Built on top of the raw palette constants in theme.js so there's still a
// single source of truth for the actual hex values.
import {
  GOLD,
  GOLD_LIGHT,
  GOLD_DARK,
  CREAM,
  CREAM_PAPER,
  INK,
  TEXT_SECONDARY,
} from "./theme";

export const colors = {
  // Page-level surfaces
  pageBg: CREAM,
  surface: CREAM_PAPER,
  surfaceBorder: "rgba(176, 141, 53, 0.2)", // matches theme.palette.divider
  surfaceBorderStrong: "rgba(176, 141, 53, 0.5)", // matches outlinedPrimary border

  // Text
  textPrimary: INK,
  textSecondary: TEXT_SECONDARY,
  textMuted: "rgba(42, 38, 32, 0.45)", // lighter than textSecondary, for placeholders/icons

  // Brand / accent
  primary: GOLD,
  primaryHover: GOLD_DARK,
  primaryLight: GOLD_LIGHT,
  primarySoftBg: "rgba(176, 141, 53, 0.12)", // matches MuiChip filled bg in theme.js
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16, // matches theme.shape.borderRadius
  full: 999, // for pills/badges
};
