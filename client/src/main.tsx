import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { config } from "./lib/config";
import { registerServiceWorker } from "./sw-register.ts";

createRoot(document.getElementById("root")!).render(<App />);

// Optional HTTPS enforcement in production, controlled by env
if (config.forceHttps && config.isProduction && window.location.protocol === "http:" && !/^(localhost|127\.0\.0\.1)/.test(window.location.hostname)) {
  const target = `https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(target);
}

// Register service worker
registerServiceWorker();
