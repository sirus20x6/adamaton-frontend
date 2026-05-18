/**
 * Typed client for the platform apiserver's fleet-health surface
 * (/api/v1/health/{fleet,roles,instances,topology,cache}). Mirrors the
 * three-tier model in dashboard/apiserver/health/: capability → role →
 * instance, with quorum thresholds per role and the worst-of rollup at
 * the capability level.
 *
 * Mutations are scoped to the cache-bust endpoint; the rest are reads
 * the SPA polls every 15s (matching the apiserver's refresh cadence).
 */

import axios, { type AxiosInstance } from "axios";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

const EVO_BASE = import.meta.env.VITE_EVO_API_BASE || "/evo-api";

const healthHttp: AxiosInstance = axios.create({
  baseURL: EVO_BASE,
  timeout: 10_000,
  headers: { Accept: "application/json" },
});

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
  const r = await healthHttp.get<unknown>(path);
  return unwrap<T>(r.data);
}

// ── Types (mirror dashboard/apiserver/health/*.go) ────────────────────

export type Status = "ok" | "degraded" | "offline" | "unknown";

export type RoleKind =
  | "http"
  | "tcp"
  | "postgres"
  | "redis"
  | "temporal_queue";

export type CapabilityStatus = {
  name: string;
  label: string;
  description?: string;
  status: Status;
  roles: string[];
  down?: string[];
};

export type RoleStatus = {
  name: string;
  kind: RoleKind;
  min_healthy: number;
  running: number;
  healthy: number;
  status: Status;
  optional?: boolean;
  instances: string[];
};

export type InstanceStatus = {
  host: string;
  role: string;
  container?: string;
  image?: string;
  status: Status;
  detail?: string;
  latency_ms: number;
  last_seen: string;
  stats?: Record<string, unknown>;
};

export type FleetHealthCompact = {
  generated_at: string;
  stale_for?: string;
  capabilities: CapabilityStatus[];
};

export type FleetRoles = {
  generated_at: string;
  stale_for?: string;
  roles: RoleStatus[];
};

export type FleetInstances = {
  generated_at: string;
  stale_for?: string;
  instances: InstanceStatus[];
};

export type FleetTopology = {
  roles: Record<string, RoleDefinition>;
  capabilities: Record<string, CapabilityDefinition>;
  role_order: string[];
  cap_order: string[];
};

export type RoleDefinition = {
  Kind: RoleKind;
  MinHealthy: number;
  Optional?: boolean;
  Description?: string;
  Queue?: string;
  HeartbeatMaxAge?: number;
  Probe?: { Host?: string; Port?: number; Path?: string; Timeout?: number };
};

export type CapabilityDefinition = {
  Label: string;
  Roles: string[];
  Description?: string;
};

// ── Query keys ────────────────────────────────────────────────────────

const FLEET_HEALTH_KEY = ["fleet", "health", "compact"] as const;
const FLEET_ROLES_KEY = ["fleet", "health", "roles"] as const;
const FLEET_INSTANCES_KEY = ["fleet", "health", "instances"] as const;
const FLEET_TOPOLOGY_KEY = ["fleet", "health", "topology"] as const;

// ── Hooks ─────────────────────────────────────────────────────────────

/**
 * Compact rollup — capabilities only, for the header pill. 15s
 * refresh matches the apiserver's cache rebuild cadence.
 */
export function useFleetHealth(refetchInterval = 15_000) {
  return useQuery<FleetHealthCompact, Error>({
    queryKey: FLEET_HEALTH_KEY,
    queryFn: () => get<FleetHealthCompact>("/api/v1/health/fleet"),
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: refetchInterval,
    retry: 1,
  });
}

/**
 * Per-role rollup — running/healthy/min_healthy counts. Polled
 * slightly slower than the compact view since the /health page is
 * less likely to be left open than the header.
 */
export function useFleetRoles(refetchInterval = 20_000) {
  return useQuery<FleetRoles, Error>({
    queryKey: FLEET_ROLES_KEY,
    queryFn: () => get<FleetRoles>("/api/v1/health/roles"),
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: refetchInterval,
    retry: 1,
  });
}

/**
 * Flat instance list — for the drilldown table. Same cadence as
 * roles since they're rendered side-by-side.
 */
export function useFleetInstances(refetchInterval = 20_000) {
  return useQuery<FleetInstances, Error>({
    queryKey: FLEET_INSTANCES_KEY,
    queryFn: () => get<FleetInstances>("/api/v1/health/instances"),
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: refetchInterval,
    retry: 1,
  });
}

/**
 * Static topology graph — never auto-refetches; the SPA caches it
 * once per page mount. Use this to render labels/descriptions
 * alongside the dynamic rollups.
 */
export function useFleetTopology() {
  return useQuery<FleetTopology, Error>({
    queryKey: FLEET_TOPOLOGY_KEY,
    queryFn: () => get<FleetTopology>("/api/v1/health/topology"),
    staleTime: Infinity, // topology only changes on apiserver restart
    retry: 1,
  });
}

/**
 * Force-refresh the apiserver's cache. Called when the user clicks
 * "Refresh now" — invalidates every health-related query so the SPA
 * sees the fresh fanout immediately.
 */
export function useRefreshFleetHealth() {
  const qc = useQueryClient();
  return useMutation<void, Error>({
    mutationFn: async () => {
      await healthHttp.delete("/api/v1/health/cache");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet", "health"] });
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * worstStatus picks the more-pessimistic of two statuses. Mirrors
 * apiserver/health/aggregator.go:worseStatus. Used by the header pill
 * to roll capability statuses into a single overall colour.
 *
 *   ok < unknown < degraded < offline
 */
export function worstStatus(statuses: Status[]): Status {
  const rank: Record<Status, number> = {
    ok: 0,
    unknown: 1,
    degraded: 2,
    offline: 3,
  };
  let worst: Status = "ok";
  for (const s of statuses) {
    if (rank[s] > rank[worst]) worst = s;
  }
  return worst;
}

/**
 * statusLabel maps a Status to a short human label. Used by chips +
 * pills.
 */
export function statusLabel(status: Status): string {
  switch (status) {
    case "ok":
      return "Healthy";
    case "degraded":
      return "Degraded";
    case "offline":
      return "Offline";
    default:
      return "Unknown";
  }
}

/**
 * statusColorClass maps a Status to a Tailwind colour utility prefix.
 * Used by every health pill / dot for consistency.
 */
export function statusColorClass(status: Status): {
  bg: string;
  text: string;
  dot: string;
} {
  switch (status) {
    case "ok":
      return {
        bg: "bg-emerald-50 dark:bg-emerald-950",
        text: "text-emerald-700 dark:text-emerald-300",
        dot: "bg-emerald-500",
      };
    case "degraded":
      return {
        bg: "bg-amber-50 dark:bg-amber-950",
        text: "text-amber-700 dark:text-amber-300",
        dot: "bg-amber-500",
      };
    case "offline":
      return {
        bg: "bg-red-50 dark:bg-red-950",
        text: "text-red-700 dark:text-red-300",
        dot: "bg-red-500",
      };
    default:
      return {
        bg: "bg-slate-50 dark:bg-slate-900",
        text: "text-slate-600 dark:text-slate-400",
        dot: "bg-slate-400",
      };
  }
}
