import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownNarrowWide,
  FlaskConical,
  LineChart,
  Plus,
  Search,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import {
  type Experiment,
  type ExperimentSortBy,
  useExperiments,
  useExperimentSearch,
  useSessionSummary,
} from "@/api/experiments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/toast";
import {
  ALL_SESSIONS,
  SessionPicker,
  type SessionOption,
} from "@/features/experiments/SessionPicker";
import { SessionSummaryCard } from "@/features/experiments/SessionSummaryCard";
import { ExperimentTable } from "@/features/experiments/ExperimentTable";
import { LineageTree } from "@/features/experiments/LineageTree";
import { ExperimentDetail } from "@/features/experiments/ExperimentDetail";
import { NewExperimentDialog } from "@/features/experiments/NewExperimentDialog";
import { MetricsChart } from "@/features/experiments/MetricsChart";
import { ExportButton } from "@/features/experiments/ExportButton";
import { CompareDrawer } from "@/features/experiments/CompareDrawer";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function useDebounced<T>(value: T, delay = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function Experiments() {
  const [sortBy, setSortBy] = useState<ExperimentSortBy>("val_bpb");
  const [session, setSession] = useState<string>(ALL_SESSIONS);
  const [query, setQuery] = useState("");
  const debouncedQ = useDebounced(query, 250);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [compareIds, setCompareIds] = useState<
    [string, string] | null
  >(null);
  const [searchParams] = useSearchParams();

  // Honor ``?selected=<id>`` deep-links from the training dashboard so the
  // detail drawer opens automatically. We only run this on mount; the user
  // can navigate freely afterwards without the URL fighting their clicks.
  useEffect(() => {
    const fromUrl = searchParams.get("selected");
    if (fromUrl && fromUrl.length > 0) {
      setSelectedId(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sessionFilter = session === ALL_SESSIONS ? undefined : session;

  const list = useExperiments({
    sort_by: sortBy,
    agent_session_id: sessionFilter ?? null,
    limit: 200,
  });

  const search = useExperimentSearch(
    {
      q: debouncedQ,
      sort_by: sortBy,
      agent_session_id: sessionFilter ?? null,
      limit: 50,
    },
    { enabled: debouncedQ.trim().length > 0 },
  );

  // Derive distinct session options from the loaded experiments.
  const sessionOptions: SessionOption[] = useMemo(() => {
    const items = list.data?.items ?? [];
    const map = new Map<string, { count: number; best: number | null }>();
    for (const e of items) {
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
  }, [list.data]);

  // Aggregate summary across either the picked session or all sessions.
  const sessionSummary = useSessionSummary(sessionFilter ?? null);
  const aggregateSummary = useMemo(() => {
    const items = list.data?.items ?? [];
    if (items.length === 0) {
      return {
        count: 0,
        best_val_bpb: null,
        latest_val_bpb: null,
        started_at: null,
        last_active_at: null,
      };
    }
    const withBpb = items.filter((e) => e.val_bpb !== null);
    const best =
      withBpb.length === 0
        ? null
        : Math.min(...withBpb.map((e) => e.val_bpb as number));
    const sortedByStart = [...items].sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    );
    const latest = sortedByStart[0]?.val_bpb ?? null;
    return {
      count: items.length,
      best_val_bpb: best,
      latest_val_bpb: latest,
      started_at: sortedByStart[items.length - 1]?.started_at ?? null,
      last_active_at: sortedByStart[0]?.started_at ?? null,
    };
  }, [list.data]);

  const summary = sessionFilter
    ? (sessionSummary.data ?? {
        count: 0,
        best_val_bpb: null,
        latest_val_bpb: null,
        started_at: null,
        last_active_at: null,
      })
    : aggregateSummary;

  // Session-trajectory chart points (val_bpb over time, oldest-first).
  const trajectoryPoints = useMemo(() => {
    const items = list.data?.items ?? [];
    return items
      .filter((e) => e.val_bpb !== null)
      .sort(
        (a, b) =>
          new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
      )
      .map((e, i) => ({
        step: i,
        key: "val_bpb",
        value: e.val_bpb as number,
        recorded_at: e.started_at,
      }));
  }, [list.data]);

  const isSearching = debouncedQ.trim().length > 0;
  const tableRows = isSearching
    ? ({
        kind: "search" as const,
        hits: search.data?.hits ?? [],
      })
    : ({
        kind: "list" as const,
        experiments: list.data?.items ?? [],
      });
  const tableLoading = isSearching ? search.isLoading : list.isLoading;

  // The export button needs the *currently visible* rows. When the user is
  // searching we resolve search hits back to full Experiment records (their
  // `code_diff`/`tags` aren't part of search hits). When ids are missing
  // from the loaded list we drop them — exporting partials is preferable to
  // exporting half-empty rows that would mislead downstream tools.
  const exportableRows: Experiment[] = useMemo(() => {
    if (!isSearching) return [...(list.data?.items ?? [])];
    const byId = new Map(
      (list.data?.items ?? []).map((e) => [e.id, e] as const),
    );
    const out: Experiment[] = [];
    for (const h of search.data?.hits ?? []) {
      const full = byId.get(h.id);
      if (full) out.push(full);
    }
    return out;
  }, [isSearching, list.data, search.data]);

  const exportSelectionRows = useMemo(() => {
    if (selection.size === 0) return [] as Experiment[];
    const byId = new Map(
      (list.data?.items ?? []).map((e) => [e.id, e] as const),
    );
    return Array.from(selection)
      .map((id) => byId.get(id))
      .filter((e): e is Experiment => Boolean(e));
  }, [selection, list.data]);

  const onCompare = (ids: readonly string[]) => {
    if (ids.length !== 2) return;
    setCompareIds([ids[0]!, ids[1]!]);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-col gap-3 border-b border-border bg-background/60 px-6 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold tracking-tight">Experiments</h1>
            <span className="text-xs text-muted-foreground">
              autoresearch journal
            </span>
          </div>
          <div className="flex items-center gap-2">
            <SessionPicker
              value={session}
              onChange={setSession}
              options={sessionOptions}
            />
            <SortToggle value={sortBy} onChange={setSortBy} disabled={isSearching} />
            <ExportButton
              rows={exportableRows}
              disabled={tableLoading}
              filenamePrefix="experiments"
            />
            <Button asChild variant="outline">
              <Link to="/experiments/dashboard">
                <LineChart className="mr-1.5 h-3.5 w-3.5" />
                Open dashboard
              </Link>
            </Button>
            <NewExperimentDialog
              defaultAgentSession={sessionFilter ?? null}
              trigger={
                <Button>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New experiment
                </Button>
              }
              onCreated={(id) => setSelectedId(id)}
            />
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search hypothesis or name (trigram)…"
            className="pl-8"
            aria-label="Search experiments"
          />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
        <SessionSummaryCard
          count={summary.count}
          bestValBpb={summary.best_val_bpb}
          latestValBpb={summary.latest_val_bpb}
          startedAt={summary.started_at}
          lastActiveAt={summary.last_active_at}
          scopeLabel={
            sessionFilter
              ? `session ${sessionFilter.slice(0, 8)}`
              : `all sessions${sessionOptions.length ? ` (${sessionOptions.length})` : ""}`
          }
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(0,2fr)]">
          <Card className="lg:max-h-[60vh] lg:overflow-auto">
            <CardContent className="p-3">
              <div className="mb-2 flex items-center justify-between text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                <span>Lineage</span>
                <span>{(list.data?.items ?? []).length} runs</span>
              </div>
              <LineageTree
                experiments={list.data?.items ?? []}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </CardContent>
          </Card>

          <ExperimentTable
            rows={tableRows}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={tableLoading}
            selectionMode={selectionMode}
            onSelectionModeChange={(v) => {
              setSelectionMode(v);
              if (!v) setSelection(new Set());
            }}
            selection={selection}
            onSelectionChange={setSelection}
            onCompare={onCompare}
            onExportSelected={() => {
              // Hand the export off to a hidden ExportButton path: simplest
              // working approach is to reuse the same blob/json helpers via
              // its rows-prop indirection. We render a hidden button below
              // and trigger it programmatically.
              triggerSelectedExport(exportSelectionRows);
            }}
          />
        </div>

        {trajectoryPoints.length > 1 && (
          <Card>
            <CardContent className="flex flex-col gap-2 p-4">
              <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                val_bpb over time {sessionFilter && "· this session"}
              </span>
              <MetricsChart points={trajectoryPoints} width={720} height={140} />
            </CardContent>
          </Card>
        )}

        {(list.error || search.error) && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-500">
            {String(
              (list.error as Error)?.message ??
                (search.error as Error)?.message ??
                "request failed",
            )}
          </div>
        )}
      </main>

      <ExperimentDetail
        experimentId={selectionMode ? null : selectedId}
        onClose={() => setSelectedId(null)}
        onNavigate={setSelectedId}
      />

      <CompareDrawer
        open={compareIds !== null}
        leftId={compareIds?.[0] ?? null}
        rightId={compareIds?.[1] ?? null}
        onClose={() => setCompareIds(null)}
      />

      <Toaster />
    </div>
  );
}

/**
 * Inline CSV export used by the table's "Export selected" affordance. Kept
 * here rather than exposed from ExportButton so the bottom action bar can
 * fire-and-forget without rendering a second dropdown next to the primary
 * one in the header.
 */
function triggerSelectedExport(rows: readonly Experiment[]): void {
  if (rows.length === 0) return;
  const headers = [
    "id",
    "name",
    "status",
    "val_bpb",
    "peak_memory_mb",
    "parent_id",
    "agent_session_id",
    "commit_hash",
    "started_at",
    "finished_at",
    "tags",
    "hypothesis",
  ];
  const escape = (v: unknown, quote = false): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : String(v);
    const needs = quote || /[",\n\r]/.test(s);
    return needs ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        escape(r.id),
        escape(r.name),
        escape(r.status),
        escape(r.val_bpb ?? ""),
        escape(r.peak_memory_mb ?? ""),
        escape(r.parent_id ?? ""),
        escape(r.agent_session_id ?? ""),
        escape(r.commit_hash ?? ""),
        escape(r.started_at),
        escape(r.finished_at ?? ""),
        escape(r.tags.join(";")),
        escape(r.hypothesis ?? "", true),
      ].join(","),
    );
  }
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `experiments-selected-${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SortToggle({
  value,
  onChange,
  disabled,
}: {
  value: ExperimentSortBy;
  onChange: (v: ExperimentSortBy) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-md border border-border p-0.5",
        disabled && "opacity-50",
      )}
      role="radiogroup"
      aria-label="Sort experiments"
      aria-disabled={disabled}
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === "val_bpb"}
        disabled={disabled}
        onClick={() => onChange("val_bpb")}
        className={cn(
          "flex items-center gap-1 rounded px-2 py-0.5 text-xs",
          value === "val_bpb"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <ArrowDownNarrowWide className="h-3 w-3" /> val_bpb
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === "recent"}
        disabled={disabled}
        onClick={() => onChange("recent")}
        className={cn(
          "rounded px-2 py-0.5 text-xs",
          value === "recent"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        recent
      </button>
    </div>
  );
}
