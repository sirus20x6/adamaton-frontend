/**
 * Typed wrappers around the platform/graph HTTP endpoints.
 *
 * The Phase G stub backend returns synthetic data shaped exactly like the
 * eventual GraphRAG-backed responses, so these wrappers are stable across
 * the transition.
 */

import { api } from "@/api/client";

export type GraphNode = {
  id: string;
  label: string;
  level: number;
  size: number;
  cluster?: number;
  community_id?: string;
  // Optional fields populated by the real-data backend; used for colouring
  // and tooltips. Older Phase-G-stub data won't have these.
  category?: string | null;
  count?: number;
};

export type GraphEdge = {
  source: string;
  target: string;
  weight: number;
  /** Optional human-readable predicate from the underlying KG row,
   * e.g. ``"kills"`` for ``Booth → Lincoln``. Backend emits this on
   * neighbourhood expansions so callers can label edges. */
  predicate?: string | null;
};

export type GraphResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  parent?: string;
};

export type GraphNodeTemporal = {
  era: string | null;
  earliest_year: number | null;
  latest_year: number | null;
  era_source: string | null;
  era_mentions: Record<string, number> | null;
  /** Pre-formatted human label, e.g. ``"M30–M31 (798.M30–014.M31)"``. */
  label: string | null;
};

export type GraphNodeDetail = GraphNode & {
  children?: GraphNode[];
  neighbours?: Array<{
    id: string;
    label: string;
    weight: number;
    /** ``"out"`` = this entity is the SUBJECT (e.g. Booth → kills →
     * Lincoln, viewed from Booth). ``"in"`` = this entity is the
     * OBJECT (the same fact viewed from Lincoln). Defaults to ``"out"``
     * for backwards compatibility with old responses. */
    direction?: "out" | "in";
    predicate?: string | null;
  }>;
  sources?: Array<{
    document_id: string;
    title: string;
    category?: string | null;
    mentions: number;
    chunk_ids?: string[];
    source_url?: string | null;
    created_at?: string | null;
  }>;
  description?: string | null;
  mentions?: number;
  stub?: boolean;
  temporal?: GraphNodeTemporal | null;
};

export type EntitySearchResponse = {
  hits: GraphNode[];
};

export async function getCommunities(
  corpusId: string,
  level: number = 2,
): Promise<GraphResponse> {
  return api.get<GraphResponse>(
    `/platform/graph/communities/${encodeURIComponent(corpusId)}`,
    { params: { level } },
  );
}

export type GraphExpandMode = "auto" | "members" | "all";

export async function expandCommunity(
  communityId: string,
  corpusId: string = "_",
  limit: number = 1_000,
  mode: GraphExpandMode = "auto",
): Promise<GraphResponse> {
  return api.get<GraphResponse>(
    `/platform/graph/expand/${encodeURIComponent(communityId)}`,
    { params: { corpus_id: corpusId, limit, mode } },
  );
}

export async function getNode(
  nodeId: string,
  corpusId: string = "_",
): Promise<GraphNodeDetail> {
  return api.get<GraphNodeDetail>(
    `/platform/graph/node/${encodeURIComponent(nodeId)}`,
    { params: { corpus_id: corpusId } },
  );
}

export async function searchEntities(
  q: string,
  corpusId: string = "_",
  limit: number = 20,
): Promise<GraphNode[]> {
  const raw = await api.get<EntitySearchResponse>("/platform/graph/search", {
    params: { q, corpus_id: corpusId, limit },
  });
  return raw.hits ?? [];
}
