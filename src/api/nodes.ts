// API surface for the Nodes page's "spin up another worker" flow.
//
// Both endpoints land on the evo-api dashboard via Caddy's existing
// /evo-api/* proxy (which injects the API bearer token server-side).
// The dashboard then either reads from its own evo.workers store
// (GET /scalable) or forwards POST /scale to the appropriate host's
// deploy-agent, injecting the deploy-agent bearer token along the way.
// Neither token ever reaches the browser.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const EVO_BASE = "/evo-api/api/v1";

export interface ScalableEstimate {
  cpu_pct: number;
  ram_gb: number;
  source: string; // "live:<worker-id>" | "average" | "default"
}

export interface ScalableEntry {
  service: string;
  running: number;
  estimate: ScalableEstimate;
}

export interface NodeHeadroom {
  cpu_pct_free: number;
  ram_gb_free: number;
  ram_gb_total: number;
  source: string; // "live:<worker-id>" | "unknown"
}

export interface NodeScalable {
  host: string;
  headroom: NodeHeadroom;
  scalable: ScalableEntry[];
}

export interface ScaleResult {
  service: string;
  host: string;
  before: number;
  after: number;
  requested: number;
  compose?: string;
  error?: string;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg =
      (parsed as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return parsed as T;
}

export const nodesApi = {
  scalable: (host: string) =>
    fetch(`${EVO_BASE}/nodes/${encodeURIComponent(host)}/scalable`).then(
      jsonOrThrow<NodeScalable>,
    ),

  scale: (host: string, service: string, replicas: number) =>
    fetch(
      `${EVO_BASE}/nodes/${encodeURIComponent(host)}/scale?service=${encodeURIComponent(service)}&replicas=${replicas}`,
      { method: "POST" },
    ).then(jsonOrThrow<ScaleResult>),
};

// React Query bindings — keep them next to the raw API so the Nodes
// page doesn't have to import both.

export const nodeKeys = {
  all: ["nodes"] as const,
  scalable: (host: string) => ["nodes", "scalable", host] as const,
};

export function useNodeScalable(host: string, enabled = true) {
  return useQuery({
    queryKey: nodeKeys.scalable(host),
    queryFn: () => nodesApi.scalable(host),
    enabled,
    refetchInterval: 5000, // headroom updates while the dialog is open
  });
}

export function useScaleService(host: string) {
  const qc = useQueryClient();
  return useMutation<
    ScaleResult,
    Error,
    { service: string; replicas: number }
  >({
    mutationFn: ({ service, replicas }) =>
      nodesApi.scale(host, service, replicas),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nodeKeys.scalable(host) });
      // The Nodes page reads /workers separately; bump that too so the
      // new container shows up as a row without waiting for the 5s
      // refetch tick.
      qc.invalidateQueries({ queryKey: ["nodes", "workers"] });
    },
  });
}
