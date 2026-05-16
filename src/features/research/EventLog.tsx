import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { ResearchEvent, Stage } from "@/api/ws";

export type EventLogProps = {
  events: ResearchEvent[];
  className?: string;
  /** Maximum events to render. Default 50. */
  limit?: number;
};

const STAGE_TONE: Record<Stage, string> = {
  live: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  indexed: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  graphed:
    "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  curated:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
};

const TYPE_TONE: Record<string, string> = {
  "stage.started": "text-foreground",
  "stage.progress": "text-muted-foreground",
  "stage.result": "text-primary",
  "stage.finished": "text-foreground",
  "stage.error": "text-red-700 dark:text-red-300",
  "task.done": "text-primary",
  heartbeat: "text-muted-foreground",
  pong: "text-muted-foreground",
  error: "text-red-700 dark:text-red-300",
};

function eventStage(ev: ResearchEvent): Stage | undefined {
  if (
    ev.type === "stage.started" ||
    ev.type === "stage.progress" ||
    ev.type === "stage.result" ||
    ev.type === "stage.finished" ||
    ev.type === "stage.error"
  ) {
    return ev.stage;
  }
  return undefined;
}

function eventTimestamp(ev: ResearchEvent): number | undefined {
  if ("at" in ev && typeof ev.at === "number") {
    return ev.at;
  }
  return undefined;
}

function formatTime(ts: number | undefined): string {
  if (ts === undefined) return "";
  // Backend emits seconds-since-epoch (server uses time.time()) for some events
  // and ISO strings for others. Normalize.
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function EventLog({ events, className, limit = 50 }: EventLogProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const slice = useMemo(() => events.slice(-limit).reverse(), [events, limit]);

  if (slice.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        No events yet.
      </p>
    );
  }

  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {slice.map((ev, idx) => {
        const stage = eventStage(ev);
        const ts = eventTimestamp(ev);
        const stageTone = stage ? STAGE_TONE[stage] : null;
        const typeTone = TYPE_TONE[ev.type] ?? "text-foreground";
        const isOpen = expanded === idx;
        return (
          <li
            key={`${ev.type}-${idx}`}
            className="rounded-md border border-border bg-card/40 px-2 py-1.5 text-[0.72rem]"
          >
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : idx)}
              className="flex w-full items-center justify-between gap-2 text-left"
              aria-expanded={isOpen}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className={cn(
                    "shrink-0 font-mono",
                    typeTone,
                  )}
                >
                  {ev.type}
                </span>
                {stage ? (
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-0.5 text-[0.65rem] font-medium",
                      stageTone,
                    )}
                  >
                    {stage}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground">
                {formatTime(ts)}
              </span>
            </button>
            {isOpen ? (
              <pre
                className={cn(
                  "mt-1.5 max-h-48 overflow-auto rounded p-2 text-[0.65rem] leading-snug",
                  "bg-muted/60 text-foreground dark:bg-muted/40 dark:text-foreground",
                )}
              >
                {JSON.stringify(ev, null, 2)}
              </pre>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
