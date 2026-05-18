/**
 * Fleet health page — three-tier model rendered as:
 *
 *   capability cards row  ← user-facing rollups
 *      ↓ click scrolls
 *   roles table           ← quorum thresholds + healthy/desired counts
 *      ↓ expand rows
 *   instances table       ← per-container drilldown, filterable
 *
 * Backed by the new /api/v1/health/{fleet,roles,instances,topology}
 * endpoints. The header pill in `Layout.tsx` polls the same compact
 * rollup; this page is where the user goes when the pill is amber/red
 * and they want to know why.
 */

import * as React from "react";
import { HeartPulse, Loader2, RefreshCw } from "lucide-react";

import {
  useFleetHealth,
  useFleetInstances,
  useFleetRoles,
  useRefreshFleetHealth,
} from "@/api/health";
import { Button } from "@/components/ui/button";
import { CapabilityCard } from "@/features/health/CapabilityCard";
import { InstanceList } from "@/features/health/InstanceList";
import { RolesTable } from "@/features/health/RolesTable";

export default function HealthPage() {
  const fleet = useFleetHealth();
  const roles = useFleetRoles();
  const instances = useFleetInstances();
  const refresh = useRefreshFleetHealth();
  const [highlightedRole, setHighlightedRole] = React.useState<string | null>(
    null,
  );

  const isLoading =
    fleet.isLoading || roles.isLoading || instances.isLoading;
  const isError = fleet.isError || roles.isError || instances.isError;
  const error = fleet.error || roles.error || instances.error;

  const scrollToRole = React.useCallback((roleName: string) => {
    setHighlightedRole(roleName);
    const el = document.getElementById(`role-${roleName}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const onCapabilityClick = React.useCallback(
    (capName: string) => {
      const cap = fleet.data?.capabilities.find((c) => c.name === capName);
      // If capability has a degraded role, scroll to it; else scroll to
      // the first role in the bundle.
      const targetRole = cap?.down?.[0] || cap?.roles[0];
      if (targetRole) scrollToRole(targetRole);
    },
    [fleet.data?.capabilities, scrollToRole],
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <HeartPulse className="size-6 text-slate-700 dark:text-slate-300" />
          <div>
            <h1 className="text-2xl font-semibold">Fleet health</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Capabilities, roles, and per-instance probes across the fleet.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
        >
          {refresh.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          <span className="ml-2">Refresh now</span>
        </Button>
      </header>

      {isLoading && !fleet.data && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-700 dark:text-red-300">
          Failed to load fleet health:{" "}
          {(error as Error | undefined)?.message ?? "unknown error"}
        </div>
      )}

      {/* Capabilities row */}
      {fleet.data && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase text-slate-500">
            Capabilities
          </h2>
          {fleet.data.stale_for && (
            <div className="text-xs text-amber-600 dark:text-amber-400">
              Stale for {fleet.data.stale_for} — last refresh failed.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {fleet.data.capabilities.map((cap) => (
              <CapabilityCard
                key={cap.name}
                capability={cap}
                onSelect={onCapabilityClick}
              />
            ))}
          </div>
        </section>
      )}

      {/* Roles table */}
      {roles.data && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase text-slate-500">
            Roles
          </h2>
          <RolesTable
            roles={roles.data.roles}
            instances={instances.data?.instances ?? []}
            highlight={highlightedRole ?? undefined}
          />
        </section>
      )}

      {/* Instance list */}
      {instances.data && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase text-slate-500">
            Instances
          </h2>
          <InstanceList instances={instances.data.instances} />
        </section>
      )}
    </div>
  );
}
