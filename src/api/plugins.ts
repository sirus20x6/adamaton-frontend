/**
 * Typed wrappers around the Plugins HTTP endpoints, paired with
 * TanStack Query hooks for caching, polling, and invalidation.
 *
 * The backend is mounted at ``/platform/plugins/`` and is responsible for
 * pulling structured records from third-party sources (YouTube, Zotero-class
 * connectors, etc.). Each plugin advertises a manifest with capability flags
 * and an args schema; runs are tracked in ``platform.plugin_runs`` and items
 * in ``platform.plugin_items``.
 *
 * Mirrors the lifecycle of ``src/api/zotero.ts`` (run row + items table +
 * per-row delete + bulk dismiss + terminal-aware polling). Kept in its own
 * namespace so the two stay decoupled.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

import { api } from "@/api/client";

/* ── Types ─────────────────────────────────────────────────────────────── */

export type PluginCapability =
  | "fetch_one"
  | "fetch_channel"
  | "fetch_playlist"
  | "fetch_audio"
  | "fetch_video"
  | "fetch_snapshots";

// Categories the plugin-host registers routes for today; left open for
// future kinds (e.g. "exporter") without a frontend bump.
export type PluginCategory = "importer" | "search" | "marketplace" | (string & {});

export type PluginManifest = {
  id: string;
  name: string;
  description: string;
  category: PluginCategory;
  capabilities: PluginCapability[];
  args_schema: Record<string, unknown>;
  // Present on the single-plugin GET (/platform/plugins/{id}); the list
  // endpoint omits it to keep the payload small.
  config_schema?: Record<string, unknown> | null;
  version?: string;
  icon?: string;
};

export type PluginConfig = {
  plugin_id: string;
  config: Record<string, unknown>;
};

export type PluginRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type PluginRunTotals = {
  seen: number;
  new: number;
  fetched: number;
  deduped: number;
  queued: number;
  errored: number;
  skipped: number;
};

export type PluginRun = {
  id: string;
  plugin_id: string;
  source: string;
  mode: string | null;
  args: Record<string, unknown>;
  corpus_id: string | null;
  status: PluginRunStatus;
  totals: PluginRunTotals;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type PluginItemStatus =
  | "pending"
  | "queued"
  | "ingested"
  | "duplicate"
  | "errored"
  | "skipped";

export type PluginItemRow = {
  id: string;
  plugin_id: string;
  external_id: string;
  external_url: string | null;
  title: string | null;
  metadata: Record<string, unknown>;
  document_id: string | null;
  ingest_status: PluginItemStatus;
  ingest_error: string | null;
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PluginItemsResponse = {
  items: PluginItemRow[];
  count: number;
  total: number;
};

export type PluginRunsResponse = {
  items?: PluginRun[];
  results?: PluginRun[];
  count?: number;
  total?: number;
};

export type PluginRunInput = {
  source: string;
  mode?: string;
  options?: Record<string, unknown>;
  corpus_id?: string;
};

export type PluginRunStartResponse = {
  run_id: string;
  queue: string;
};

export type PluginItemsParams = {
  plugin_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
};

export type PluginRunsParams = {
  plugin_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
};

export type DeletePluginItemResponse = {
  ok: true;
  id: string;
  previous_status: string;
};

export type BulkDeletePluginItemsResponse = {
  ok: true;
  deleted: number;
  plugin_id: string;
  status: string;
};

export const ZERO_PLUGIN_TOTALS: PluginRunTotals = {
  seen: 0,
  new: 0,
  fetched: 0,
  deduped: 0,
  queued: 0,
  errored: 0,
  skipped: 0,
};

const TERMINAL_RUN_STATUSES: ReadonlySet<PluginRunStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
]);

export function isTerminalPluginRunStatus(s: PluginRunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(s);
}

/* ── Imperative API ────────────────────────────────────────────────────── */

const ROOT = "/platform/plugins";

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    sp.append(k, String(v));
  }
  const out = sp.toString();
  return out ? `?${out}` : "";
}

// Map a UI filter value to the host's actual path. Marketplace doesn't
// pluralize ("marketplaces" reads silly and the host registers
// /platform/marketplace/); importer/search both gain a trailing 's'.
function categoryPath(category: PluginCategory | "all"): string {
  if (category === "all") return "/platform/plugins/";
  if (category === "marketplace") return "/platform/marketplace/";
  return `/platform/${category}s/`;
}

// Drop manifests missing the new required `category` field. After this
// migration the host guarantees it, but defensively filtering here means
// stale dev servers don't blow up the grid.
function hasCategory(m: PluginManifest): boolean {
  return typeof m.category === "string" && m.category.length > 0;
}

