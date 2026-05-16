/**
 * Typed wrappers + TanStack Query hooks for the SkillRAE + evo-api
 * skills endpoints.
 *
 * Two upstream services to talk to:
 *
 *   - Evo dashboard CRUD     /evo-api/api/v1/skills/*    (skill rows,
 *                                                          graph, import,
 *                                                          drift)
 *   - SkillRAE retrieval     /platform/skills/rae/v1/*   (subunits,
 *                                                          communities,
 *                                                          compile, search)
 *
 * Routing: Caddy on the Pi has dedicated matcher blocks for both. For
 * local dev, vite.config.ts proxies /evo-api and /platform/skills/rae
 * to their respective ports.
 *
 * Auth split: the shared axios client attaches a Bearer token for
 * platform routes; evo-api gets its bearer injected by Caddy. We use
 * bare fetch() here to dodge the double-bearer problem (same pattern
 * Memory uses).
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

const EVO_BASE = "/evo-api/api/v1";
const RAE_BASE = "/platform/skills/rae";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("Content-Type") ?? "";
  const parsed = ct.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    const msg =
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      typeof (parsed as { error: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return parsed as T;
}

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface Skill {
  id: string;
  name: string;
  description: string;
  body: string;
  when_to_use?: string;
  example?: string;
  community?: string;
  community_id?: string;
  tags: string[];
  depends_on: string[];
  origin: string;
  source_url?: string;
  source_sha?: string;
  source_checked_at?: string;
  drift_detected?: boolean;
  r2r_document_id?: string;
  r2r_corpus_id?: string;
  rae_indexed_at?: string;
  created_at: string;
  updated_at: string;
  usage_count?: number;
}

export interface SkillInput {
  name: string;
  description: string;
  body: string;
  when_to_use?: string;
  example?: string;
  community?: string;
  tags?: string[];
  depends_on?: string[];
}

export interface SkillListFilters {
  q?: string;
  community?: string;
  origin?: string;
  tag?: string;
}

export interface GraphNode {
  id: string;
  name: string;
  community?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: string;
}

export interface SkillsGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  r2r_available: boolean;
  note?: string;
}

export interface SkillsFlatHit {
  skill_id: string;
  skill_name: string;
  chunk_kind?: string;
  score: number;
  text: string;
  community?: string;
  tags?: string[];
  document_id?: string;
}

/* ── SkillRAE types ─────────────────────────────────────────────────────── */

export interface RAESelectedSkill {
  skill_id: string;
  name: string;
  description: string;
  score: number;
  l1: number;
  l0: number;
  name_score: number;
  boosted: boolean;
  community_id?: string;
}

export interface RAEHighlight {
  subunit_id: string;
  content: string;
  kind: string;
  similarity: number;
}

export interface RAERescue {
  subunit_id: string;
  source_skill_id: string;
  content: string;
  kind: string;
  similarity: number;
}

export interface RAEAttachedCue {
  host_skill_id: string;
  source_skill_id: string;
  subunit: string;
  kind: string;
  aff_score: number;
}

export interface RAESkippedCue {
  subunit_id?: string;
  reason: string;
}

export interface RAEDiagnostics {
  stage_ms: Record<string, number>;
  top_down_labels: string[];
  bottom_up_hits: number;
  l1_hits: number;
}

export interface RAESearchResponse {
  selected_skills: RAESelectedSkill[];
  highlights: Record<string, RAEHighlight[]>;
  rescue_candidates: RAERescue[];
  diagnostics: RAEDiagnostics;
}

export interface RAECompileResponse {
  context: string;
  selected_skills: RAESelectedSkill[];
  rescue_attached: RAEAttachedCue[];
  skipped_cues: RAESkippedCue[];
  diagnostics: RAEDiagnostics;
}

export interface SkillCommunity {
  id: string;
  label: string;
  representative_text: string;
  member_count: number;
  computed_at: string;
}

export interface SubunitRow {
  id: string;
  content: string;
  kind: "procedural" | "element" | "constraint";
  length: number;
  idf: number;
  line_no?: number;
  edge_count: number;
}

export interface CommunitySkillRow {
  id: string;
  name: string;
  description: string;
  origin: string;
  drift_detected: boolean;
  rae_indexed_at?: string;
}

/* ── Imperative API ────────────────────────────────────────────────────── */

