/**
 * Network → Audit outcomes.
 *
 * Polls audit-monitor's /outcomes on a 10s cadence, renders a sortable
 * table of recent OutcomePosted events with challenge / finalize-
 * challenged state inlined. Live status pill in the header reflects
 * /health.
 *
 * Read-only. No wallet connection.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Gavel, RefreshCw, ServerCrash } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type AuditOutcome,
  formatBpsPercent,
  relativeAge,
  shortHex,
  useAuditHealth,
  useAuditOutcomes,
} from "@/api/network";
import { cn } from "@/lib/utils";

function HealthPill() {
  const { data, isError, isLoading } = useAuditHealth();
  if (isLoading && !data) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/40 px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
        Loading
      </span>
    );
  }
  if (isError || !data) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide text-red-700 dark:text-red-300">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
        Daemon unreachable
      </span>
    );
  }
  const ok = data.status === "ok" && data.rpc_reachable;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide",
        ok
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
      aria-live="polite"
      title={
        data.last_event_at
          ? `last event ${relativeAge(data.last_event_at)}`
          : "no events yet"
      }
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          ok ? "bg-primary animate-pulse-soft" : "bg-amber-500",
        )}
      />
      {ok ? "Live" : "Degraded"}
    </span>
  );
}

type StatusBadgeProps = { o: AuditOutcome };

/**
 * Renders the three-stage state of an outcome (Posted / Challenged /
 * FinalizedChallenged) as a single coloured pill. The labels match the
 * v1.0 dispute-window semantics:
 *   posted but not challenged    → "Posted"
 *   challenged within window     → "Challenged"
 *   finalize() ran on challenged → "Finalized (challenged)"
 *   pass=false                   → "Slash"   (orange — appended after
 *                                  the lifecycle pill to flag
 *                                  the audit's actual verdict)
 */
function StatusCell({ o }: StatusBadgeProps) {
  const lifecycle = o.finalized_challenged
    ? {
        label: "Finalized (challenged)",
        tone:
          "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
      }
    : o.challenged
      ? {
          label: "Challenged",
          tone:
            "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        }
      : {
          label: "Posted",
          tone:
            "border-primary/30 bg-primary/10 text-primary",
        };
  const verdict = o.pass
    ? null
    : {
        label: "Slash",
        tone: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
      };
  return (
    <div className="flex flex-wrap gap-1">
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-1.5 py-0 text-[0.65rem] font-medium uppercase tracking-wider",
          lifecycle.tone,
        )}
      >
        {lifecycle.label}
      </span>
      {verdict ? (
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-1.5 py-0 text-[0.65rem] font-medium uppercase tracking-wider",
            verdict.tone,
          )}
        >
          {verdict.label}
        </span>
      ) : null}
    </div>
  );
}

export default function Outcomes() {
  const { data, isError, isLoading, dataUpdatedAt, refetch, isFetching } =
    useAuditOutcomes();

  /**
   * Sort newest-first by posted_block (chain-canonical order), falling
   * back to posted_at if blocks tie. The daemon doesn't pre-sort.
   */
  const rows = useMemo(() => {
    if (!data) return [] as AuditOutcome[];
    return [...data].sort((a, b) => {
      if (b.posted_block !== a.posted_block) {
        return b.posted_block - a.posted_block;
      }
      return Date.parse(b.posted_at) - Date.parse(a.posted_at);
    });
  }, [data]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/network"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Back to Network home"
            title="Back to Network home"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Gavel className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-semibold tracking-tight">
            Audit outcomes
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <HealthPill />
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isFetching && "opacity-60",
            )}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
            />
            Refresh
          </button>
        </div>
      </header>

      {isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <ServerCrash className="h-8 w-8 text-red-500" aria-hidden="true" />
            <p className="font-medium text-foreground">
              audit-monitor daemon is unreachable.
            </p>
            <p className="max-w-md">
              Start it locally (defaults to{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                127.0.0.1:9275
              </code>
              ) or point the vite proxy at the host where it is running. See
              the v1.0 deploy README and{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                cmd/audit-monitor/README.md
              </code>
              .
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!isError && !isLoading && rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No outcomes yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The daemon is reachable but hasn&apos;t observed any{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                OutcomePosted
              </code>{" "}
              events. On a quiet testnet this is expected — outcomes only
              accumulate when the orchestrator + audit pipeline are driving
              jobs through the Audit contract.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Job ID</th>
                    <th className="px-3 py-2 font-medium">Worker</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Similarity</th>
                    <th className="px-3 py-2 font-medium">Block</th>
                    <th className="px-3 py-2 font-medium">Posted</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr
                      key={o.job_id}
                      className="border-b border-border last:border-b-0 hover:bg-accent/30"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {shortHex(`0x${o.job_id}`)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {shortHex(o.worker)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusCell o={o} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {formatBpsPercent(o.similarity_bps)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {o.posted_block}
                      </td>
                      <td
                        className="px-3 py-2 text-xs text-muted-foreground"
                        title={o.posted_at}
                      >
                        {relativeAge(o.posted_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <footer className="text-[0.7rem] text-muted-foreground">
        {dataUpdatedAt
          ? `Last fetched ${relativeAge(new Date(dataUpdatedAt).toISOString())}`
          : null}
        {dataUpdatedAt && rows.length > 0 ? " · " : null}
        {rows.length > 0 ? `${rows.length} outcomes observed` : null}
      </footer>
    </div>
  );
}
