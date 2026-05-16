/**
 * Typed wrappers around the autoresearch / experiments HTTP endpoints, paired
 * with TanStack Query hooks for caching, retries, and invalidation.
 *
 * Backend contract is mounted at `/platform/experiments` and frontend traffic
 * is routed through the Vite proxy. POSTs require a trailing slash on the
 * collection root because FastAPI redirects without it.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

import { api } from "@/api/client";
import { db, type DbFilters, type DbOrder } from "@/api/db";

/* ── Types ─────────────────────────────────────────────────────────────── */

export type ExperimentStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "interrupted";

export type ExperimentSortBy = "val_bpb" | "recent";

export type Experiment = {
  id: string;
  agent_session_id: string | null;
  name: string;
  hypothesis: string;
  code_diff: string | null;
  val_bpb: number | null;
  peak_memory_mb: number | null;
  status: ExperimentStatus;
  notes: string | null;
  parent_id: string | null;
  commit_hash: string | null;
  tags: string[];
  started_at: string;
  finished_at: string | null;
  created_at: string;
};

export type ExperimentListResponse = {
  items: Experiment[];
  limit: number;
  offset: number;
  count: number;
  sort_by: ExperimentSortBy;
};

export type ExperimentSearchHit = {
  id: string;
  name: string;
  hypothesis_preview: string;
  val_bpb: number | null;
  status: ExperimentStatus;
  started_at: string;
  similarity: number;
};

export type ExperimentSearchResponse = {
  hits: ExperimentSearchHit[];
};

export type SessionSummary = {
  count: number;
  best_val_bpb: number | null;
  latest_val_bpb: number | null;
  started_at: string | null;
  last_active_at: string | null;
};

export type MetricPoint = {
  step: number;
  key: string;
  value: number;
  recorded_at: string;
};

type RawMetricResponse = {
  experiment_id: string;
  key: string | null;
  points: MetricPoint[];
  count: number;
};

/** Per-experiment, per-key bucket of points returned by the bulk endpoint. */
export type BulkMetricsSeries = Record<string, Record<string, MetricPoint[]>>;

export type BulkMetricsResponse = {
  series: BulkMetricsSeries;
  count: number;
  since_step: number | null;
};

type RawBulkMetricsResponse = {
  series?: Record<
    string,
    Record<string, Array<{ step: number; value: number; recorded_at?: string | null }>>
  > | null;
  count?: number;
  since_step?: number | null;
};

export type BulkMetricsArgs = {
  ids: readonly string[];
  keys?: readonly string[];
  since_step?: number | null;
};

export type ExperimentCreateInput = {
  name: string;
  hypothesis: string;
  code_diff?: string | null;
  val_bpb?: number | null;
  peak_memory_mb?: number | null;
  status?: ExperimentStatus;
  notes?: string | null;
  parent_id?: string | null;
  commit_hash?: string | null;
  tags?: string[];
  agent_session_id?: string | null;
};

export type ExperimentUpdateInput = Partial<ExperimentCreateInput> & {
  finished_at?: string | null;
};

export type ListExperimentsArgs = {
  sort_by?: ExperimentSortBy;
  agent_session_id?: string | null;
  limit?: number;
  offset?: number;
};

export type SearchExperimentsArgs = {
  q: string;
  sort_by?: ExperimentSortBy;
  agent_session_id?: string | null;
  limit?: number;
};

/* ── Path helpers ──────────────────────────────────────────────────────── */

const ROOT = "/platform/experiments";
/** POST collection requires the trailing slash; FastAPI 307s without it which
 *  drops bodies under some proxies. List GET also accepts the slash. */
const ROOT_SLASH = "/platform/experiments/";

function withQuery(
  path: string,
  params: Record<string, string | number | null | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    sp.append(k, String(v));
  }
  const q = sp.toString();
  return q ? `${path}?${q}` : path;
}

/* ── Imperative API ────────────────────────────────────────────────────── */

