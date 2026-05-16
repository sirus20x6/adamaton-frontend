import { Loader2, RefreshCcw, AlertTriangle } from "lucide-react";

import {
  TRUST_FACTORS,
  TRUST_FACTOR_EXPLANATIONS,
  TRUST_FACTOR_LABELS,
  factorValue,
  factorWeight,
  useRecomputeTrust,
  useTrustDetail,
  type TrustDetail,
  type TrustFactor,
} from "@/api/trust";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type TrustScorecardProps = {
  /** UUID of the document we're showing trust for. */
  documentId: string;
  /** Compact rendering shrinks padding + hides the recompute button. */
  compact?: boolean;
  className?: string;
};

/**
 * Maps a final score to the same red/amber/green palette TrustBadge uses,
 * so the prominent score number is colored consistently with the small
 * badges sprinkled across IndexedPanel etc.
 */
function scoreTone(score: number | null | undefined): {
  text: string;
  ring: string;
  bg: string;
} {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return {
      text: "text-muted-foreground",
      ring: "ring-border",
      bg: "bg-muted/40",
    };
  }
  if (score >= 0.8) {
    return {
      text: "text-emerald-600 dark:text-emerald-300",
      ring: "ring-emerald-500/40",
      bg: "bg-emerald-500/10",
    };
  }
  if (score >= 0.5) {
    return {
      text: "text-amber-600 dark:text-amber-300",
      ring: "ring-amber-500/40",
      bg: "bg-amber-500/10",
    };
  }
  return {
    text: "text-red-600 dark:text-red-300",
    ring: "ring-red-500/40",
    bg: "bg-red-500/10",
  };
}

function FactorRow({
  factor,
  detail,
}: {
  factor: TrustFactor;
  detail: TrustDetail;
}) {
  const value = factorValue(detail.signals, factor);
  const weight = factorWeight(detail.signals, factor);
  const contribution = Math.max(0, Math.min(1, value * weight));
  const barWidth = `${(value * 100).toFixed(1)}%`;
  const weightPct = `${Math.round(weight * 100)}%`;
  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "grid grid-cols-[minmax(0,1fr)_3.25rem_3.25rem] items-center gap-2",
            "rounded-md px-1.5 py-1 text-left",
            "hover:bg-accent/40 focus-within:bg-accent/40",
          )}
          tabIndex={0}
        >
          <div className="min-w-0 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-foreground">
                {TRUST_FACTOR_LABELS[factor]}
              </span>
              <span className="font-mono text-[0.65rem] text-muted-foreground">
                {value.toFixed(2)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
              <div
                role="progressbar"
                aria-label={TRUST_FACTOR_LABELS[factor]}
                aria-valuenow={Math.round(value * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-full rounded-full bg-primary/70 transition-[width]"
                style={{ width: barWidth }}
              />
            </div>
          </div>
          <span className="text-right font-mono text-[0.65rem] text-muted-foreground">
            {weightPct}
          </span>
          <span className="text-right font-mono text-[0.65rem] text-foreground">
            {contribution.toFixed(3)}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        className="max-w-xs text-left leading-snug"
      >
        <p className="font-medium">{TRUST_FACTOR_LABELS[factor]}</p>
        <p className="mt-1 text-[0.7rem] text-muted-foreground">
          {TRUST_FACTOR_EXPLANATIONS[factor]}
        </p>
        <p className="mt-1.5 font-mono text-[0.65rem] text-muted-foreground">
          contribution = value × weight = {value.toFixed(2)} × {weight.toFixed(2)} ={" "}
          {contribution.toFixed(3)}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function ScorecardError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p className="leading-snug">{message}</p>
    </div>
  );
}

function ScorecardSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground",
        compact ? "p-2" : "p-3",
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Loading trust signals…
    </div>
  );
}

export function TrustScorecard({
  documentId,
  compact = false,
  className,
}: TrustScorecardProps) {
  const detailQuery = useTrustDetail(documentId);
  const { toast } = useToast();
  const recompute = useRecomputeTrust(documentId, {
    onSuccess: (resp) => {
      if (resp.ok) {
        toast({
          title: "Recompute queued",
          description: resp.job_id
            ? `job ${resp.job_id.slice(0, 8)} on ${resp.queue ?? "lo"}`
            : "Trust recompute scheduled.",
          variant: "success",
        });
      } else {
        toast({
          title: "Recompute rejected",
          description:
            resp.error ?? "Backend refused the recompute request.",
          variant: "error",
        });
      }
    },
    onError: (err) => {
      toast({
        title: "Recompute failed",
        description: err.message,
        variant: "error",
      });
    },
  });

  if (detailQuery.isLoading) {
    return (
      <div
        className={cn(
          "rounded-md border border-border bg-card text-card-foreground",
          className,
        )}
      >
        <ScorecardSkeleton compact={compact} />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    const message =
      detailQuery.error?.message ??
      "No trust row for this document yet — Stage 1 may not have run.";
    return (
      <div
        className={cn(
          "rounded-md border border-border bg-card p-2 text-card-foreground",
          className,
        )}
      >
        <ScorecardError message={message} />
      </div>
    );
  }

  const detail = detailQuery.data;
  const score = detail.stage1_score;
  const tone = scoreTone(score);

  return (
    <TooltipProvider>
      <div
        className={cn(
          "rounded-md border border-border bg-card text-card-foreground",
          compact ? "p-2.5" : "p-3",
          className,
        )}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
              Stage 1 trust
            </p>
            <p
              className="truncate font-mono text-[0.7rem] text-muted-foreground"
              title={detail.document_id}
            >
              {detail.document_id.slice(0, 8)}…
            </p>
          </div>
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-2",
              tone.bg,
              tone.ring,
            )}
            aria-label={
              score === null
                ? "trust score unavailable"
                : `trust score ${score.toFixed(2)}`
            }
          >
            <span
              className={cn(
                "font-mono text-sm font-semibold tabular-nums",
                tone.text,
              )}
            >
              {score === null ? "—" : score.toFixed(2)}
            </span>
          </div>
        </header>

        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_3.25rem_3.25rem] gap-2 px-1.5 pb-1 text-[0.6rem] uppercase tracking-wide text-muted-foreground">
          <span>factor</span>
          <span className="text-right">weight</span>
          <span className="text-right">contrib</span>
        </div>
        <div className="space-y-0.5">
          {TRUST_FACTORS.map((factor) => (
            <FactorRow key={factor} factor={factor} detail={detail} />
          ))}
        </div>

        {detail.stage3_score !== null ? (
          <p className="mt-2 rounded-md bg-muted/40 px-2 py-1 text-[0.7rem] text-muted-foreground">
            Stage 3:{" "}
            <span className="font-mono text-foreground">
              {detail.stage3_score.toFixed(2)}
            </span>
          </p>
        ) : null}

        {compact ? null : (
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[0.65rem] text-muted-foreground">
              {detail.computed_at
                ? `computed ${new Date(detail.computed_at).toLocaleString()}`
                : "computed time unknown"}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => recompute.mutate()}
              disabled={recompute.isPending}
              className="gap-1.5"
            >
              {recompute.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCcw className="h-3 w-3" />
              )}
              Recompute
            </Button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
