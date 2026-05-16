import {
  BookmarkCheck,
  Database,
  Network,
  Zap,
  type LucideIcon,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type StageState = "pending" | "running" | "done" | "error" | "skipped";
export type Stage = "live" | "indexed" | "graphed" | "curated";

export type StageInfo = {
  state: StageState;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  pct?: number;
  count?: number;
};

export type StageProgressProps = {
  stages: Record<Stage, StageInfo>;
  className?: string;
};

const STAGE_ORDER: readonly Stage[] = ["live", "indexed", "graphed", "curated"];

const STAGE_META: Record<
  Stage,
  { label: string; icon: LucideIcon; description: string }
> = {
  live: { label: "Live", icon: Zap, description: "Streaming initial signal" },
  indexed: {
    label: "Indexed",
    icon: Database,
    description: "Embeddings + retrieval",
  },
  graphed: {
    label: "Graphed",
    icon: Network,
    description: "Knowledge graph",
  },
  curated: {
    label: "Curated",
    icon: BookmarkCheck,
    description: "Final synthesis",
  },
};

function stateClasses(state: StageState): {
  ring: string;
  text: string;
  iconColor: string;
} {
  switch (state) {
    case "running":
      return {
        ring: "border-primary bg-primary/10 animate-pulse-soft",
        text: "text-foreground",
        iconColor: "text-primary",
      };
    case "done":
      return {
        ring: "border-primary bg-primary/15",
        text: "text-foreground",
        iconColor: "text-primary",
      };
    case "error":
      return {
        ring: "border-destructive bg-destructive/10",
        text: "text-destructive",
        iconColor: "text-destructive",
      };
    case "skipped":
      return {
        ring: "border-border bg-muted/40",
        text: "text-muted-foreground",
        iconColor: "text-muted-foreground",
      };
    case "pending":
    default:
      return {
        ring: "border-border bg-background",
        text: "text-muted-foreground",
        iconColor: "text-muted-foreground",
      };
  }
}

function fmtTs(ts: number | undefined): string | null {
  if (typeof ts !== "number") return null;
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function StageProgress({ stages, className }: StageProgressProps) {
  return (
    <TooltipProvider delayDuration={120}>
      <ol
        className={cn(
          "flex w-full items-center gap-2",
          "text-xs sm:text-sm",
          className,
        )}
        aria-label="Research pipeline progress"
      >
        {STAGE_ORDER.map((stage, idx) => {
          const info = stages[stage];
          const meta = STAGE_META[stage];
          const Icon = meta.icon;
          const cls = stateClasses(info.state);
          const isCurrent = info.state === "running";
          const startedLabel = fmtTs(info.startedAt);
          const finishedLabel = fmtTs(info.finishedAt);
          return (
            <li
              key={stage}
              className="flex flex-1 items-center gap-2"
              aria-current={isCurrent ? "step" : undefined}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                      cls.ring,
                    )}
                  >
                    <Icon className={cn("h-4 w-4", cls.iconColor)} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{meta.label}</span>
                    <span className="text-muted-foreground">
                      {info.state}
                      {typeof info.count === "number"
                        ? ` · ${info.count} item${info.count === 1 ? "" : "s"}`
                        : ""}
                    </span>
                    {startedLabel ? (
                      <span className="text-muted-foreground">
                        started {startedLabel}
                      </span>
                    ) : null}
                    {finishedLabel ? (
                      <span className="text-muted-foreground">
                        finished {finishedLabel}
                      </span>
                    ) : null}
                    {info.error ? (
                      <span className="text-destructive">{info.error}</span>
                    ) : null}
                  </div>
                </TooltipContent>
              </Tooltip>
              <div className={cn("flex min-w-0 flex-col leading-tight", cls.text)}>
                <span className="truncate font-medium">{meta.label}</span>
                <span className="truncate text-[0.7rem] text-muted-foreground">
                  {info.state === "error" && info.error
                    ? info.error
                    : meta.description}
                </span>
              </div>
              {idx < STAGE_ORDER.length - 1 && (
                <div
                  className={cn(
                    "mx-1 h-px flex-1",
                    info.state === "done"
                      ? "bg-primary/60"
                      : "bg-border",
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </TooltipProvider>
  );
}
