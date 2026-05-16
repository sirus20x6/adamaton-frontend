/**
 * Typed client for the evo apiserver — the Go service that exposes
 * delegator quota, delegator tasks, evo runs/programs/insights, and
 * workflow definitions/runs. evo-api runs in its own container on
 * the Pi; the frontend reaches it through Caddy's /evo-api/* matcher
 * (prefix-strip + Bearer-token injection).
 *
 * Default base is "/evo-api" so the same bundle works in both:
 *
 *   - Dev (Vite on the workstation): vite.config.ts proxies
 *     /evo-api/* to a local evo-api with the same prefix-strip rewrite
 *     that Caddy does in prod.
 *   - Prod (Pi/Caddy): the @evoapi matcher strips /evo-api and adds
 *     the Bearer header before reverse_proxy to evo-api:9123.
 *
 * Override via VITE_EVO_API_BASE only when running the React bundle
 * against an evo-api that's NOT behind Caddy (e.g. direct workstation
 * cross-origin during a debugging session).
 */

import axios, { type AxiosInstance } from "axios";
import { useQuery } from "@tanstack/react-query";

const EVO_BASE = import.meta.env.VITE_EVO_API_BASE ?? "/evo-api";

const evoHttp: AxiosInstance = axios.create({
  baseURL: EVO_BASE,
  timeout: 10_000,
  headers: { Accept: "application/json" },
});

/**
 * Many of evo's delegator/workflow endpoints wrap payloads as
 * `{ success: true, data: T }` while the newer evo schema endpoints
 * return T directly. unwrap collapses the two shapes so callers can
 * write hooks against a clean T.
 */
function unwrap<T>(value: unknown): T {
  if (
    value &&
    typeof value === "object" &&
    "data" in value &&
    "success" in (value as Record<string, unknown>)
  ) {
    return (value as { data: T }).data;
  }
  return value as T;
}

async function get<T>(path: string): Promise<T> {
  const r = await evoHttp.get<unknown>(path);
  return unwrap<T>(r.data);
}

// ── Delegator quota ──────────────────────────────────────────────────

export type AgentQuota = {
  agent: string;
  apiType: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  model: string;
  utilization5h?: number;
  utilization7d?: number;
  resetTime5h?: string;
  resetTime7d?: string;
};

type DelegatorQuotaPayload = { agents: AgentQuota[] };

export function useDelegatorQuota(refetchMs = 5000) {
  return useQuery({
    queryKey: ["evoSuite", "delegator", "quota"],
    queryFn: () => get<DelegatorQuotaPayload>("/api/v1/delegator/quota"),
    refetchInterval: refetchMs,
    staleTime: refetchMs,
  });
}

// ── Delegator tasks ──────────────────────────────────────────────────

export type DelegatorTask = {
  id: string;
  agent: string;
  provider: string;
  difficulty?: string;
  priority?: string;
  prompt: string;
  working_dir?: string;
  model?: string;
  status: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  exit_code?: number;
  output?: string;
  error?: string;
};

export function useDelegatorTasks(refetchMs = 5000, limit = 20) {
  return useQuery({
    queryKey: ["evoSuite", "delegator", "tasks", limit],
    queryFn: () =>
      get<DelegatorTask[]>(`/api/v1/delegator/tasks?limit=${limit}`),
    refetchInterval: refetchMs,
    staleTime: refetchMs,
  });
}

// ── Workflow definitions ─────────────────────────────────────────────

export type WorkflowDefinition = {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
};

export function useWorkflowDefinitions(refetchMs = 10_000) {
  return useQuery({
    queryKey: ["evoSuite", "workflows", "definitions"],
    queryFn: () =>
      get<WorkflowDefinition[]>("/api/v1/workflows/definitions"),
    refetchInterval: refetchMs,
    staleTime: refetchMs,
  });
}

// ── Workflow runs (recent) ───────────────────────────────────────────

export type WorkflowRun = {
  id: string;
  definition_id: string;
  temporal_id: string;
  temporal_run: string;
  status: string;
  started_at: string;
  finished_at?: string;
};

export function useWorkflowRuns(refetchMs = 10_000, limit = 20) {
  return useQuery({
    queryKey: ["evoSuite", "workflows", "runs", limit],
    queryFn: () =>
      get<WorkflowRun[]>(`/api/v1/workflows/runs?limit=${limit}`),
    refetchInterval: refetchMs,
    staleTime: refetchMs,
  });
}

// ── Evo runs (the evolutionary loop) ─────────────────────────────────

export type EvoRun = {
  id: string;
  task_id: string;
  task_name: string;
  domain: string;
  status: string;
  started_at: string;
  finished_at?: string;
  num_programs: number;
  best_speedup?: number;
};

export function useEvoRuns(refetchMs = 10_000) {
  return useQuery({
    queryKey: ["evoSuite", "evo", "runs"],
    queryFn: () => get<EvoRun[]>("/api/v1/evo/runs"),
    refetchInterval: refetchMs,
    staleTime: refetchMs,
  });
}

// ── Evo programs for a run ───────────────────────────────────────────

export type EvoProgram = {
  id: number;
  parent_id?: number;
  generation: number;
  island: number;
  compiled: boolean;
  correct: boolean;
  speedup?: number;
  backend: string;
  created_at: string;
  metrics?: Record<string, unknown>;
};

export function useEvoRunPrograms(runId: string | null, refetchMs = 10_000) {
  return useQuery({
    queryKey: ["evoSuite", "evo", "runs", runId, "programs"],
    queryFn: () => get<EvoProgram[]>(`/api/v1/evo/runs/${runId}/programs`),
    enabled: !!runId,
    refetchInterval: refetchMs,
    staleTime: refetchMs,
  });
}

// ── Evo insights (cross-run lab notebook) ────────────────────────────

export type EvoInsight = {
  id: number;
  domain: string;
  title: string;
  body: string;
  tags: string[];
  has_embedding: boolean;
  source_program_id?: number;
  created_at: string;
};

export function useEvoInsights(refetchMs = 30_000) {
  return useQuery({
    queryKey: ["evoSuite", "evo", "insights"],
    queryFn: () => get<EvoInsight[]>("/api/v1/evo/insights"),
    refetchInterval: refetchMs,
    staleTime: refetchMs,
  });
}

// ── System status (cross-tool health) ────────────────────────────────

export type Subsystem = {
  name: string;
  status: "ok" | "degraded" | "offline" | string;
  detail?: string;
  url?: string;
  latency_ms: number;
  stats?: Record<string, unknown>;
};

export type SystemStatus = {
  generated_at: string;
  subsystems: Subsystem[];
};

export function useSystemStatus(refetchMs = 5000) {
  return useQuery({
    queryKey: ["evoSuite", "system", "status"],
    queryFn: () => get<SystemStatus>("/api/v1/system/status"),
    refetchInterval: refetchMs,
    staleTime: refetchMs,
  });
}
