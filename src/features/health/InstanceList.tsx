import * as React from "react";

import {
  type InstanceStatus,
  type Status,
  statusColorClass,
  statusLabel,
} from "@/api/health";
import { cn } from "@/lib/utils";

interface InstanceListProps {
  instances: InstanceStatus[];
}

/**
 * Flat instance list with chip filters across host / role / status.
 * Used at the bottom of /health for ops drilldown.
 */
export function InstanceList({ instances }: InstanceListProps) {
  const [hostFilter, setHostFilter] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<Status | null>(null);

  const hosts = React.useMemo(() => {
    return Array.from(new Set(instances.map((i) => i.host))).sort();
  }, [instances]);

  const filtered = React.useMemo(() => {
    return instances.filter((inst) => {
      if (hostFilter && inst.host !== hostFilter) return false;
      if (statusFilter && inst.status !== statusFilter) return false;
      return true;
    });
  }, [instances, hostFilter, statusFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Host:</span>
        <FilterChip
          label="all"
          active={hostFilter === null}
          onClick={() => setHostFilter(null)}
        />
        {hosts.map((h) => (
          <FilterChip
            key={h}
            label={h}
            active={hostFilter === h}
            onClick={() => setHostFilter(h)}
          />
        ))}
        <span className="mx-2 text-slate-300">|</span>
        <span className="text-slate-500">Status:</span>
        <FilterChip
          label="all"
          active={statusFilter === null}
          onClick={() => setStatusFilter(null)}
        />
        {(["ok", "degraded", "offline", "unknown"] as Status[]).map((s) => (
          <FilterChip
            key={s}
            label={statusLabel(s)}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
          />
        ))}
        <span className="ml-auto text-slate-400">
          {filtered.length} of {instances.length}
        </span>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">host</th>
              <th className="px-3 py-2 text-left font-medium">role</th>
              <th className="px-3 py-2 text-left font-medium">container</th>
              <th className="px-3 py-2 text-left font-medium">status</th>
              <th className="px-3 py-2 text-left font-medium">latency</th>
              <th className="px-3 py-2 text-left font-medium">last seen</th>
              <th className="px-3 py-2 text-left font-medium">detail</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inst, i) => {
              const colors = statusColorClass(inst.status);
              return (
                <tr
                  key={`${inst.host}/${inst.container || inst.role}/${i}`}
                  className="border-t border-slate-200 dark:border-slate-800"
                >
                  <td className="px-3 py-2 font-mono text-xs">{inst.host}</td>
                  <td className="px-3 py-2 font-mono text-xs">{inst.role}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {inst.container || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs",
                        colors.text,
                      )}
                    >
                      <span className={cn("size-2 rounded-full", colors.dot)} />
                      {statusLabel(inst.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-slate-500">
                    {inst.latency_ms > 0 ? `${inst.latency_ms.toFixed(1)}ms` : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {formatRelative(inst.last_seen)}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 truncate max-w-md">
                    {inst.detail || "—"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-sm text-slate-400"
                >
                  No instances match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2 py-0.5 rounded-full text-xs transition",
        active
          ? "bg-slate-900 text-slate-50 dark:bg-slate-50 dark:text-slate-900"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700",
      )}
    >
      {label}
    </button>
  );
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (isNaN(t)) return "—";
  const ago = Date.now() - t;
  if (ago < 60_000) return `${Math.floor(ago / 1000)}s ago`;
  if (ago < 3_600_000) return `${Math.floor(ago / 60_000)}m ago`;
  if (ago < 86_400_000) return `${Math.floor(ago / 3_600_000)}h ago`;
  return new Date(t).toLocaleDateString();
}