export const pluginsApi = {
  list: async (): Promise<PluginManifest[]> => {
    // Backend wraps the array as ``{plugins: [...]}`` so the response stays
    // forward-compatible (paging, capability filters, etc). Unwrap here so
    // every consumer sees a plain array.
    const resp = await api.get<{ plugins: PluginManifest[] }>(`${ROOT}/`);
    return (resp.plugins ?? []).filter(hasCategory);
  },
  listByCategory: async (
    category: PluginCategory | "all",
  ): Promise<PluginManifest[]> => {
    const resp = await api.get<{ plugins: PluginManifest[] }>(
      categoryPath(category),
    );
    return (resp.plugins ?? []).filter(hasCategory);
  },
  getConfig: (pluginId: string): Promise<PluginConfig> =>
    api.get<PluginConfig>(
      `${ROOT}/${encodeURIComponent(pluginId)}/config`,
    ),
  setConfig: (
    pluginId: string,
    config: Record<string, unknown>,
  ): Promise<{ ok: true }> =>
    api.put<{ ok: true }>(
      `${ROOT}/${encodeURIComponent(pluginId)}/config`,
      config,
    ),
  get: (pluginId: string): Promise<PluginManifest> =>
    api.get<PluginManifest>(`${ROOT}/${encodeURIComponent(pluginId)}`),
  startRun: (
    pluginId: string,
    input: PluginRunInput,
  ): Promise<PluginRunStartResponse> =>
    api.post<PluginRunStartResponse>(
      `${ROOT}/${encodeURIComponent(pluginId)}/run`,
      input,
    ),
  getRun: (runId: string): Promise<PluginRun> =>
    api.get<PluginRun>(`${ROOT}/runs/${encodeURIComponent(runId)}`),
  listRuns: (params: PluginRunsParams): Promise<PluginRunsResponse> =>
    api.get<PluginRunsResponse>(
      `${ROOT}/runs${qs({
        plugin_id: params.plugin_id,
        status: params.status,
        limit: params.limit,
        offset: params.offset,
      })}`,
    ),
  listItems: (params: PluginItemsParams): Promise<PluginItemsResponse> =>
    api.get<PluginItemsResponse>(
      `${ROOT}/items${qs({
        plugin_id: params.plugin_id,
        status: params.status,
        limit: params.limit,
        offset: params.offset,
      })}`,
    ),
  deleteItem: (id: string): Promise<DeletePluginItemResponse> =>
    api.del<DeletePluginItemResponse>(
      `${ROOT}/items/${encodeURIComponent(id)}`,
    ),
  bulkDeleteItems: (
    pluginId: string,
    status: string,
  ): Promise<BulkDeletePluginItemsResponse> =>
    api.del<BulkDeletePluginItemsResponse>(
      `${ROOT}/items${qs({ plugin_id: pluginId, status })}`,
    ),
};

/* ── Query keys ────────────────────────────────────────────────────────── */

export const pluginKeys = {
  all: ["plugins"] as const,
  list: () => ["plugins", "list"] as const,
  byCategory: (category: PluginCategory | "all") =>
    ["plugins", category] as const,
  config: (id: string) => ["plugin-config", id] as const,
  manifest: (id: string) => ["plugins", "manifest", id] as const,
  run: (id: string | null) => ["plugins", "run", id ?? ""] as const,
  runs: (params: PluginRunsParams) =>
    [
      "plugins",
      "runs",
      {
        plugin_id: params.plugin_id ?? null,
        status: params.status ?? null,
        limit: params.limit ?? 25,
        offset: params.offset ?? 0,
      },
    ] as const,
  items: (params: PluginItemsParams) =>
    [
      "plugins",
      "items",
      {
        plugin_id: params.plugin_id ?? null,
        status: params.status ?? null,
        limit: params.limit ?? 25,
        offset: params.offset ?? 0,
      },
    ] as const,
};

/* ── TanStack Query hooks ──────────────────────────────────────────────── */

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T>, "queryKey" | "queryFn">;
type MutationOpts<TData, TVar> = Omit<
  UseMutationOptions<TData, Error, TVar>,
  "mutationFn"
>;

export function usePlugins(opts?: QueryOpts<PluginManifest[]>) {
  return useQuery<PluginManifest[], Error, PluginManifest[]>({
    queryKey: pluginKeys.list(),
    queryFn: () => pluginsApi.list(),
    staleTime: 30_000,
    ...opts,
  });
}

// Category-filtered listing. "all" hits /platform/plugins/; everything
// else hits the host's category-specific endpoint.
export function usePluginsByCategory(
  category: PluginCategory | "all",
  opts?: QueryOpts<PluginManifest[]>,
) {
  return useQuery<PluginManifest[], Error, PluginManifest[]>({
    queryKey: pluginKeys.byCategory(category),
    queryFn: () => pluginsApi.listByCategory(category),
    staleTime: 30_000,
    ...opts,
  });
}

