import { Activity, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import {
  type CapabilityStatus,
  statusColorClass,
  statusLabel,
} from "@/api/health";
import { cn } from "@/lib/utils";

interface CapabilityCardProps {
  capability: CapabilityStatus;
  onSelect?: (name: string) => void;
}

/**
 * One capability tile. Colour codes the status, lists the underlying
 * roles, and surfaces which member roles are degraded ("down" array).
 * Clicking the card pages the parent to scroll to the matching row in
 * the roles table.
 */
export function CapabilityCard({ capability, onSelect }: CapabilityCardProps) {
  const colors = statusColorClass(capability.status);
  const Icon = iconForStatus(capability.status);
  const downCount = capability.down?.length ?? 0;
  return (
    <button
      type="button"
      onClick={() => onSelect?.(capability.name)}
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-4 text-left transition",
        "hover:shadow-md hover:-translate-y-0.5",
        "border-slate-200 dark:border-slate-800",
        colors.bg,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className={cn("font-medium text-sm", colors.text)}>
            {capability.label}
          </span>
          {capability.description && (
            <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {capability.description}
            </span>
          )}
        </div>
        <Icon className={cn("size-5 shrink-0", colors.text)} />
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className={cn("font-medium", colors.text)}>
          {statusLabel(capability.status)}
        </span>
        <span className="text-slate-400">·</span>
        <span className="text-slate-500 dark:text-slate-400">
          {capability.roles.length} role{capability.roles.length === 1 ? "" : "s"}
        </span>
        {downCount > 0 && (
          <>
            <span className="text-slate-400">·</span>
            <span className={colors.text}>
              {downCount} degraded
            </span>
          </>
        )}
      </div>
      {downCount > 0 && capability.down && (
        <div className="flex flex-wrap gap-1 mt-1">
          {capability.down.map((role) => (
            <span
              key={role}
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-mono",
                "bg-white/60 dark:bg-black/30",
                colors.text,
              )}
            >
              {role}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function iconForStatus(status: CapabilityStatus["status"]) {
  switch (status) {
    case "ok":
      return CheckCircle2;
    case "degraded":
      return AlertTriangle;
    case "offline":
      return XCircle;
    default:
      return Activity;
  }
}
