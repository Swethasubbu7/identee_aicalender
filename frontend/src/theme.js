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

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: GOLD, contrastText: "#FFFFFF" },
    secondary: { main: GOLD_DARK },
    background: {
      default: CREAM,
      paper: CREAM_PAPER,
    },
    text: {
      primary: INK,
      secondary: TEXT_SECONDARY,
    },
    divider: "rgba(176, 141, 53, 0.2)",
  },
  typography: {
    fontFamily: '"Poppins", sans-serif',
    h4: {
      fontFamily: '"Cormorant Garamond", serif',
      fontWeight: 700,
      letterSpacing: 1,
      color: INK,
    },
    h6: { fontWeight: 600, color: INK },
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
          color: GOLD_DARK,
          "&:hover": {
            borderColor: GOLD,
            backgroundColor: "rgba(176,141,53,0.06)",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        outlined: {
          borderColor: "rgba(176,141,53,0.4)",
          color: GOLD_DARK,
        },
        // The original override only styled the "outlined" variant, so any
        // filled chip (status badges, selected-type tags) fell through to
        // MUI's stock gray. This gives filled chips the same gold identity.
        filled: {
          backgroundColor: "rgba(176,141,53,0.12)",
          color: GOLD_DARK,
          fontWeight: 600,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            backgroundColor: "#FFFFFF",
            "& fieldset": { borderColor: "rgba(176,141,53,0.25)" },
            "&:hover fieldset": { borderColor: "rgba(176,141,53,0.5)" },
            "&.Mui-focused fieldset": { borderColor: GOLD },
          },
        },
      },
    },
    // A bare <Select> (not wrapped in <TextField>) renders MuiOutlinedInput
    // directly, so without this override those dropdowns keep MUI's default
    // gray border/focus color instead of the gold one defined above.
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#FFFFFF",
          "& fieldset": { borderColor: "rgba(176,141,53,0.25)" },
          "&:hover fieldset": { borderColor: "rgba(176,141,53,0.5)" },
          "&.Mui-focused fieldset": { borderColor: GOLD },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: { color: GOLD_DARK },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(176,141,53,0.25)",
          color: "#7A7266",
          "&.Mui-selected": {
            backgroundColor: "rgba(176,141,53,0.12)",
            color: GOLD_DARK,
            "&:hover": { backgroundColor: "rgba(176,141,53,0.18)" },
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

export default theme;
