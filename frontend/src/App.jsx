import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import LayoutPage from "./pages/layouts/LayoutPage";
import CalendarCustomise from "./pages/calender/CalendarCustomise";
import ProductionCustomise from "./pages/calender/ProductionCustomise";
import AIDesigns from "./pages/calender/AIDesigns";
import DraftProjects from "./pages/DraftProjects";
import GeneratedDesigns from "./pages/GeneratedDesigns";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/layouts" element={<LayoutPage />} />
        <Route path="/calendar/designs/:jobId" element={<AIDesigns />} />
        <Route path="/drafts" element={<DraftProjects />} />
        <Route path="/generated" element={<GeneratedDesigns />} />
        <Route
          path="/calendar/customise/:layoutId"
          element={<CalendarCustomise />}
        />
        <Route
          path="/calendar/production/:variantId"
          element={<ProductionCustomise />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
