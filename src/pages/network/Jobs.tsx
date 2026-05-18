/**
 * Network → Jobs.
 *
 * Polls ledger-monitor's /jobs on a 10s cadence, renders a sortable
 * table of recent job lifecycle events (StakeLocked → JobSettled /
 * JobSlashed) with each stage's chain coordinates inlined. Live
 * status pill in the header reflects /health.
 *
 * Read-only. No wallet connection.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, ScrollText, ServerCrash } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatBps,
  formatWei,
  type JobLifecycle,
  relativeAge,
  shortHex,
  useJobs,
  useLedgerHealth,
} from "@/api/network";
import { cn } from "@/lib/utils";

function HealthPill() {
  const { data, isError, isLoading } = useLedgerHealth();
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

type StatusBadgeProps = { j: JobLifecycle };

/**
 * Renders the lifecycle state of a job as one or more coloured pills.
 * Priority order mirrors the StakingLedger contract semantics:
 *   locked && !settled && !slashed       → "Locked"      (primary)
 *   settled                              → "Settled"     (purple)
 *   slashed                              → "Slashed"     (red)
 *   !locked && !settled && !slashed      → "Pending"     (muted —
 *                                          no lock event observed)
 * settled && slashed (shouldn't happen per contract, but defensive)
 * shows both pills.
 */
function StatusCell({ j }: StatusBadgeProps) {
  const pills: Array<{ label: string; tone: string }> = [];
  if (j.settled) {
    pills.push({
      label: "Settled",
      tone:
        "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
    });
  }
  if (j.slashed) {
    pills.push({
      label: "Slashed",
      tone: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    });
  }
  if (j.locked && !j.settled && !j.slashed) {
    pills.push({
      label: "Locked",
      tone: "border-primary/30 bg-primary/10 text-primary",
    });
  }
  if (!j.locked && !j.settled && !j.slashed) {
    pills.push({
      label: "Pending",
      tone: "border-border bg-muted/40 text-muted-foreground",
    });
  }
  return (
    <div className="flex flex-wrap gap-1">
      {pills.map((p) => (
        <span
          key={p.label}
          className={cn(
            "inline-flex items-center rounded-full border px-1.5 py-0 text-[0.65rem] font-medium uppercase tracking-wider",
            p.tone,
          )}
        >
          {p.label}
        </span>
      ))}
    </div>
  );
}

export default function Jobs() {
  const { data, isError, isLoading, dataUpdatedAt, refetch, isFetching } =
    useJobs();

  /**
   * Sort newest-first by the latest observed event block on each job
   * (lock / settle / slash, whichever is highest). The daemon doesn't
   * pre-sort.
   */
  const rows = useMemo(() => {
    if (!data) return [] as JobLifecycle[];
    const latestBlock = (j: JobLifecycle) =>
      Math.max(
        j.locked_block ?? 0,
        j.settled_block ?? 0,
        j.slashed_block ?? 0,
      );
    return [...data].sort((a, b) => latestBlock(b) - latestBlock(a));
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
          <ScrollText className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-semibold tracking-tight">Jobs</h1>
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
              ledger-monitor daemon is unreachable.
            </p>
            <p className="max-w-md">
              Start it locally (defaults to{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                127.0.0.1:9277
              </code>
              ) or point the vite proxy at the host where it is running. See
              the v1.0 deploy README and{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                cmd/ledger-monitor/README.md
              </code>
              .
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!isError && !isLoading && rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No jobs yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The daemon is reachable but hasn&apos;t observed any{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                StakeLocked
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                JobSettled
              </code>
              , or{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                JobSlashed
              </code>{" "}
              events. Orchestrators must call{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                lockForJob()
              </code>{" "}
              on the StakingLedger contract before rows appear here.
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
                    <th className="px-3 py-2 font-medium">Publisher</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Stake</th>
                    <th className="px-3 py-2 font-medium">Gross</th>
                    <th className="px-3 py-2 font-medium">Paid / Slashed</th>
                    <th className="px-3 py-2 font-medium">Block</th>
                    <th className="px-3 py-2 font-medium">Last event</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((j) => {
                    /**
                     * Pick the most recent lifecycle timestamp for the
                     * "Last event" column — slash supersedes settle
                     * supersedes lock per contract ordering.
                     */
                    const lastEventAt =
                      j.slashed_at || j.settled_at || j.locked_at;
                    return (
                      <tr
                        key={j.job_id}
                        className="border-b border-border last:border-b-0 hover:bg-accent/30"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {shortHex(`0x${j.job_id}`)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {j.worker ? shortHex(j.worker) : ""}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {j.publisher ? shortHex(j.publisher) : ""}
                        </td>
                        <td className="px-3 py-2">
                          <StatusCell j={j} />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {formatWei(j.stake_wei)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {formatWei(j.gross_wei)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {j.settled
                            ? formatWei(j.paid_wei)
                            : j.slashed
                              ? `${formatWei(j.slashed_stake_wei)} (${formatBps(j.slash_fraction_bps)})`
                              : ""}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {j.locked_block ?? "—"}
                        </td>
                        <td
                          className="px-3 py-2 text-xs text-muted-foreground"
                          title={lastEventAt}
                        >
                          {relativeAge(lastEventAt)}
                        </td>
                      </tr>
                    );
                  })}
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
        {rows.length > 0 ? `${rows.length} jobs observed` : null}
      </footer>
    </div>
  );
}
