/**
 * Typed wrappers around the Library / Corpora HTTP endpoints.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import axios from "axios";

import { api } from "@/api/client";
import { db } from "@/api/db";

export type CorpusScope = "research" | "book" | "mixed" | "experiments";

export type Corpus = {
  id: string;
  name: string;
  scope: CorpusScope | string | null;
  created_at: string | null;
  document_count: number;
  metadata?: Record<string, unknown> | null;
};

export type ListCorporaResponse = {
  corpora: Corpus[];
};

export type CreateCorpusInput = {
  name: string;
  scope: CorpusScope;
};

export type UpdateCorpusInput = {
  name?: string;
  scope?: CorpusScope;
  metadata?: Record<string, unknown> | null;
};

export type UploadResponse = {
  ok: boolean;
  path: string;
  size: number;
  filename?: string;
  content_type?: string;
};

export type IngestResponse = {
  ok: boolean;
  scheme?: string;
  error?: string;
  arxiv_id?: string;
  source_tier?: string;
  length?: number;
  path?: string;
};

export type StageCounts = {
  stage1: number;
  stage2: number;
  stage3: number;
  stage4: number;
  total: number;
};

export const ZERO_STAGES: StageCounts = {
  stage1: 0,
  stage2: 0,
  stage3: 0,
  stage4: 0,
  total: 0,
};

/* ── Imperative API ────────────────────────────────────────────────────── */

export async function listCorpora(): Promise<Corpus[]> {
  return db.raw<Corpus>("corpora", {
    order: [{ column: "created_at", dir: "desc", nulls: "last" }],
    limit: 500,
  });
}

export async function createCorpus(input: CreateCorpusInput): Promise<Corpus> {
  return api.post<Corpus>("/platform/corpora/", input);
}

export async function getCorpus(corpusId: string): Promise<Corpus> {
  return api.get<Corpus>(
    `/platform/corpora/${encodeURIComponent(corpusId)}`,
  );
}

export async function updateCorpus(
  corpusId: string,
  patch: UpdateCorpusInput,
): Promise<Corpus> {
  return api.patch<Corpus>(
    `/platform/corpora/${encodeURIComponent(corpusId)}`,
    patch,
  );
}

export async function deleteCorpus(corpusId: string): Promise<{ ok: boolean }> {
  return api.del<{ ok: boolean }>(
    `/platform/corpora/${encodeURIComponent(corpusId)}`,
  );
}

export type AttachDocumentsResponse = {
  ok: boolean;
  corpus_id: string;
  /** Newly attached this call. */
  attached: number;
  /** Submitted but already attached — idempotent skip count. */
  skipped: number;
  /** Submitted ids that don't actually exist in R2R (silently dropped). */
  missing: number;
};

/** Attach R2R documents to a corpus. Idempotent — duplicates count as skipped. */
export async function attachDocumentsToCorpus(
  corpusId: string,
  documentIds: string[],
  addedBy: string = "research_view",
): Promise<AttachDocumentsResponse> {
  return api.post<AttachDocumentsResponse>(
    `/platform/corpora/${encodeURIComponent(corpusId)}/documents`,
    { document_ids: documentIds, added_by: addedBy },
  );
}

/**
 * Pull pipeline-stage counts for a single corpus. The backend route lives
 * at ``GET /platform/corpora/{id}/stages`` and joins document_stages
 * against R2R documents whose metadata.corpus_id matches; when it
 * degrades (missing R2R schema) it falls back to platform-wide totals
 * server-side. We still tolerate 404/405/501 here so older builds and
 * race-y deployments don't break the meter.
 */
export async function getCorpusStages(corpusId: string): Promise<StageCounts> {
  try {
    return await api.get<StageCounts>(
      `/platform/corpora/${encodeURIComponent(corpusId)}/stages`,
    );
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status ?? 0;
      // 404/405/501 all map to "endpoint not implemented yet" — fall back to
      // zeros instead of surfacing the error to the UI.
      if (status === 404 || status === 405 || status === 501) {
        return { ...ZERO_STAGES };
      }
    }
    throw err;
  }
}

export type UploadOptions = {
  corpus_id?: string;
  /** Optional axios upload-progress callback (0..1 fraction). */
  onProgress?: (fraction: number) => void;
  /** Optional abort signal for cancellation. */
  signal?: AbortSignal;
};

