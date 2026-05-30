/**
 * KanbanPreview — a compact, read-only board preview embedded in the project
 * detail panel. Shows the project's first board as horizontally-scrollable
 * columns with their cards as small chips (priority dot + title + claimed-by
 * indicator), so you get at-a-glance status without leaving the project.
 *
 * Read-only on purpose: drag-and-drop + editing live on the full board page
 * (/projects/:id/kanban, src/pages/ProjectKanban). The header + each card link
 * there. Data flows through src/api/kanban.ts.
 */

import { Link } from "react-router-dom";
import { KanbanSquare, Loader2, Plus, User } from "lucide-react";

import {
  useKanbanBoard,
  useKanbanBoards,
  type Card,
  type CardPriority,
} from "@/api/kanban";
import { cn } from "@/lib/utils";

const PRIORITY_DOT: Record<CardPriority, string> = {
  low: "bg-slate-400",
  normal: "bg-sky-400",
  high: "bg-amber-400",
  urgent: "bg-rose-400",
};

function Shell({
  projectId,
  boardName,
  children,
}: {
  projectId: string;
  boardName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/20">
      <div className="flex items-center gap-2 border-b border-border bg-card/30 px-3 py-2">
        <KanbanSquare className="h-4 w-4 shrink-0 text-violet-300" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">
          {boardName ?? "Kanban"}
        </span>
        <Link
          to={`/projects/${projectId}/kanban`}
          className="shrink-0 text-xs text-violet-300 hover:underline"
        >
          Open board →
        </Link>
      </div>
      {children}
    </section>
  );
}

function CardChip({ card, projectId }: { card: Card; projectId: string }) {
  const claimed = card.claim_status === "claimed";
  const done = card.claim_status === "done";
  const failed = card.claim_status === "failed";
  return (
    <Link
      to={`/projects/${projectId}/kanban`}
      title={card.title}
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs transition-colors hover:border-border hover:bg-card",
        done && "opacity-60",
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_DOT[card.priority])}
        title={`priority: ${card.priority}`}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-slate-200",
          done && "line-through",
          failed && "text-rose-300",
        )}
      >
        {card.title}
      </span>
      {claimed && card.claimed_by && (
        <span
          className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-500/15 px-1 text-[10px] text-emerald-300"
          title={`claimed by ${card.claimed_by}`}
        >
          <User className="h-2.5 w-2.5" />
          {card.claimed_by.replace(/^claude-code-/, "").slice(0, 8)}
        </span>
      )}
    </Link>
  );
}

export function KanbanPreview({ projectId }: { projectId: string }) {
  const boards = useKanbanBoards(projectId);
  const boardId = boards.data?.[0]?.id ?? null;
  const detail = useKanbanBoard(boardId);

  if (boards.isLoading) {
    return (
      <Shell projectId={projectId}>
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
        </div>
      </Shell>
    );
  }

  if (!boardId) {
    return (
      <Shell projectId={projectId}>
        <div className="flex h-24 flex-col items-center justify-center gap-2 p-4 text-center">
          <p className="text-xs text-muted-foreground">No board yet.</p>
          <Link
            to={`/projects/${projectId}/kanban`}
            className="inline-flex items-center gap-1 text-xs text-violet-300 hover:underline"
          >
            <Plus className="h-3 w-3" />
            Create a board
          </Link>
        </div>
      </Shell>
    );
  }

  const columns = [...(detail.data?.columns ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  const cards = detail.data?.cards ?? [];
  const byColumn = (colId: string) =>
    cards
      .filter((c) => c.column_id === colId)
      .sort((a, b) => a.position - b.position);

  return (
    <Shell projectId={projectId} boardName={detail.data?.board.name}>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {columns.map((col) => {
          const colCards = byColumn(col.id);
          return (
            <div key={col.id} className="flex w-44 shrink-0 flex-col gap-1.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="truncate text-xs font-medium text-slate-300">
                  {col.name}
                </span>
                <span className="ml-1 shrink-0 rounded bg-card px-1.5 text-[10px] text-slate-500">
                  {colCards.length}
                </span>
              </div>
              <div className="flex max-h-44 flex-col gap-1 overflow-y-auto pr-0.5">
                {colCards.map((card) => (
                  <CardChip key={card.id} card={card} projectId={projectId} />
                ))}
                {colCards.length === 0 && (
                  <span className="px-1 py-0.5 text-[10px] text-muted-foreground/50">
                    —
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

export default KanbanPreview;
