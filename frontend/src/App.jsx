import { useCallback, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import LayoutPage from "./pages/layouts/LayoutPage";
import CalendarCustomise from "./pages/calender/CalendarCustomise";
import ProductionCustomise from "./pages/calender/ProductionCustomise";
import AIDesigns from "./pages/calender/AIDesigns";
import DraftProjects from "./pages/DraftProjects";
import GeneratedDesigns from "./pages/GeneratedDesigns";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import RequireAuth from "./components/RequireAuth";
import SplashScreen from "./components/SplashScreen";

// Every page except Login needs a signed-in user; a direct URL or refresh
// without one goes to Login and comes back afterwards.
const signedIn = (page) => <RequireAuth>{page}</RequireAuth>;

const SPLASH_KEY = "nauticrew.splashShown";
const splashSeen = () => {
  try {
    return sessionStorage.getItem(SPLASH_KEY) === "1";
  } catch {
    return false;
  }
};

function App() {
  // The loading screen appears once when the tool is opened in a tab.
  const [showSplash, setShowSplash] = useState(() => !splashSeen());
  const hideSplash = useCallback(() => {
    try {
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      // storage refused: the splash simply shows again next time
    }
    setShowSplash(false);
  }, []);

  return (
    <BrowserRouter>
      {showSplash && <SplashScreen onDone={hideSplash} />}
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={signedIn(<Dashboard />)} />
        <Route path="/layouts" element={signedIn(<LayoutPage />)} />
        <Route path="/calendar/designs/:jobId" element={signedIn(<AIDesigns />)} />
        <Route path="/drafts" element={signedIn(<DraftProjects />)} />
        <Route path="/generated" element={signedIn(<GeneratedDesigns />)} />
        <Route path="/settings" element={signedIn(<Settings />)} />
        <Route
          path="/calendar/customise/:layoutId"
          element={signedIn(<CalendarCustomise />)}
        />
        <Route
          path="/calendar/production/:variantId"
          element={signedIn(<ProductionCustomise />)}
        />
        <Route path="*" element={signedIn(<NotFound />)} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
