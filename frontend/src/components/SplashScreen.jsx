import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import logoLight from "../assets/nauticrew-logo.png";
import logoDark from "../assets/nauticrew-logo-dark.png";
import { useColorMode } from "../colorMode";

const SHOW_MS = 3000; // the logo is on screen for about 3 seconds
const FADE_MS = 450;

// Nauticrew loading screen shown when the tool is opened (once per browser
// tab session; in-app navigation and refreshes in the same tab skip it).
const SplashScreen = ({ onDone }) => {
  const { mode } = useColorMode();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const leave = setTimeout(() => setLeaving(true), SHOW_MS - FADE_MS);
    const done = setTimeout(onDone, SHOW_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, [onDone]);

  return (
    <Box
      role="status"
      aria-label="Loading Nauticrew AI Calendar Studio"
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        background: "radial-gradient(circle at 50% 40%, rgba(242,183,5,0.10), transparent 55%), var(--nc-bg)",
        opacity: leaving ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        "@keyframes ncLogoIn": {
          from: { opacity: 0, transform: "translateY(12px) scale(0.94)" },
          to: { opacity: 1, transform: "none" },
        },
        "@keyframes ncBar": { from: { transform: "scaleX(0)" }, to: { transform: "scaleX(1)" } },
        "@keyframes ncFadeIn": { from: { opacity: 0 }, to: { opacity: 1 } },
        "@media (prefers-reduced-motion: reduce)": {
          "& *": { animation: "none !important" },
        },
      }}
    >
      <Box
        component="img"
        src={mode === "dark" ? logoDark : logoLight}
        alt="Nauticrew"
        sx={{
          width: { xs: 220, sm: 280 },
          maxWidth: "70vw",
          animation: "ncLogoIn 900ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        }}
      />
      <Box
        sx={{
          width: { xs: 160, sm: 200 },
          height: 4,
          borderRadius: 2,
          overflow: "hidden",
          background: "rgba(176,141,53,0.18)",
          animation: "ncFadeIn 400ms 300ms ease both",
        }}
      >
        <Box
          sx={{
            height: "100%",
            transformOrigin: "left",
            background: "linear-gradient(90deg, #F2B705, #E9C767)",
            animation: `ncBar ${SHOW_MS - FADE_MS - 300}ms 300ms ease-in-out both`,
          }}
        />
      </Box>
      <Typography
        variant="caption"
        sx={{ color: "var(--nc-text-2)", letterSpacing: 2, animation: "ncFadeIn 600ms 500ms ease both" }}
      >
        AI CALENDAR STUDIO
      </Typography>
    </Box>
  );
};

export default SplashScreen;
