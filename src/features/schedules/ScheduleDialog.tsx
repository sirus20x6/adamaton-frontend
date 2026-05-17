/**
 * Create/edit dialog for a Temporal schedule. Two tabs:
 *
 *   - Delegation: easy-mode form for the delegator preset (prompt +
 *     difficulty/priority/etc.). Builds a CreateScheduleRequest with
 *     kind="delegation".
 *
 *   - Advanced: workflow name + task queue + JSON args. Builds a
 *     request with kind="generic" so any registered workflow can be
 *     scheduled.
 *
 * In edit mode the workflow action is immutable (matches the backend's
 * v1 constraint) — only cron + note are editable, the tabs are hidden,
 * and the form submits an UpdateScheduleRequest instead of a create.
 *
 * Hand-rolled controlled state with a single validate() pass at submit.
 * No form library — keeps the dependency footprint to what the rest of
 * the SPA already uses (MCPManager.tsx is the prior art).
 */

import * as React from "react";
import { Loader2 } from "lucide-react";

import {
  type CreateScheduleRequest,
  type ScheduleKind,
  type ScheduleSummary,
  type UpdateScheduleRequest,
  errorMessage,
  useCreateSchedule,
  useUpdateSchedule,
} from "@/api/temporal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const DIFFICULTIES = ["trivial", "easy", "medium", "hard", "expert"] as const;
const PRIORITIES = ["immediate", "normal", "background"] as const;

type Mode = "create" | "edit";

type Props = {
  mode: Mode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // In edit mode this is the schedule being edited (drives the form
  // defaults). In create mode it's undefined.
  schedule?: ScheduleSummary;
};

type FormState = {
  id: string;
  cron: string;
  note: string;
  paused: boolean;
  kind: ScheduleKind;
  // delegation tab fields
  prompt: string;
  difficulty: string;
  priority: string;
  agentHint: string;
  workingDir: string;
  model: string;
  timeoutSecs: string;
  // generic tab fields
  workflow: string;
  taskQueue: string;
  argsJSON: string;
};

const EMPTY_FORM: FormState = {
  id: "",
  cron: "0 9 * * *",
  note: "",
  paused: false,
  kind: "delegation",
  prompt: "",
  difficulty: "medium",
  priority: "normal",
  agentHint: "",
  workingDir: "",
  model: "",
  timeoutSecs: "",
  workflow: "",
  taskQueue: "",
  argsJSON: "",
};

function formFromSchedule(s: ScheduleSummary): FormState {
  return {
    ...EMPTY_FORM,
    id: s.id,
    cron: s.cron,
    note: s.note ?? "",
    paused: s.paused,
    kind: s.kind,
    workflow: s.workflow,
    taskQueue: s.task_queue ?? "",
  };
}

// 5-field cron pre-validator. The Temporal server is authoritative —
// this just catches the obvious "left blank" / "typed prose" cases
// before the round-trip.
function looksLikeCron(s: string): boolean {
  const fields = s.trim().split(/\s+/);
  return fields.length === 5 && fields.every((f) => f.length > 0);
}

function buildCreatePayload(f: FormState): {
  payload?: CreateScheduleRequest;
  error?: string;
} {
  if (!f.id.trim()) return { error: "ID is required" };
  if (!looksLikeCron(f.cron)) {
    return { error: "Cron must be 5 space-separated fields (m h dom mon dow)" };
  }
  const base: CreateScheduleRequest = {
    id: f.id.trim(),
    cron: f.cron.trim(),
    note: f.note.trim() || undefined,
    paused: f.paused,
    kind: f.kind,
  };
  if (f.kind === "delegation") {
    if (!f.prompt.trim()) return { error: "Prompt is required for delegation" };
    base.delegation = {
      prompt: f.prompt.trim(),
      difficulty: f.difficulty || undefined,
      priority: f.priority || undefined,
      agent_hint: f.agentHint.trim() || undefined,
      working_dir: f.workingDir.trim() || undefined,
      model: f.model.trim() || undefined,
      timeout_secs: f.timeoutSecs ? Number(f.timeoutSecs) : undefined,
    };
  } else {
    if (!f.workflow.trim()) return { error: "Workflow name is required" };
    if (!f.taskQueue.trim()) return { error: "Task queue is required" };
    if (f.argsJSON.trim()) {
      try {
        const parsed = JSON.parse(f.argsJSON);
        if (!Array.isArray(parsed)) {
          return { error: "args_json must be a JSON array" };
        }
      } catch (err) {
        return { error: `args_json: ${errorMessage(err)}` };
      }
    }
    base.generic = {
      workflow: f.workflow.trim(),
      task_queue: f.taskQueue.trim(),
      args_json: f.argsJSON.trim() || undefined,
    };
  }
  return { payload: base };
}

function buildUpdatePayload(f: FormState): {
  payload?: UpdateScheduleRequest;
  error?: string;
} {
  if (!looksLikeCron(f.cron)) {
    return { error: "Cron must be 5 space-separated fields (m h dom mon dow)" };
  }
  return {
    payload: {
      cron: f.cron.trim(),
      note: f.note.trim() || undefined,
    },
  };
}

