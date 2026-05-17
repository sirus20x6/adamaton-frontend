/**
 * Recurring Temporal schedules — list, create, edit, pause/resume,
 * trigger now, delete. Each row expands into a "recent runs" panel
 * sourced from the schedule's describe payload (Temporal stores up to
 * 10 recent actions per schedule), so the user can see the log without
 * leaving the page.
 *
 * The list query lives on a 10s refetch interval so newly-triggered
 * runs surface promptly without polling Temporal too hard. Mutations
 * invalidate the list (see src/api/temporal.ts) so the UI updates
 * within one round-trip of any action.
 */

import * as React from "react";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";

import {
  type ScheduleSummary,
  errorMessage,
  useDeleteSchedule,
  usePauseSchedule,
  useSchedule,
  useSchedules,
  useTriggerSchedule,
  useUnpauseSchedule,
} from "@/api/temporal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster, useToast } from "@/components/ui/toast";
import { ScheduleDialog } from "@/features/schedules/ScheduleDialog";
import { cn } from "@/lib/utils";

type DialogState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; schedule: ScheduleSummary };

export default function Schedules() {
  const query = useSchedules();
  const schedules = React.useMemo(
    () => [...(query.data ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    [query.data],
  );
  const [dialog, setDialog] = React.useState<DialogState>({ open: false });
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const toggleExpanded = (id: string) =>
    setExpanded((m) => ({ ...m, [id]: !m[id] }));

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Schedules</h1>
            <p className="text-sm text-muted-foreground">
              Recurring Temporal schedules — delegations, workflow runs, and
              anything else on a cron. Pause, trigger, edit, or remove inline.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!query.isLoading && schedules.length > 0 ? (
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {schedules.length} schedule{schedules.length === 1 ? "" : "s"}
            </p>
          ) : null}
          <Button onClick={() => setDialog({ open: true, mode: "create" })}>
            <Plus className="mr-1 h-4 w-4" />
            New schedule
          </Button>
        </div>
      </header>

      {query.isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading schedules…
        </div>
      ) : null}

      {query.isError ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-200">
          <p className="font-medium">Couldn't load schedules</p>
          <p className="mt-1 text-xs text-red-300/80">
            {errorMessage(query.error)}
          </p>
        </div>
      ) : null}

      {!query.isLoading && !query.isError && schedules.length === 0 ? (
        <EmptyState
          onCreate={() => setDialog({ open: true, mode: "create" })}
        />
      ) : null}

      {schedules.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-6" />
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">Kind</th>
                <th className="px-3 py-2 text-left font-medium">Cron</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Next run</th>
                <th className="px-3 py-2 text-left font-medium">Last run</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <ScheduleRow
                  key={s.id}
                  schedule={s}
                  expanded={!!expanded[s.id]}
                  onToggleExpand={() => toggleExpanded(s.id)}
                  onEdit={() =>
                    setDialog({ open: true, mode: "edit", schedule: s })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <ScheduleDialog
        mode={dialog.open ? dialog.mode : "create"}
        open={dialog.open}
        onOpenChange={(o) =>
          o
            ? null
            : setDialog({ open: false })
        }
        schedule={dialog.open && dialog.mode === "edit" ? dialog.schedule : undefined}
      />

      <Toaster />
    </section>
  );
}

