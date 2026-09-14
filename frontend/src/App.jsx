import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import LayoutPage from "./pages/layouts/LayoutPage";
import CalendarCreatePlaceholder from "./pages/calender/CalendarCreatePlaceholder";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/layouts" element={<LayoutPage />} />
        <Route
          path="/calendar/create"
          element={<CalendarCreatePlaceholder />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
