import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import {
  type CapabilityStatus,
  type Status,
  statusColorClass,
  statusLabel,
  useFleetHealth,
  worstStatus,
} from "@/api/health";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatRelative } from "@/lib/utils";

/**
 * Header pill — backed by the new fleet-health rollup.
 *
 *   green   when every capability is "ok"
 *   amber   when any capability is "degraded" or "unknown"
 *   red     when any capability is "offline"
 *
 * Clicking opens a popover listing each capability + the roles within
 * it that are sad. A footer link sends the user to /health for the
 * full drilldown.
 */

type SystemHealthWidgetProps = {
  className?: string;
};

export function SystemHealthWidget({ className }: SystemHealthWidgetProps) {
  const fleet = useFleetHealth();

  const overall: Status = useMemo(() => {
    if (!fleet.data) return "unknown";
    return worstStatus(fleet.data.capabilities.map((c) => c.status));
  }, [fleet.data]);

  const tone = toneFor(overall);
  const TriggerIcon = tone.Icon;
  const generatedAt = fleet.data?.generated_at
    ? new Date(fleet.data.generated_at)
    : null;
  const checkedLabel = generatedAt
    ? `checked ${formatRelative(generatedAt)}`
    : "never checked";
  const ariaLabel = `${tone.label} - ${checkedLabel}`;
  const isStale = fleet.data?.stale_for !== undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          title={ariaLabel}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border",
            "bg-card/40 transition-colors",
            "hover:bg-accent",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <TriggerIcon className={cn("h-4 w-4", tone.iconClass)} />
          <span className="sr-only">{ariaLabel}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[18rem]">
        <DropdownMenuLabel>
          <span className="flex items-center gap-2 normal-case tracking-normal">
            <TriggerIcon className={cn("h-3.5 w-3.5", tone.iconClass)} />
            <span className="text-foreground">{tone.label}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ul className="px-1 pb-1 text-xs">
          {fleet.data?.capabilities.map((cap) => (
            <CapabilityRow key={cap.name} capability={cap} />
          ))}
          {!fleet.data && (
            <li className="px-2 py-1.5 text-[0.7rem] text-muted-foreground">
              Awaiting first health check…
            </li>
          )}
        </ul>
        <DropdownMenuSeparator />
        <div className="px-3 py-1.5 text-[0.7rem] text-muted-foreground flex items-center justify-between gap-2">
          <span
            title={
              generatedAt ? generatedAt.toLocaleString() : "Health not yet polled."
            }
          >
            {generatedAt
              ? `Last checked ${formatRelative(generatedAt)}`
              : "Awaiting first health check..."}
            {isStale && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                (stale: {fleet.data?.stale_for})
              </span>
            )}
          </span>
          <Link
            to="/health"
            className="text-foreground underline-offset-2 hover:underline"
          >
            Open /health
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CapabilityRow({ capability }: { capability: CapabilityStatus }) {
  const colors = statusColorClass(capability.status);
  const downCount = capability.down?.length ?? 0;
  return (
    <li className="flex items-start justify-between gap-3 rounded-sm px-2 py-1.5">
      <div className="flex flex-col">
        <span className="text-foreground">{capability.label}</span>
        {downCount > 0 && capability.down && (
          <span className="text-[10px] font-mono text-muted-foreground mt-0.5">
            {capability.down.join(", ")}
          </span>
        )}
      </div>
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[0.7rem] font-medium",
          colors.text,
        )}
        aria-live="polite"
      >
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 rounded-full", colors.dot)}
        />
        {statusLabel(capability.status)}
      </span>
    </li>
  );
}

type WidgetTone = {
  Icon: typeof CheckCircle2;
  label: string;
  iconClass: string;
};

function toneFor(status: Status): WidgetTone {
  switch (status) {
    case "ok":
      return {
        Icon: CheckCircle2,
        label: "All systems normal",
        iconClass: "text-emerald-700 dark:text-emerald-300",
      };
    case "degraded":
      return {
        Icon: AlertTriangle,
        label: "Degraded",
        iconClass: "text-amber-700 dark:text-amber-300",
      };
    case "offline":
      return {
        Icon: XCircle,
        label: "Outage",
        iconClass: "text-red-700 dark:text-red-300",
      };
    default:
      return {
        Icon: Activity,
        label: "Health unknown",
        iconClass: "text-slate-500 dark:text-slate-400",
      };
  }
}
