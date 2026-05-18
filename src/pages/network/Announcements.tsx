/**
 * Network → Stealth announcements.
 *
 * Polls stealthmonitor's /announcements every 10s and renders a
 * table of recent ERC-5564 Announce events. Read-only — workers run
 * `adamaton-wallet stealth scan` against this page's data (or the
 * raw JSON endpoint) with their viewing key to detect their own
 * incoming payments. The page itself can't tell which announcements
 * are "yours"; the viewing key never leaves the worker's host.
 *
 * Header pill reflects /health.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Eye, RefreshCw, ServerCrash } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type StealthAnnouncement,
  relativeAge,
  shortHex,
  useStealthAnnouncements,
  useStealthHealth,
} from "@/api/network";
import { cn } from "@/lib/utils";

function HealthPill() {
  const { data, isError, isLoading } = useStealthHealth();
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

/**
 * Render the metadata blob's view tag separately from any application
 * payload. Scheme 0x01 puts the 1-byte view tag in metadata[0]; the
 * remainder is publisher-defined (jobId hint, amount hint, etc.).
 * Empty payloads render only the tag chip.
 */
function MetadataCell({ metadata }: { metadata: string }) {
  const hex = metadata.replace(/^0x/, "");
  if (hex.length < 2) {
    return <span className="font-mono text-xs text-muted-foreground">—</span>;
  }
  const viewTag = "0x" + hex.slice(0, 2);
  const rest = hex.length > 2 ? "0x" + hex.slice(2) : "";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0 text-[0.65rem] font-mono uppercase tracking-wider text-primary"
        title="view tag (metadata[0])"
      >
        tag {viewTag}
      </span>
      {rest ? (
        <span
          className="font-mono text-[0.7rem] text-muted-foreground"
          title={rest}
        >
          {rest.length > 18 ? rest.slice(0, 18) + "…" : rest}
        </span>
      ) : null}
    </div>
  );
}

export default function Announcements() {
  const { data, isError, isLoading, dataUpdatedAt, refetch, isFetching } =
    useStealthAnnouncements();

  /**
   * Sort newest-first by block, tiebreak by observed_at. The daemon
   * holds a ring buffer (oldest first); we reverse for display so
   * the freshest event is at the top.
   */
  const rows = useMemo(() => {
    if (!data) return [] as StealthAnnouncement[];
    return [...data].sort((a, b) => {
      if (b.block !== a.block) return b.block - a.block;
      return Date.parse(b.observed_at) - Date.parse(a.observed_at);
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
          <Eye className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-semibold tracking-tight">
            Stealth announcements
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

      <p className="max-w-3xl text-xs text-muted-foreground">
        Live mirror of the StealthAnnouncer contract&apos;s{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[0.7rem]">
          Announce
        </code>{" "}
        event log (ERC-5564 scheme 0x01). The page itself is blind to
        which announcements are addressed to you — workers run{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[0.7rem]">
          adamaton-wallet stealth scan
        </code>{" "}
        with their viewing key locally to detect incoming stealth
        payments. The viewing key never leaves the worker&apos;s host.
      </p>

      {isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <ServerCrash className="h-8 w-8 text-red-500" aria-hidden="true" />
            <p className="font-medium text-foreground">
              stealthmonitor daemon is unreachable.
            </p>
            <p className="max-w-md">
              Start it locally (defaults to{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                127.0.0.1:9279
              </code>
              ) or point the vite proxy at the host where it is running. See{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                cmd/stealthmonitor/README.md
              </code>
              .
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!isError && !isLoading && rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No announcements yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The daemon is reachable but hasn&apos;t observed any{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                Announce
              </code>{" "}
              events. Publishers must call{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                StealthAnnouncer.announce(...)
              </code>{" "}
              for rows to appear here — the Phase 8.2 orchestrator
              integration (PR 5) does this automatically when a job
              settles to a stealth address.
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
                    <th className="px-3 py-2 font-medium">Stealth address</th>
                    <th className="px-3 py-2 font-medium">Caller</th>
                    <th className="px-3 py-2 font-medium">Scheme</th>
                    <th className="px-3 py-2 font-medium">Metadata</th>
                    <th className="px-3 py-2 font-medium">Block</th>
                    <th className="px-3 py-2 font-medium">Observed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr
                      key={a.tx + ":" + a.stealth_address}
                      className="border-b border-border last:border-b-0 hover:bg-accent/30"
                    >
                      <td
                        className="px-3 py-2 font-mono text-xs"
                        title={a.stealth_address}
                      >
                        {shortHex(a.stealth_address)}
                      </td>
                      <td
                        className="px-3 py-2 font-mono text-xs text-muted-foreground"
                        title={a.caller}
                      >
                        {shortHex(a.caller)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        0x{a.scheme_id.toString(16).padStart(2, "0")}
                      </td>
                      <td className="px-3 py-2">
                        <MetadataCell metadata={a.metadata} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {a.block}
                      </td>
                      <td
                        className="px-3 py-2 text-xs text-muted-foreground"
                        title={a.observed_at}
                      >
                        {relativeAge(a.observed_at)}
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
        {rows.length > 0
          ? `${rows.length} announcement${rows.length === 1 ? "" : "s"} retained`
          : null}
      </footer>
    </div>
  );
}