export const experimentsApi = {
  list: async (args: ListExperimentsArgs = {}): Promise<ExperimentListResponse> => {
    const filters: DbFilters = {};
    if (args.agent_session_id) {
      filters.agent_session_id = { op: "eq", value: args.agent_session_id };
    }
    const order: DbOrder =
      args.sort_by === "recent"
        ? [{ column: "created_at", dir: "desc" }]
        : [
            { column: "val_bpb", dir: "asc", nulls: "last" },
            { column: "created_at", dir: "desc" },
          ];
    const env = await db.list<Experiment>("experiments", {
      filters,
      order,
      limit: args.limit ?? 50,
      offset: args.offset ?? 0,
    });
    return {
      items: env.items,
      limit: env.limit,
      offset: env.offset,
      count: env.total,
      sort_by: args.sort_by ?? "val_bpb",
    };
  },

  get: (id: string): Promise<Experiment> =>
    db.one<Experiment>("experiments", {
      filters: { id: { op: "eq", value: id } },
    }),

  create: (payload: ExperimentCreateInput): Promise<Experiment> =>
    api.post<Experiment>(ROOT_SLASH, payload),

  update: (id: string, patch: ExperimentUpdateInput): Promise<Experiment> =>
    api.patch<Experiment>(`${ROOT}/${encodeURIComponent(id)}`, patch),

  search: (
    q: string,
    opts: Omit<SearchExperimentsArgs, "q"> = {},
  ): Promise<ExperimentSearchResponse> =>
    api.get<ExperimentSearchResponse>(
      withQuery(`${ROOT}/search`, {
        q,
        sort_by: opts.sort_by,
        agent_session_id: opts.agent_session_id ?? undefined,
        limit: opts.limit,
      }),
    ),

  metrics: async (id: string, key?: string): Promise<MetricPoint[]> => {
    const raw = await api.get<RawMetricResponse>(
      withQuery(`${ROOT}/${encodeURIComponent(id)}/metrics`, { key }),
    );
    return raw.points ?? [];
  },

  bulkMetrics: async (
    args: BulkMetricsArgs,
  ): Promise<BulkMetricsResponse> => {
    const ids = args.ids.filter((s) => s.length > 0);
    if (ids.length === 0) {
      return { series: {}, count: 0, since_step: args.since_step ?? null };
    }
    const params: Record<string, string | number | null | undefined> = {
      ids: ids.join(","),
    };
    if (args.keys && args.keys.length > 0) {
      params["keys"] = args.keys.join(",");
    }
    if (args.since_step !== null && args.since_step !== undefined) {
      params["since_step"] = args.since_step;
    }
    const raw = await api.get<RawBulkMetricsResponse>(
      withQuery(`${ROOT}/metrics`, params),
    );
    const series: BulkMetricsSeries = {};
    const rawSeries = raw.series ?? {};
    for (const [eid, perKey] of Object.entries(rawSeries)) {
      const bucket: Record<string, MetricPoint[]> = {};
      for (const [key, points] of Object.entries(perKey)) {
        bucket[key] = (points ?? []).map((p) => ({
          step: Number(p.step),
          key,
          value: Number(p.value),
          recorded_at: typeof p.recorded_at === "string" ? p.recorded_at : "",
        }));
      }
      series[eid] = bucket;
    }
    return {
      series,
      count: Number(raw.count ?? 0),
      since_step: raw.since_step ?? args.since_step ?? null,
    };
  },

  sessionSummary: (sid: string): Promise<SessionSummary> =>
    api.get<SessionSummary>(
      `${ROOT}/sessions/${encodeURIComponent(sid)}/summary`,
    ),
};

/* ── Query key factory ─────────────────────────────────────────────────── */

export const experimentKeys = {
  all: ["experiments"] as const,
  list: (args: ListExperimentsArgs) =>
    [
      "experiments",
      "list",
      {
        sort_by: args.sort_by ?? "val_bpb",
        agent_session_id: args.agent_session_id ?? null,
        limit: args.limit ?? null,
        offset: args.offset ?? null,
      },
    ] as const,
  detail: (id: string) => ["experiments", "detail", id] as const,
  search: (args: SearchExperimentsArgs) =>
    [
      "experiments",
      "search",
      {
        q: args.q,
        sort_by: args.sort_by ?? "val_bpb",
        agent_session_id: args.agent_session_id ?? null,
        limit: args.limit ?? null,
      },
    ] as const,
  metrics: (id: string, key?: string) =>
    ["experiments", "metrics", id, key ?? null] as const,
  bulkMetrics: (args: BulkMetricsArgs) =>
    [
      "experiments",
      "bulkMetrics",
      {
        ids: [...args.ids].sort().join(","),
        keys: args.keys ? [...args.keys].sort().join(",") : null,
        since_step: args.since_step ?? null,
      },
    ] as const,
  sessionSummary: (sid: string) =>
    ["experiments", "sessionSummary", sid] as const,
};

