import { useEffect, useMemo, useState } from "react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { buildTheme } from "../theme";
import { ColorModeContext, readColorMode, saveColorMode } from "../colorMode";

// MUI theme + <html data-theme> (for the --nc-* CSS colour variables).
const ColorModeProvider = ({ children }) => {
  const [mode, setMode] = useState(readColorMode);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    saveColorMode(mode);
  }, [mode]);

  const theme = useMemo(() => buildTheme(mode), [mode]);
  const value = useMemo(
    () => ({ mode, toggleMode: () => setMode((m) => (m === "dark" ? "light" : "dark")) }),
    [mode],
  );

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
};

export default ColorModeProvider;