export async function uploadFile(
  file: File,
  options: UploadOptions = {},
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file, file.name);
  // ``corpus_id`` rides along on the multipart payload so the backend can
  // record it on the upload row's metadata even though the actual ingest
  // call will repeat it. Sending it twice is cheap and tolerates either
  // call landing first when the routes are async.
  if (options.corpus_id) {
    form.append("corpus_id", options.corpus_id);
  }
  // Let axios derive the correct multipart boundary automatically — passing an
  // explicit Content-Type without the boundary parameter breaks server-side
  // parsing.
  return api.post<UploadResponse>("/platform/sources/upload", form, {
    onUploadProgress: options.onProgress
      ? (event) => {
          if (typeof event.total === "number" && event.total > 0) {
            options.onProgress!(Math.min(1, event.loaded / event.total));
          } else if (typeof event.loaded === "number") {
            options.onProgress!(0.5);
          }
        }
      : undefined,
    signal: options.signal,
  });
}

export type IngestInput = {
  target: string;
  corpus_id?: string;
};

export async function ingestTarget(
  input: IngestInput,
): Promise<IngestResponse> {
  return api.post<IngestResponse>("/platform/sources/ingest", input);
}

/* ── Recent activity (research jobs) ───────────────────────────────────── */

export type ResearchJobRow = {
  task_id: string;
  query: string;
  status: string;
  corpus_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ResearchJobsResponse = {
  items?: ResearchJobRow[];
  results?: ResearchJobRow[];
  total_entries?: number;
};

/**
 * Best-effort lookup of recent research jobs scoped to a corpus. Older builds
 * may reject the `corpus_id` filter (422) or only allow POSTs at this path
 * (405); both translate to "no rows to display" so the caller can quietly
 * collapse the section.
 */
export async function listRecentResearch(
  corpusId: string,
  limit = 5,
): Promise<ResearchJobRow[]> {
  const params = new URLSearchParams();
  if (corpusId) params.set("corpus_id", corpusId);
  params.set("limit", String(limit));
  const path = `/platform/research/?${params.toString()}`;
  try {
    const raw = await api.get<ResearchJobsResponse | ResearchJobRow[]>(path);
    const rows = Array.isArray(raw)
      ? raw
      : (raw.items ?? raw.results ?? []);
    return rows.slice(0, limit);
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status ?? 0;
      if (
        status === 404 ||
        status === 405 ||
        status === 422 ||
        status === 501
      ) {
        return [];
      }
    }
    throw err;
  }
}

/* ── R2R-native document index ─────────────────────────────────────────── */

export type R2RDocumentRow = {
  id: string;
  title?: string | null;
  type?: string | null;
  ingestion_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type R2RDocumentsResponse = {
  results: R2RDocumentRow[];
  total_entries: number;
};

export async function listR2RDocuments(args: {
  limit?: number;
  offset?: number;
} = {}): Promise<R2RDocumentsResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(args.limit ?? 50));
  params.set("offset", String(args.offset ?? 0));
  return api.get<R2RDocumentsResponse>(`/v3/documents?${params.toString()}`);
}

/** Documents attached to one platform corpus (joined to R2R metadata). */
export type CorpusDocumentRow = {
  document_id: string;
  title?: string | null;
  type?: string | null;
  metadata?: Record<string, unknown> | null;
  size_in_bytes?: number | null;
  ingestion_status?: string | null;
  added_at?: string | null;
  added_by?: string | null;
  document_created_at?: string | null;
};

export type CorpusDocumentsResponse = {
  corpus_id: string;
  corpus_name: string;
  total: number;
  limit: number;
  offset: number;
  documents: CorpusDocumentRow[];
};

export async function listCorpusDocuments(
  corpusId: string,
  args: { limit?: number; offset?: number } = {},
): Promise<CorpusDocumentsResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(args.limit ?? 50));
  params.set("offset", String(args.offset ?? 0));
  return api.get<CorpusDocumentsResponse>(
    `/platform/corpora/${encodeURIComponent(corpusId)}/documents?${params.toString()}`,
  );
}

/* ── libraryApi facade ─────────────────────────────────────────────────── */

export const libraryApi = {
  list: listCorpora,
  get: getCorpus,
  create: createCorpus,
  update: updateCorpus,
  remove: deleteCorpus,
  stages: getCorpusStages,
  ingest: ingestTarget,
  upload: uploadFile,
  recentResearch: listRecentResearch,
  documents: listR2RDocuments,
};

/* ── Query keys ────────────────────────────────────────────────────────── */

export const libraryKeys = {
  all: ["library"] as const,
  corpora: () => ["library", "corpora"] as const,
  corpus: (id: string) => ["library", "corpus", id] as const,
  stages: (id: string) => ["library", "corpus", id, "stages"] as const,
  recent: (id: string, limit: number) =>
    ["library", "corpus", id, "recent", limit] as const,
  documents: (limit: number, offset: number) =>
    ["library", "documents", { limit, offset }] as const,
  corpusDocuments: (corpusId: string, limit: number, offset: number) =>
    ["library", "corpus", corpusId, "documents", { limit, offset }] as const,
};