/* ── TanStack Query hooks ──────────────────────────────────────────────── */

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T>, "queryKey" | "queryFn">;

export function useExperiments(
  args: ListExperimentsArgs = {},
  opts?: QueryOpts<ExperimentListResponse>,
) {
  return useQuery<ExperimentListResponse, Error, ExperimentListResponse>({
    queryKey: experimentKeys.list(args),
    queryFn: () => experimentsApi.list(args),
    staleTime: 15_000,
    ...opts,
  });
}

export function useExperiment(id: string, opts?: QueryOpts<Experiment>) {
  return useQuery<Experiment, Error, Experiment>({
    queryKey: experimentKeys.detail(id),
    queryFn: () => experimentsApi.get(id),
    enabled: id.length > 0,
    staleTime: 15_000,
    ...opts,
  });
}

export function useExperimentSearch(
  args: SearchExperimentsArgs,
  opts?: QueryOpts<ExperimentSearchResponse>,
) {
  return useQuery<ExperimentSearchResponse, Error, ExperimentSearchResponse>({
    queryKey: experimentKeys.search(args),
    queryFn: () =>
      experimentsApi.search(args.q, {
        sort_by: args.sort_by,
        agent_session_id: args.agent_session_id,
        limit: args.limit,
      }),
    enabled: args.q.trim().length > 0,
    staleTime: 5_000,
    ...opts,
  });
}

export function useExperimentMetrics(
  id: string,
  key?: string,
  opts?: QueryOpts<MetricPoint[]>,
) {
  return useQuery<MetricPoint[], Error, MetricPoint[]>({
    queryKey: experimentKeys.metrics(id, key),
    queryFn: () => experimentsApi.metrics(id, key),
    enabled: id.length > 0,
    staleTime: 15_000,
    ...opts,
  });
}

export function useBulkMetrics(
  args: BulkMetricsArgs,
  opts?: QueryOpts<BulkMetricsResponse>,
) {
  return useQuery<BulkMetricsResponse, Error, BulkMetricsResponse>({
    queryKey: experimentKeys.bulkMetrics(args),
    queryFn: () => experimentsApi.bulkMetrics(args),
    enabled: args.ids.length > 0,
    staleTime: 5_000,
    ...opts,
  });
}

export function useSessionSummary(
  sid: string | null,
  opts?: QueryOpts<SessionSummary>,
) {
  return useQuery<SessionSummary, Error, SessionSummary>({
    queryKey: experimentKeys.sessionSummary(sid ?? ""),
    queryFn: () => experimentsApi.sessionSummary(sid as string),
    enabled: typeof sid === "string" && sid.length > 0,
    staleTime: 30_000,
    ...opts,
  });
}

/* ── Mutations ─────────────────────────────────────────────────────────── */

type MutationOpts<TData, TVar> = Omit<
  UseMutationOptions<TData, Error, TVar>,
  "mutationFn"
>;

export function useCreateExperiment(
  opts?: MutationOpts<Experiment, ExperimentCreateInput>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<Experiment, Error, ExperimentCreateInput>({
    ...opts,
    mutationFn: (payload) => experimentsApi.create(payload),
    onSuccess: (created, vars, onMutateResult, ctx) => {
      qc.invalidateQueries({ queryKey: experimentKeys.all });
      userOnSuccess?.(created, vars, onMutateResult, ctx);
    },
  });
}

export function useUpdateExperiment(
  id: string,
  opts?: MutationOpts<Experiment, ExperimentUpdateInput>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<Experiment, Error, ExperimentUpdateInput>({
    ...opts,
    mutationFn: (patch) => experimentsApi.update(id, patch),
    onSuccess: (updated, vars, onMutateResult, ctx) => {
      qc.invalidateQueries({ queryKey: experimentKeys.all });
      qc.setQueryData(experimentKeys.detail(id), updated);
      userOnSuccess?.(updated, vars, onMutateResult, ctx);
    },
  });
}
