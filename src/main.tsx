import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// Initialize i18next BEFORE rendering so the first paint already uses the
// detected language and <html dir>/<lang> are set correctly. The module has
// side effects (i18next.init + applyDirection wiring), so a bare import is
// the contract.
import "./i18n";

createRoot(document.getElementById("root")!).render(<App />);
