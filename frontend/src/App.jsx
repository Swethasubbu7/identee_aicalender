import { useCallback, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import LayoutPage from "./pages/layouts/LayoutPage";
import CalendarCustomise from "./pages/calender/CalendarCustomise";
import ProductionCustomise from "./pages/calender/ProductionCustomise";
import AIDesigns from "./pages/calender/AIDesigns";
import DraftProjects from "./pages/DraftProjects";
import GeneratedDesigns from "./pages/GeneratedDesigns";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import SplashScreen from "./components/SplashScreen";
import RequireAudience from "./shared/auth/RequireAudience";
import AuthPage from "./shared/auth/AuthPage";
import PortalHome from "./shared/PortalHome";
import { AUDIENCES } from "./shared/auth/audiences";

// Nauticrew platform routes (Phase 2). Four separate sign-in areas:
//   /, /dashboard, /layouts, …  the existing AI Calendar Tool (calendar staff),
//                       at its original addresses
//   /calendar/customer  calendar customers (panel: Phase 8)
//   /shop/staff         shop staff / admin (panel: Phase 6)
//   /shop/account       shop customers (panel: Phase 5)
// "/" is the Calendar Staff sign-in, as before (the landing page will need
// its own address decided in Phase 3).

const SPLASH_KEY = "nauticrew.splashShown";
const splashSeen = () => {
  try {
    return sessionStorage.getItem(SPLASH_KEY) === "1";
  } catch {
    return false;
  }
};

const staff = (page) => <RequireAudience audience="calendar-staff">{page}</RequireAudience>;

/** Old address → new one, keeping :params and the ?query. */
const Redirect = ({ to }) => {
  const params = useParams();
  const { search, hash } = useLocation();
  const path = to.replace(/:(\w+)/g, (_, k) => encodeURIComponent(params[k] ?? ""));
  return <Navigate to={`${path}${search}${hash}`} replace />;
};

// Calendar Staff use the original Calendar Tool addresses; the
// /calendar/staff/... forms (used briefly during Phase 2) redirect to them.
const CALENDAR_STAFF_ALIASES = [
  ["/calendar/staff", "/dashboard"],
  ["/calendar/staff/layouts", "/layouts"],
  ["/calendar/staff/drafts", "/drafts"],
  ["/calendar/staff/generated", "/generated"],
  ["/calendar/staff/settings", "/settings"],
  ["/calendar/staff/designs/:jobId", "/calendar/designs/:jobId"],
  ["/calendar/staff/customise/:layoutId", "/calendar/customise/:layoutId"],
  ["/calendar/staff/production/:variantId", "/calendar/production/:variantId"],
];

// Sign-in pages of one area (customers can also register).
const authRoutes = (audience) => {
  const { base, kind } = AUDIENCES[audience];
  return [
    <Route key={`${audience}-login`} path={`${base}/login`} element={<AuthPage audience={audience} mode="login" />} />,
    <Route key={`${audience}-forgot`} path={`${base}/forgot-password`} element={<AuthPage audience={audience} mode="forgot" />} />,
    <Route key={`${audience}-reset`} path={`${base}/reset-password`} element={<AuthPage audience={audience} mode="reset" />} />,
    ...(kind === "customer"
      ? [
          <Route key={`${audience}-register`} path={`${base}/register`} element={<AuthPage audience={audience} mode="register" />} />,
          <Route key={`${audience}-verify`} path={`${base}/verify-email`} element={<AuthPage audience={audience} mode="verify" />} />,
        ]
      : []),
  ];
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
        {/* Calendar Staff: the existing AI Calendar Tool at its original addresses */}
        <Route path="/" element={<AuthPage audience="calendar-staff" mode="login" />} />
        {authRoutes("calendar-staff")}
        <Route path="/dashboard" element={staff(<Dashboard />)} />
        <Route path="/layouts" element={staff(<LayoutPage />)} />
        <Route path="/drafts" element={staff(<DraftProjects />)} />
        <Route path="/generated" element={staff(<GeneratedDesigns />)} />
        <Route path="/settings" element={staff(<Settings />)} />
        <Route path="/calendar/designs/:jobId" element={staff(<AIDesigns />)} />
        <Route path="/calendar/customise/:layoutId" element={staff(<CalendarCustomise />)} />
        <Route path="/calendar/production/:variantId" element={staff(<ProductionCustomise />)} />
        {CALENDAR_STAFF_ALIASES.map(([from, to]) => (
          <Route key={from} path={from} element={<Redirect to={to} />} />
        ))}

        {/* Calendar Customer, Shop Staff, Shop Customer */}
        {authRoutes("calendar-customer")}
        <Route path="/calendar/customer" element={<RequireAudience audience="calendar-customer"><PortalHome audience="calendar-customer" /></RequireAudience>} />
        {authRoutes("shop-staff")}
        <Route path="/shop/staff" element={<RequireAudience audience="shop-staff"><PortalHome audience="shop-staff" /></RequireAudience>} />
        {authRoutes("shop-customer")}
        <Route path="/shop/account" element={<RequireAudience audience="shop-customer"><PortalHome audience="shop-customer" /></RequireAudience>} />

        <Route path="*" element={staff(<NotFound />)} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
