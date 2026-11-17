// Flat color & radius tokens for pages that want simple `colors.x` / `radii.x`
// lookups. Page surfaces and text are CSS variables (index.css) so they follow
// light / dark mode; the gold brand colours are the same in both modes.
import { GOLD, GOLD_LIGHT, GOLD_DARK } from "./theme";

export const colors = {
  // Page-level surfaces
  pageBg: "var(--nc-bg)",
  surface: "var(--nc-paper)",
  surfaceBorder: "var(--nc-border)",
  surfaceBorderStrong: "rgba(176, 141, 53, 0.5)",

  // Text
  textPrimary: "var(--nc-text)",
  textSecondary: "var(--nc-text-2)",
  textMuted: "var(--nc-text-3)",

  // Brand / accent
  primary: GOLD,
  primaryHover: GOLD_DARK,
  primaryLight: GOLD_LIGHT,
  primarySoftBg: "rgba(176, 141, 53, 0.12)",
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16, // matches theme.shape.borderRadius
  full: 999, // for pills/badges
};
