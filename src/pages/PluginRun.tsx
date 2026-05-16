import * as React from "react";
import { ArrowLeft, Loader2, Plug } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import {
  isTerminalPluginRunStatus,
  usePlugin,
  usePluginRuns,
  type PluginCapability,
  type PluginRun,
  type PluginRunStatus,
} from "@/api/plugins";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/toast";
import { PluginItemsTable } from "@/features/plugins/PluginItemsTable";
import { PluginRunForm } from "@/features/plugins/PluginRunForm";
import { PluginRunProgress } from "@/features/plugins/PluginRunProgress";
import { YouTubeForm } from "@/features/plugins/youtube/YouTubeForm";
import { formatRelative } from "@/lib/utils";

const CAPABILITY_LABEL: Record<PluginCapability, string> = {
  fetch_one: "fetch one",
  fetch_channel: "channel",
  fetch_playlist: "playlist",
  fetch_audio: "audio",
  fetch_video: "video",
  fetch_snapshots: "snapshots",
};

const STATUS_LABEL: Record<PluginRunStatus, string> = {
  pending: "Pending",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<
  PluginRunStatus,
  "default" | "success" | "warning" | "danger" | "outline" | "secondary"
> = {
  pending: "outline",
  running: "warning",
  succeeded: "success",
  failed: "danger",
  cancelled: "default",
};

function unwrapRuns(
  data: { items?: PluginRun[]; results?: PluginRun[] } | undefined,
): PluginRun[] {
  if (!data) return [];
  return data.items ?? data.results ?? [];
}

export default function PluginRunPage() {
  const params = useParams<{ pluginId: string }>();
  const pluginId = params.pluginId ?? "";
  const manifestQuery = usePlugin(pluginId);
  const manifest = manifestQuery.data;

  const [activeRunId, setActiveRunId] = React.useState<string | null>(null);

  const recentQuery = usePluginRuns({ plugin_id: pluginId, limit: 5 });
  const recentRuns = unwrapRuns(recentQuery.data);

  // The shape of the form is plugin-specific. YouTube has a hand-tuned
  // form; everything else falls through to the generic schema-driven form.
  const renderForm = (): React.ReactNode => {
    if (!manifest) return null;
    if (pluginId === "youtube") {
      return <YouTubeForm onRunStarted={setActiveRunId} />;
    }
    return <PluginRunForm plugin={manifest} onRunStarted={setActiveRunId} />;
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-6">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Link
          to="/plugins"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Plugins
        </Link>
        <span>/</span>
        <span className="font-mono">{pluginId}</span>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Plug className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">
              {manifestQuery.isLoading
                ? "Loading…"
                : (manifest?.name ?? pluginId)}
            </h1>
            <p className="text-sm text-muted-foreground">
              {manifestQuery.isError
                ? `Couldn't load this plugin: ${
                    manifestQuery.error instanceof Error
                      ? manifestQuery.error.message
                      : String(manifestQuery.error)
                  }`
                : (manifest?.description ?? "")}
            </p>
          </div>
        </div>
        {manifest && manifest.capabilities.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {manifest.capabilities.map((cap) => (
              <Badge key={cap} variant="outline" className="font-mono">
                {CAPABILITY_LABEL[cap] ?? cap}
              </Badge>
            ))}
          </div>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto pr-1">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <h2 className="mb-2 text-sm font-semibold tracking-tight">
              Run config
            </h2>
            {manifestQuery.isLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading manifest…
              </div>
            ) : null}
            {manifestQuery.isError ? (
              <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-200">
                <p className="font-medium">Plugin not available</p>
                <p className="mt-1 text-xs text-red-300/80">
                  {manifestQuery.error instanceof Error
                    ? manifestQuery.error.message
                    : String(manifestQuery.error)}
                </p>
              </div>
            ) : null}
            {!manifestQuery.isLoading && !manifestQuery.isError
              ? renderForm()
              : null}
          </div>

          <div className="lg:col-span-2">
            <h2 className="mb-2 text-sm font-semibold tracking-tight">
              Active run
            </h2>
            {activeRunId ? (
              <PluginRunProgress
                runId={activeRunId}
                onDismiss={() => setActiveRunId(null)}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-card/30 p-6 text-center text-xs text-muted-foreground">
                <p>
                  No run in flight. Start one from the form to watch progress
                  here.
                </p>
              </div>
            )}
          </div>
        </div>

        <section className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Items</h2>
            <p className="text-[11px] text-muted-foreground">
              Most recent first. Filter by ingest status.
            </p>
          </div>
          <PluginItemsTable pluginId={pluginId} />
        </section>

        <section className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">
              Recent runs
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Last 5 runs for this plugin.
            </p>
          </div>
          {recentQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading recent runs…
            </div>
          ) : null}
          {recentQuery.isError ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-xs text-red-200">
              {recentQuery.error instanceof Error
                ? recentQuery.error.message
                : String(recentQuery.error)}
            </div>
          ) : null}
          {!recentQuery.isLoading && recentRuns.length === 0 ? (
            <div className="rounded-lg border border-border bg-card/30 p-6 text-center text-xs text-muted-foreground">
              No runs yet. Start one above.
            </div>
          ) : null}
          {recentRuns.length > 0 ? (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card/40">
              {recentRuns.map((run) => {
                const terminal = isTerminalPluginRunStatus(run.status);
                return (
                  <li
                    key={run.id}
                    className="grid grid-cols-[120px_1fr_140px_140px] items-center gap-3 px-4 py-2 text-xs"
                  >
                    <Badge variant={STATUS_VARIANT[run.status]}>
                      {STATUS_LABEL[run.status]}
                    </Badge>
                    <span
                      className="truncate font-mono text-[11px] text-muted-foreground"
                      title={run.source}
                    >
                      {run.source || "—"}
                    </span>
                    <span
                      className="truncate text-[11px] text-muted-foreground"
                      title={run.created_at}
                    >
                      started {formatRelative(run.started_at ?? run.created_at)}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground tabular-nums">
                      {terminal
                        ? `${(run.totals?.queued ?? 0).toLocaleString()} queued · ${(run.totals?.errored ?? 0).toLocaleString()} err`
                        : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      </div>

      <Toaster />
    </section>
  );
}
