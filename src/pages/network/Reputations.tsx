/**
 * Network → Reputations.
 *
 * Polls federation-monitor's /reputations on a 10s cadence, renders a
 * sortable table of the latest RepUpdated snapshot per node. Live
 * status pill in the header reflects /health.
 *
 * Read-only. No wallet connection.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, ServerCrash, Sigma } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ReputationSnapshot,
  formatWei,
  relativeAge,
  shortHex,
  useFederationHealth,
  useReputations,
} from "@/api/network";
import { cn } from "@/lib/utils";

function HealthPill() {
  const { data, isError, isLoading } = useFederationHealth();
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

type StatusBadgeProps = { r: ReputationSnapshot };

/**
 * Renders the on-chain lifecycle of a node's reputation as a single
 * coloured pill. The labels match the federation contract semantics:
 *   burned == false → "Active"   (primary tone)
 *   burned == true  → "Burned"   (red tone; burned_at relative age
 *                                 rendered underneath in muted text
 *                                 by the caller)
 */
function StatusCell({ r }: StatusBadgeProps) {
  const lifecycle = r.burned
    ? {
        label: "Burned",
        tone: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
      }
    : {
        label: "Active",
        tone: "border-primary/30 bg-primary/10 text-primary",
      };
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          "inline-flex w-fit items-center rounded-full border px-1.5 py-0 text-[0.65rem] font-medium uppercase tracking-wider",
          lifecycle.tone,
        )}
      >
        {lifecycle.label}
      </span>
      {r.burned && r.burned_at ? (
        <span
          className="text-[0.65rem] text-muted-foreground"
          title={r.burned_at}
        >
          {relativeAge(r.burned_at)}
        </span>
      ) : null}
    </div>
  );
}

export default function Reputations() {
  const { data, isError, isLoading, dataUpdatedAt, refetch, isFetching } =
    useReputations();

  /**
   * Sort by earned_score descending (parsed as BigInt — the field is a
   * stringified uint256 and may exceed Number.MAX_SAFE_INTEGER once the
   * federation has been running for a while). Tiebreak by
   * last_event_block desc so equally-scored nodes show most-recent
   * activity first. The daemon doesn't pre-sort.
   */
  const rows = useMemo(() => {
    if (!data) return [] as ReputationSnapshot[];
    const safeBig = (v: string): bigint => {
      try {
        return BigInt(v);
      } catch {
        return 0n;
      }
    };
    return [...data].sort((a, b) => {
      const av = safeBig(a.earned_score);
      const bv = safeBig(b.earned_score);
      if (av !== bv) return bv > av ? 1 : -1;
      return b.last_event_block - a.last_event_block;
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
          <Sigma className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-semibold tracking-tight">Reputations</h1>
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
              federation-monitor daemon is unreachable.
            </p>
            <p className="max-w-md">
              Start it locally (defaults to{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                127.0.0.1:9276
              </code>
              ) or point the vite proxy at the host where it is running. See
              the v1.0 deploy README and{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                cmd/federation-monitor/README.md
              </code>
              .
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!isError && !isLoading && rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No reputations yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The daemon is reachable but hasn&apos;t observed any{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                RepUpdated
              </code>{" "}
              events. On a quiet testnet this is expected — reputation
              snapshots only accumulate once the federation contract starts
              emitting per-node score updates.
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
                    <th className="px-3 py-2 font-medium">Node</th>
                    <th className="px-3 py-2 font-medium">Earned score</th>
                    <th className="px-3 py-2 font-medium">Defaults</th>
                    <th className="px-3 py-2 font-medium">Donations</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Last event</th>
                    <th className="px-3 py-2 font-medium">Block</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.node}
                      className="border-b border-border last:border-b-0 hover:bg-accent/30"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {shortHex(r.node)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.earned_score}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.default_count}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {formatWei(r.donations_total_wei)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusCell r={r} />
                      </td>
                      <td
                        className="px-3 py-2 text-xs text-muted-foreground"
                        title={r.last_event_at}
                      >
                        {relativeAge(r.last_event_at)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.last_event_block}
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
        {rows.length > 0 ? `${rows.length} nodes observed` : null}
      </footer>
    </div>
  );
}
