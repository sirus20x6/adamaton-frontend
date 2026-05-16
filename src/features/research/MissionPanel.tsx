/**
 * Mission-workspace sidebar panel.
 *
 * Renders the per-task execution log + goals — the surface area built
 * for the maestro lift (#46 ExecutionLog, #45 Reflection). Polls
 * ``/platform/research/{task_id}/log`` while the task is open and
 * stops after a few empty intervals once it goes quiet.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Goal,
  Loader2,
  XCircle,
} from "lucide-react";

import { cn, formatRelative } from "@/lib/utils";
import {
  type GoalRow,
  type LogStepRow,
  type ResearchLogResponse,
  getResearchLog,
} from "@/api/research";

type Section = "goals" | "agents" | "thoughts";

const SECTION_LABEL: Record<Section, string> = {
  goals: "Goals",
  agents: "Agents",
  thoughts: "Thoughts",
};

const SECTION_ICON: Record<Section, typeof Goal> = {
  goals: Goal,
  agents: Activity,
  thoughts: Brain,
};

export type MissionPanelProps = {
  taskId: string;
  /** Stop polling once the parent says the task is no longer running. */
  isWorking?: boolean;
  className?: string;
};

export function MissionPanel({
  taskId,
  isWorking,
  className,
}: MissionPanelProps) {
  const query = useQuery<ResearchLogResponse>({
    queryKey: ["research-log", taskId],
    queryFn: () => getResearchLog(taskId, 200),
    refetchInterval: isWorking ? 2_000 : 30_000,
    refetchIntervalInBackground: false,
  });

  const log = query.data;

  const thoughts = useMemo(() => {
    if (!log) return [];
    return log.goals.filter((g) => g.source_agent === "reflection");
  }, [log]);

  return (
    <section
      aria-label="Mission workspace"
      className={cn(
        "flex flex-col gap-2 border-t border-border bg-card/40",
        className,
      )}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card/60 px-4 py-2 backdrop-blur">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Mission
        </h2>
        <span className="text-[0.7rem] text-muted-foreground">
          {query.isFetching ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : log ? (
            `${log.steps.length} steps`
          ) : null}
        </span>
      </header>

      <div className="flex flex-col gap-2 px-4 py-2">
        <CollapsibleSection
          section="goals"
          count={log?.goals.filter((g) => g.status === "active").length ?? 0}
          defaultOpen
        >
          <GoalsList goals={log?.goals ?? []} />
        </CollapsibleSection>

        <CollapsibleSection
          section="thoughts"
          count={thoughts.length}
          defaultOpen={thoughts.length > 0}
        >
          <ThoughtsList thoughts={thoughts} />
        </CollapsibleSection>

        <CollapsibleSection
          section="agents"
          count={log?.steps.length ?? 0}
          defaultOpen
        >
          <StepsList steps={log?.steps ?? []} />
        </CollapsibleSection>
      </div>
    </section>
  );
}

function CollapsibleSection({
  section,
  count,
  defaultOpen,
  children,
}: {
  section: Section;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const Icon = SECTION_ICON[section];
  return (
    <div className="rounded-md border border-border bg-background/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-2 px-3 py-2",
          "text-left text-xs font-medium uppercase tracking-wide text-muted-foreground",
          "transition-colors hover:bg-accent/40",
        )}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" />
          {SECTION_LABEL[section]}
          <span className="rounded-full bg-muted/60 px-1.5 text-[0.6rem] text-muted-foreground">
            {count}
          </span>
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>
      {open ? <div className="border-t border-border px-3 py-2">{children}</div> : null}
    </div>
  );
}

function GoalsList({ goals }: { goals: GoalRow[] }) {
  if (goals.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No goals recorded yet.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {goals.map((g) => (
        <li
          key={g.id}
          className={cn(
            "flex items-start gap-2 rounded-sm border border-border/60 bg-card/60 px-2 py-1.5 text-xs",
            g.status === "addressed" && "opacity-70",
            g.status === "obsolete" && "opacity-40 line-through",
          )}
        >
          <GoalStatusDot status={g.status} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="break-words text-foreground">{g.text}</p>
            <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
              {g.source_agent ?? "—"} · {g.status}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function GoalStatusDot({ status }: { status: string }) {
  const tone =
    status === "active"
      ? "bg-amber-500"
      : status === "addressed"
        ? "bg-emerald-500"
        : "bg-muted-foreground";
  return (
    <span
      className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", tone)}
      aria-hidden
    />
  );
}

function ThoughtsList({ thoughts }: { thoughts: GoalRow[] }) {
  if (thoughts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Reflection hasn't surfaced any thoughts yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {thoughts.map((t) => (
        <li
          key={t.id}
          className="rounded-sm border border-border/60 bg-card/60 px-2 py-1.5 text-xs"
        >
          <p className="text-foreground">{t.text}</p>
          <p className="mt-1 text-[0.65rem] text-muted-foreground">
            {formatRelative(t.created_at)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function StepsList({ steps }: { steps: LogStepRow[] }) {
  if (steps.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Waiting for the first agent step…
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {steps.map((s) => (
        <StepRow key={s.id} step={s} />
      ))}
    </ul>
  );
}

function StepRow({ step }: { step: LogStepRow }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-sm border border-border/60 bg-card/60 px-2 py-1.5 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 text-left"
        aria-expanded={open}
      >
        <StatusIcon status={step.status} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[0.7rem] text-foreground">
              {step.agent_name}
            </span>
            <span className="shrink-0 text-[0.6rem] uppercase tracking-wide text-muted-foreground">
              {step.action}
              {step.elapsed_ms !== null ? ` · ${step.elapsed_ms}ms` : ""}
            </span>
          </div>
          {step.input_summary ? (
            <p className="line-clamp-2 break-words text-muted-foreground">
              {step.input_summary}
            </p>
          ) : null}
        </div>
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-border/60 pt-2 text-[0.7rem]">
          {step.output_summary ? (
            <Field label="Output">{step.output_summary}</Field>
          ) : null}
          {step.error ? (
            <Field label="Error" tone="error">
              {step.error}
            </Field>
          ) : null}
          {step.model_details ? (
            <Field label="Model">
              <code className="break-all font-mono text-[0.65rem]">
                {JSON.stringify(step.model_details)}
              </code>
            </Field>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "failure") {
    return (
      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden />
    );
  }
  if (status === "warning") {
    return (
      <AlertTriangle
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600"
        aria-hidden
      />
    );
  }
  if (status === "running") {
    return (
      <Loader2
        className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary"
        aria-hidden
      />
    );
  }
  return (
    <CheckCircle2
      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
      aria-hidden
    />
  );
}

function Field({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "error";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "break-words text-foreground",
          tone === "error" && "text-red-700 dark:text-red-300",
        )}
      >
        {children}
      </span>
    </div>
  );
}
