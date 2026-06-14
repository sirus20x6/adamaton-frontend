/**
 * Home — landing page for the unified evo/gogents/deepresearch suite.
 *
 * Right pane content (above-the-fold first, more below):
 *
 *   1. Delegator token statuses — per-agent utilization gauges + the
 *      latest 5h / 7d reset times. Tells the user at a glance whether
 *      any agent is rate-limited or close to it.
 *
 *   2. Recent delegator tasks — what the multi-agent router has been
 *      running, last ~20.
 *
 *   3. Workflows — n8n-style workflow definitions + the most recent
 *      Temporal runs against them.
 *
 *   4. Evo runs — kept in a small section so the evolutionary loop
 *      shows alongside everything else; full detail lives on the
 *      workstation's evo page.
 *
 * Profiling graphs are deferred — text + sparkline-free for now.
 *
 * Everything is read-only here. Kicking off a research session, a
 * delegate_task call, or a new workflow run happens elsewhere: the
 * Pi's research surface, MCP tools, or evo-cli respectively.
 */

import { useMemo, useState } from "react";
import {
  Activity,
  Clock,
  ExternalLink,
  GitBranch,
  Layers,
  Package,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DelegationStreamDialog } from "@/features/delegator/DelegationStreamDialog";
import { cn } from "@/lib/utils";
import {
  type AgentQuota,
  type DelegatorTask,
  type EvoRun,
  type WorkflowDefinition,
  type WorkflowRun,
  useDelegatorQuota,
  useDelegatorTasks,
  useEvoRuns,
  useWorkflowDefinitions,
  useWorkflowRuns,
} from "@/api/evoSuite";

// ── helpers ────────────────────────────────────────────────────────

function fmtRelative(ts?: string): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleString();
}

function fmtTokens(n: number): string {
  if (!n) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
}

function pct(util?: number): string {
  if (typeof util !== "number") return "—";
  return `${(util * 100).toFixed(1)}%`;
}

function utilTone(util?: number): string {
  if (typeof util !== "number") return "bg-muted-foreground";
  if (util >= 0.8) return "bg-red-500";
  if (util >= 0.5) return "bg-amber-500";
  return "bg-primary";
}

// ── components ─────────────────────────────────────────────────────

function SectionTitle({
  icon: Icon,
  label,
  count,
  href,
}: {
  icon: typeof Activity;
  label: string;
  count?: number;
  href?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        {label}
      </h2>
      {typeof count === "number" ? (
        <span className="text-xs text-muted-foreground">{count}</span>
      ) : null}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          full view <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  );
}

