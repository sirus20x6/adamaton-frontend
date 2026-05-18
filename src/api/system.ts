/**
 * Back-compat adapter over the new fleet-health API.
 *
 * Historically this module polled `/platform/health/ready` on the Python
 * R2R backend and returned `{ok, deps:{postgres, redis, sidecar}}`. That
 * backend was retired (docs/WHERE_DID_IT_GO.md). Today this module
 * derives the same shape from the new `/api/v1/health/roles` endpoint
 * via `useFleetRoles`, so legacy callers (SystemStatsPanel) keep
 * working without an HTTP round-trip detour.
 *
 * New code should use `useFleetHealth` / `useFleetRoles` /
 * `useFleetInstances` from `@/api/health` directly. This file exists
 * only to keep `SystemStatsPanel` (and any other legacy callers)
 * functional through the cutover; it can be deleted once those callers
 * migrate.
 */

import { useMemo } from "react";

import { useFleetRoles } from "@/api/health";

export type SystemDeps = {
  postgres: boolean;
  redis: boolean;
  sidecar: boolean;
};

export type SystemHealth = {
  ok: boolean;
  deps: SystemDeps;
};

const FALLBACK_DEPS: SystemDeps = {
  postgres: false,
  redis: false,
  sidecar: false,
};

/**
 * Mirrors the old hook signature: returns `{ data, isFetching,
 * dataUpdatedAt }` so SystemStatsPanel and friends don't need to
 * change their destructure pattern.
 *
 * Polling cadence is delegated to useFleetRoles; the refetchInterval
 * param is accepted for source-compat but ignored — the new endpoint
 * handles its own cache cadence.
 */
export function useSystemHealth(_refetchInterval = 30_000) {
  const roles = useFleetRoles();

  const data: SystemHealth = useMemo(() => {
    if (!roles.data) return { ok: false, deps: { ...FALLBACK_DEPS } };
    const lookup = (name: string): boolean => {
      const r = roles.data!.roles.find((role) => role.name === name);
      return r ? r.status === "ok" : false;
    };
    const next: SystemDeps = {
      postgres: lookup("postgres"),
      redis: lookup("redis"),
      // "sidecar" historically meant the BGE embedding sidecar.
      sidecar: lookup("bge-embed"),
    };
    return {
      ok: next.postgres && next.redis && next.sidecar,
      deps: next,
    };
  }, [roles.data]);

  return {
    data,
    isSuccess: roles.isSuccess,
    isFetching: roles.isFetching,
    isError: roles.isError,
    error: roles.error,
    dataUpdatedAt: roles.dataUpdatedAt,
  };
}
