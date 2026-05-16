/**
 * Typed wrappers around the per-document trust HTTP endpoints, paired with
 * TanStack Query hooks for caching, retries, and invalidation.
 *
 * The backend lives at ``/platform/trust/`` and returns the same JSONB
 * ``signals`` blob the Stage 1 scorer wrote — we surface it verbatim so the
 * UI can render the per-factor breakdown without recomputing anything.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

import { api } from "@/api/client";
import { db } from "@/api/db";

/* ── Types ─────────────────────────────────────────────────────────────── */

/**
 * Five Stage 1 factor names, in the order the backend lists them in
 * ``app/trust/scorer.py``. Sticking to a tuple keeps the table render order
 * deterministic and lets us narrow indexed access under
 * ``noUncheckedIndexedAccess``.
 */
export const TRUST_FACTORS = [
  "source_weight",
  "recency_decay",
  "arxiv_source_tier",
  "citation_count_log",
  "journal_quality",
] as const;

export type TrustFactor = (typeof TRUST_FACTORS)[number];

/** Per-factor explanation surfaced inside the scorecard tooltip. */
export const TRUST_FACTOR_EXPLANATIONS: Record<TrustFactor, string> = {
  source_weight:
    "Curated reputation of the publishing venue; pulled from platform.sources.default_weight.",
  recency_decay:
    "Exponential decay on the publication date with a per-source-kind half-life.",
  arxiv_source_tier:
    "Quality of the arXiv fetch tier (LaTeX > ar5iv > vanity > HTML > PDF).",
  citation_count_log:
    "log10(citations + 1) / 4, capped at 1.0; rewards papers with sustained pickup.",
  journal_quality:
    "Soft proxy: peer-reviewed + h5_index >= 50 ⇒ 1.0; peer-reviewed ⇒ 0.7; OA ⇒ 0.5.",
};

/** Friendly labels for the table — match the spacing convention used in the UI. */
export const TRUST_FACTOR_LABELS: Record<TrustFactor, string> = {
  source_weight: "Source weight",
  recency_decay: "Recency",
  arxiv_source_tier: "arXiv tier",
  citation_count_log: "Citations",
  journal_quality: "Journal quality",
};

export type TrustSignals = {
  weights?: Partial<Record<TrustFactor, number>>;
  inputs?: Record<string, unknown>;
  stage1_score?: number;
} & Partial<Record<TrustFactor, number>> &
  Record<string, unknown>;

export type TrustDetail = {
  document_id: string;
  stage1_score: number | null;
  stage3_score: number | null;
  signals: TrustSignals;
  computed_at: string | null;
};

export type TrustListResponse = {
  items: TrustDetail[];
  limit: number;
  offset: number;
  count: number;
};

export type RecomputeResponse = {
  ok: boolean;
  document_id?: string;
  job_id?: string;
  queue?: string;
  error?: string;
};

/* ── Imperative API ────────────────────────────────────────────────────── */

const ROOT = "/platform/trust";

export async function listTrust(
  args: { limit?: number; offset?: number } = {},
): Promise<TrustListResponse> {
  return db.list<TrustDetail>("documents_trust", {
    order: [
      { column: "stage1_score", dir: "desc", nulls: "last" },
      { column: "computed_at", dir: "desc", nulls: "last" },
    ],
    limit: args.limit ?? 50,
    offset: args.offset ?? 0,
  });
}

export async function getTrustDetail(
  documentId: string,
): Promise<TrustDetail> {
  return db.one<TrustDetail>("documents_trust", {
    filters: { document_id: { op: "eq", value: documentId } },
  });
}

export async function recomputeTrust(
  documentId: string,
): Promise<RecomputeResponse> {
  return api.post<RecomputeResponse>(
    `${ROOT}/${encodeURIComponent(documentId)}/recompute`,
  );
}

export const trustApi = {
  list: listTrust,
  detail: getTrustDetail,
  recompute: recomputeTrust,
};

/* ── Query keys ────────────────────────────────────────────────────────── */

export const trustKeys = {
  all: ["trust"] as const,
  list: (limit: number, offset: number) =>
    ["trust", "list", { limit, offset }] as const,
  detail: (documentId: string) => ["trust", "detail", documentId] as const,
};

/* ── TanStack Query hooks ──────────────────────────────────────────────── */

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T>, "queryKey" | "queryFn">;
type MutationOpts<TData, TVar> = Omit<
  UseMutationOptions<TData, Error, TVar>,
  "mutationFn"
>;

export function useTrustDetail(
  documentId: string | null | undefined,
  opts?: QueryOpts<TrustDetail>,
) {
  const id = (documentId ?? "").trim();
  return useQuery<TrustDetail, Error, TrustDetail>({
    queryKey: trustKeys.detail(id),
    queryFn: () => getTrustDetail(id),
    enabled: id.length > 0,
    staleTime: 30_000,
    retry: false,
    ...opts,
  });
}

export function useRecomputeTrust(
  documentId: string,
  opts?: MutationOpts<RecomputeResponse, void>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<RecomputeResponse, Error, void>({
    ...opts,
    mutationFn: () => recomputeTrust(documentId),
    onSuccess: (resp, vars, onMutateResult, ctx) => {
      qc.invalidateQueries({ queryKey: trustKeys.detail(documentId) });
      userOnSuccess?.(resp, vars, onMutateResult, ctx);
    },
  });
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

/** Default Stage 1 weights mirroring ``app/trust/scorer.py``. */
const DEFAULT_WEIGHTS: Record<TrustFactor, number> = {
  source_weight: 0.4,
  recency_decay: 0.2,
  arxiv_source_tier: 0.15,
  citation_count_log: 0.15,
  journal_quality: 0.1,
};

/** Pull a [0, 1]-clamped factor value out of a possibly-malformed signals blob. */
export function factorValue(
  signals: TrustSignals | undefined | null,
  factor: TrustFactor,
): number {
  if (!signals) return 0;
  const raw = signals[factor];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}

/** Pull the weight for a factor from signals.weights or the default vector. */
export function factorWeight(
  signals: TrustSignals | undefined | null,
  factor: TrustFactor,
): number {
  const fromSignals = signals?.weights?.[factor];
  if (typeof fromSignals === "number" && Number.isFinite(fromSignals)) {
    return fromSignals;
  }
  return DEFAULT_WEIGHTS[factor] ?? 0;
}
