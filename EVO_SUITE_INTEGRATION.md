# evo suite integration

Adds a **Home** entry above Search in the left sidebar, showing the
delegator's token statuses, recent tasks, and workflows in the right
pane. The deep researcher UI stays as the host application — Home is
just the new default landing, with Search still reachable at
`/search`.

## What changed

```
src/api/evoSuite.ts           NEW   typed React Query hooks for the
                                    evo apiserver (delegator quota,
                                    delegator tasks, evo runs, workflow
                                    definitions + runs, system status)

src/pages/Home.tsx            NEW   the Home page

src/App.tsx                   MOD   route `/`   → Home (was Search)
                                    route `/search` → Search (added)

src/components/layout/Layout.tsx
                              MOD   NAV: Home at top, then Search,
                                    then the rest unchanged
```

## Configuration

The new page calls the workstation-side evo apiserver. Base URL via
build-time env var:

```bash
# Build for local dev (Vite dev server, workstation hits localhost)
VITE_EVO_API_BASE=http://localhost:9123 npx vite build

# Build for Pi deployment (browser on the Pi hits the workstation)
VITE_EVO_API_BASE=http://workstation.local:9123 npx vite build

# Cleanest end state (no CORS, Caddy on the Pi reverse-proxies)
VITE_EVO_API_BASE="" npx vite build
# then in Caddyfile on the Pi:
#   handle /api/v1/* {
#     reverse_proxy workstation.local:9123
#   }
```

Default (when unset) is `http://localhost:9123` — fine for local dev,
won't reach the workstation from the Pi's browser.

## CORS

The workstation evo apiserver (`/thearray/git/evo/dashboard`) needs to
allow the Pi's origin. The relevant config field is
`api.cors_origins`:

```yaml
# evo apiserver config
api:
  cors_origins:
    - "https://deepresearch.local"
```

The Pi route `https://deepresearch.local` is what the React app's
browser session has as `window.location.origin`. Add the workstation's
own scheme+host if you ever serve this UI from there too.

## Build

```bash
cd /thearray/git/deepresearch/platform/frontend
npx vite build
# → dist/assets/index-<hash>.js + Home-<hash>.js chunk
```

`tsc -b && vite build` (the default `npm run build`) currently fails
on pre-existing strict-mode TS errors in `TrainingChart`,
`GraphRAGPanel`, and several other unrelated files. `npx vite build`
skips the type pre-check and emits a working bundle. Fixing the
existing TS errors is out of scope for this commit.

## Deploy to Pi

This directory isn't a git repo, so changes live on disk only. To get
the new bundle onto the Pi:

```bash
rsync -av --delete dist/ deepresearch.local:/path/to/served/frontend/
ssh deepresearch.local 'sudo systemctl restart deepresearch-frontend'
# (replace with whatever serves the static assets — Caddy file_server,
#  or a backend that ships them)
```

You'll know it took effect when the Pi's homepage shows the new
sidebar (Home at the top) instead of landing on the Search page.

## Telemetry sources

The Home page reads from these endpoints on the evo apiserver:

| section | endpoint |
|---|---|
| token statuses | `GET /api/v1/delegator/quota` |
| recent tasks | `GET /api/v1/delegator/tasks?limit=20` |
| workflow defs | `GET /api/v1/workflows/definitions` |
| workflow runs | `GET /api/v1/workflows/runs?limit=20` |
| evo runs | `GET /api/v1/evo/runs` |

Profiling graphs (sparklines, speedup-over-time) come later — the
section heading "coming next" at the bottom of Home is the placeholder.

## Schedules page (`/schedules`)

Separate from Home: a CRUD view over Temporal recurring schedules
(delegations + arbitrary workflow crons). Wrappers in
`src/api/temporal.ts`; page in `src/pages/Schedules.tsx`; create/edit
dialog in `src/features/schedules/ScheduleDialog.tsx`. Backed by the
platform apiserver:

| action | endpoint |
|---|---|
| list | `GET /api/v1/schedules` |
| describe (with recent runs) | `GET /api/v1/schedules/{id}` |
| create | `POST /api/v1/schedules` |
| update (cron + note only; action is immutable in v1) | `PUT /api/v1/schedules/{id}` |
| delete (idempotent — 204 on NotFound) | `DELETE /api/v1/schedules/{id}` |
| pause / resume | `POST /api/v1/schedules/{id}/{pause,unpause}` |
| trigger now | `POST /api/v1/schedules/{id}/trigger` |

Two create-payload shapes via a `kind` discriminator: `delegation`
(the delegator MCP's `schedule_recurring_task` fields — prompt,
difficulty, priority, agent_hint, etc.) and `generic` (workflow name
+ task queue + JSON args, for cron-ing any registered workflow).
