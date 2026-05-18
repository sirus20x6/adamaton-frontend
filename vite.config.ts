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
      // v1.0 on-chain observability daemons. Each daemon listens on its
      // own loopback port (see core/cmd/*/README.md). The page calls
      // /network-api/<daemon>/<path> and we rewrite to the daemon's
      // native path so each daemon's handler doesn't have to be
      // namespace-aware.
      const auditMonitorTarget =
        process.env.VITE_PROXY_AUDIT_MONITOR ?? "http://localhost:9275";
      const federationMonitorTarget =
        process.env.VITE_PROXY_FEDERATION_MONITOR ?? "http://localhost:9276";
      const ledgerMonitorTarget =
        process.env.VITE_PROXY_LEDGER_MONITOR ?? "http://localhost:9277";
      const finalizerTarget =
        process.env.VITE_PROXY_FINALIZER ?? "http://localhost:9278";
      const stealthMonitorTarget =
        process.env.VITE_PROXY_STEALTH_MONITOR ?? "http://localhost:9279";
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
        "/network-api/audit": {
          target: auditMonitorTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/network-api\/audit/, ""),
        },
        "/network-api/federation": {
          target: federationMonitorTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/network-api\/federation/, ""),
        },
        "/network-api/ledger": {
          target: ledgerMonitorTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/network-api\/ledger/, ""),
        },
        "/network-api/finalizer": {
          target: finalizerTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/network-api\/finalizer/, ""),
        },
        "/network-api/stealth": {
          target: stealthMonitorTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/network-api\/stealth/, ""),
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
