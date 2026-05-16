/**
 * Typed hooks for the nano-research service.
 *
 * Backend lives at nano-research:7378 on the Pi; Caddy proxies the
 * /api/v1/nano/* path through. We use bare fetch() (not the shared axios
 * client) to dodge the platform/evo-api double-bearer issue the Skills
 * + Memory pages also avoid.
 */
import { useEffect, useReducer, useRef } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

import { useEventSource } from "../hooks/useEventSource";

const NANO_BASE = "/api/v1/nano";

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

export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type Stage =
  | "IDEATION"
  | "PLANNING"
  | "SETUP"
  | "CODING"
  | "EXECUTION"
  | "ANALYSIS"
  | "FIGURE_GEN"
  | "WRITING"
  | "REVIEW";

export const STAGES: Stage[] = [
  "IDEATION",
  "PLANNING",
  "SETUP",
  "CODING",
  "EXECUTION",
  "ANALYSIS",
  "FIGURE_GEN",
  "WRITING",
  "REVIEW",
];

export type ModelKind = "closed" | "open";

export interface ResearchRun {
  id: string;
  topic: string;
  profile: string;
  status: RunStatus;
  session_id: string;
  workspace: string;
  workflow_id?: string;
  started_at: string;
  completed_at?: string;
}

export interface ArtifactRow {
  id: string;
  stage: Stage;
  kind: "markdown" | "code" | "figure" | "pdf" | "json" | "tex" | "log";
  name: string;
  path: string;
  bytes: number;
  trace_id?: string;
  created_at: string;
}

export interface TraceRow {
  id: string;
  stage?: Stage;
  model_id: string;
  model_family: string;
  model_kind: ModelKind;
  trainable: boolean;
  previous_trace_id?: string;
  skill_context?: string;
  memory_context?: string;
  prompt: string;
  response: string;
  input_tokens?: number;
  output_tokens?: number;
  latency_ms?: number;
  created_at: string;
}

export interface CreateRunInput {
  topic: string;
  profile?: "local_quick" | "blackwell_full" | "fast_draft";
}

export interface CorrectStageInput {
  runId: string;
  stage: Stage;
  note: string;
  previous_trace_id?: string;
}

export const nanoKeys = {
  all: ["nano"] as const,
  runs: (status?: string) => ["nano", "runs", status ?? "any"] as const,
  run: (id: string) => ["nano", "run", id] as const,
  artifacts: (id: string) => ["nano", "run", id, "artifacts"] as const,
  traces: (id: string) => ["nano", "run", id, "traces"] as const,
  distillRuns: () => ["nano", "distill", "runs"] as const,
  distillRun: (id: string) => ["nano", "distill", "run", id] as const,
};

export type DistillRunStatus =
  | "pending"
  | "dataprep"
  | "training"
  | "eval"
  | "promoted"
  | "rejected"
  | "failed";

export interface DistillRun {
  id: string;
  parent_model_id: string;
  new_model_id?: string;
  status: DistillRunStatus;
  sample_count?: number;
  eval_old_mean?: number;
  eval_new_mean?: number;
  eval_delta?: number;
  adapter_path?: string;
  error?: string;
  started_at: string;
  completed_at?: string;
}

export interface TriggerDistillInput {
  parent_model_id?: string;
  new_model_id?: string;
  min_samples?: number;
  threshold?: number;
  base_checkpoint_path?: string;
  output_adapter_path?: string;
}

export interface TriggerDistillResponse {
  distill_run_id: string;
  workflow_id: string;
}

export function nanoArtifactUrl(runId: string, name: string): string {
  return `${NANO_BASE}/runs/${runId}/artifacts/${encodeURIComponent(name)}`;
}
export function nanoEventsUrl(runId: string): string {
  return `${NANO_BASE}/runs/${runId}/events`;
}

export function useNanoRuns(
  status?: string,
  options?: Omit<UseQueryOptions<ResearchRun[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery<ResearchRun[], Error>({
    queryKey: nanoKeys.runs(status),
    queryFn: () => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      return jsonFetch<ResearchRun[]>(`${NANO_BASE}/runs${qs}`);
    },
    refetchInterval: 5000,
    ...(options ?? {}),
  });
}

export function useNanoRun(
  id: string | null,
  options?: Omit<UseQueryOptions<ResearchRun, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<ResearchRun, Error>({
    queryKey: nanoKeys.run(id ?? ""),
    queryFn: () => jsonFetch<ResearchRun>(`${NANO_BASE}/runs/${id}`),
    enabled: !!id,
    ...(options ?? {}),
  });
}

