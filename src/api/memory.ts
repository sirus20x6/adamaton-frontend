/**
 * Typed wrappers + TanStack Query hooks for the evo-api memory endpoints.
 *
 * Routing:
 *   - Frontend hits `/evo-api/api/v1/memory/...`.
 *   - Caddy on the Pi strips `/evo-api` and injects `Authorization: Bearer <token>`
 *     before proxying to `evo-api:9123`.
 *   - For local dev `vite.config.ts` proxies `/evo-api` to localhost:9123 with
 *     the same prefix-strip via `rewrite`.
 *
 * Auth split:
 *   The shared axios wrapper in `client.ts` attaches `Authorization: Bearer
 *   <localStorage.token>` on every request. For evo-api we don't want that —
 *   Caddy injects its own bearer token and the client token would override
 *   it. So this module uses a bare `fetch` instead of `api.get/post/...`.
 *   The platform endpoints continue to use the wrapper as before.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

const BASE = "/evo-api/api/v1";

async function rawFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
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

export interface MemorySource {
  key: string;
  label: string;
  kind: "files" | "file" | "postgres";
  count: number;
  last_modified?: string;
  path?: string;
  available: boolean;
  note?: string;
}

export interface MemoryItem {
  id: string;
  agent: string;
  scope?: string;
  name: string;
  description: string;
  type?: string;
  body?: string;
  path: string;
  last_modified: string;
  has_matter: boolean;
}

export interface MemoryInsight {
  id: number;
  domain: string;
  title: string;
  body: string;
  tags: string[];
  has_embedding: boolean;
  source_program_id?: number;
  created_at: string;
}

export interface MemoryEntity {
  id: string;
  parent_id: string;
  name: string;
  category: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface MemoryRelationship {
  id: string;
  parent_id: string;
  subject: string;
  predicate: string;
  object: string;
  description: string;
  weight: number;
  created_at: string;
  updated_at: string;
}

export interface MemoryWriteInput {
  name?: string;
  description?: string;
  type?: string;
  scope?: string;
  body?: string;
}

/* ── Imperative API ────────────────────────────────────────────────────── */

