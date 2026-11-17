import { createContext, useContext } from "react";

// Light / dark mode, remembered in this browser (kept across refresh,
// sign-out and sign-in). index.html applies it before the app loads.
export const COLOR_MODE_KEY = "nauticrew.colorMode";

export const readColorMode = () => {
  try {
    return localStorage.getItem(COLOR_MODE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
};

export const saveColorMode = (mode) => {
  try {
    localStorage.setItem(COLOR_MODE_KEY, mode);
  } catch {
    // Private windows may refuse storage: the mode still applies until reload.
  }
};

export const ColorModeContext = createContext({ mode: "light", toggleMode: () => {} });

export const useColorMode = () => useContext(ColorModeContext);