export function useNanoArtifacts(id: string | null) {
  return useQuery<ArtifactRow[], Error>({
    queryKey: nanoKeys.artifacts(id ?? ""),
    queryFn: () => jsonFetch<ArtifactRow[]>(`${NANO_BASE}/runs/${id}/artifacts`),
    enabled: !!id,
  });
}

export function useNanoTraces(id: string | null) {
  return useQuery<TraceRow[], Error>({
    queryKey: nanoKeys.traces(id ?? ""),
    queryFn: () => jsonFetch<TraceRow[]>(`${NANO_BASE}/runs/${id}/traces`),
    enabled: !!id,
  });
}

export function useNanoArtifactText(runId: string | null, name: string | null) {
  return useQuery<string, Error>({
    queryKey: ["nano", "artifact-text", runId ?? "", name ?? ""],
    queryFn: async () => {
      const res = await fetch(nanoArtifactUrl(runId!, name!));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
    enabled: !!runId && !!name,
  });
}

export function useCreateNanoRun() {
  const qc = useQueryClient();
  return useMutation<ResearchRun, Error, CreateRunInput>({
    mutationFn: (input) =>
      jsonFetch<ResearchRun>(`${NANO_BASE}/runs`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nano", "runs"] });
    },
  });
}

/**
 * Phase P: structured SSE events.
 *
 * Backend emits one of these named events via Postgres NOTIFY → SSE.
 * The SPA used to invalidate the whole run query on every event; now we
 * dispatch into a reducer so stage chips repaint in O(1) without a
 * refetch round-trip. The full-query invalidation only fires on
 * `run.completed` (or as a fallback after `change` from the legacy
 * polling path while the new migration is unevenly deployed).
 */
export type NanoEvent =
  | { type: "hello"; run_id: string }
  | { type: "heartbeat"; at: string }
  | { type: "run.started"; topic?: string; profile?: string }
  | { type: "stage.started"; stage: Stage }
  | {
      type: "stage.finished";
      stage: Stage;
      artifact_count?: number;
      trace_id?: string;
      failed?: boolean;
      error?: string;
      skipped?: boolean;
    }
  | {
      type: "run.completed";
      status?: RunStatus;
      artifact_count?: number;
      failed_stages?: string[];
    }
  | { type: "change"; status?: RunStatus; artifacts?: number }
  | { type: "done"; status?: RunStatus };

/**
 * Live, in-flight stage status the parent workflow has signalled via
 * NOTIFY but the polled query hasn't yet caught up to. Keys are stage
 * names; values describe the latest known phase. The SPA merges this
 * map over the polled `artifacts`/`traces` view so the UI feels
 * instantaneous even when the artifact insert lands a beat after the
 * stage.finished notification.
 */
export type LiveStageStatus = "running" | "done" | "failed" | "skipped";
export interface LiveStage {
  status: LiveStageStatus;
  trace_id?: string;
  artifact_count?: number;
  error?: string;
}
export type LiveStages = Partial<Record<Stage, LiveStage>>;

interface NanoLiveState {
  runStatus: RunStatus | null;
  liveStages: LiveStages;
  lastEventAt: number; // ms since epoch; used by fallback gating
}

function nanoLiveReducer(state: NanoLiveState, ev: NanoEvent): NanoLiveState {
  const ts = Date.now();
  switch (ev.type) {
    case "hello":
    case "heartbeat":
      return { ...state, lastEventAt: ts };
    case "run.started":
      return { ...state, runStatus: "running", lastEventAt: ts };
    case "stage.started":
      return {
        ...state,
        lastEventAt: ts,
        liveStages: {
          ...state.liveStages,
          [ev.stage]: { ...(state.liveStages[ev.stage] ?? {}), status: "running" },
        },
      };
    case "stage.finished":
      return {
        ...state,
        lastEventAt: ts,
        liveStages: {
          ...state.liveStages,
          [ev.stage]: {
            status: ev.failed ? "failed" : ev.skipped ? "skipped" : "done",
            trace_id: ev.trace_id || state.liveStages[ev.stage]?.trace_id,
            artifact_count: ev.artifact_count,
            error: ev.error,
          },
        },
      };
    case "run.completed":
      return {
        ...state,
        lastEventAt: ts,
        runStatus: ev.status ?? "completed",
      };
    case "change":
      return {
        ...state,
        lastEventAt: ts,
        runStatus: ev.status ?? state.runStatus,
      };
    case "done":
      return {
        ...state,
        lastEventAt: ts,
        runStatus: ev.status ?? state.runStatus,
      };
    default:
      return state;
  }
}

/**
 * Subscribe to the structured SSE stream for a run.
 *
 * Returns a `liveStages` map the page overlays on the polled stage view
 * for instant feedback. Heavy data (artifacts/traces) is still fetched
 * via TanStack queries; this hook just nudges the page to refetch at
 * the right moments instead of every second.
 *
 * Fallback: if no SSE event has been seen in the last 60s (legacy
 * backend, dropped connection, migration not applied), the hook
 * preserves the original "invalidate on change" behaviour by listening
 * for the legacy `change` event.
 */
export function useNanoEvents(runId: string | null): {
  liveStages: LiveStages;
  runStatus: RunStatus | null;
  hasLiveEvents: boolean;
} {
  const qc = useQueryClient();
  const [state, dispatch] = useReducer(nanoLiveReducer, {
    runStatus: null,
    liveStages: {},
    lastEventAt: 0,
  });
  // Stash the latest run id in a ref so the SSE callback always invalidates
  // the right query key even after the closure was captured.
  const runIdRef = useRef<string | null>(runId);
  useEffect(() => {
    runIdRef.current = runId;
  }, [runId]);

  useEventSource(runId ? nanoEventsUrl(runId) : null, (eventName, data) => {
    let parsed: Record<string, unknown> = {};
    if (data) {
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = {};
      }
    }
    const ev = { type: eventName, ...parsed } as NanoEvent;
    dispatch(ev);
    const id = runIdRef.current;
    if (!id) return;
    // Only the events that imply an authoritative state change in the
    // server-side queries trigger a refetch.
    if (
      eventName === "stage.finished" ||
      eventName === "run.completed" ||
      eventName === "change" ||
      eventName === "done"
    ) {
      qc.invalidateQueries({ queryKey: nanoKeys.artifacts(id) });
      qc.invalidateQueries({ queryKey: nanoKeys.traces(id) });
      qc.invalidateQueries({ queryKey: nanoKeys.run(id) });
      qc.invalidateQueries({ queryKey: ["nano", "runs"] });
    }
  });

  const hasLiveEvents = state.lastEventAt > 0 && Date.now() - state.lastEventAt < 60_000;
  return {
    liveStages: state.liveStages,
    runStatus: state.runStatus,
    hasLiveEvents,
  };
}

