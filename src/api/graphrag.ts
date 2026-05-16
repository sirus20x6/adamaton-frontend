/**
 * Typed wrappers around the GraphRAG community / report endpoints.
 *
 * Mirrors the conventions in src/api/library.ts: imperative fetchers using
 * the shared `api` helper from src/api/client.ts, paired with a small
 * `graphragKeys` factory and TanStack Query v5 hooks.
 */

import {
  useQuery,
  type UseQueryOptions,
} from "@tanstack/react-query";

import { api } from "@/api/client";

/* ── Response shapes ───────────────────────────────────────────────────── */

export type GraphragSummary = {
  entities: number;
  relationships: number;
  communities: number;
  reports: number;
  text_units: number;
  levels: number[];
};

export type GraphragCommunity = {
  id: string;
  community_id: number;
  level: number;
  title: string;
  size: number;
  parent: number | null;
  report_summary: string | null;
  report_rank: number | null;
};

export type GraphragCommunitiesResponse = {
  communities: GraphragCommunity[];
};

export type GraphragFinding = {
  summary: string;
  explanation: string;
};

export type GraphragReport = {
  summary: string | null;
  full_content: string | null;
  findings: GraphragFinding[];
  rating: number | null;
  rating_explanation: string | null;
  rank: number | null;
} & Record<string, unknown>;

export type GraphragCommunityDetail = {
  community: GraphragCommunity;
  report: GraphragReport | null;
};

export type GraphragEntity = {
  id: string;
  title: string;
  type: string | null;
  description: string | null;
  degree: number | null;
  frequency: number | null;
};

export type GraphragEntitiesResponse = {
  entities: GraphragEntity[];
};

/* ── Imperative fetchers ───────────────────────────────────────────────── */

export async function getGraphragSummary(
  corpusId: string,
): Promise<GraphragSummary> {
  return api.get<GraphragSummary>(
    `/platform/graph/graphrag/${encodeURIComponent(corpusId)}/summary`,
  );
}

export async function getGraphragCommunities(
  corpusId: string,
  args: { level?: number; limit?: number } = {},
): Promise<GraphragCommunity[]> {
  const params = new URLSearchParams();
  if (typeof args.level === "number") params.set("level", String(args.level));
  params.set("limit", String(args.limit ?? 200));
  const raw = await api.get<GraphragCommunitiesResponse>(
    `/platform/graph/graphrag/${encodeURIComponent(corpusId)}/communities?${params.toString()}`,
  );
  return raw.communities ?? [];
}

export async function getGraphragCommunity(
  communityUuid: string,
): Promise<GraphragCommunityDetail> {
  return api.get<GraphragCommunityDetail>(
    `/platform/graph/graphrag/community/${encodeURIComponent(communityUuid)}`,
  );
}

export async function searchGraphragEntities(
  corpusId: string,
  args: { q?: string; limit?: number } = {},
): Promise<GraphragEntity[]> {
  const params = new URLSearchParams();
  if (args.q && args.q.length > 0) params.set("q", args.q);
  params.set("limit", String(args.limit ?? 50));
  const raw = await api.get<GraphragEntitiesResponse>(
    `/platform/graph/graphrag/${encodeURIComponent(corpusId)}/entities?${params.toString()}`,
  );
  return raw.entities ?? [];
}

/* ── Query keys ────────────────────────────────────────────────────────── */

export const graphragKeys = {
  all: ["graphrag"] as const,
  summary: (corpusId: string) =>
    ["graphrag", "summary", corpusId] as const,
  communities: (corpusId: string, level: number | null, limit: number) =>
    ["graphrag", "communities", corpusId, { level, limit }] as const,
  community: (communityUuid: string) =>
    ["graphrag", "community", communityUuid] as const,
  entities: (corpusId: string, q: string, limit: number) =>
    ["graphrag", "entities", corpusId, { q, limit }] as const,
};

/* ── TanStack Query hooks ──────────────────────────────────────────────── */

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T>, "queryKey" | "queryFn">;

export function useGraphragSummary(
  corpusId: string,
  opts?: QueryOpts<GraphragSummary>,
) {
  return useQuery<GraphragSummary, Error, GraphragSummary>({
    queryKey: graphragKeys.summary(corpusId),
    queryFn: () => getGraphragSummary(corpusId),
    enabled: corpusId.length > 0,
    staleTime: 30_000,
    retry: false,
    ...opts,
  });
}

export function useGraphragCommunities(
  corpusId: string,
  args: { level?: number | null; limit?: number } = {},
  opts?: QueryOpts<GraphragCommunity[]>,
) {
  const level = args.level ?? null;
  const limit = args.limit ?? 200;
  return useQuery<GraphragCommunity[], Error, GraphragCommunity[]>({
    queryKey: graphragKeys.communities(corpusId, level, limit),
    queryFn: () =>
      getGraphragCommunities(corpusId, {
        level: level === null ? undefined : level,
        limit,
      }),
    enabled: corpusId.length > 0,
    staleTime: 30_000,
    retry: false,
    ...opts,
  });
}

export function useGraphragCommunity(
  communityUuid: string | null,
  opts?: QueryOpts<GraphragCommunityDetail>,
) {
  return useQuery<GraphragCommunityDetail, Error, GraphragCommunityDetail>({
    queryKey: graphragKeys.community(communityUuid ?? ""),
    queryFn: () => getGraphragCommunity(communityUuid as string),
    enabled: !!communityUuid && communityUuid.length > 0,
    staleTime: 60_000,
    retry: false,
    ...opts,
  });
}

export function useSearchGraphragEntities(
  corpusId: string,
  args: { q?: string; limit?: number } = {},
  opts?: QueryOpts<GraphragEntity[]>,
) {
  const q = args.q ?? "";
  const limit = args.limit ?? 50;
  return useQuery<GraphragEntity[], Error, GraphragEntity[]>({
    queryKey: graphragKeys.entities(corpusId, q, limit),
    queryFn: () => searchGraphragEntities(corpusId, { q, limit }),
    enabled: corpusId.length > 0,
    staleTime: 15_000,
    retry: false,
    ...opts,
  });
}

/* ── Facade for non-hook callers ───────────────────────────────────────── */

export const graphragApi = {
  summary: getGraphragSummary,
  communities: getGraphragCommunities,
  community: getGraphragCommunity,
  searchEntities: searchGraphragEntities,
};
