# Agent instructions — adamaton-frontend

> **🚫 BLOCKING — never commit to `main` directly.** Adamaton's pre-commit hook hard-rejects commits to `main`/`master` from the canonical checkout. Always start with:
> ```bash
> cd /thearray/git/Adamaton && bin/adam claim 'frontend'/<task>
> ```
> This creates a worktree on a feature branch where you can work freely. If you accidentally edited main, run `bin/adam rescue` from the umbrella to recover. See [umbrella CLAUDE.md](../CLAUDE.md) for the full agent workflow.

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

### QA rationale

The frontend is a React/Vite SPA with no server-side rendering and no
integration harness. Runtime correctness is validated by two fast gates:

- **Typecheck** (`pnpm typecheck` → `tsc --noEmit`): catches type errors,
  missing props, wrong hook call signatures, and broken imports at
  compile-time without a full build.
- **Lint** (`pnpm lint` → `eslint . --ext ts,tsx`): enforces react-hooks
  exhaustive-deps, react-refresh boundaries, and TypeScript-ESLint rules
  that catch common async pitfalls (e.g. unhandled promises,
  `@typescript-eslint/no-floating-promises`).

Both gates must pass clean (zero errors, zero warnings-treated-as-errors)
before a PR is merged. Together they substitute for the unit/integration
test suite that a more complex SPA would carry.

**e2e plan (not yet implemented):** When the platform reaches a stable API
contract, a Playwright smoke suite should cover: (1) Library page loads and
corpus grid renders, (2) Graph view mounts and Cytoscape canvas appears,
(3) Research stream connects and stage chips advance. Until then, manual
smoke-testing on the dev stack (`pnpm dev` against a local platform
instance) is the fallback QA step.

## Gotchas

- **`VITE_EVO_API_BASE` is build-time, not runtime**. Pi production builds use the empty string so Caddy proxies `/api/v1/*` to `platform.dashboard` on localhost. Workstation dev uses `http://localhost:9123`. See `EVO_SUITE_INTEGRATION.md`.
- **Pi Caddy bind-mount inode trap** (memory: `pi_caddy_bind_mount_inode`): when deploying a new `dist/`, `mv newfile oldfile` on the host pins the OLD inode in the `deepresearch-frontend-1` container. After a swap you must `docker compose restart frontend` — `caddy reload` is not enough.
- **`package.json` `name` field is still `deepresearch-frontend`** (historical). Renaming requires updating any deploy scripts that grep for it; leave alone unless asked.
- **React 19 + react-router-dom 7**. Some older patterns (e.g. `useNavigate` in loaders) changed shape. Check upstream docs when migrating examples.
- **All API calls go through `src/api/`** wrappers using `@tanstack/react-query`. Add a new endpoint there, not inline in a page.
- **Citations + math** rendered via `rehype-katex` + `remark-math`. The `katex` stylesheet must be imported in `main.tsx`.

## Universal rules

See `../CLAUDE.md` in the umbrella.
