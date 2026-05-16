/**
 * Compact metadata card per active run shown beneath the chart.
 *
 * The "Open detail" affordance routes back to ``/experiments`` with a
 * ``?selected=<id>`` query param so the existing detail drawer opens
 * without a separate dashboard-flavored sheet. This keeps the detail
 * presentation single-sourced.
 */

import { ExternalLink, GitCommit } from "lucide-react";
import { Link } from "react-router-dom";

import type { Experiment } from "@/api/experiments";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill } from "@/features/experiments/StatusPill";
import { ValBpbBadge } from "@/features/experiments/ValBpbBadge";
import { cn, formatRelative } from "@/lib/utils";

type Props = {
  experiment: Experiment;
  color: string;
  className?: string;
};

export function RunDetailCard({ experiment, color, className }: Props) {
  const hypothesisPreview =
    experiment.hypothesis.length > 200
      ? `${experiment.hypothesis.slice(0, 200)}…`
      : experiment.hypothesis;
  const shortCommit = experiment.commit_hash
    ? experiment.commit_hash.slice(0, 7)
    : null;

  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: color }}
      />
      <CardContent className="flex flex-col gap-2 p-3 pl-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{ background: color }}
              />
              <span className="truncate text-sm font-medium text-foreground">
                {experiment.name}
              </span>
            </div>
            <div className="mt-0.5 text-[0.65rem] text-muted-foreground">
              started {formatRelative(experiment.started_at)}
              {shortCommit && (
                <span className="ml-2 inline-flex items-center gap-1 font-mono">
                  <GitCommit className="h-2.5 w-2.5" />
                  {shortCommit}
                </span>
              )}
            </div>
          </div>
          <StatusPill status={experiment.status} className="shrink-0" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ValBpbBadge value={experiment.val_bpb} />
          {experiment.peak_memory_mb !== null && (
            <span className="rounded-md border border-border bg-card/40 px-2 py-0.5 font-mono text-[0.65rem] tabular-nums text-muted-foreground">
              {experiment.peak_memory_mb} MB
            </span>
          )}
        </div>

        <p className="line-clamp-3 text-[0.7rem] leading-snug text-muted-foreground">
          {hypothesisPreview}
        </p>

        <div className="flex justify-end pt-1">
          <Button asChild size="sm" variant="ghost" className="h-7 gap-1 text-xs">
            <Link to={`/experiments?selected=${encodeURIComponent(experiment.id)}`}>
              Open detail
              <ExternalLink className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