/* ── TanStack Query hooks ──────────────────────────────────────────────── */

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T>, "queryKey" | "queryFn">;
type MutationOpts<TData, TVar> = Omit<
  UseMutationOptions<TData, Error, TVar>,
  "mutationFn"
>;

export function useCorpora(opts?: QueryOpts<Corpus[]>) {
  return useQuery<Corpus[], Error, Corpus[]>({
    queryKey: libraryKeys.corpora(),
    queryFn: () => listCorpora(),
    staleTime: 15_000,
    ...opts,
  });
}

export function useCorpus(id: string, opts?: QueryOpts<Corpus>) {
  return useQuery<Corpus, Error, Corpus>({
    queryKey: libraryKeys.corpus(id),
    queryFn: () => getCorpus(id),
    enabled: id.length > 0,
    staleTime: 15_000,
    ...opts,
  });
}

export function useCorpusStages(id: string, opts?: QueryOpts<StageCounts>) {
  return useQuery<StageCounts, Error, StageCounts>({
    queryKey: libraryKeys.stages(id),
    queryFn: () => getCorpusStages(id),
    enabled: id.length > 0,
    staleTime: 30_000,
    retry: false,
    ...opts,
  });
}

export function useRecentResearch(
  corpusId: string,
  limit = 5,
  opts?: QueryOpts<ResearchJobRow[]>,
) {
  return useQuery<ResearchJobRow[], Error, ResearchJobRow[]>({
    queryKey: libraryKeys.recent(corpusId, limit),
    queryFn: () => listRecentResearch(corpusId, limit),
    enabled: corpusId.length > 0,
    staleTime: 10_000,
    retry: false,
    ...opts,
  });
}

export function useR2RDocuments(
  args: { limit?: number; offset?: number } = {},
  opts?: QueryOpts<R2RDocumentsResponse>,
) {
  const limit = args.limit ?? 50;
  const offset = args.offset ?? 0;
  return useQuery<R2RDocumentsResponse, Error, R2RDocumentsResponse>({
    queryKey: libraryKeys.documents(limit, offset),
    queryFn: () => listR2RDocuments({ limit, offset }),
    staleTime: 10_000,
    ...opts,
  });
}

export function useCorpusDocuments(
  corpusId: string,
  args: { limit?: number; offset?: number } = {},
  opts?: QueryOpts<CorpusDocumentsResponse>,
) {
  const limit = args.limit ?? 50;
  const offset = args.offset ?? 0;
  return useQuery<CorpusDocumentsResponse, Error, CorpusDocumentsResponse>({
    queryKey: libraryKeys.corpusDocuments(corpusId, limit, offset),
    queryFn: () => listCorpusDocuments(corpusId, { limit, offset }),
    enabled: corpusId.length > 0,
    staleTime: 10_000,
    ...opts,
  });
}

/**
 * Snapshot of every corpus cache we touch during an optimistic mutation, so
 * ``onError`` can roll the UI back to exactly what it showed before. We grab
 * the single-corpus detail entry plus both list keys (the new
 * ``libraryKeys.corpora()`` and the legacy bare ``["corpora"]``).
 */
type CorpusCacheSnapshot = {
  detail?: Corpus;
  corpora?: Corpus[];
  legacy?: Corpus[];
};

function snapshotCorpusCaches(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
): CorpusCacheSnapshot {
  return {
    detail: qc.getQueryData<Corpus>(libraryKeys.corpus(id)),
    corpora: qc.getQueryData<Corpus[]>(libraryKeys.corpora()),
    legacy: qc.getQueryData<Corpus[]>(["corpora"]),
  };
}

function restoreCorpusCaches(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
  snap: CorpusCacheSnapshot | undefined,
): void {
  if (!snap) return;
  qc.setQueryData(libraryKeys.corpus(id), snap.detail);
  qc.setQueryData(libraryKeys.corpora(), snap.corpora);
  qc.setQueryData(["corpora"], snap.legacy);
}

