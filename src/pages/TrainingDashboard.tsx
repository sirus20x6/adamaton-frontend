/**
 * Training dashboard: multi-run overlay for the autoresearch journal.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────┐
 *   │ Header: title • session picker • back link • live    │
 *   │         pill • last refresh timestamp                │
 *   ├────────────┬─────────────────────────────────────────┤
 *   │ run        │  TrainingChart (multi-series)           │
 *   │ selector   │  Metric chips                           │
 *   │            │  RunDetailCard grid                     │
 *   │            │  SystemStatsPanel                       │
 *   └────────────┴─────────────────────────────────────────┘
 *
 * URL state: ``?ids=<id1,id2>&metric=<key>&session=<sid>`` so the page
 * is shareable and reload-stable.
 */

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Activity,
  LineChart,
  RefreshCcw,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import {
  type BulkMetricsSeries,
  type Experiment,
  type ExperimentStatus,
  useBulkMetrics,
  useExperiments,
} from "@/api/experiments";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ALL_SESSIONS,
  SessionPicker,
  type SessionOption,
} from "@/features/experiments/SessionPicker";
import { RunSelector, MAX_ACTIVE_RUNS } from "@/features/experiments/RunSelector";
import { MetricSelector } from "@/features/experiments/MetricSelector";
import { TrainingChart, type ChartSeries } from "@/features/experiments/TrainingChart";
import { RunDetailCard } from "@/features/experiments/RunDetailCard";
import { SystemStatsPanel } from "@/features/experiments/SystemStatsPanel";
import { colorForRun } from "@/features/experiments/runColors";
import { cn, formatRelative } from "@/lib/utils";

const DEFAULT_METRIC = "val_bpb";

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * For a given set of selected experiments and a target metric, build
 * the {experimentId: ChartSeries} map. ``val_bpb`` falls back to a
 * synthetic single-step series sourced from the experiments table when
 * no metric points exist server-side.
 */
function buildSeries({
  experiments,
  bulkSeries,
  metric,
  activeIds,
}: {
  experiments: readonly Experiment[];
  bulkSeries: BulkMetricsSeries;
  metric: string;
  activeIds: readonly string[];
}): ChartSeries[] {
  const byId = new Map(experiments.map((e) => [e.id, e] as const));
  const out: ChartSeries[] = [];
  for (const id of activeIds) {
    const exp = byId.get(id);
    if (!exp) continue;
    const color = colorForRun(id, activeIds);
    const fromServer = bulkSeries[id]?.[metric] ?? [];
    let points = fromServer.map((p) => ({ x: p.step, y: p.value }));

    if (points.length === 0 && metric === "val_bpb" && exp.val_bpb !== null) {
      // Synthetic anchor so val_bpb still plots when the run never
      // emitted a metric stream — see also MetricSelector's note.
      points = [{ x: 0, y: exp.val_bpb }];
    }
    if (points.length === 0 && metric === "peak_memory_mb" && exp.peak_memory_mb !== null) {
      points = [{ x: 0, y: exp.peak_memory_mb }];
    }

    out.push({
      id,
      label: exp.name,
      color,
      points,
    });
  }
  return out;
}

const RUNNING: ExperimentStatus = "running";