function AgentCard({ q }: { q: AgentQuota }) {
  const util = q.utilization5h ?? 0;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-medium">{q.agent}</div>
          <div className="text-xs text-muted-foreground">{q.apiType}</div>
        </div>
        <div className="mt-1 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          {q.model || "—"}
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[0.7rem] uppercase text-muted-foreground">
              5h util
            </span>
            <span className="text-sm font-medium tabular-nums">
              {pct(q.utilization5h)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full transition-all", utilTone(util))}
              style={{ width: `${Math.min(100, util * 100)}%` }}
            />
          </div>
          {typeof q.utilization7d === "number" ? (
            <div className="mt-2 flex items-baseline justify-between text-xs text-muted-foreground">
              <span>7d</span>
              <span className="tabular-nums">{pct(q.utilization7d)}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <Stat label="sessions" value={q.sessions.toString()} />
          <Stat label="in" value={fmtTokens(q.inputTokens)} />
          <Stat label="out" value={fmtTokens(q.outputTokens)} />
        </div>

        {q.resetTime5h ? (
          <div className="mt-2 text-[0.7rem] text-muted-foreground">
            resets {fmtRelativeFuture(q.resetTime5h)}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/40 px-2 py-1.5">
      <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

function fmtRelativeFuture(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const diff = (d.getTime() - Date.now()) / 1000;
  if (diff <= 0) return "now";
  if (diff < 60) return `in ${Math.floor(diff)}s`;
  if (diff < 3600) return `in ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `in ${Math.floor(diff / 3600)}h`;
  return d.toLocaleString();
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "ok" || status === "completed"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status === "running" || status === "pending"
        ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
        : status === "degraded"
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
          : "bg-red-500/15 text-red-700 dark:text-red-300";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide",
        tone,
      )}
    >
      {status}
    </span>
  );
}

function TasksTable({ tasks }: { tasks: DelegatorTask[] }) {
  const [streamTask, setStreamTask] = useState<DelegatorTask | null>(null);

  if (!tasks.length) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        no delegator tasks yet
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-card/40 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">agent</th>
            <th className="px-3 py-2 text-left font-medium">prompt</th>
            <th className="px-3 py-2 text-left font-medium">status</th>
            <th className="px-3 py-2 text-right font-medium">created</th>
            <th className="px-3 py-2 text-right font-medium" />
          </tr>
        </thead>
        <tbody>
          {tasks.slice(0, 10).map((t) => {
            const live = t.status === "running" || t.status === "pending";
            return (
              <tr key={t.id} className="border-t border-border">
                <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                  {t.agent || "?"}
                </td>
                <td className="max-w-md truncate px-3 py-2 align-top">
                  {t.prompt?.slice(0, 120) ?? ""}
                </td>
                <td className="px-3 py-2 align-top">
                  <StatusPill status={t.status} />
                </td>
                <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                  {fmtRelative(t.created_at)}
                </td>
                <td className="px-3 py-2 text-right">
                  {live && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => setStreamTask(t)}
                    >
                      ▶ live
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <DelegationStreamDialog
        taskId={streamTask?.id ?? null}
        agent={streamTask?.agent}
        onClose={() => setStreamTask(null)}
      />
    </div>
  );
}

function WorkflowsBlock({
  defs,
  runs,
}: {
  defs: WorkflowDefinition[];
  runs: WorkflowRun[];
}) {
  if (!defs.length && !runs.length) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        no workflow definitions or runs yet
      </div>
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          definitions
        </h3>
        {defs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
            none
          </div>
        ) : (
          <ul className="space-y-1">
            {defs.slice(0, 8).map((d) => (
              <li
                key={d.id}
                className="rounded-md border border-border bg-card/40 px-3 py-2 text-sm"
              >
                <div className="font-medium">{d.name}</div>
                {d.description ? (
                  <div className="text-xs text-muted-foreground">
                    {d.description}
                  </div>
                ) : null}
                <div className="mt-1 text-[0.7rem] text-muted-foreground">
                  updated {fmtRelative(d.updated_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          recent runs
        </h3>
        {runs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
            none
          </div>
        ) : (
          <ul className="space-y-1">
            {runs.slice(0, 8).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-md border border-border bg-card/40 px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs">{r.id}</div>
                  <div className="text-[0.7rem] text-muted-foreground">
                    started {fmtRelative(r.started_at)}
                  </div>
                </div>
                <StatusPill status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EvoRunsBlock({ runs }: { runs: EvoRun[] }) {
  if (!runs.length) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        no evo runs yet — try{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          evo-cli run --task &lt;…&gt; --skip-eval
        </code>
      </div>
    );
  }
  return (
    <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {runs.slice(0, 6).map((r) => (
        <li
          key={r.id}
          className="rounded-md border border-border bg-card/40 px-3 py-2"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate font-mono text-xs">{r.id}</span>
            <StatusPill status={r.status} />
          </div>
          <div className="mt-1 truncate text-sm">{r.task_name}</div>
          <div className="mt-1 flex items-center justify-between text-[0.7rem] text-muted-foreground">
            <span>{r.num_programs} programs</span>
            {typeof r.best_speedup === "number" ? (
              <span className="tabular-nums text-foreground">
                {r.best_speedup.toFixed(3)}× best
              </span>
            ) : (
              <span>—</span>
            )}
          </div>
          <div className="text-[0.7rem] text-muted-foreground">
            started {fmtRelative(r.started_at)}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── page root ──────────────────────────────────────────────────────

export default function Home() {
  const quota = useDelegatorQuota();
  const tasks = useDelegatorTasks();
  const defs = useWorkflowDefinitions();
  const runs = useWorkflowRuns();
  const evoRuns = useEvoRuns();

  const agents = useMemo<AgentQuota[]>(
    () => quota.data?.agents ?? [],
    [quota.data],
  );

  // Surface the most useful error if any — the page still renders the
  // sections we did get; one source being down shouldn't blank
  // everything else.
  const errors = [
    quota.error,
    tasks.error,
    defs.error,
    runs.error,
    evoRuns.error,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Suite</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          token usage, recent tasks, workflows. Profiling graphs land here next.
        </p>
        {errors.length > 0 ? (
          <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {errors.length} data source(s) unreachable — check{" "}
            <code>VITE_EVO_API_BASE</code> and the evo apiserver. First error:{" "}
            <span className="font-mono">{String(errors[0])}</span>
          </div>
        ) : null}
      </div>

      <section>
        <SectionTitle
          icon={Activity}
          label="delegator · token statuses"
          count={agents.length}
        />
        {quota.isLoading ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            loading…
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {agents.map((q) => (
              <AgentCard key={q.agent} q={q} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle
          icon={Clock}
          label="delegator · recent tasks"
          count={tasks.data?.length}
        />
        <TasksTable tasks={tasks.data ?? []} />
      </section>

      <section>
        <SectionTitle
          icon={GitBranch}
          label="workflows"
          count={(defs.data?.length ?? 0) + (runs.data?.length ?? 0)}
        />
        <WorkflowsBlock defs={defs.data ?? []} runs={runs.data ?? []} />
      </section>

      <section>
        <SectionTitle
          icon={Package}
          label="evo · recent runs"
          count={evoRuns.data?.length}
        />
        <EvoRunsBlock runs={evoRuns.data ?? []} />
      </section>

      <section className="border-t border-border pt-4">
        <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Layers className="h-3.5 w-3.5" aria-hidden />
          coming next
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          per-agent token-rate sparklines, evo speedup distribution over time,
          and a workflow lineage tree. Source telemetry already lands in
          Postgres; we just need the rendering.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Deep-link to the workstation's full evo dashboard:{" "}
          <Link
            to="/search"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            switch to Search
          </Link>{" "}
          .
        </p>
      </section>
    </div>
  );
}
