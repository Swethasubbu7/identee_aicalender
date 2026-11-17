import { createRoot } from "react-dom/client";
import axios from "axios";
import "./index.css";
import App from "./App.jsx";
import ColorModeProvider from "./components/ColorModeProvider";
import { loginPathFor } from "./utils/auth";

// An expired or invalid sign-in (401 from any API call except sign-in
// itself) goes back to Login, which returns to this page afterwards.
axios.interceptors.response.use(undefined, (error) => {
  const url = String(error.config?.url || "");
  if (error.response?.status === 401 && !url.includes("/api/auth/") && localStorage.getItem("token")) {
    localStorage.removeItem("token");
    if (window.location.pathname !== "/") window.location.assign(loginPathFor(window.location));
  }
  return Promise.reject(error);
});

createRoot(document.getElementById("root")).render(
  <ColorModeProvider>
    <App />
  </ColorModeProvider>,
);
