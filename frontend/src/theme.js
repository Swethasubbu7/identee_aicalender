import { createTheme } from "@mui/material/styles";

// Exported so other files (e.g. identeeColors.js) can build on the same
// palette instead of re-declaring these hex values in a second place.
export const GOLD = "#B08D35";
export const GOLD_LIGHT = "#C9A227";
export const GOLD_DARK = "#8a6d1f";
export const CREAM = "#FAF6EC";
export const CREAM_PAPER = "#FFFFFF";
export const INK = "#2A2620";
export const TEXT_SECONDARY = "#7A7266";

// Light and dark palettes. The page colours used in `sx` props are CSS
// variables (index.css: --nc-*), switched by <html data-theme="dark">, so
// both MUI components and hand-styled boxes follow the same mode.
const PALETTES = {
  light: {
    background: { default: CREAM, paper: CREAM_PAPER },
    text: { primary: INK, secondary: TEXT_SECONDARY },
    divider: "rgba(176, 141, 53, 0.2)",
    input: "#FFFFFF",
    goldText: GOLD_DARK,
    toggleText: "#7A7266",
  },
  dark: {
    background: { default: "#12100D", paper: "#1C1915" },
    text: { primary: "#F1ECE0", secondary: "#B5AC9C" },
    divider: "rgba(201, 162, 39, 0.25)",
    input: "#24211C",
    goldText: "#E9C767",
    toggleText: "#B5AC9C",
  },
};

export const buildTheme = (mode = "light") => {
  const p = PALETTES[mode] || PALETTES.light;
  return createTheme({
    palette: {
      mode,
      primary: { main: GOLD, contrastText: "#FFFFFF" },
      secondary: { main: GOLD_DARK },
      background: p.background,
      text: p.text,
      divider: p.divider,
    },
    typography: {
      fontFamily: '"Poppins", sans-serif',
      h4: {
        fontFamily: '"Cormorant Garamond", serif',
        fontWeight: 700,
        letterSpacing: 1,
        color: p.text.primary,
      },
      h6: { fontWeight: 600, color: p.text.primary },
      button: { textTransform: "none", fontWeight: 600, letterSpacing: 0.3 },
    },
    shape: { borderRadius: 16 },
    components: {
      MuiButton: {
        styleOverrides: {
          containedPrimary: {
            background: `linear-gradient(135deg, ${GOLD_LIGHT} 0%, ${GOLD} 55%, ${GOLD_DARK} 100%)`,
            color: "#FFFFFF",
            boxShadow: "0 4px 14px rgba(176,141,53,0.25)",
            "&:hover": {
              background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_DARK} 100%)`,
              boxShadow: "0 6px 18px rgba(176,141,53,0.35)",
            },
          },
          outlinedPrimary: {
            borderColor: "rgba(176,141,53,0.5)",
            color: p.goldText,
            "&:hover": {
              borderColor: GOLD,
              backgroundColor: "rgba(176,141,53,0.06)",
            },
          },
          textPrimary: { color: p.goldText },
        },
      },
      MuiChip: {
        styleOverrides: {
          outlined: {
            borderColor: "rgba(176,141,53,0.4)",
            color: p.goldText,
          },
          // Filled chips (status badges, selected-type tags) in the gold identity.
          filled: {
            backgroundColor: "rgba(176,141,53,0.12)",
            color: p.goldText,
            fontWeight: 600,
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": {
              backgroundColor: p.input,
              "& fieldset": { borderColor: "rgba(176,141,53,0.25)" },
              "&:hover fieldset": { borderColor: "rgba(176,141,53,0.5)" },
              "&.Mui-focused fieldset": { borderColor: GOLD },
            },
          },
        },
      },
      // A bare <Select> renders MuiOutlinedInput directly: same gold borders.
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: p.input,
            "& fieldset": { borderColor: "rgba(176,141,53,0.25)" },
            "&:hover fieldset": { borderColor: "rgba(176,141,53,0.5)" },
            "&.Mui-focused fieldset": { borderColor: GOLD },
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          icon: { color: p.goldText },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            border: "1px solid rgba(176,141,53,0.25)",
            color: p.toggleText,
            "&.Mui-selected": {
              backgroundColor: "rgba(176,141,53,0.14)",
              color: p.goldText,
              "&:hover": { backgroundColor: "rgba(176,141,53,0.2)" },
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
        },
      },
    },
  });
};

const theme = buildTheme("light");
export default theme;
