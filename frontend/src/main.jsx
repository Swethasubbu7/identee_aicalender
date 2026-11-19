import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import ColorModeProvider from "./components/ColorModeProvider";
import { setupHttp } from "./shared/http";

// Sign-in cookies, the app header and session renewal for every API call.
setupHttp();

createRoot(document.getElementById("root")).render(
  <ColorModeProvider>
    <App />
  </ColorModeProvider>,
);
