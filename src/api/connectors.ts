/**
 * Workflow-node catalog. Read-only view onto the plugin loader's three
 * trees (builtin / community / n8n), surfaced for the Connectors page.
 *
 * The dashboard apiserver already exposes the catalog via
 *   GET /api/v1/workflows/activities/extended
 * (workflow_endpoints.go:62 — listExtendedActivities). It returns the full
 * PluginNode shape — properties, executor config, output_type — which the
 * page uses today and which Phase 2 will use for client-side
 * type-compatibility graphs without an API revision.
 *
 * Routing: same /evo-api prefix as skills (Caddy reverse-proxies the
 * dashboard apiserver). We use bare fetch via jsonFetch to dodge the
 * double-bearer problem the axios client introduces — Caddy injects the
 * evo-api bearer for us.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

const EVO_BASE = "/evo-api/api/v1";

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

/* ── Types ──────────────────────────────────────────────────────────────
 *
 * Mirrors evolve/workflow-builder/pluginloader/types.go. Keep these in
 * sync with the Go json tags — contract is locked in by
 * platform/dashboard/apiserver/extended_activities_test.go.
 */

export type NodeSource = "builtin" | "community" | "n8n";

export type ExecutorKind =
  | "go_function"
  | "agent_prompt"
  | "http_request"
  | "n8n_bridge"
  | (string & {});

export interface PropertyOption {
  name: string;
  value: unknown;
  description?: string;
}

export interface DisplayOptions {
  show?: Record<string, unknown[]>;
  hide?: Record<string, unknown[]>;
}

export interface NodeProperty {
  name: string;
  displayName: string;
  type: string;
  default?: unknown;
  required?: boolean;
  description?: string;
  placeholder?: string;
  options?: PropertyOption[];
  displayOptions?: DisplayOptions;
  subProperties?: NodeProperty[];
}

export interface CredentialRef {
  name: string;
  required: boolean;
}

export interface ExecutorConfig {
  type: ExecutorKind;
  function?: string;
  agent?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
  package?: string;
  nodeName?: string;
}

export interface WorkflowNode {
  name: string;
  displayName: string;
  description: string;
  category: string;
  icon?: string;
  iconType?: string;
  color?: string;
  version: number;
  properties: NodeProperty[];
  credentials?: CredentialRef[];
  executor: ExecutorConfig;
  prompt?: string;
  output_type: string;
  mutating?: boolean;
  source: NodeSource;
  parseErrors?: string[];
}

export interface CategoryMeta {
  id: string;
  label: string;
  icon?: string;
  color?: string;
  order: number;
}

export interface WorkflowCatalog {
  nodes: WorkflowNode[];
  categories: CategoryMeta[];
}

/* ── Hooks ──────────────────────────────────────────────────────────── */

export const WORKFLOW_NODES_KEY = ["workflow", "nodes"] as const;

export function useWorkflowCatalog(
  options?: Omit<UseQueryOptions<WorkflowCatalog>, "queryKey" | "queryFn">,
) {
  return useQuery<WorkflowCatalog>({
    queryKey: WORKFLOW_NODES_KEY,
    queryFn: async () => {
      // The apiserver wraps everything in {data, success, error}. Unwrap
      // here so callers only see the catalog. Falsy/empty data means an
      // empty catalog rather than an error — the page renders a hint.
      const resp = await jsonFetch<{
        success: boolean;
        data: WorkflowCatalog | null;
        error?: string;
      }>(`${EVO_BASE}/workflows/activities/extended`);
      if (!resp.success && resp.error) throw new Error(resp.error);
      return resp.data ?? { nodes: [], categories: [] };
    },
    // The catalog only changes on apiserver restart (loader reads on
    // boot). Stale-while-revalidate by minute is fine; no point polling.
    staleTime: 60_000,
    ...options,
  });
}
