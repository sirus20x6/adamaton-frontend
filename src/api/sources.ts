/**
 * Typed wrappers around the curated-sources HTTP endpoints, paired with
 * TanStack Query hooks for caching.
 *
 * Backend is mounted at ``/platform/sources/``; the catalog is served from
 * ``platform.sources`` and is what feeds the Stage 1 trust scorer's
 * ``source_weight`` factor.
 */

import {
  useQuery,
  type UseQueryOptions,
} from "@tanstack/react-query";

import { db, type DbFilters } from "@/api/db";

/* ── Types ─────────────────────────────────────────────────────────────── */

/**
 * Mirrors the ``platform.sources.kind`` CHECK constraint on the backend.
 * ``GET /platform/sources/kinds`` is the source of truth at runtime; this
 * tuple just gives the UI a stable fallback when the request is in-flight.
 */
export const KNOWN_SOURCE_KINDS = [
  "journal",
  "preprint",
  "repo",
  "forum",
  "wiki",
  "web",
  "book",
] as const;

export type SourceKind = (typeof KNOWN_SOURCE_KINDS)[number];

export type Source = {
  id: number;
  name: string;
  kind: SourceKind | string;
  domain: string;
  default_weight: number | null;
  peer_reviewed: boolean;
  h5_index: number | null;
  metadata: Record<string, unknown>;
};

export type ListSourcesResponse = {
  items: Source[];
  count: number;
  total: number;
  limit: number;
  offset: number;
};

export type SourceKindsResponse = {
  kinds: string[];
};

export type SourceListArgs = {
  /** Filter by exact kind. ``undefined`` means "all kinds". */
  kind?: SourceKind | string | null;
  /** ``true`` keeps only peer-reviewed; ``false`` keeps only the others. */
  peer_reviewed?: boolean | null;
  /** Substring match on name OR domain (server-side ILIKE). */
  q?: string | null;
  limit?: number;
  offset?: number;
};

export type SourceSortKey = "weight" | "h5" | "name";

/* ── Imperative API ────────────────────────────────────────────────────── */

const ROOT = "/platform/sources";
const ROOT_SLASH = "/platform/sources/";

function withQuery(
  path: string,
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    sp.append(k, String(v));
  }
  const q = sp.toString();
  return q ? `${path}?${q}` : path;
}

export async function listSources(
  args: SourceListArgs = {},
): Promise<ListSourcesResponse> {
  const filters: DbFilters = {};
  if (args.kind) filters.kind = { op: "eq", value: args.kind };
  if (typeof args.peer_reviewed === "boolean") {
    filters.peer_reviewed = { op: "is", value: args.peer_reviewed ? "true" : "false" };
  }
  if (args.q && args.q.length > 0) {
    // PostgREST OR group: ?or=(name.ilike.*foo*,domain.ilike.*foo*)
    filters.or = {
      op: "raw",
      value: `(name.ilike.*${args.q}*,domain.ilike.*${args.q}*)`,
    };
  }
  return db.list<Source>("sources", {
    filters,
    order: [
      { column: "default_weight", dir: "desc", nulls: "last" },
      { column: "peer_reviewed", dir: "desc" },
      { column: "name", dir: "asc" },
    ],
    limit: args.limit ?? 100,
    offset: args.offset ?? 0,
  });
}

export async function listSourceKinds(): Promise<SourceKindsResponse> {
  // Hardcoded enum constraint — no DB round-trip needed.
  return { kinds: [...KNOWN_SOURCE_KINDS] };
}

export async function getSource(id: number): Promise<Source> {
  return db.one<Source>("sources", {
    filters: { id: { op: "eq", value: id } },
  });
}

export const sourcesApi = {
  list: listSources,
  kinds: listSourceKinds,
  get: getSource,
};

/* ── Query keys ────────────────────────────────────────────────────────── */

export const sourceKeys = {
  all: ["sources"] as const,
  list: (args: SourceListArgs) =>
    [
      "sources",
      "list",
      {
        kind: args.kind ?? null,
        peer_reviewed: args.peer_reviewed ?? null,
        q: (args.q ?? "").trim().toLowerCase(),
        limit: args.limit ?? 100,
        offset: args.offset ?? 0,
      },
    ] as const,
  kinds: () => ["sources", "kinds"] as const,
  detail: (id: number) => ["sources", "detail", id] as const,
};

/* ── TanStack Query hooks ──────────────────────────────────────────────── */

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T>, "queryKey" | "queryFn">;

export function useSources(
  args: SourceListArgs = {},
  opts?: QueryOpts<ListSourcesResponse>,
) {
  return useQuery<ListSourcesResponse, Error, ListSourcesResponse>({
    queryKey: sourceKeys.list(args),
    queryFn: () => listSources(args),
    staleTime: 60_000,
    ...opts,
  });
}

export function useSourceKinds(opts?: QueryOpts<SourceKindsResponse>) {
  return useQuery<SourceKindsResponse, Error, SourceKindsResponse>({
    queryKey: sourceKeys.kinds(),
    queryFn: () => listSourceKinds(),
    // Kinds are effectively static (DB CHECK constraint); cache aggressively.
    staleTime: 5 * 60_000,
    ...opts,
  });
}

export function useSource(id: number | null | undefined, opts?: QueryOpts<Source>) {
  const numericId = typeof id === "number" && Number.isFinite(id) ? id : 0;
  return useQuery<Source, Error, Source>({
    queryKey: sourceKeys.detail(numericId),
    queryFn: () => getSource(numericId),
    enabled: numericId > 0,
    staleTime: 5 * 60_000,
    ...opts,
  });
}

/* ── Client-side helpers ───────────────────────────────────────────────── */

/**
 * Stable client-side sort. The backend already returns rows ordered by
 * ``default_weight DESC, peer_reviewed DESC, name ASC`` — for the other two
 * sort modes (``h5`` and ``name``) we reshuffle in memory to keep filter
 * tweaks instant.
 */
export function sortSources(items: Source[], by: SourceSortKey): Source[] {
  const out = [...items];
  if (by === "weight") {
    out.sort((a, b) => {
      const aw = a.default_weight ?? -Infinity;
      const bw = b.default_weight ?? -Infinity;
      if (aw !== bw) return bw - aw;
      if (a.peer_reviewed !== b.peer_reviewed) {
        return a.peer_reviewed ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } else if (by === "h5") {
    out.sort((a, b) => {
      const ah = a.h5_index ?? -Infinity;
      const bh = b.h5_index ?? -Infinity;
      if (ah !== bh) return bh - ah;
      return a.name.localeCompare(b.name);
    });
  } else {
    out.sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}