export const skillsApi = {
  list: (filters: SkillListFilters = {}) => {
    const qs = new URLSearchParams();
    if (filters.q) qs.set("q", filters.q);
    if (filters.community) qs.set("community", filters.community);
    if (filters.origin) qs.set("origin", filters.origin);
    if (filters.tag) qs.set("tag", filters.tag);
    const suffix = qs.toString() ? `?${qs}` : "";
    return jsonFetch<Skill[]>(`${EVO_BASE}/skills${suffix}`);
  },

  get: (id: string) =>
    jsonFetch<Skill>(`${EVO_BASE}/skills/${encodeURIComponent(id)}`),

  create: (input: SkillInput) =>
    jsonFetch<Skill>(`${EVO_BASE}/skills`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  update: (id: string, input: Partial<SkillInput>) =>
    jsonFetch<Skill>(`${EVO_BASE}/skills/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  remove: (id: string) =>
    jsonFetch<void>(`${EVO_BASE}/skills/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  flatSearch: (query: string, limit = 5) =>
    jsonFetch<{ hits: SkillsFlatHit[] }>(`${EVO_BASE}/skills/search`, {
      method: "POST",
      body: JSON.stringify({ query, limit }),
    }),

  graph: () => jsonFetch<SkillsGraph>(`${EVO_BASE}/skills/graph`),

  checkSource: (id: string) =>
    jsonFetch<{ drift_detected: boolean; message: string }>(
      `${EVO_BASE}/skills/${encodeURIComponent(id)}/check-source`,
      { method: "POST" },
    ),

  /* ── SkillRAE side ──────────────────────────────────────────────── */

  raeSearch: (
    query: string,
    opts: { top_k?: number; top_down_n?: number; bottom_up_n?: number } = {},
  ) =>
    jsonFetch<RAESearchResponse>(`${RAE_BASE}/v1/rae/search`, {
      method: "POST",
      body: JSON.stringify({ query, ...opts }),
    }),

  raeCompile: (
    query: string,
    opts: {
      top_k?: number;
      budget_tokens?: number;
      output_contract?: string;
    } = {},
  ) =>
    jsonFetch<RAECompileResponse>(`${RAE_BASE}/v1/rae/compile`, {
      method: "POST",
      body: JSON.stringify({ query, ...opts }),
    }),

  raeCommunities: () =>
    jsonFetch<SkillCommunity[]>(`${RAE_BASE}/v1/rae/communities`),

  raeSubunits: (skillId: string) =>
    jsonFetch<SubunitRow[]>(
      `${RAE_BASE}/v1/rae/skill/${encodeURIComponent(skillId)}/subunits`,
    ),

  raeCommunitySkills: (communityId: string) =>
    jsonFetch<CommunitySkillRow[]>(
      `${RAE_BASE}/v1/rae/community/${encodeURIComponent(communityId)}/skills`,
    ),
};

/* ── Query keys ────────────────────────────────────────────────────────── */

export const skillsKeys = {
  all: ["skills"] as const,
  list: (filters: SkillListFilters) =>
    ["skills", "list", filters] as const,
  detail: (id: string) => ["skills", "detail", id] as const,
  graph: () => ["skills", "graph"] as const,
  raeCommunities: () => ["skills", "rae", "communities"] as const,
  raeSubunits: (id: string) => ["skills", "rae", "subunits", id] as const,
  raeCommunitySkills: (id: string) =>
    ["skills", "rae", "community", id, "skills"] as const,
  raeCompile: (q: string) => ["skills", "rae", "compile", q] as const,
};

/* ── TanStack Query hooks ──────────────────────────────────────────────── */

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T>, "queryKey" | "queryFn">;
type MutationOpts<TData, TVar> = Omit<
  UseMutationOptions<TData, Error, TVar>,
  "mutationFn"
>;

export function useSkills(
  filters: SkillListFilters = {},
  opts?: QueryOpts<Skill[]>,
) {
  return useQuery<Skill[], Error, Skill[]>({
    queryKey: skillsKeys.list(filters),
    queryFn: () => skillsApi.list(filters),
    staleTime: 15_000,
    ...opts,
  });
}

export function useSkill(id: string, opts?: QueryOpts<Skill>) {
  return useQuery<Skill, Error, Skill>({
    queryKey: skillsKeys.detail(id),
    queryFn: () => skillsApi.get(id),
    enabled: id.length > 0,
    staleTime: 30_000,
    ...opts,
  });
}

export function useSkillsGraph(opts?: QueryOpts<SkillsGraph>) {
  return useQuery<SkillsGraph, Error, SkillsGraph>({
    queryKey: skillsKeys.graph(),
    queryFn: () => skillsApi.graph(),
    staleTime: 30_000,
    ...opts,
  });
}

export function useRAECommunities(opts?: QueryOpts<SkillCommunity[]>) {
  return useQuery<SkillCommunity[], Error, SkillCommunity[]>({
    queryKey: skillsKeys.raeCommunities(),
    queryFn: () => skillsApi.raeCommunities(),
    staleTime: 60_000,
    ...opts,
  });
}

export function useRAESubunits(
  skillId: string,
  opts?: QueryOpts<SubunitRow[]>,
) {
  return useQuery<SubunitRow[], Error, SubunitRow[]>({
    queryKey: skillsKeys.raeSubunits(skillId),
    queryFn: () => skillsApi.raeSubunits(skillId),
    enabled: skillId.length > 0,
    staleTime: 30_000,
    ...opts,
  });
}

export function useRAECommunitySkills(
  communityId: string,
  opts?: QueryOpts<CommunitySkillRow[]>,
) {
  return useQuery<CommunitySkillRow[], Error, CommunitySkillRow[]>({
    queryKey: skillsKeys.raeCommunitySkills(communityId),
    queryFn: () => skillsApi.raeCommunitySkills(communityId),
    enabled: communityId.length > 0,
    staleTime: 30_000,
    ...opts,
  });
}

export function useCreateSkill(opts?: MutationOpts<Skill, SkillInput>) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<Skill, Error, SkillInput>({
    ...opts,
    mutationFn: (input) => skillsApi.create(input),
    onSuccess: (data, vars, ctx, m) => {
      qc.invalidateQueries({ queryKey: ["skills", "list"] });
      userOnSuccess?.(data, vars, ctx, m);
    },
  });
}

export type PatchSkillVars = { id: string; input: Partial<SkillInput> };

export function usePatchSkill(opts?: MutationOpts<Skill, PatchSkillVars>) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<Skill, Error, PatchSkillVars>({
    ...opts,
    mutationFn: (vars) => skillsApi.update(vars.id, vars.input),
    onSuccess: (data, vars, ctx, m) => {
      qc.invalidateQueries({ queryKey: ["skills", "list"] });
      qc.invalidateQueries({ queryKey: skillsKeys.detail(vars.id) });
      userOnSuccess?.(data, vars, ctx, m);
    },
  });
}