export function useCorrectStage() {
  const qc = useQueryClient();
  return useMutation<
    { trace_id: string; stage: Stage },
    Error,
    CorrectStageInput
  >({
    mutationFn: ({ runId, stage, note, previous_trace_id }) =>
      jsonFetch(`${NANO_BASE}/runs/${runId}/stages/${stage}/correct`, {
        method: "POST",
        body: JSON.stringify({ note, previous_trace_id }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: nanoKeys.run(vars.runId) });
      qc.invalidateQueries({ queryKey: nanoKeys.traces(vars.runId) });
    },
  });
}

// ── Phase Q: self-distillation hooks ──────────────────────────────

export function useDistillRuns(
  options?: Omit<UseQueryOptions<DistillRun[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery<DistillRun[], Error>({
    queryKey: nanoKeys.distillRuns(),
    queryFn: () => jsonFetch<DistillRun[]>(`${NANO_BASE}/distill/runs`),
    refetchInterval: 10000,
    ...(options ?? {}),
  });
}

export function useDistillRun(
  id: string | null,
  options?: Omit<UseQueryOptions<DistillRun, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<DistillRun, Error>({
    queryKey: nanoKeys.distillRun(id ?? ""),
    queryFn: () => jsonFetch<DistillRun>(`${NANO_BASE}/distill/runs/${id}`),
    enabled: !!id,
    ...(options ?? {}),
  });
}

export function useTriggerDistill() {
  const qc = useQueryClient();
  return useMutation<TriggerDistillResponse, Error, TriggerDistillInput>({
    mutationFn: (input) =>
      jsonFetch<TriggerDistillResponse>(`${NANO_BASE}/distill/trigger`, {
        method: "POST",
        body: JSON.stringify(input ?? {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nanoKeys.distillRuns() });
    },
  });
}