export function useUpdateCorpus(
  id: string,
  opts?: MutationOpts<Corpus, UpdateCorpusInput>,
) {
  const qc = useQueryClient();
  const userOnMutate = opts?.onMutate;
  const userOnError = opts?.onError;
  const userOnSuccess = opts?.onSuccess;
  const userOnSettled = opts?.onSettled;
  return useMutation<Corpus, Error, UpdateCorpusInput, CorpusCacheSnapshot>({
    ...opts,
    mutationFn: (patch) => updateCorpus(id, patch),
    onMutate: async (patch, mctx) => {
      // Cancel in-flight fetches so they don't clobber our optimistic write,
      // snapshot the caches for rollback, then patch the detail + list rows
      // in place so a rename/scope change is reflected immediately.
      await qc.cancelQueries({ queryKey: libraryKeys.corpus(id) });
      await qc.cancelQueries({ queryKey: libraryKeys.corpora() });
      await qc.cancelQueries({ queryKey: ["corpora"] });
      const snapshot = snapshotCorpusCaches(qc, id);

      const applyPatch = (c: Corpus): Corpus => ({ ...c, ...patch });
      const patchList = (list: Corpus[] | undefined) =>
        list?.map((c) => (c.id === id ? applyPatch(c) : c));

      if (snapshot.detail) {
        qc.setQueryData(libraryKeys.corpus(id), applyPatch(snapshot.detail));
      }
      qc.setQueryData(libraryKeys.corpora(), patchList(snapshot.corpora));
      qc.setQueryData(["corpora"], patchList(snapshot.legacy));

      void userOnMutate?.(patch, mctx);
      return snapshot;
    },
    onError: (err, patch, snapshot, mctx) => {
      restoreCorpusCaches(qc, id, snapshot);
      userOnError?.(err, patch, snapshot, mctx);
    },
    onSuccess: (updated, vars, snapshot, mctx) => {
      // Reconcile with the server's authoritative row.
      qc.setQueryData(libraryKeys.corpus(id), updated);
      userOnSuccess?.(updated, vars, snapshot, mctx);
    },
    onSettled: (data, error, vars, snapshot, mctx) => {
      // Always refetch so any server-side derived fields (document_count,
      // updated_at, …) land. The legacy Library page still keys off the bare
      // ``["corpora"]`` array, so invalidate both list keys.
      qc.invalidateQueries({ queryKey: libraryKeys.corpus(id) });
      qc.invalidateQueries({ queryKey: libraryKeys.corpora() });
      qc.invalidateQueries({ queryKey: ["corpora"] });
      userOnSettled?.(data, error, vars, snapshot, mctx);
    },
  });
}

export function useDeleteCorpus(
  opts?: MutationOpts<{ ok: boolean }, string>,
) {
  const qc = useQueryClient();
  const userOnMutate = opts?.onMutate;
  const userOnError = opts?.onError;
  const userOnSuccess = opts?.onSuccess;
  const userOnSettled = opts?.onSettled;
  return useMutation<{ ok: boolean }, Error, string, CorpusCacheSnapshot>({
    ...opts,
    mutationFn: (corpusId) => deleteCorpus(corpusId),
    onMutate: async (corpusId, mctx) => {
      // Optimistically drop the corpus from both list caches so the grid
      // updates instantly; snapshot for rollback if the delete fails.
      await qc.cancelQueries({ queryKey: libraryKeys.corpora() });
      await qc.cancelQueries({ queryKey: ["corpora"] });
      await qc.cancelQueries({ queryKey: libraryKeys.corpus(corpusId) });
      const snapshot = snapshotCorpusCaches(qc, corpusId);

      const dropFromList = (list: Corpus[] | undefined) =>
        list?.filter((c) => c.id !== corpusId);
      qc.setQueryData(libraryKeys.corpora(), dropFromList(snapshot.corpora));
      qc.setQueryData(["corpora"], dropFromList(snapshot.legacy));

      void userOnMutate?.(corpusId, mctx);
      return snapshot;
    },
    onError: (err, corpusId, snapshot, mctx) => {
      restoreCorpusCaches(qc, corpusId, snapshot);
      userOnError?.(err, corpusId, snapshot, mctx);
    },
    onSuccess: (resp, corpusId, snapshot, mctx) => {
      qc.removeQueries({ queryKey: libraryKeys.corpus(corpusId) });
      userOnSuccess?.(resp, corpusId, snapshot, mctx);
    },
    onSettled: (data, error, corpusId, snapshot, mctx) => {
      // Mirror the rename hook and bust both ``["library", "corpora"]`` and
      // the legacy ``["corpora"]`` key so the Library grid and any new
      // ``useCorpora`` consumer both refresh.
      qc.invalidateQueries({ queryKey: libraryKeys.corpora() });
      qc.invalidateQueries({ queryKey: ["corpora"] });
      userOnSettled?.(data, error, corpusId, snapshot, mctx);
    },
  });
}
