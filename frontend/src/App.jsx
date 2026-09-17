import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import LayoutPage from "./pages/layouts/LayoutPage";
import CalendarCustomise from "./pages/calender/CalendarCustomise";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/layouts" element={<LayoutPage />} />
        <Route
          path="/calendar/customise/:layoutId"
          element={<CalendarCustomise />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
