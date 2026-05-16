# Agent instructions — adamaton-frontend

React/Vite SPA. Leaf of the dep DAG — never imported by anything else.

## Before you edit

From the umbrella:

```bash
bin/adam claim frontend/<task>
```

## Build / test

```bash
pnpm install
pnpm build         # tsc -b && vite build -> dist/
pnpm dev           # vite on :5173
pnpm typecheck
pnpm lint
```

No test suite. Typecheck + lint are the contract.

## Gotchas

- **`VITE_EVO_API_BASE` is build-time, not runtime**. Pi production builds use the empty string so Caddy proxies `/api/v1/*` to `platform.dashboard` on localhost. Workstation dev uses `http://localhost:9123`. See `EVO_SUITE_INTEGRATION.md`.
- **Pi Caddy bind-mount inode trap** (memory: `pi_caddy_bind_mount_inode`): when deploying a new `dist/`, `mv newfile oldfile` on the host pins the OLD inode in the `deepresearch-frontend-1` container. After a swap you must `docker compose restart frontend` — `caddy reload` is not enough.
- **`package.json` `name` field is still `deepresearch-frontend`** (historical). Renaming requires updating any deploy scripts that grep for it; leave alone unless asked.
- **React 19 + react-router-dom 7**. Some older patterns (e.g. `useNavigate` in loaders) changed shape. Check upstream docs when migrating examples.
- **All API calls go through `src/api/`** wrappers using `@tanstack/react-query`. Add a new endpoint there, not inline in a page.
- **Citations + math** rendered via `rehype-katex` + `remark-math`. The `katex` stylesheet must be imported in `main.tsx`.

## Universal rules

See `../CLAUDE.md` in the umbrella.
