import { useState } from "react";
import { Copy, GitBranch, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Prose } from "@/components/markdown/Prose";
import { CodeDiff } from "@/features/experiments/CodeDiff";
import { StatusPill } from "@/features/experiments/StatusPill";
import { ValBpbBadge } from "@/features/experiments/ValBpbBadge";
import { MetricsChart } from "@/features/experiments/MetricsChart";
import { NewExperimentDialog } from "@/features/experiments/NewExperimentDialog";
import {
  useExperiment,
  useExperimentMetrics,
  useExperiments,
} from "@/api/experiments";
import { cn, formatRelative } from "@/lib/utils";

type Props = {
  experimentId: string | null;
  onClose: () => void;
  onNavigate: (id: string) => void;
};

export function ExperimentDetail({ experimentId, onClose, onNavigate }: Props) {
  const open = experimentId !== null;
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="max-w-xl">
        {experimentId && (
          <ExperimentDetailBody
            experimentId={experimentId}
            onNavigate={onNavigate}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ExperimentDetailBody({
  experimentId,
  onNavigate,
  onClose,
}: {
  experimentId: string;
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const { data: exp, isLoading, error } = useExperiment(experimentId);
  const { data: parent } = useExperiment(exp?.parent_id ?? "");
  const { data: metrics = [] } = useExperimentMetrics(experimentId);
  const { data: list } = useExperiments({ limit: 200 });
  const [showDiff, setShowDiff] = useState(false);
  const { toast } = useToast();

  if (isLoading) {
    return (
      <SheetBody>
        <div className="text-sm text-muted-foreground">Loading…</div>
      </SheetBody>
    );
  }
  if (error || !exp) {
    return (
      <SheetBody>
        <div className="text-sm text-red-500">
          Failed to load experiment: {String((error as Error)?.message ?? "unknown")}
        </div>
      </SheetBody>
    );
  }

  const children =
    list?.items.filter((e) => e.parent_id === exp.id) ?? [];

  const metricsByKey = new Map<string, typeof metrics>();
  for (const m of metrics) {
    if (!metricsByKey.has(m.key)) metricsByKey.set(m.key, []);
    metricsByKey.get(m.key)!.push(m);
  }

  const onCopyId = async () => {
    try {
      await navigator.clipboard.writeText(exp.id);
      toast({
        title: "Experiment id copied",
        description: exp.id,
        variant: "success",
      });
    } catch (e) {
      toast({
        title: "Copy failed",
        description: String((e as Error)?.message ?? "clipboard unavailable"),
        variant: "error",
      });
    }
  };

  return (
    <>
      <SheetHeader>
        <div className="flex items-center justify-between gap-2 pr-8">
          <SheetTitle className="truncate">{exp.name}</SheetTitle>
          <ValBpbBadge value={exp.val_bpb} relativeTo={parent?.val_bpb} />
        </div>
        <SheetDescription>
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={exp.status} />
            <span className="font-mono text-[0.65rem]">
              id {exp.id.slice(0, 8)}…
            </span>
            <span>· started {formatRelative(exp.started_at)}</span>
            {exp.finished_at && (
              <span>· finished {formatRelative(exp.finished_at)}</span>
            )}
            {exp.peak_memory_mb !== null && exp.peak_memory_mb !== undefined && (
              <span>· peak {exp.peak_memory_mb} MB</span>
            )}
            {exp.commit_hash && (
              <span className="font-mono">· {exp.commit_hash.slice(0, 7)}</span>
            )}
            {exp.agent_session_id && (
              <span className="font-mono">
                · session {exp.agent_session_id.slice(0, 8)}
              </span>
            )}
          </span>
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="space-y-5">
        {exp.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {exp.tags.map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
          </div>
        )}

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Hypothesis
          </h3>
          <Prose source={exp.hypothesis} />
        </section>

        {exp.notes && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </h3>
            <Prose source={exp.notes} />
          </section>
        )}

        {exp.code_diff && (
          <section>
            <button
              type="button"
              onClick={() => setShowDiff((v) => !v)}
              className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              {showDiff ? "▾" : "▸"} Code diff ({exp.code_diff.length} chars)
            </button>
            {showDiff && (
              <CodeDiff diff={exp.code_diff} maxHeightClass="max-h-72" />
            )}
          </section>
        )}

        {metricsByKey.size > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Metrics
            </h3>
            <div className="flex flex-col gap-3">
              {Array.from(metricsByKey.entries()).map(([key, points]) => (
                <MetricsChart key={key} points={points} />
              ))}
            </div>
          </section>
        )}

        {parent && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Parent
            </h3>
            <button
              type="button"
              onClick={() => onNavigate(parent.id)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card/40 px-3 py-2 text-left text-sm",
                "hover:bg-accent",
              )}
            >
              <span className="flex items-center gap-2 truncate">
                <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{parent.name}</span>
              </span>
              <ValBpbBadge value={parent.val_bpb} />
            </button>
          </section>
        )}

        {children.length > 0 && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Children ({children.length})
            </h3>
            <ul className="flex flex-col gap-1.5">
              {children.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onNavigate(c.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card/40 px-3 py-2 text-left text-sm",
                      "hover:bg-accent",
                    )}
                  >
                    <span className="truncate">{c.name}</span>
                    <ValBpbBadge value={c.val_bpb} relativeTo={exp.val_bpb} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </SheetBody>
      <SheetFooter>
        <Button
          variant="ghost"
          onClick={onCopyId}
          title="Copy experiment id"
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copy id
        </Button>
        <NewExperimentDialog
          parentId={exp.id}
          parentName={exp.name}
          defaultAgentSession={exp.agent_session_id}
          trigger={
            <Button>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Log child run
            </Button>
          }
          onCreated={(newId) => {
            onNavigate(newId);
          }}
        />
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </SheetFooter>
    </>
  );
}
