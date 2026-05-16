/**
 * Typed wrappers around the Zotero import HTTP endpoints, paired with
 * TanStack Query hooks for caching, polling, and invalidation.
 *
 * The backend is mounted at ``/platform/zotero/`` and is responsible for
 * pulling reference metadata (and optionally PDF attachments) from a user's
 * Zotero library — either via the Zotero Web API or a locally-uploaded
 * ``zotero.sqlite`` file. Items land in ``platform.zotero_imports`` and,
 * after dedupe, are routed onto the platform ingestion queue.
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

export type ZoteroLibraryType = "user" | "group";

export type ZoteroSyncStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type ZoteroSyncTotals = {
  seen: number;
  new: number;
  deduped: number;
  queued: number;
  errored: number;
};

export type ZoteroStatus = {
  connected: boolean;
  library_name: string | null;
  last_sync_at: string | null;
  last_totals: ZoteroSyncTotals | null;
  item_count: number;
};

export type ZoteroSyncJob = {
  id: string;
  status: ZoteroSyncStatus;
  totals: ZoteroSyncTotals;
  started_at: string | null;
  finished_at: string | null;
  error?: string | null;
};

export type ZoteroIngestStatus =
  | "pending"
  | "queued"
  | "ingested"
  | "duplicate"
  | "errored"
  | "skipped";

export type ZoteroImportRow = {
  id: string;
  zotero_key: string;
  title: string | null;
  doi: string | null;
  arxiv_id: string | null;
  document_id: string | null;
  ingest_status: ZoteroIngestStatus;
  ingest_error: string | null;
  created_at: string;
};

export type ZoteroImportsResponse = {
  items: ZoteroImportRow[];
  count: number;
  total: number;
};

export type ZoteroConnectInput = {
  api_key: string;
  library_type: ZoteroLibraryType;
  library_id: string;
};

export type ZoteroConnectResponse = {
  ok: true;
  library_name: string;
  item_count: number;
};

export type ZoteroSyncInput = {
  corpus_id?: string;
  only_with_pdf?: boolean;
  force_full?: boolean;
};

export type ZoteroSyncStartResponse = {
  job_id: string;
  queue: string;
};

export type ZoteroImportsParams = {
  status?: string;
  limit?: number;
  offset?: number;
};

export const ZERO_TOTALS: ZoteroSyncTotals = {
  seen: 0,
  new: 0,
  deduped: 0,
  queued: 0,
  errored: 0,
};

const TERMINAL_STATUSES: ReadonlySet<ZoteroSyncStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
]);

export function isTerminalSyncStatus(s: ZoteroSyncStatus): boolean {
  return TERMINAL_STATUSES.has(s);
}

/* ── Imperative API ────────────────────────────────────────────────────── */

const ROOT = "/platform/zotero";

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    sp.append(k, String(v));
  }
  const out = sp.toString();
  return out ? `?${out}` : "";
}

