import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { config } from "./lib/config";
import { registerServiceWorker } from "./sw-register.ts";

// After a redeploy, an open tab still references the old chunk hashes, so lazy
// imports fail ("Failed to fetch dynamically imported module"). Reload once to
// fetch the fresh index.html; the time guard prevents a reload loop.
const CHUNK_RELOAD_KEY = "chunk-reload-at";
function reloadForStaleChunk() {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    // storage unavailable: still reload once per page load
  }
  window.location.reload();
}
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadForStaleChunk();
});
window.addEventListener("unhandledrejection", (event) => {
  const message = String((event.reason as Error | undefined)?.message || event.reason || "");
  if (/dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message)) {
    reloadForStaleChunk();
  }
});

createRoot(document.getElementById("root")!).render(<App />);

// Optional HTTPS enforcement in production, controlled by env
if (config.forceHttps && config.isProduction && window.location.protocol === "http:" && !/^(localhost|127\.0\.0\.1)/.test(window.location.hostname)) {
  const target = `https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(target);
}

// Register service worker
registerServiceWorker();