export function useDeleteSkill(opts?: MutationOpts<void, string>) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<void, Error, string>({
    ...opts,
    mutationFn: (id) => skillsApi.remove(id),
    onSuccess: (data, vars, ctx, m) => {
      qc.invalidateQueries({ queryKey: ["skills", "list"] });
      userOnSuccess?.(data, vars, ctx, m);
    },
  });
}

export function useCheckSkillSource(opts?: MutationOpts<{ drift_detected: boolean; message: string }, string>) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<{ drift_detected: boolean; message: string }, Error, string>({
    ...opts,
    mutationFn: (id) => skillsApi.checkSource(id),
    onSuccess: (data, vars, ctx, m) => {
      qc.invalidateQueries({ queryKey: ["skills", "list"] });
      qc.invalidateQueries({ queryKey: skillsKeys.detail(vars) });
      userOnSuccess?.(data, vars, ctx, m);
    },
  });
}

export function useRAECompileMutation(
  opts?: MutationOpts<
    RAECompileResponse,
    { query: string; top_k?: number; budget_tokens?: number; output_contract?: string }
  >,
) {
  return useMutation({
    ...opts,
    mutationFn: ({ query, ...rest }) => skillsApi.raeCompile(query, rest),
  });
}

export function useRAESearchMutation(
  opts?: MutationOpts<
    RAESearchResponse,
    { query: string; top_k?: number; bottom_up_n?: number }
  >,
) {
  return useMutation({
    ...opts,
    mutationFn: ({ query, ...rest }) => skillsApi.raeSearch(query, rest),
  });
}