export const memoryApi = {
  listSources: () => rawFetch<MemorySource[]>("/memory/sources"),

  listAgent: (agent: string) =>
    rawFetch<MemoryItem[]>(
      `/memory/agents/${encodeURIComponent(agent)}/items`,
    ),

  getItem: (agent: string, id: string) =>
    rawFetch<MemoryItem>(
      `/memory/agents/${encodeURIComponent(agent)}/items/${encodeURIComponent(id)}`,
    ),

  createItem: (agent: string, input: MemoryWriteInput) =>
    rawFetch<MemoryItem>(
      `/memory/agents/${encodeURIComponent(agent)}/items`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    ),

  updateItem: (agent: string, id: string, input: MemoryWriteInput) =>
    rawFetch<MemoryItem>(
      `/memory/agents/${encodeURIComponent(agent)}/items/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    ),

  deleteItem: (agent: string, id: string) =>
    rawFetch<void>(
      `/memory/agents/${encodeURIComponent(agent)}/items/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),

  listInsights: (q = "", limit = 200) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    qs.set("limit", String(limit));
    return rawFetch<MemoryInsight[]>(`/memory/insights?${qs}`);
  },

  createInsight: (input: {
    domain: string;
    title: string;
    body: string;
    tags?: string[];
  }) =>
    rawFetch<MemoryInsight>("/memory/insights", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateInsight: (
    id: number,
    input: {
      domain?: string;
      title?: string;
      body?: string;
      tags?: string[];
    },
  ) =>
    rawFetch<MemoryInsight>(`/memory/insights/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteInsight: (id: number) =>
    rawFetch<void>(`/memory/insights/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  listEntities: (q = "", limit = 200) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    qs.set("limit", String(limit));
    return rawFetch<MemoryEntity[]>(`/memory/entities?${qs}`);
  },

  updateEntity: (
    id: string,
    input: { description?: string; category?: string },
  ) =>
    rawFetch<MemoryEntity>(`/memory/entities/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteEntity: (id: string) =>
    rawFetch<void>(`/memory/entities/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  listRelationships: (q = "", limit = 200) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    qs.set("limit", String(limit));
    return rawFetch<MemoryRelationship[]>(`/memory/relationships?${qs}`);
  },

  updateRelationship: (
    id: string,
    input: { predicate?: string; description?: string; weight?: number },
  ) =>
    rawFetch<MemoryRelationship>(
      `/memory/relationships/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    ),

  deleteRelationship: (id: string) =>
    rawFetch<void>(`/memory/relationships/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};

/* ── Query keys ────────────────────────────────────────────────────────── */

export const memoryKeys = {
  all: ["memory"] as const,
  sources: () => ["memory", "sources"] as const,
  agent: (agent: string) => ["memory", "agent", agent] as const,
  agentItem: (agent: string, id: string) =>
    ["memory", "agent", agent, id] as const,
  insights: (q = "") => ["memory", "insights", q] as const,
  entities: (q = "") => ["memory", "entities", q] as const,
  relationships: (q = "") => ["memory", "relationships", q] as const,
};

/* ── TanStack Query hooks ──────────────────────────────────────────────── */

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T>, "queryKey" | "queryFn">;
type MutationOpts<TData, TVar> = Omit<
  UseMutationOptions<TData, Error, TVar>,
  "mutationFn"
>;

export function useMemorySources(opts?: QueryOpts<MemorySource[]>) {
  return useQuery<MemorySource[], Error, MemorySource[]>({
    queryKey: memoryKeys.sources(),
    queryFn: () => memoryApi.listSources(),
    staleTime: 30_000,
    ...opts,
  });
}

export function useMemoryItems(agent: string, opts?: QueryOpts<MemoryItem[]>) {
  return useQuery<MemoryItem[], Error, MemoryItem[]>({
    queryKey: memoryKeys.agent(agent),
    queryFn: () => memoryApi.listAgent(agent),
    enabled: agent.length > 0,
    staleTime: 15_000,
    ...opts,
  });
}

export function useMemoryItem(
  agent: string,
  id: string,
  opts?: QueryOpts<MemoryItem>,
) {
  return useQuery<MemoryItem, Error, MemoryItem>({
    queryKey: memoryKeys.agentItem(agent, id),
    queryFn: () => memoryApi.getItem(agent, id),
    enabled: agent.length > 0 && id.length > 0,
    staleTime: 15_000,
    ...opts,
  });
}

export type CreateMemoryItemVars = {
  agent: string;
  input: MemoryWriteInput;
};

export function useCreateMemoryItem(
  opts?: MutationOpts<MemoryItem, CreateMemoryItemVars>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<MemoryItem, Error, CreateMemoryItemVars>({
    ...opts,
    mutationFn: (vars) => memoryApi.createItem(vars.agent, vars.input),
    onSuccess: (data, vars, ctx, m) => {
      qc.invalidateQueries({ queryKey: memoryKeys.sources() });
      qc.invalidateQueries({ queryKey: memoryKeys.agent(vars.agent) });
      userOnSuccess?.(data, vars, ctx, m);
    },
  });
}

export type PatchMemoryItemVars = {
  agent: string;
  id: string;
  input: MemoryWriteInput;
};

export function usePatchMemoryItem(
  opts?: MutationOpts<MemoryItem, PatchMemoryItemVars>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<MemoryItem, Error, PatchMemoryItemVars>({
    ...opts,
    mutationFn: (vars) =>
      memoryApi.updateItem(vars.agent, vars.id, vars.input),
    onSuccess: (data, vars, ctx, m) => {
      qc.invalidateQueries({ queryKey: memoryKeys.sources() });
      qc.invalidateQueries({ queryKey: memoryKeys.agent(vars.agent) });
      qc.invalidateQueries({
        queryKey: memoryKeys.agentItem(vars.agent, vars.id),
      });
      userOnSuccess?.(data, vars, ctx, m);
    },
  });
}

export type DeleteMemoryItemVars = {
  agent: string;
  id: string;
};

export function useDeleteMemoryItem(
  opts?: MutationOpts<void, DeleteMemoryItemVars>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<void, Error, DeleteMemoryItemVars>({
    ...opts,
    mutationFn: (vars) => memoryApi.deleteItem(vars.agent, vars.id),
    onSuccess: (data, vars, ctx, m) => {
      qc.invalidateQueries({ queryKey: memoryKeys.sources() });
      qc.invalidateQueries({ queryKey: memoryKeys.agent(vars.agent) });
      userOnSuccess?.(data, vars, ctx, m);
    },
  });
}

export function useMemoryInsights(
  q = "",
  opts?: QueryOpts<MemoryInsight[]>,
) {
  return useQuery<MemoryInsight[], Error, MemoryInsight[]>({
    queryKey: memoryKeys.insights(q),
    queryFn: () => memoryApi.listInsights(q),
    staleTime: 15_000,
    ...opts,
  });
}

export type CreateInsightVars = {
  domain: string;
  title: string;
  body: string;
  tags?: string[];
};

export function useCreateInsight(
  opts?: MutationOpts<MemoryInsight, CreateInsightVars>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<MemoryInsight, Error, CreateInsightVars>({
    ...opts,
    mutationFn: (vars) => memoryApi.createInsight(vars),
    onSuccess: (data, vars, ctx, m) => {
      qc.invalidateQueries({ queryKey: memoryKeys.sources() });
      qc.invalidateQueries({ queryKey: ["memory", "insights"] });
      userOnSuccess?.(data, vars, ctx, m);
    },
  });
}

export type PatchInsightVars = {
  id: number;
  input: {
    domain?: string;
    title?: string;
    body?: string;
    tags?: string[];
  };
};

export function usePatchInsight(
  opts?: MutationOpts<MemoryInsight, PatchInsightVars>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<MemoryInsight, Error, PatchInsightVars>({
    ...opts,
    mutationFn: (vars) => memoryApi.updateInsight(vars.id, vars.input),
    onSuccess: (data, vars, ctx, m) => {
      qc.invalidateQueries({ queryKey: ["memory", "insights"] });
      userOnSuccess?.(data, vars, ctx, m);
    },
  });
}

export function useDeleteInsight(opts?: MutationOpts<void, number>) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<void, Error, number>({
    ...opts,
    mutationFn: (id) => memoryApi.deleteInsight(id),
    onSuccess: (data, vars, ctx, m) => {
      qc.invalidateQueries({ queryKey: memoryKeys.sources() });
      qc.invalidateQueries({ queryKey: ["memory", "insights"] });
      userOnSuccess?.(data, vars, ctx, m);
    },
  });
}