export function ScheduleDialog({ mode, open, onOpenChange, schedule }: Props) {
  const { toast } = useToast();
  const create = useCreateSchedule();
  const update = useUpdateSchedule();

  const [form, setForm] = React.useState<FormState>(() =>
    mode === "edit" && schedule ? formFromSchedule(schedule) : EMPTY_FORM,
  );
  const [formError, setFormError] = React.useState<string | null>(null);

  // Reset the form whenever the dialog opens (or the target schedule
  // changes mid-session) so a previous draft doesn't leak between rows.
  React.useEffect(() => {
    if (open) {
      setForm(
        mode === "edit" && schedule ? formFromSchedule(schedule) : EMPTY_FORM,
      );
      setFormError(null);
    }
  }, [open, mode, schedule]);

  const updateField = React.useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
    },
    [],
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (mode === "create") {
      const { payload, error } = buildCreatePayload(form);
      if (error || !payload) {
        setFormError(error ?? "invalid form");
        return;
      }
      try {
        await create.mutateAsync(payload);
        toast({
          title: "Schedule created",
          description: payload.id,
          variant: "success",
        });
        onOpenChange(false);
      } catch (err) {
        toast({
          title: "Failed to create schedule",
          description: errorMessage(err),
          variant: "error",
        });
      }
      return;
    }

    // edit
    if (!schedule) {
      setFormError("missing target schedule");
      return;
    }
    const { payload, error } = buildUpdatePayload(form);
    if (error || !payload) {
      setFormError(error ?? "invalid form");
      return;
    }
    try {
      await update.mutateAsync({ id: schedule.id, req: payload });
      toast({
        title: "Schedule updated",
        description: schedule.id,
        variant: "success",
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Failed to update schedule",
        description: errorMessage(err),
        variant: "error",
      });
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New schedule" : `Edit ${schedule?.id ?? ""}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a recurring Temporal schedule. Cron is in the operator's timezone."
              : "Only cron + note are editable. To change workflow type or args, delete and recreate."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {/* Common fields */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="ID" required>
              <Input
                value={form.id}
                onChange={(e) => updateField("id", e.target.value)}
                disabled={mode === "edit"}
                placeholder="morning-summary"
              />
            </Field>
            <Field label="Cron" required hint="m h dom mon dow">
              <Input
                value={form.cron}
                onChange={(e) => updateField("cron", e.target.value)}
                placeholder="0 9 * * *"
              />
            </Field>
          </div>

          <Field label="Note" hint="optional, surfaced in the list view">
            <Input
              value={form.note}
              onChange={(e) => updateField("note", e.target.value)}
              placeholder="Daily PR summary"
            />
          </Field>

          {mode === "create" ? (
            <Tabs
              value={form.kind}
              onValueChange={(v) => updateField("kind", v as ScheduleKind)}
              className="flex flex-col gap-3"
            >
              <TabsList className="self-start">
                <TabsTrigger value="delegation">Delegation</TabsTrigger>
                <TabsTrigger value="generic">Advanced</TabsTrigger>
              </TabsList>

              <TabsContent value="delegation" className="m-0 flex flex-col gap-3">
                <Field label="Prompt" required>
                  <Textarea
                    rows={4}
                    value={form.prompt}
                    onChange={(e) => updateField("prompt", e.target.value)}
                    placeholder="Summarise yesterday's merged PRs and email me at 9am."
                  />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Difficulty">
                    <Select
                      value={form.difficulty}
                      options={DIFFICULTIES}
                      onChange={(v) => updateField("difficulty", v)}
                    />
                  </Field>
                  <Field label="Priority">
                    <Select
                      value={form.priority}
                      options={PRIORITIES}
                      onChange={(v) => updateField("priority", v)}
                    />
                  </Field>
                  <Field label="Agent hint" hint="optional override">
                    <Input
                      value={form.agentHint}
                      onChange={(e) => updateField("agentHint", e.target.value)}
                      placeholder="opencode | codex | gemini"
                    />
                  </Field>
                  <Field label="Model" hint="optional">
                    <Input
                      value={form.model}
                      onChange={(e) => updateField("model", e.target.value)}
                    />
                  </Field>
                  <Field label="Working dir" hint="optional, absolute path">
                    <Input
                      value={form.workingDir}
                      onChange={(e) => updateField("workingDir", e.target.value)}
                      placeholder="/thearray/git/Adamaton"
                    />
                  </Field>
                  <Field label="Timeout (s)" hint="0 = default">
                    <Input
                      type="number"
                      min={0}
                      value={form.timeoutSecs}
                      onChange={(e) => updateField("timeoutSecs", e.target.value)}
                    />
                  </Field>
                </div>
              </TabsContent>

              <TabsContent value="generic" className="m-0 flex flex-col gap-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Workflow" required>
                    <Input
                      value={form.workflow}
                      onChange={(e) => updateField("workflow", e.target.value)}
                      placeholder="PRReviewWorkflow"
                    />
                  </Field>
                  <Field label="Task queue" required>
                    <Input
                      value={form.taskQueue}
                      onChange={(e) => updateField("taskQueue", e.target.value)}
                      placeholder="platform"
                    />
                  </Field>
                </div>
                <Field
                  label="Args (JSON array)"
                  hint="empty = no args; otherwise must be a JSON array"
                >
                  <Textarea
                    rows={5}
                    spellCheck={false}
                    className="font-mono text-xs"
                    value={form.argsJSON}
                    onChange={(e) => updateField("argsJSON", e.target.value)}
                    placeholder={'[{"prNumber":42,"repoOwner":"acme"}]'}
                  />
                </Field>
              </TabsContent>
            </Tabs>
          ) : null}

          {formError ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-200">
              {formError}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {mode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── tiny in-file form primitives ──────────────────────────────────────

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-foreground">
        {label}
        {required ? <span className="ml-1 text-red-400">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 w-full rounded-md border border-border bg-background px-2 text-sm",
        "focus:outline-none focus:ring-1 focus:ring-ring",
      )}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