export function usePluginConfig(
  pluginId: string,
  opts?: QueryOpts<PluginConfig>,
) {
  return useQuery<PluginConfig, Error, PluginConfig>({
    queryKey: pluginKeys.config(pluginId),
    queryFn: () => pluginsApi.getConfig(pluginId),
    enabled: pluginId.length > 0,
    staleTime: 5_000,
    ...opts,
  });
}

export type SetPluginConfigVars = {
  plugin_id: string;
  config: Record<string, unknown>;
};

export function useSetPluginConfig(
  opts?: MutationOpts<{ ok: true }, SetPluginConfigVars>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<{ ok: true }, Error, SetPluginConfigVars>({
    ...opts,
    mutationFn: (vars) => pluginsApi.setConfig(vars.plugin_id, vars.config),
    onSuccess: (data, vars, onMutateResult, ctx) => {
      qc.invalidateQueries({ queryKey: pluginKeys.config(vars.plugin_id) });
      qc.invalidateQueries({ queryKey: pluginKeys.manifest(vars.plugin_id) });
      userOnSuccess?.(data, vars, onMutateResult, ctx);
    },
  });
}

export function usePlugin(
  pluginId: string,
  opts?: QueryOpts<PluginManifest>,
) {
  return useQuery<PluginManifest, Error, PluginManifest>({
    queryKey: pluginKeys.manifest(pluginId),
    queryFn: () => pluginsApi.get(pluginId),
    enabled: pluginId.length > 0,
    staleTime: 30_000,
    ...opts,
  });
}

/**
 * Polls ``GET /platform/plugins/runs/{run_id}`` until the run reaches a
 * terminal state, then stops refetching. Pass ``null`` as the run id when
 * no run is active — the query is disabled.
 */
export function usePluginRun(
  runId: string | null,
  refetchInterval = 2000,
  opts?: QueryOpts<PluginRun>,
) {
  return useQuery<PluginRun, Error, PluginRun>({
    queryKey: pluginKeys.run(runId),
    queryFn: () => pluginsApi.getRun(runId as string),
    enabled: typeof runId === "string" && runId.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && isTerminalPluginRunStatus(data.status)) return false;
      return refetchInterval;
    },
    refetchIntervalInBackground: true,
    ...opts,
  });
}

export function usePluginRuns(
  params: PluginRunsParams = {},
  opts?: QueryOpts<PluginRunsResponse>,
) {
  return useQuery<PluginRunsResponse, Error, PluginRunsResponse>({
    queryKey: pluginKeys.runs(params),
    queryFn: () => pluginsApi.listRuns(params),
    staleTime: 5_000,
    ...opts,
  });
}

export function usePluginItems(
  params: PluginItemsParams = {},
  opts?: QueryOpts<PluginItemsResponse>,
) {
  return useQuery<PluginItemsResponse, Error, PluginItemsResponse>({
    queryKey: pluginKeys.items(params),
    queryFn: () => pluginsApi.listItems(params),
    staleTime: 5_000,
    ...opts,
  });
}

export function useStartPluginRun(
  pluginId: string,
  opts?: MutationOpts<PluginRunStartResponse, PluginRunInput>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<PluginRunStartResponse, Error, PluginRunInput>({
    ...opts,
    mutationFn: (input) => pluginsApi.startRun(pluginId, input),
    onSuccess: (data, vars, onMutateResult, ctx) => {
      // Invalidate runs and items lists scoped to the plugin so the new
      // run row and any side effects (newly fetched items) become visible.
      qc.invalidateQueries({ queryKey: ["plugins", "runs"] });
      qc.invalidateQueries({ queryKey: ["plugins", "items"] });
      userOnSuccess?.(data, vars, onMutateResult, ctx);
    },
  });
}

export function useDeletePluginItem(
  opts?: MutationOpts<DeletePluginItemResponse, string>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<DeletePluginItemResponse, Error, string>({
    ...opts,
    mutationFn: (id) => pluginsApi.deleteItem(id),
    onSuccess: (data, vars, onMutateResult, ctx) => {
      qc.invalidateQueries({ queryKey: ["plugins", "items"] });
      userOnSuccess?.(data, vars, onMutateResult, ctx);
    },
  });
}

export type BulkDeleteVars = {
  plugin_id: string;
  status: string;
};

export function useBulkDeletePluginItems(
  opts?: MutationOpts<BulkDeletePluginItemsResponse, BulkDeleteVars>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<BulkDeletePluginItemsResponse, Error, BulkDeleteVars>({
    ...opts,
    mutationFn: (vars) =>
      pluginsApi.bulkDeleteItems(vars.plugin_id, vars.status),
    onSuccess: (data, vars, onMutateResult, ctx) => {
      qc.invalidateQueries({ queryKey: ["plugins", "items"] });
      userOnSuccess?.(data, vars, onMutateResult, ctx);
    },
  });
}
