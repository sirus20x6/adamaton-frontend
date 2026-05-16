import { useMemo } from "react";
import { ArrowDown, ArrowUp, Equal, GitCompareArrows } from "lucide-react";

import {
  type Experiment,
  type MetricPoint,
  useExperiment,
  useExperimentMetrics,
} from "@/api/experiments";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CodeDiff } from "@/features/experiments/CodeDiff";
import { MetricsChart } from "@/features/experiments/MetricsChart";
import { StatusPill } from "@/features/experiments/StatusPill";
import { ValBpbBadge } from "@/features/experiments/ValBpbBadge";
import { Prose } from "@/components/markdown/Prose";
import { cn, formatRelative } from "@/lib/utils";

type Props = {
  open: boolean;
  leftId: string | null;
  rightId: string | null;
  onClose: () => void;
};

/**
 * Side-by-side comparison of two experiments. Drives off the same hooks the
 * detail drawer uses so cache hits cover the common case where the user has
 * already opened either run individually.
 */
export function CompareDrawer({ open, leftId, rightId, onClose }: Props) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="max-w-5xl">
        {open && leftId && rightId ? (
          <CompareBody leftId={leftId} rightId={rightId} onClose={onClose} />
        ) : (
          <SheetBody>
            <div className="text-sm text-muted-foreground">
              Pick two experiments to compare.
            </div>
          </SheetBody>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CompareBody({
  leftId,
  rightId,
  onClose,
}: {
  leftId: string;
  rightId: string;
  onClose: () => void;
}) {
  const left = useExperiment(leftId);
  const right = useExperiment(rightId);
  const leftMetrics = useExperimentMetrics(leftId);
  const rightMetrics = useExperimentMetrics(rightId);

  const overlay = useMemo(() => {
    return buildOverlay(leftMetrics.data ?? [], rightMetrics.data ?? []);
  }, [leftMetrics.data, rightMetrics.data]);

  const valDelta = useMemo(() => {
    const a = left.data?.val_bpb ?? null;
    const b = right.data?.val_bpb ?? null;
    if (a === null || b === null) return null;
    return b - a;
  }, [left.data, right.data]);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-muted-foreground" />
          Compare experiments
        </SheetTitle>
        <SheetDescription>
          Side-by-side detail. val_bpb delta and metric overlays highlight the
          divergence.
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-5">
        <ValDeltaBanner
          left={left.data ?? null}
          right={right.data ?? null}
          delta={valDelta}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ExperimentColumn
            exp={left.data ?? null}
            label="A"
            loading={left.isLoading}
            error={left.error}
          />
          <ExperimentColumn
            exp={right.data ?? null}
            label="B"
            loading={right.isLoading}
            error={right.error}
          />
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Hypothesis
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <HypothesisPanel exp={left.data ?? null} label="A" />
            <HypothesisPanel exp={right.data ?? null} label="B" />
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Code diff
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <DiffPanel exp={left.data ?? null} label="A" />
            <DiffPanel exp={right.data ?? null} label="B" />
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Metrics
          </h3>
          <MetricOverlay
            overlay={overlay}
            loading={leftMetrics.isLoading || rightMetrics.isLoading}
          />
        </section>
      </SheetBody>
      <SheetFooter>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </SheetFooter>
    </>
  );
}

function ValDeltaBanner({
  left,
  right,
  delta,
}: {
  left: Experiment | null;
  right: Experiment | null;
  delta: number | null;
}) {
  if (delta === null) {
    return (
      <div className="rounded-md border border-border bg-card/40 px-4 py-3 text-xs text-muted-foreground">
        At least one run is missing val_bpb — direct delta unavailable.
      </div>
    );
  }
  const better = delta < 0; // B better than A (lower is better)
  const tie = Math.abs(delta) < 1e-4;
  const Icon = tie ? Equal : better ? ArrowDown : ArrowUp;
  const tone = tie
    ? "border-border bg-card/40 text-muted-foreground"
    : better
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500 dark:text-emerald-300"
      : "border-red-500/40 bg-red-500/10 text-red-500 dark:text-red-300";

  return (
    <div className={cn("rounded-md border px-4 py-3", tone)}>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">
            A {left?.val_bpb?.toFixed(3) ?? "—"}
          </span>
          <span className="text-muted-foreground">→</span>
          <span className="font-mono text-xs">
            B {right?.val_bpb?.toFixed(3) ?? "—"}
          </span>
        </div>
        <div className="flex items-center gap-1 font-mono text-sm">
          <Icon className="h-4 w-4" aria-hidden="true" />
          {tie ? "Δ tie" : `Δ ${delta > 0 ? "+" : ""}${delta.toFixed(3)} bpb`}
        </div>
      </div>
    </div>
  );
}

function ExperimentColumn({
  exp,
  label,
  loading,
  error,
}: {
  exp: Experiment | null;
  label: string;
  loading: boolean;
  error: Error | null;
}) {
  if (loading) {
    return (
      <div className="rounded-md border border-border bg-card/40 px-3 py-3 text-xs text-muted-foreground">
        Loading {label}…
      </div>
    );
  }
  if (error || !exp) {
    return (
      <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-3 text-xs text-red-500">
        {label}: {String(error?.message ?? "no data")}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card/40 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className="font-mono">
          {label}
        </Badge>
        <ValBpbBadge value={exp.val_bpb} />
      </div>
      <div className="truncate text-sm font-medium">{exp.name}</div>
      <div className="flex flex-wrap items-center gap-2 text-[0.7rem] text-muted-foreground">
        <StatusPill status={exp.status} />
        <span className="font-mono">id {exp.id.slice(0, 8)}…</span>
      </div>
      <div className="text-xs text-muted-foreground">
        started {formatRelative(exp.started_at)}
        {exp.finished_at && ` · finished ${formatRelative(exp.finished_at)}`}
        {exp.commit_hash && (
          <>
            {" "}
            · <span className="font-mono">{exp.commit_hash.slice(0, 7)}</span>
          </>
        )}
        {exp.peak_memory_mb !== null && exp.peak_memory_mb !== undefined && (
          <> · peak {exp.peak_memory_mb} MB</>
        )}
      </div>
      {exp.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {exp.tags.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function HypothesisPanel({
  exp,
  label,
}: {
  exp: Experiment | null;
  label: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card/40 px-3 py-2">
      <div className="mb-1 flex items-center gap-2 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
      </div>
      {exp ? (
        exp.hypothesis.trim().length > 0 ? (
          <Prose source={exp.hypothesis} className="prose-sm" />
        ) : (
          <p className="text-xs text-muted-foreground">No hypothesis recorded.</p>
        )
      ) : (
        <p className="text-xs text-muted-foreground">—</p>
      )}
    </div>
  );
}

function DiffPanel({ exp, label }: { exp: Experiment | null; label: string }) {
  if (!exp || !exp.code_diff) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
        {label}: no diff recorded.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <CodeDiff diff={exp.code_diff} maxHeightClass="max-h-72" />
    </div>
  );
}

type Overlay = {
  /** Concatenated points from both experiments, with the metric key
   *  augmented to disambiguate matching keys across the two runs. */
  points: MetricPoint[];
  /** Whether at least one metric key was shared between the two runs. */
  hasShared: boolean;
};

function buildOverlay(
  leftPoints: readonly MetricPoint[],
  rightPoints: readonly MetricPoint[],
): Overlay {
  const leftKeys = new Set(leftPoints.map((p) => p.key));
  const rightKeys = new Set(rightPoints.map((p) => p.key));
  const shared = new Set([...leftKeys].filter((k) => rightKeys.has(k)));

  // Suffix every series with its side. The legend reads "loss (A)" /
  // "loss (B)" rather than collapsing the two into one ambiguous line.
  const tag = (p: MetricPoint, side: "A" | "B"): MetricPoint => ({
    ...p,
    key: `${p.key} (${side})`,
  });

  return {
    points: [
      ...leftPoints.map((p) => tag(p, "A")),
      ...rightPoints.map((p) => tag(p, "B")),
    ],
    hasShared: shared.size > 0,
  };
}

function MetricOverlay({
  overlay,
  loading,
}: {
  overlay: Overlay;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-md border border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
        Loading metrics…
      </div>
    );
  }
  if (overlay.points.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        Neither run logged metrics.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card/40 p-3">
      <MetricsChart points={overlay.points} multi width={720} height={200} />
      {!overlay.hasShared && (
        <p className="text-[0.7rem] text-muted-foreground">
          No shared metric keys — each run contributes its own series.
        </p>
      )}
    </div>
  );
}