export function useMemoryEntities(q = "", opts?: QueryOpts<MemoryEntity[]>) {
  return useQuery<MemoryEntity[], Error, MemoryEntity[]>({
    queryKey: memoryKeys.entities(q),
    queryFn: () => memoryApi.listEntities(q),
    staleTime: 15_000,
    ...opts,
  });
}

export type PatchEntityVars = {
  id: string;
  input: { description?: string; category?: string };
};

export function usePatchEntity(
  opts?: MutationOpts<MemoryEntity, PatchEntityVars>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<MemoryEntity, Error, PatchEntityVars>({
    ...opts,
    mutationFn: (vars) => memoryApi.updateEntity(vars.id, vars.input),
    onSuccess: (data, vars, ctx, m) => {
      qc.invalidateQueries({ queryKey: ["memory", "entities"] });
      userOnSuccess?.(data, vars, ctx, m);
    },
  });
}

export function useDeleteEntity(opts?: MutationOpts<void, string>) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<void, Error, string>({
    ...opts,
    mutationFn: (id) => memoryApi.deleteEntity(id),
    onSuccess: (data, vars, ctx, m) => {
      qc.invalidateQueries({ queryKey: memoryKeys.sources() });
      qc.invalidateQueries({ queryKey: ["memory", "entities"] });
      userOnSuccess?.(data, vars, ctx, m);
    },
  });
}

export function useMemoryRelationships(
  q = "",
  opts?: QueryOpts<MemoryRelationship[]>,
) {
  return useQuery<MemoryRelationship[], Error, MemoryRelationship[]>({
    queryKey: memoryKeys.relationships(q),
    queryFn: () => memoryApi.listRelationships(q),
    staleTime: 15_000,
    ...opts,
  });
}

export type PatchRelationshipVars = {
  id: string;
  input: { predicate?: string; description?: string; weight?: number };
};

export function usePatchRelationship(
  opts?: MutationOpts<MemoryRelationship, PatchRelationshipVars>,
) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<MemoryRelationship, Error, PatchRelationshipVars>({
    ...opts,
    mutationFn: (vars) => memoryApi.updateRelationship(vars.id, vars.input),
    onSuccess: (data, vars, ctx, m) => {
      qc.invalidateQueries({ queryKey: ["memory", "relationships"] });
      userOnSuccess?.(data, vars, ctx, m);
    },
  });
}

export function useDeleteRelationship(opts?: MutationOpts<void, string>) {
  const qc = useQueryClient();
  const userOnSuccess = opts?.onSuccess;
  return useMutation<void, Error, string>({
    ...opts,
    mutationFn: (id) => memoryApi.deleteRelationship(id),
    onSuccess: (data, vars, ctx, m) => {
      qc.invalidateQueries({ queryKey: memoryKeys.sources() });
      qc.invalidateQueries({ queryKey: ["memory", "relationships"] });
      userOnSuccess?.(data, vars, ctx, m);
    },
  });
}
