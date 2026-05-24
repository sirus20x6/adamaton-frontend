import "katex/dist/katex.min.css";
import "./index.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import App from "@/App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// ─────────────────────────────────────────────────────────────────────
// Stale-deploy recovery (issue #125)
//
// We ship hashed dynamic-import chunks. After a deploy, a tab that loaded
// the old index will request chunk filenames that no longer exist on the
// server, and Vite fires a `vite:preloadError` event ("Failed to fetch
// dynamically imported module"). Reloading pulls the new index + chunks.
//
// Guard the reload with sessionStorage so a genuinely-broken chunk (or a
// server that's actually down) can't trap the tab in an infinite reload
// loop: we reload at most once, then let the error surface. The guard key
// is cleared once the app loads cleanly, so a *later* stale deploy in the
// same tab still gets its one reload.
// ─────────────────────────────────────────────────────────────────────
const PRELOAD_RELOAD_KEY = "vite-preload-reloaded";

window.addEventListener("vite:preloadError", (event) => {
  if (sessionStorage.getItem(PRELOAD_RELOAD_KEY)) {
    // Already reloaded once and still failing — this isn't a stale deploy.
    // Let the default handler throw so the error is visible, not silent.
    return;
  }
  // Suppress the default (which rethrows) since we're about to reload.
  event.preventDefault();
  sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now()));
  window.location.reload();
});

// A clean load means whatever chunks we needed resolved fine — reset the
// guard so the next stale deploy gets a fresh one-shot reload.
window.addEventListener("load", () => {
  sessionStorage.removeItem(PRELOAD_RELOAD_KEY);
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
