# adamomaton-frontend

React 19 + Vite + Tailwind SPA. Single binary bundle served by Caddy on the Pi; talks to `platform.dashboard` via `/api/v1/*` proxy.

## Pages

| Route | Purpose |
|---|---|
| `/` | Home (delegator quota, recent tasks, workflows) |
| `/search` | Original deep-researcher search UI |
| `/nano` | NanoResearch run viewer (SSE event stream from `deepresearch`) |
| `/skills` | Skill bank + community graph (`knowledge.skills-rae`) |
| `/research` | Long-form research artifact viewer |
| `/memory` | `evo.insights` browser |
| `/evo` | Evolution runs + programs (`evolve`) |
| `/delegator` | Live agent cards, quota gauges, task table |
| `/nodes` | Worker registry (Temporal workers heartbeating via `core/workerregistry`) |
| `/library` | Corpora / documents / chunks (`knowledge.r2g`) |
| `/experiments` | One-off playground pages |

## Layout

| Dir | Purpose |
|---|---|
| `src/` | TS/TSX source tree (`pages/`, `components/`, `api/`, `lib/`) |
| `index.html` | Vite entrypoint |
| `vite.config.ts`, `tsconfig*.json`, `tailwind.config.ts`, `postcss.config.js` | Build/tooling config |
| `EVO_SUITE_INTEGRATION.md` | Notes on the Home page wiring + `VITE_EVO_API_BASE` env var |

## Build

```bash
pnpm install          # or npm install
pnpm build            # tsc -b && vite build -> dist/
pnpm dev              # vite dev server on :5173
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
```

For Pi deployment build with the empty base so Caddy proxies `/api/v1/*` locally:

```bash
VITE_EVO_API_BASE="" pnpm build
```

For workstation dev hitting the local dashboard:

```bash
VITE_EVO_API_BASE=http://localhost:9123 pnpm dev
```

## Test

No test suite yet — typecheck + lint are the gate.

## Dev DSN / endpoints

- Dev server: `http://localhost:5173`
- Backend it calls: `platform.dashboard` at `http://localhost:9123` (via `VITE_EVO_API_BASE`)

## Where this fits

Leaf consumer. Depends on `platform.dashboard` HTTP contract; depends on `deepresearch` only transitively (via dashboard SSE proxy). Production deployment: `pi5` host, built into the Caddy static volume. See `docs/ARCHITECTURE.md` in the umbrella.
