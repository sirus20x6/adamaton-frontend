import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SystemDeps } from "@/api/system";
import { useConnectionStore } from "@/features/research/connectionStore";
import { cn, formatRelative } from "@/lib/utils";

type Status = "healthy" | "degraded" | "down";

type WidgetTone = {
  Icon: typeof CheckCircle2;
  label: string;
  iconClass: string;
};

const TONE: Record<Status, WidgetTone> = {
  healthy: {
    Icon: CheckCircle2,
    label: "All systems normal",
    iconClass: "text-emerald-700 dark:text-emerald-300",
  },
  degraded: {
    Icon: AlertTriangle,
    label: "Degraded",
    iconClass: "text-amber-700 dark:text-amber-300",
  },
  down: {
    Icon: XCircle,
    label: "Outage",
    iconClass: "text-red-700 dark:text-red-300",
  },
};

const DEP_KEYS = ["postgres", "redis", "sidecar"] as const satisfies ReadonlyArray<
  keyof SystemDeps
>;

const DEP_LABELS: Record<keyof SystemDeps, string> = {
  postgres: "PostgreSQL",
  redis: "Redis",
  sidecar: "Sidecar",
};

function classify(deps: SystemDeps, lastChecked: number): Status {
  if (lastChecked === 0) return "degraded";
  const values: boolean[] = DEP_KEYS.map((k) => deps[k]);
  if (values.every((v) => v)) return "healthy";
  if (values.every((v) => !v)) return "down";
  return "degraded";
}

type SystemHealthWidgetProps = {
  className?: string;
};

export function SystemHealthWidget({ className }: SystemHealthWidgetProps) {
  const deps = useConnectionStore((s) => s.deps);
  const lastChecked = useConnectionStore((s) => s.lastChecked);

  const status = useMemo(
    () => classify(deps, lastChecked),
    [deps, lastChecked],
  );
  const tone = TONE[status];
  const TriggerIcon = tone.Icon;
  const checkedLabel =
    lastChecked === 0
      ? "never checked"
      : `checked ${formatRelative(new Date(lastChecked))}`;
  const ariaLabel = `${tone.label} - ${checkedLabel}`;

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
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuLabel>
          <span className="flex items-center gap-2 normal-case tracking-normal">
            <TriggerIcon className={cn("h-3.5 w-3.5", tone.iconClass)} />
            <span className="text-foreground">{tone.label}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ul className="px-1 pb-1 text-xs">
          {DEP_KEYS.map((key) => {
            const ok = deps[key];
            return (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded-sm px-2 py-1.5"
              >
                <span className="text-foreground">{DEP_LABELS[key]}</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[0.7rem] font-medium",
                    ok
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-red-700 dark:text-red-300",
                  )}
                  aria-live="polite"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      ok ? "bg-emerald-500" : "bg-red-500",
                    )}
                  />
                  {ok ? "Healthy" : "Down"}
                </span>
              </li>
            );
          })}
        </ul>
        <DropdownMenuSeparator />
        <p
          className="px-3 py-1.5 text-[0.7rem] text-muted-foreground"
          title={
            lastChecked === 0
              ? "Health endpoint not yet polled."
              : new Date(lastChecked).toLocaleString()
          }
        >
          {lastChecked === 0
            ? "Awaiting first health check..."
            : `Last checked ${formatRelative(new Date(lastChecked))}`}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
