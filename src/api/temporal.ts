/**
 * Typed client for the platform apiserver's /api/v1/schedules surface —
 * Temporal Schedule CRUD (list/create/get/update/delete + pause/unpause/
 * trigger). Reaches the same evo-api/platform-dashboard backend that
 * `src/api/evoSuite.ts` already targets; uses the same VITE_EVO_API_BASE
 * + Caddy /evo-api prefix-strip in prod.
 *
 * Two create-payload shapes via the `kind` discriminator:
 *
 *   - "delegation": delegator MCP's schedule_recurring_task fields
 *     (prompt, difficulty, priority, agent_hint, working_dir, model,
 *     timeout_secs). Backend builds a ScheduleWorkflowAction targeting
 *     DelegationWorkflow on the delegator-recurring task queue.
 *
 *   - "generic": workflow name + task queue + JSON args, for any other
 *     workflow the user wants on a cron.
 *
 * Mutations invalidate ["temporal", "schedules"] so the list refetches.
 * Toast feedback (success + error) is on the caller side via useToast
 * inside the mutation's onSuccess/onError — kept out of this file so
 * the hooks stay free of React UI state.
 */

import axios, { type AxiosInstance } from "axios";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

// Mirrors the convention in `evoSuite.ts`: empty/undefined env falls
// through to "/evo-api", the prefix Caddy proxies to the platform
// apiserver. Override via VITE_EVO_API_BASE only when the React bundle
// is hitting the apiserver cross-origin (rare; debugging only).
const EVO_BASE = import.meta.env.VITE_EVO_API_BASE || "/evo-api";

const temporalHttp: AxiosInstance = axios.create({
  baseURL: EVO_BASE,
  timeout: 15_000,
  headers: { Accept: "application/json", "Content-Type": "application/json" },
});

// Server envelope: { data: T, success: bool, error?: string }. Some
// endpoints return T directly (e.g. 204 on delete); unwrap collapses
// both shapes so callers see clean T.
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
  const r = await temporalHttp.get<unknown>(path);
  return unwrap<T>(r.data);
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const r = await temporalHttp.post<unknown>(path, body);
  return unwrap<T>(r.data);
}

async function put<T>(path: string, body?: unknown): Promise<T> {
  const r = await temporalHttp.put<unknown>(path, body);
  return unwrap<T>(r.data);
}

async function del(path: string): Promise<void> {
  await temporalHttp.delete(path);
}

// ── Types (mirror dashboard/apiserver/schedule_endpoints.go) ──────────

export type ScheduleKind = "delegation" | "generic";

export type DelegationSpec = {
  prompt: string;
  difficulty?: string;
  priority?: string;
  agent_hint?: string;
  working_dir?: string;
  model?: string;
  timeout_secs?: number;
};

export type GenericSpec = {
  workflow: string;
  task_queue: string;
  args_json?: string;
};

export type CreateScheduleRequest = {
  id: string;
  cron: string;
  note?: string;
  paused?: boolean;
  kind: ScheduleKind;
  delegation?: DelegationSpec;
  generic?: GenericSpec;
};

export type UpdateScheduleRequest = {
  cron: string;
  note?: string;
};

export type RunSummary = {
  started_at: string;
  workflow_id?: string;
};

export type ScheduleSummary = {
  id: string;
  cron: string;
  note?: string;
  paused: boolean;
  kind: ScheduleKind;
  workflow: string;
  task_queue?: string;
  next_run?: string;
  last_run?: RunSummary;
  recent_runs?: RunSummary[];
};

// The list endpoint wraps in {schedules: [...]} so the iterator vs
// single-row case is unambiguous on the wire.
type ListSchedulesPayload = { schedules: ScheduleSummary[] };
type SingleSchedulePayload = { schedule: ScheduleSummary };

// Standard query-key namespace. All mutations invalidate the root
// ["temporal", "schedules"] so list + single-row hooks both refetch.
const SCHEDULES_KEY = ["temporal", "schedules"] as const;

// ── Queries ───────────────────────────────────────────────────────────

export function useSchedules(refetchMs = 10_000) {
  return useQuery({
    queryKey: SCHEDULES_KEY,
    queryFn: async () => {
      const payload = await get<ListSchedulesPayload>("/api/v1/schedules");
      return payload.schedules ?? [];
    },
    refetchInterval: refetchMs,
    staleTime: refetchMs,
  });
}

export function useSchedule(id: string | null | undefined, refetchMs = 10_000) {
  return useQuery({
    queryKey: [...SCHEDULES_KEY, id ?? "__none__"],
    queryFn: async () => {
      const payload = await get<SingleSchedulePayload>(
        `/api/v1/schedules/${encodeURIComponent(id ?? "")}`,
      );
      return payload.schedule;
    },
    enabled: !!id,
    refetchInterval: refetchMs,
    staleTime: refetchMs,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: CreateScheduleRequest) => {
      const payload = await post<SingleSchedulePayload>("/api/v1/schedules", req);
      return payload.schedule;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SCHEDULES_KEY });
    },
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; req: UpdateScheduleRequest }) => {
      const payload = await put<SingleSchedulePayload>(
        `/api/v1/schedules/${encodeURIComponent(input.id)}`,
        input.req,
      );
      return payload.schedule;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SCHEDULES_KEY });
    },
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await del(`/api/v1/schedules/${encodeURIComponent(id)}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SCHEDULES_KEY });
    },
  });
}

export function usePauseSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await post(`/api/v1/schedules/${encodeURIComponent(id)}/pause`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SCHEDULES_KEY });
    },
  });
}

export function useUnpauseSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await post(`/api/v1/schedules/${encodeURIComponent(id)}/unpause`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SCHEDULES_KEY });
    },
  });
}

export function useTriggerSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await post(`/api/v1/schedules/${encodeURIComponent(id)}/trigger`);
    },
    onSuccess: (_data, id) => {
      // Invalidate the list + the per-schedule detail so the new
      // execution shows up in recent_runs on the next refetch.
      qc.invalidateQueries({ queryKey: SCHEDULES_KEY });
      qc.invalidateQueries({ queryKey: [...SCHEDULES_KEY, id] });
    },
  });
}

// ── Utilities ─────────────────────────────────────────────────────────

// errorMessage extracts a readable string from the various error shapes
// axios produces. Use in toast callbacks: toast({ description: errorMessage(err) }).
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (data && typeof data === "object" && "error" in data) {
      const m = (data as { error?: unknown }).error;
      if (typeof m === "string" && m.length > 0) return m;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
