/**
 * Network → Pools.
 *
 * Polls federation-monitor's /pools on a 30s cadence, renders a
 * sortable table of PoolRegistered events. Live status pill in the
 * header reflects /health.
 *
 * Read-only. No wallet connection.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  Layers,
  RefreshCw,
  ServerCrash,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type Pool,
  formatBps,
  relativeAge,
  shortHex,
  useFederationHealth,
  usePools,
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

type MembersCellProps = { pool: Pool };

/**
 * Renders the member count as a small clickable chip. Clicking
 * (or focusing + Enter) expands a list of member addresses below
 * the row's inline content. Implemented with native <details> so
 * keyboard + screen-reader semantics come for free.
 */
function MembersCell({ pool }: MembersCellProps) {
  return (
    <details className="group [&[open]>summary>svg]:rotate-90">
      <summary className="inline-flex items-center gap-1 cursor-pointer rounded-md border border-border px-2 py-0.5 text-xs hover:bg-accent list-none [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="h-3 w-3 transition-transform"
          aria-hidden="true"
        />
        {pool.member_count}
      </summary>
      {pool.members.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-0.5 pl-4">
          {pool.members.map((m) => (
            <li
              key={m}
              className="font-mono text-xs text-muted-foreground"
              title={m}
            >
              {shortHex(m)}
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

export default function Pools() {
  const { data, isError, isLoading, dataUpdatedAt, refetch, isFetching } =
    usePools();

  /**
   * Sort newest-first by registered_at. The daemon doesn't pre-sort
   * and registration order is what operators care about when
   * eyeballing the registry.
   */
  const rows = useMemo(() => {
    if (!data) return [] as Pool[];
    return [...data].sort(
      (a, b) => Date.parse(b.registered_at) - Date.parse(a.registered_at),
    );
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
          <Layers className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-semibold tracking-tight">Pools</h1>
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
            <CardTitle className="text-base">No pools yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The daemon is reachable but hasn&apos;t observed any{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                PoolRegistered
              </code>{" "}
              events. Pools must call{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                registerPool()
              </code>{" "}
              on the federation contract before rows appear here.
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
                    <th className="px-3 py-2 font-medium">Pool</th>
                    <th className="px-3 py-2 font-medium">Operator</th>
                    <th className="px-3 py-2 font-medium">Tax</th>
                    <th className="px-3 py-2 font-medium">Members</th>
                    <th className="px-3 py-2 font-medium">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr
                      key={p.pool_id}
                      className="border-b border-border last:border-b-0 hover:bg-accent/30"
                    >
                      <td
                        className="px-3 py-2 font-mono text-xs text-muted-foreground"
                        title={p.pool_id}
                      >
                        {shortHex(p.pool_id)}
                      </td>
                      <td
                        className="px-3 py-2 font-mono text-xs text-muted-foreground"
                        title={p.operator}
                      >
                        {shortHex(p.operator)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {formatBps(p.tax_bps)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <MembersCell pool={p} />
                      </td>
                      <td
                        className="px-3 py-2 text-xs text-muted-foreground"
                        title={p.registered_at}
                      >
                        {relativeAge(p.registered_at)}
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
        {rows.length > 0 ? `${rows.length} pools observed` : null}
      </footer>
    </div>
  );
}
