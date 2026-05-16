/**
 * Typed wrappers around the platform's health endpoints. The header
 * indicator polls `useSystemHealth` on a fixed cadence so navigation
 * across pages doesn't blank out the connection pill.
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";

export type SystemDeps = {
  postgres: boolean;
  redis: boolean;
  sidecar: boolean;
};

export type SystemHealth = {
  ok: boolean;
  deps: SystemDeps;
};

type RawReadyResponse = {
  ok?: unknown;
  deps?: Record<string, unknown> | null;
};

const FALLBACK_DEPS: SystemDeps = {
  postgres: false,
  redis: false,
  sidecar: false,
};

function coerceBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.toLowerCase();
    return v === "true" || v === "ok" || v === "up" || v === "ready";
  }
  if (typeof value === "number") return value > 0;
  return false;
}

function normalizeReady(raw: RawReadyResponse | undefined): SystemHealth {
  const deps = raw?.deps ?? {};
  const next: SystemDeps = {
    postgres: coerceBool(deps["postgres"]),
    redis: coerceBool(deps["redis"]),
    sidecar: coerceBool(deps["sidecar"]),
  };
  const ok =
    coerceBool(raw?.ok) || (next.postgres && next.redis && next.sidecar);
  return { ok, deps: next };
}

export const systemApi = {
  ready: async (): Promise<SystemHealth> => {
    const raw = await api.get<RawReadyResponse>("/platform/health/ready");
    return normalizeReady(raw);
  },
  live: () => api.get<{ ok: boolean }>("/platform/health/live"),
};

export const SYSTEM_HEALTH_QUERY_KEY = ["system", "health", "ready"] as const;

/**
 * Polls the platform health endpoint at a steady interval so the header
 * status indicator stays accurate across route changes.
 */
export function useSystemHealth(refetchInterval = 30_000) {
  return useQuery<SystemHealth, Error, SystemHealth>({
    queryKey: SYSTEM_HEALTH_QUERY_KEY,
    queryFn: systemApi.ready,
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: refetchInterval,
    retry: 1,
    placeholderData: (previous: SystemHealth | undefined) =>
      previous ?? { ok: false, deps: { ...FALLBACK_DEPS } },
  });
}
