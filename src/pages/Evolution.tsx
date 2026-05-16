import { useState } from "react";
import { Dna, Lightbulb, Sparkles } from "lucide-react";

import {
  useEvoRuns,
  useEvoRunPrograms,
  useEvoInsights,
  type EvoRun,
  type EvoProgram,
} from "@/api/evoSuite";
import { cn } from "@/lib/utils";

/**
 * Evolution — the dedicated MAP-Elites + island-model view.
 *
 * Three vertical sections:
 *   1. Run summary table (id, task, domain, status, programs, best
 *      speedup) sorted newest first.
 *   2. Programs for the selected run (generation, island, correctness,
 *      speedup) — first row of the table starts selected so the
 *      sub-section never reads blank.
 *   3. Recent insights (the cross-run lab notebook stored in
 *      evo.insights with pgvector embeddings).
 */
export default function Evolution() {
  const runsQ = useEvoRuns();
  const insightsQ = useEvoInsights();

  const runs = runsQ.data ?? [];
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const effectiveRunId =
    selectedRunId ?? (runs.length > 0 ? runs[0].id : null);

  const programsQ = useEvoRunPrograms(effectiveRunId);
  const programs = programsQ.data ?? [];
  const insights = insightsQ.data ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <Dna className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Evolution</h1>
          <p className="text-sm text-muted-foreground">
            MAP-Elites runs, candidate programs, and insights distilled
            from prior wins.
          </p>
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card/30">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 className="text-sm font-medium">Runs</h2>
          <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
            {runs.length} total
          </span>
        </div>
        <RunsTable
          runs={runs}
          loading={runsQ.isLoading}
          selectedId={effectiveRunId}
          onSelect={setSelectedRunId}
        />
      </section>

      <section className="rounded-lg border border-border bg-card/30">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 className="text-sm font-medium">
            Programs
            {effectiveRunId && (
              <span className="ml-2 text-xs text-muted-foreground">
                · run {effectiveRunId.slice(0, 8)}
              </span>
            )}
          </h2>
          <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
            {programs.length} shown
          </span>
        </div>
        <ProgramsTable
          programs={programs}
          loading={programsQ.isLoading}
          hasRun={!!effectiveRunId}
        />
      </section>

      <section className="rounded-lg border border-border bg-card/30">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
          <h2 className="text-sm font-medium">Insights</h2>
          <span className="ml-auto text-[0.7rem] uppercase tracking-wide text-muted-foreground">
            {insights.length} entries
          </span>
        </div>
        <InsightsList loading={insightsQ.isLoading} insights={insights} />
      </section>
    </div>
  );
}

function RunsTable({
  runs,
  loading,
  selectedId,
  onSelect,
}: {
  runs: EvoRun[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (loading && runs.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (runs.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        No evolution runs yet. Kick one off with{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          evo-cli run
        </code>
        .
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">Run</th>
            <th className="px-4 py-2 text-left">Task</th>
            <th className="px-4 py-2 text-left">Domain</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-right">Programs</th>
            <th className="px-4 py-2 text-right">Best ×</th>
            <th className="px-4 py-2 text-left">Started</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={cn(
                "cursor-pointer border-t border-border/60 transition-colors",
                "hover:bg-accent/40",
                selectedId === r.id && "bg-accent/60",
              )}
            >
              <td className="px-4 py-2 font-mono text-xs">
                {r.id.slice(0, 8)}
              </td>
              <td className="px-4 py-2">{r.task_name}</td>
              <td className="px-4 py-2">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[0.7rem] uppercase tracking-wide">
                  {r.domain}
                </span>
              </td>
              <td className="px-4 py-2 text-xs">{r.status}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {r.num_programs}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {r.best_speedup ? r.best_speedup.toFixed(2) : "—"}
              </td>
              <td className="px-4 py-2 text-xs text-muted-foreground">
                {new Date(r.started_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProgramsTable({
  programs,
  loading,
  hasRun,
}: {
  programs: EvoProgram[];
  loading: boolean;
  hasRun: boolean;
}) {
  if (!hasRun) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Select a run to see its candidate programs.
      </div>
    );
  }
  if (loading && programs.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (programs.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        This run has no programs yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">ID</th>
            <th className="px-4 py-2 text-right">Gen</th>
            <th className="px-4 py-2 text-right">Island</th>
            <th className="px-4 py-2 text-left">Backend</th>
            <th className="px-4 py-2 text-center">Compiled</th>
            <th className="px-4 py-2 text-center">Correct</th>
            <th className="px-4 py-2 text-right">Speedup ×</th>
            <th className="px-4 py-2 text-left">Created</th>
          </tr>
        </thead>
        <tbody>
          {programs.map((p) => (
            <tr key={p.id} className="border-t border-border/60">
              <td className="px-4 py-2 font-mono text-xs">{p.id}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {p.generation}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{p.island}</td>
              <td className="px-4 py-2 text-xs">{p.backend || "—"}</td>
              <td className="px-4 py-2 text-center">
                {p.compiled ? "✓" : "✗"}
              </td>
              <td className="px-4 py-2 text-center">
                {p.correct ? "✓" : "✗"}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {p.speedup != null ? p.speedup.toFixed(3) : "—"}
              </td>
              <td className="px-4 py-2 text-xs text-muted-foreground">
                {new Date(p.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InsightsList({
  loading,
  insights,
}: {
  loading: boolean;
  insights: ReturnType<typeof useEvoInsights>["data"] extends infer T
    ? Exclude<T, undefined>
    : never;
}) {
  if (loading && insights.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (insights.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        No insights stored yet. Phase 3 MemoryWrite produces these
        once a run finds something worth remembering.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border/60">
      {insights.map((i) => (
        <li key={i.id} className="flex flex-col gap-1 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-sm font-medium">{i.title}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[0.7rem] uppercase tracking-wide">
              {i.domain}
            </span>
            <span className="ml-auto text-[0.7rem] text-muted-foreground">
              {new Date(i.created_at).toLocaleString()}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{i.body}</p>
          {i.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {i.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-border bg-card/60 px-2 py-0.5 text-[0.7rem]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