function ScheduleRow({
  schedule,
  expanded,
  onToggleExpand,
  onEdit,
}: {
  schedule: ScheduleSummary;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const pause = usePauseSchedule();
  const unpause = useUnpauseSchedule();
  const trigger = useTriggerSchedule();
  const del = useDeleteSchedule();

  const handleAction = async (
    label: string,
    fn: () => Promise<unknown>,
    successCopy: string,
  ) => {
    try {
      await fn();
      toast({ title: successCopy, description: schedule.id, variant: "success" });
    } catch (err) {
      toast({
        title: `Failed to ${label}`,
        description: errorMessage(err),
        variant: "error",
      });
    }
  };

  return (
    <>
      <tr
        className={cn(
          "border-t border-border hover:bg-muted/20",
          schedule.paused && "opacity-70",
        )}
      >
        <td className="px-2 py-2 text-center align-middle">
          <button
            type="button"
            onClick={onToggleExpand}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted/40"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="px-3 py-2 align-middle">
          <div className="font-medium">{schedule.id}</div>
          {schedule.note ? (
            <div className="text-xs text-muted-foreground line-clamp-1">
              {schedule.note}
            </div>
          ) : null}
        </td>
        <td className="px-3 py-2 align-middle">
          <Badge variant={schedule.kind === "delegation" ? "default" : "outline"}>
            {schedule.kind}
          </Badge>
          {schedule.kind === "generic" ? (
            <div className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">
              {schedule.workflow}
            </div>
          ) : null}
        </td>
        <td className="px-3 py-2 align-middle font-mono text-xs">
          {schedule.cron}
        </td>
        <td className="px-3 py-2 align-middle">
          {schedule.paused ? (
            <Badge variant="outline" className="text-amber-300 border-amber-500/40">
              Paused
            </Badge>
          ) : (
            <Badge variant="outline" className="text-emerald-300 border-emerald-500/40">
              Active
            </Badge>
          )}
        </td>
        <td className="px-3 py-2 align-middle text-xs text-muted-foreground tabular-nums">
          {schedule.paused ? "—" : formatTime(schedule.next_run)}
        </td>
        <td className="px-3 py-2 align-middle text-xs text-muted-foreground tabular-nums">
          {schedule.last_run ? formatTime(schedule.last_run.started_at) : "—"}
        </td>
        <td className="px-2 py-2 text-right align-middle">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  handleAction(
                    "trigger",
                    () => trigger.mutateAsync(schedule.id),
                    "Triggered",
                  )
                }
              >
                <Zap className="mr-2 h-4 w-4" />
                Trigger now
              </DropdownMenuItem>
              {schedule.paused ? (
                <DropdownMenuItem
                  onSelect={() =>
                    handleAction(
                      "resume",
                      () => unpause.mutateAsync(schedule.id),
                      "Resumed",
                    )
                  }
                >
                  <Play className="mr-2 h-4 w-4" />
                  Resume
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={() =>
                    handleAction(
                      "pause",
                      () => pause.mutateAsync(schedule.id),
                      "Paused",
                    )
                  }
                >
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onEdit}>Edit…</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  if (
                    typeof window !== "undefined" &&
                    !window.confirm(`Delete schedule "${schedule.id}"?`)
                  ) {
                    return;
                  }
                  void handleAction(
                    "delete",
                    () => del.mutateAsync(schedule.id),
                    "Deleted",
                  );
                }}
                className="text-red-300 focus:text-red-200"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-t border-border bg-muted/10">
          <td />
          <td colSpan={7} className="px-3 py-3">
            <ExpandedRowDetail id={schedule.id} listSummary={schedule} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ExpandedRowDetail({
  id,
  listSummary,
}: {
  id: string;
  listSummary: ScheduleSummary;
}) {
  // Fetch the describe payload lazily — only when the row is expanded —
  // so we don't pay a per-row describe for every schedule on every list
  // refetch. The list summary's recent_runs is usually absent (the list
  // iterator omits it for bandwidth); describe populates it.
  const detail = useSchedule(id, 15_000);
  const recent =
    detail.data?.recent_runs ?? listSummary.recent_runs ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Recent runs
      </div>
      {detail.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading…
        </div>
      ) : null}
      {detail.isError ? (
        <div className="text-xs text-red-300/80">
          {errorMessage(detail.error)}
        </div>
      ) : null}
      {!detail.isLoading && !detail.isError && recent.length === 0 ? (
        <div className="text-xs italic text-muted-foreground">
          No runs yet. Trigger the schedule to produce one.
        </div>
      ) : null}
      {recent.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card/40 text-xs">
          {[...recent].reverse().map((r, i) => (
            <li
              key={`${r.workflow_id ?? "anon"}-${r.started_at}-${i}`}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="tabular-nums text-muted-foreground">
                {formatTime(r.started_at)}
              </span>
              <span className="font-mono text-[11px] text-foreground/80 truncate">
                {r.workflow_id ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-4 text-[11px] text-muted-foreground">
        <span>workflow: {listSummary.workflow}</span>
        {listSummary.task_queue ? (
          <span>queue: {listSummary.task_queue}</span>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/30 p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
        <Calendar className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-medium">No schedules yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Create a delegation schedule to fire a recurring task, or an
          advanced schedule to cron any registered workflow.
        </p>
      </div>
      <Button size="sm" onClick={onCreate}>
        <Plus className="mr-1 h-4 w-4" />
        New schedule
      </Button>
    </div>
  );
}

function formatTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Compact human-friendly form: "May 17, 09:00:00" + relative hint.
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, { hour12: false });
  return `${date} ${time}`;
}
