import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";

import {
  isTerminalSyncStatus,
  useZoteroSyncJob,
  ZERO_TOTALS,
  type ZoteroSyncStatus,
  type ZoteroSyncTotals,
} from "@/api/zotero";
import { Badge } from "@/components/ui/badge";
import { cn, formatRelative } from "@/lib/utils";

const AUTO_COLLAPSE_AFTER_MS = 30_000;

const STATUS_LABEL: Record<ZoteroSyncStatus, string> = {
  pending: "Pending",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<
  ZoteroSyncStatus,
  "default" | "success" | "warning" | "danger" | "outline" | "secondary"
> = {
  pending: "outline",
  running: "warning",
  succeeded: "success",
  failed: "danger",
  cancelled: "default",
};

type TotalsBlockProps = {
  totals: ZoteroSyncTotals;
};

function TotalsBlock({ totals }: TotalsBlockProps) {
  const cells: Array<{ label: string; value: number; tone: string }> = [
    { label: "Seen", value: totals.seen, tone: "text-foreground" },
    { label: "New", value: totals.new, tone: "text-emerald-300" },
    { label: "Deduped", value: totals.deduped, tone: "text-sky-300" },
    { label: "Queued", value: totals.queued, tone: "text-violet-300" },
    {
      label: "Errored",
      value: totals.errored,
      tone:
        totals.errored > 0 ? "text-red-300" : "text-muted-foreground",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="flex flex-col items-start gap-0.5 rounded-md border border-border bg-background/60 px-3 py-2"
        >
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {cell.label}
          </span>
          <span
            className={cn(
              "font-mono text-2xl font-semibold tabular-nums",
              cell.tone,
            )}
          >
            {cell.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function IndeterminateBar() {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40"
      aria-label="Sync in progress"
      role="progressbar"
    >
      <div
        className="h-full w-1/3 rounded-full bg-gradient-to-r from-sky-500 via-primary to-sky-500"
        style={{
          // CSS keyframe declared inline so the file stays self-contained
          // without touching tailwind.config.ts. The slide is bounded by the
          // bar's overflow:hidden, so transform is enough.
          animationName: "zotero-progress-slide",
          animationDuration: "1.4s",
          animationIterationCount: "infinite",
          animationTimingFunction: "ease-in-out",
        }}
      />
      <style>{`
        @keyframes zotero-progress-slide {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(150%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}

function StatusIcon({ status }: { status: ZoteroSyncStatus }) {
  switch (status) {
    case "pending":
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-amber-400" />;
    case "succeeded":
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-400" />;
    case "cancelled":
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

export type SyncProgressProps = {
  jobId: string | null;
  /** Called when the user dismisses a terminal card (or the auto-collapse
   * timer fires after a successful sync). The page can reset its
   * ``activeJobId`` state to ``null`` here. */
  onDismiss?: () => void;
};

export function SyncProgress({ jobId, onDismiss }: SyncProgressProps) {
  const { data, error, isError } = useZoteroSyncJob(jobId);
  const [collapsed, setCollapsed] = React.useState(false);

  // Reset collapse state when the active job id flips.
  React.useEffect(() => {
    setCollapsed(false);
  }, [jobId]);

  // Auto-collapse 30 s after a successful terminal state.
  React.useEffect(() => {
    if (!data || data.status !== "succeeded") return;
    const timer = window.setTimeout(() => {
      setCollapsed(true);
      onDismiss?.();
    }, AUTO_COLLAPSE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [data, onDismiss]);

  if (!jobId) return null;
  if (collapsed) return null;

  // Initial fetch in flight (no data yet, no error)
  if (!data && !isError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Connecting to sync job…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-200">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
        <div className="min-w-0">
          <p className="font-medium">Lost connection to sync job</p>
          <p className="mt-1 text-xs text-red-300/80">
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const totals = data.totals ?? ZERO_TOTALS;
  const isTerminal = isTerminalSyncStatus(data.status);
  const startedRel = formatRelative(data.started_at);
  const finishedRel = data.finished_at
    ? formatRelative(data.finished_at)
    : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusIcon status={data.status} />
          <Badge variant={STATUS_VARIANT[data.status]}>
            {STATUS_LABEL[data.status]}
          </Badge>
          <span className="font-mono text-[11px] text-muted-foreground">
            #{data.id.slice(0, 8)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>started {startedRel}</span>
          {finishedRel ? <span>· finished {finishedRel}</span> : null}
          {isTerminal ? (
            <button
              type="button"
              onClick={() => {
                setCollapsed(true);
                onDismiss?.();
              }}
              className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Dismiss"
            >
              <RotateCcw className="h-3 w-3" />
              Dismiss
            </button>
          ) : null}
        </div>
      </div>

      <TotalsBlock totals={totals} />

      {!isTerminal ? <IndeterminateBar /> : null}

      {data.status === "succeeded" ? (
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
          <div>
            <p className="font-medium">Sync complete</p>
            <p className="mt-0.5 text-emerald-200/80">
              {totals.queued.toLocaleString()} item
              {totals.queued === 1 ? "" : "s"} queued for ingestion ·{" "}
              {totals.deduped.toLocaleString()} skipped as duplicates ·{" "}
              {totals.errored.toLocaleString()} errored. This card auto-hides
              in {Math.round(AUTO_COLLAPSE_AFTER_MS / 1000)}s.
            </p>
          </div>
        </div>
      ) : null}

      {data.status === "failed" ? (
        <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-100">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-300" />
          <div className="min-w-0">
            <p className="font-medium">Sync failed</p>
            <p
              className="mt-0.5 break-words text-red-200/90"
              title={data.error ?? undefined}
            >
              {data.error ?? "The backend did not provide a reason."}
            </p>
          </div>
        </div>
      ) : null}

      {data.status === "cancelled" ? (
        <div className="flex items-start gap-2 rounded-md border border-border bg-card/60 p-2.5 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">Sync cancelled</p>
            <p className="mt-0.5">
              No further items will be queued from this run.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