export default function TrainingDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();

  const sessionFilter = searchParams.get("session") ?? ALL_SESSIONS;
  const metricKey = searchParams.get("metric") ?? DEFAULT_METRIC;
  const activeIds = useMemo(
    () => parseIds(searchParams.get("ids")),
    [searchParams],
  );
  const [smoothing, setSmoothing] = useState(0);
  const [logY, setLogY] = useState(false);

  // Fetch the experiments table — used as the source of truth for the
  // run selector and for synthesizing fallback val_bpb / peak_memory_mb
  // series. Refetch every 30s as required by the spec.
  const list = useExperiments(
    {
      sort_by: "val_bpb",
      agent_session_id: sessionFilter === ALL_SESSIONS ? null : sessionFilter,
      limit: 200,
    },
    { refetchInterval: 30_000 },
  );

  const experiments = list.data?.items ?? [];

  const sessionOptions: SessionOption[] = useMemo(() => {
    const map = new Map<string, { count: number; best: number | null }>();
    for (const e of experiments) {
      if (!e.agent_session_id) continue;
      const key = e.agent_session_id;
      const cur = map.get(key) ?? { count: 0, best: null };
      cur.count += 1;
      if (e.val_bpb !== null) {
        cur.best =
          cur.best === null ? e.val_bpb : Math.min(cur.best, e.val_bpb);
      }
      map.set(key, cur);
    }
    return Array.from(map, ([id, v]) => ({
      id,
      count: v.count,
      bestValBpb: v.best,
    })).sort((a, b) => b.count - a.count);
  }, [experiments]);

  const activeExperiments = useMemo(() => {
    const byId = new Map(experiments.map((e) => [e.id, e] as const));
    return activeIds
      .map((id) => byId.get(id))
      .filter((e): e is Experiment => Boolean(e));
  }, [experiments, activeIds]);

  // We intentionally don't auto-seed: the empty state in the chart panel
  // tells the user to "Select runs in the left rail to plot" so the
  // dashboard is predictable across reloads. Quick-actions in the run
  // selector ("Best 5") are one click away when needed.

  const anyActiveRunning = activeExperiments.some((e) => e.status === RUNNING);

  const bulk = useBulkMetrics(
    {
      ids: activeIds,
      // No keys filter — fetch everything so MetricSelector can derive
      // the chip set from the actual payload. Cheap with the (id, key)
      // index even for ~12 runs.
    },
    {
      // FUTURE: pass since_step here to do incremental merges. v1 just
      // refetches the full window — fine until series get long.
      refetchInterval: anyActiveRunning ? 3_000 : 30_000,
    },
  );

  const bulkSeries = bulk.data?.series ?? {};

  const discoveredKeys = useMemo(() => {
    const set = new Set<string>();
    for (const perKey of Object.values(bulkSeries)) {
      for (const k of Object.keys(perKey)) set.add(k);
    }
    return [...set];
  }, [bulkSeries]);

  const series = useMemo(
    () =>
      buildSeries({
        experiments: activeExperiments,
        bulkSeries,
        metric: metricKey,
        activeIds,
      }),
    [activeExperiments, bulkSeries, metricKey, activeIds],
  );

  // ---- URL helpers --------------------------------------------------

  const setActiveIds = (next: string[]) => {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      if (next.length === 0) sp.delete("ids");
      else sp.set("ids", next.slice(0, MAX_ACTIVE_RUNS).join(","));
      return sp;
    });
  };
  const setMetric = (next: string) => {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      sp.set("metric", next);
      return sp;
    });
  };
  const setSession = (next: string) => {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      if (next === ALL_SESSIONS) sp.delete("session");
      else sp.set("session", next);
      return sp;
    });
  };

  const lastUpdatedAt = bulk.dataUpdatedAt
    ? new Date(bulk.dataUpdatedAt)
    : null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-col gap-3 border-b border-border bg-background/60 px-6 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LineChart className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold tracking-tight">
              Training dashboard
            </h1>
            <span className="text-xs text-muted-foreground">
              autoresearch live monitor
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SessionPicker
              value={sessionFilter}
              onChange={setSession}
              options={sessionOptions}
            />
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium",
                anyActiveRunning
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-border bg-card/40 text-muted-foreground",
              )}
              aria-live="polite"
            >
              <Activity
                className={cn(
                  "h-3 w-3",
                  anyActiveRunning && "animate-pulse-soft",
                )}
              />
              {anyActiveRunning ? "Live" : "Idle"}
            </span>
            <span
              className="inline-flex items-center gap-1 text-[0.65rem] text-muted-foreground"
              title={
                lastUpdatedAt
                  ? lastUpdatedAt.toLocaleTimeString()
                  : "no fetch yet"
              }
            >
              <RefreshCcw
                className={cn(
                  "h-3 w-3",
                  bulk.isFetching && "animate-spin",
                )}
              />
              {lastUpdatedAt
                ? `refreshed ${formatRelative(lastUpdatedAt)}`
                : "—"}
            </span>
            <Button asChild variant="ghost" size="sm" className="h-8 gap-1">
              <Link to="/experiments">
                <ArrowLeft className="h-3.5 w-3.5" />
                Experiments
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-72 shrink-0 flex-col gap-3 border-r border-border bg-card/30 p-3">
          <RunSelector
            experiments={experiments}
            activeIds={activeIds}
            onChange={setActiveIds}
            className="min-h-0 flex-1"
          />
        </aside>

        <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    Active metric
                  </div>
                  <div className="font-mono text-sm text-foreground">
                    {metricKey}
                    <span className="ml-2 text-[0.65rem] text-muted-foreground">
                      {series.length} series •{" "}
                      {series.reduce((acc, s) => acc + s.points.length, 0)} pts
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[0.7rem] text-muted-foreground">
                  <label className="flex items-center gap-2">
                    <span>Smoothing</span>
                    <input
                      type="range"
                      min={0}
                      max={0.95}
                      step={0.05}
                      value={smoothing}
                      onChange={(e) => setSmoothing(Number(e.target.value))}
                      className="w-32 accent-foreground"
                      aria-label="EMA smoothing factor"
                    />
                    <span className="w-8 text-right font-mono tabular-nums">
                      {smoothing.toFixed(2)}
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={logY}
                      onChange={(e) => setLogY(e.target.checked)}
                      className="accent-foreground"
                    />
                    log y
                  </label>
                </div>
              </div>
              {series.length === 0 ? (
                <div className="flex h-[320px] items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                  {activeIds.length === 0
                    ? "Select runs in the left rail to plot."
                    : "No points reported for this metric yet."}
                </div>
              ) : (
                <TrainingChart
                  metricKey={metricKey}
                  series={series}
                  smoothing={smoothing}
                  logY={logY}
                  isLive={anyActiveRunning}
                  height={340}
                />
              )}
              <MetricSelector
                discoveredKeys={discoveredKeys}
                selected={metricKey}
                onSelect={setMetric}
              />
            </CardContent>
          </Card>

          {activeExperiments.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {activeExperiments.map((exp) => (
                <RunDetailCard
                  key={exp.id}
                  experiment={exp}
                  color={colorForRun(exp.id, activeIds)}
                />
              ))}
            </div>
          )}

          <SystemStatsPanel />

          {(list.error || bulk.error) && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {String(
                (list.error as Error)?.message ??
                  (bulk.error as Error)?.message ??
                  "request failed",
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
