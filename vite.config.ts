import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: (() => {
      const target = process.env.VITE_PROXY_BACKEND ?? "http://localhost:7272";
      // evo-api lives separately from the platform backend; in prod Caddy
      // strips the /evo-api prefix and injects a Bearer token. For local
      // dev we mirror that prefix-strip with `rewrite` so the page can
      // call /evo-api/api/v1/memory/... and the upstream sees /api/v1/...
      const evoApiTarget =
        process.env.VITE_PROXY_EVO_API ?? "http://localhost:9123";
      return {
        "/v3": { target, changeOrigin: true },
        "/platform": { target, changeOrigin: true },
        "/ws": { target, changeOrigin: true, ws: true },
        "/metrics": { target, changeOrigin: true },
        "/evo-api": {
          target: evoApiTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/evo-api/, ""),
        },
      };
    })(),
  },
  build: {
    target: "es2022",
  },
  optimizeDeps: {
    exclude: ["cytoscape"],
  },
});