export const zoteroApi = {
  status: (): Promise<ZoteroStatus> =>
    api.get<ZoteroStatus>(`${ROOT}/status`),
  connect: (input: ZoteroConnectInput): Promise<ZoteroConnectResponse> =>
    api.post<ZoteroConnectResponse>(`${ROOT}/connect`, input),
  sync: (input: ZoteroSyncInput): Promise<ZoteroSyncStartResponse> =>
    api.post<ZoteroSyncStartResponse>(`${ROOT}/sync`, input),
  getJob: (id: string): Promise<ZoteroSyncJob> =>
    api.get<ZoteroSyncJob>(`${ROOT}/sync/${encodeURIComponent(id)}`),
  imports: (params: ZoteroImportsParams): Promise<ZoteroImportsResponse> =>
    api.get<ZoteroImportsResponse>(
      `${ROOT}/imports${qs({
        status: params.status,
        limit: params.limit,
        offset: params.offset,
      })}`,
    ),
  uploadSqlite: (form: FormData): Promise<ZoteroSyncStartResponse> =>
    api.post<ZoteroSyncStartResponse>(`${ROOT}/upload-sqlite`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  deleteImport: (id: string): Promise<{ ok: true; id: string; previous_status: string }> =>
    api.del(`${ROOT}/imports/${encodeURIComponent(id)}`),
  bulkDeleteImports: (status: string): Promise<{ ok: true; deleted: number; status: string }> =>
    api.del(`${ROOT}/imports${qs({ status })}`),
};

/* ── Query keys ────────────────────────────────────────────────────────── */

export const zoteroKeys = {
  all: ["zotero"] as const,
  status: () => ["zotero", "status"] as const,
  job: (id: string | null) => ["zotero", "sync", id ?? ""] as const,
  imports: (params: ZoteroImportsParams) =>
    [
      "zotero",
      "imports",
      {
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

export function useZoteroStatus(
  refetchInterval = 60_000,
  opts?: QueryOpts<ZoteroStatus>,
) {
  return useQuery<ZoteroStatus, Error, ZoteroStatus>({
    queryKey: zoteroKeys.status(),
    queryFn: () => zoteroApi.status(),
    refetchInterval,
    staleTime: 15_000,
    ...opts,
  });
}

/**
 * Polls ``GET /platform/zotero/sync/{job_id}`` until the job reaches a
 * terminal state, then stops refetching. Pass ``null`` as the job id when
 * no sync is active — the query is disabled.
 */
export function useZoteroSyncJob(
  jobId: string | null,
  refetchInterval = 2000,
  opts?: QueryOpts<ZoteroSyncJob>,
) {
  return useQuery<ZoteroSyncJob, Error, ZoteroSyncJob>({
    queryKey: zoteroKeys.job(jobId),
    queryFn: () => zoteroApi.getJob(jobId as string),
    enabled: typeof jobId === "string" && jobId.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && isTerminalSyncStatus(data.status)) return false;
      return refetchInterval;
    },
    refetchIntervalInBackground: true,
    ...opts,
  });
}

export function useZoteroImports(
  params: ZoteroImportsParams = {},
  opts?: QueryOpts<ZoteroImportsResponse>,
) {
  return useQuery<ZoteroImportsResponse, Error, ZoteroImportsResponse>({
    queryKey: zoteroKeys.imports(params),
    queryFn: () => zoteroApi.imports(params),
    staleTime: 5_000,
    ...opts,
  });
}

export function useZoteroConnect(
  opts?: MutationOpts<ZoteroConnectResponse, ZoteroConnectInput>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<ZoteroConnectResponse, Error, ZoteroConnectInput>({
    ...opts,
    mutationFn: (input) => zoteroApi.connect(input),
    onSuccess: (data, vars, onMutateResult, ctx) => {
      qc.invalidateQueries({ queryKey: zoteroKeys.status() });
      userOnSuccess?.(data, vars, onMutateResult, ctx);
    },
  });
}

export function useZoteroSync(
  opts?: MutationOpts<ZoteroSyncStartResponse, ZoteroSyncInput>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<ZoteroSyncStartResponse, Error, ZoteroSyncInput>({
    ...opts,
    mutationFn: (input) => zoteroApi.sync(input),
    onSuccess: (data, vars, onMutateResult, ctx) => {
      // Touch status so the header pill repaints after a kickoff.
      qc.invalidateQueries({ queryKey: zoteroKeys.status() });
      userOnSuccess?.(data, vars, onMutateResult, ctx);
    },
  });
}

export function useZoteroUploadSqlite(
  opts?: MutationOpts<ZoteroSyncStartResponse, FormData>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<ZoteroSyncStartResponse, Error, FormData>({
    ...opts,
    mutationFn: (form) => zoteroApi.uploadSqlite(form),
    onSuccess: (data, vars, onMutateResult, ctx) => {
      qc.invalidateQueries({ queryKey: zoteroKeys.status() });
      userOnSuccess?.(data, vars, onMutateResult, ctx);
    },
  });
}

type DeleteImportResponse = { ok: true; id: string; previous_status: string };
type BulkDeleteImportsResponse = { ok: true; deleted: number; status: string };

export function useZoteroDeleteImport(
  opts?: MutationOpts<DeleteImportResponse, string>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<DeleteImportResponse, Error, string>({
    ...opts,
    mutationFn: (id) => zoteroApi.deleteImport(id),
    onSuccess: (data, vars, onMutateResult, ctx) => {
      // Refresh every imports list (any filter / page) so the row vanishes
      // immediately. Cheap — TanStack Query batches the refetches.
      qc.invalidateQueries({ queryKey: ["zotero", "imports"] });
      qc.invalidateQueries({ queryKey: zoteroKeys.status() });
      userOnSuccess?.(data, vars, onMutateResult, ctx);
    },
  });
}

export function useZoteroBulkDeleteImports(
  opts?: MutationOpts<BulkDeleteImportsResponse, string>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<BulkDeleteImportsResponse, Error, string>({
    ...opts,
    mutationFn: (status) => zoteroApi.bulkDeleteImports(status),
    onSuccess: (data, vars, onMutateResult, ctx) => {
      qc.invalidateQueries({ queryKey: ["zotero", "imports"] });
      qc.invalidateQueries({ queryKey: zoteroKeys.status() });
      userOnSuccess?.(data, vars, onMutateResult, ctx);
    },
  });
}
