/**
 * Network → Daemon health.
 *
 * 2x2 grid of detail cards, one per v1.0/v1.1 monitor daemon (audit /
 * federation / ledger / finalizer). Each card surfaces the same
 * eventindexer.Base /health JSON plus the daemon's own count extras —
 * outcomes_count for audit, credit_lines_count / credit_policies_count
 * / reputations_count / pools_count for federation, stakes_count /
 * jobs_count for ledger. Finalize-bot has no per-event store so its
 * card just reflects RPC reachability + last event timestamp.
 *
 * Read-only. No wallet connection.
 */
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Gavel,
  Heart,
  Layers,
  RefreshCw,
  ScrollText,
  ServerCrash,
  Wallet,
} from "lucide-react";
import { type UseQueryResult } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type MonitorHealth,
  relativeAge,
  useAuditHealth,
  useFederationHealth,
  useFinalizerHealth,
  useLedgerHealth,
} from "@/api/network";
import { cn } from "@/lib/utils";

type DaemonStatus = "loading" | "live" | "degraded" | "unreachable";

function statusOf(result: UseQueryResult<MonitorHealth, Error>): DaemonStatus {
  if (result.isLoading && !result.data) return "loading";
  if (result.isError || !result.data) return "unreachable";
  return result.data.status === "ok" && result.data.rpc_reachable
    ? "live"
    : "degraded";
}

const STATUS_TONE: Record<DaemonStatus, string> = {
  loading:
    "border-border bg-card/40 text-muted-foreground",
  live: "border-primary/30 bg-primary/10 text-primary",
  degraded:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  unreachable:
    "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
};

const STATUS_LABEL: Record<DaemonStatus, string> = {
  loading: "Loading",
  live: "Live",
  degraded: "Degraded",
  unreachable: "Unreachable",
};

const STATUS_DOT: Record<DaemonStatus, string> = {
  loading: "bg-muted-foreground animate-pulse",
  live: "bg-primary animate-pulse-soft",
  degraded: "bg-amber-500",
  unreachable: "bg-red-500",
};

function StatusPill({ status }: { status: DaemonStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide",
        STATUS_TONE[status],
      )}
      aria-live="polite"
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          STATUS_DOT[status],
        )}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

type DaemonCardProps = {
  name: string;
  port: number;
  icon: typeof Heart;
  result: UseQueryResult<MonitorHealth, Error>;
  /**
   * Names of the count keys this daemon adds to /health beyond the base
   * eventindexer fields. The card iterates these in order and renders
   * each as a label/value pair.
   */
  countKeys: readonly { key: string; label: string }[];
};

function DaemonCard({ name, port, icon: Icon, result, countKeys }: DaemonCardProps) {
  const status = statusOf(result);
  const data = result.data;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-md border",
              status === "live"
                ? "border-primary/30 bg-primary/10 text-primary"
                : status === "degraded"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : status === "unreachable"
                    ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                    : "border-border bg-card/40 text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-0.5">
            <CardTitle className="text-base font-semibold">{name}</CardTitle>
            <code className="text-[0.7rem] text-muted-foreground">
              127.0.0.1:{port}
            </code>
          </div>
        </div>
        <StatusPill status={status} />
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {status === "unreachable" ? (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <ServerCrash
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500"
              aria-hidden="true"
            />
            <span>
              No response from{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[0.7rem]">
                /health
              </code>
              . Daemon may be offline or not deployed.
            </span>
          </div>
        ) : null}

        {data ? (
          <>
            <Row
              label="RPC"
              value={
                <span
                  className={cn(
                    "font-mono text-xs",
                    data.rpc_reachable
                      ? "text-primary"
                      : "text-amber-700 dark:text-amber-300",
                  )}
                >
                  {data.rpc_reachable ? "reachable" : "unreachable"}
                </span>
              }
            />
            <Row
              label="RPC checked"
              value={
                <span
                  className="text-xs text-muted-foreground"
                  title={data.rpc_checked_at ?? ""}
                >
                  {relativeAge(data.rpc_checked_at) || "—"}
                </span>
              }
            />
            <Row
              label="Last event"
              value={
                <span
                  className="text-xs text-muted-foreground"
                  title={data.last_event_at ?? ""}
                >
                  {relativeAge(data.last_event_at) || "—"}
                </span>
              }
            />
            {countKeys.map(({ key, label }) => {
              const raw = data[key];
              const value = typeof raw === "number" ? raw : null;
              return (
                <Row
                  key={key}
                  label={label}
                  value={
                    <span className="font-mono text-xs">
                      {value == null ? "—" : value}
                    </span>
                  }
                />
              );
            })}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/40 pb-1.5 last:border-b-0 last:pb-0">
      <span className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {value}
    </div>
  );
}

export default function Health() {
  const audit = useAuditHealth();
  const federation = useFederationHealth();
  const ledger = useLedgerHealth();
  const finalizer = useFinalizerHealth();

  const anyFetching =
    audit.isFetching ||
    federation.isFetching ||
    ledger.isFetching ||
    finalizer.isFetching;

  const refreshAll = () => {
    audit.refetch();
    federation.refetch();
    ledger.refetch();
    finalizer.refetch();
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
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
          <Heart className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-semibold tracking-tight">
            Daemon health
          </h1>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={anyFetching}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            anyFetching && "opacity-60",
          )}
          aria-label="Refresh all"
          title="Refresh all"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", anyFetching && "animate-spin")}
          />
          Refresh
        </button>
      </header>

      <p className="max-w-3xl text-xs text-muted-foreground">
        Live aggregation of <code>/health</code> from each v1.0/v1.1 monitor
        daemon. Each card polls independently every 30s; the refresh button
        forces a re-fetch on all four. Counts beyond RPC status are pulled
        from each daemon&apos;s eventindexer.Base extras.
      </p>

      <section
        aria-label="Daemons"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <DaemonCard
          name="audit-monitor"
          port={9275}
          icon={Gavel}
          result={audit}
          countKeys={[{ key: "outcomes_count", label: "Outcomes" }]}
        />
        <DaemonCard
          name="federation-monitor"
          port={9276}
          icon={Layers}
          result={federation}
          countKeys={[
            { key: "credit_lines_count", label: "Credit lines" },
            { key: "credit_policies_count", label: "Credit policies" },
            { key: "reputations_count", label: "Reputations" },
            { key: "pools_count", label: "Pools" },
          ]}
        />
        <DaemonCard
          name="ledger-monitor"
          port={9277}
          icon={Wallet}
          result={ledger}
          countKeys={[
            { key: "stakes_count", label: "Stakes" },
            { key: "jobs_count", label: "Jobs" },
          ]}
        />
        <DaemonCard
          name="finalize-bot"
          port={9278}
          icon={ScrollText}
          result={finalizer}
          countKeys={[]}
        />
      </section>
    </div>
  );
}
