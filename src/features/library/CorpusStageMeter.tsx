import { BookmarkCheck, Database, Network, Zap, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type StageBucket = "live" | "indexed" | "graphed" | "curated";

export type CorpusStageMeterProps = {
  live: number;
  indexed: number;
  graphed: number;
  curated: number;
  total: number;
  className?: string;
};

type SegmentMeta = {
  key: StageBucket;
  label: string;
  icon: LucideIcon;
  /** Tailwind classes for the filled segment. Pairs with a faded
   *  background so empty stages still register as a track on the bar. */
  fill: string;
  text: string;
};

const SEGMENTS: readonly SegmentMeta[] = [
  {
    key: "live",
    label: "Live",
    icon: Zap,
    fill: "bg-amber-500/70",
    text: "text-amber-300",
  },
  {
    key: "indexed",
    label: "Indexed",
    icon: Database,
    fill: "bg-sky-500/70",
    text: "text-sky-300",
  },
  {
    key: "graphed",
    label: "Graphed",
    icon: Network,
    fill: "bg-violet-500/70",
    text: "text-violet-300",
  },
  {
    key: "curated",
    label: "Curated",
    icon: BookmarkCheck,
    fill: "bg-emerald-500/70",
    text: "text-emerald-300",
  },
];

function pct(count: number, total: number): number {
  if (total <= 0) return 0;
  if (count <= 0) return 0;
  // Floor to keep the bar visually honest; a 1-doc corpus shouldn't render
  // at 100% across multiple buckets just because they all have one row.
  return Math.min(100, Math.max(0, (count / total) * 100));
}

export function CorpusStageMeter({
  live,
  indexed,
  graphed,
  curated,
  total,
  className,
}: CorpusStageMeterProps) {
  const counts: Record<StageBucket, number> = {
    live,
    indexed,
    graphed,
    curated,
  };

  return (
    <section
      aria-label="Pipeline stage progress"
      className={cn("flex flex-col gap-2", className)}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SEGMENTS.map((seg) => {
          const Icon = seg.icon;
          const count = counts[seg.key];
          const ratio = pct(count, total);
          return (
            <div
              key={seg.key}
              className="flex flex-col gap-1.5 rounded-md border border-border bg-card/40 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide",
                    seg.text,
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {seg.label}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {count}
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted/40"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={count}
                aria-valuetext={`${count} of ${total} documents at the ${seg.label} stage`}
              >
                <div
                  className={cn("h-full transition-all", seg.fill)}
                  style={{ width: `${ratio}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {total} document{total === 1 ? "" : "s"} tracked across pipeline
        stages.
      </p>
    </section>
  );
}
