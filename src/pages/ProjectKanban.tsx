/**
 * ProjectKanban — per-project Kanban board page (/projects/:projectId/kanban).
 *
 * Reads :projectId, lists the project's boards, and renders the first one in a
 * KanbanBoard. When a project has multiple boards a selector switches between
 * them; when it has none, an empty state seeds the default 5-column board
 * (Backlog / Ready / In Progress / Review / Done).
 *
 * Page chrome mirrors Projects.tsx / ProjectDetail.tsx. The board surface and
 * drag-and-drop live in src/features/projects/KanbanBoard.tsx; data flows
 * through src/api/kanban.ts. See docs/PROJECTS_KANBAN.md.
 */

import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, KanbanSquare, Loader2, Plus } from "lucide-react";

import { useKanbanBoards, useCreateBoard } from "@/api/kanban";
import { useProject } from "@/api/projects";
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
import { KanbanBoard } from "@/features/projects/KanbanBoard";

export default function ProjectKanban() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId ?? null;

  const project = useProject(pid);
  const boards = useKanbanBoards(pid);

  const [selectedBoardId, setSelectedBoardId] = React.useState<string | null>(
    null,
  );
  const [createOpen, setCreateOpen] = React.useState(false);

  const boardList = boards.data ?? [];

  // Default the selection to the first board once they load, and keep it valid
  // if the selected board disappears.
  React.useEffect(() => {
    if (boardList.length === 0) {
      setSelectedBoardId(null);
      return;
    }
    setSelectedBoardId((prev) =>
      prev && boardList.some((b) => b.id === prev) ? prev : boardList[0].id,
    );
  }, [boardList]);

  const loading = project.isLoading || boards.isLoading;

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link
              to={pid ? `/projects/${pid}` : "/projects"}
              aria-label="Back to project"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10">
            <KanbanSquare className="h-5 w-5 text-violet-300" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {project.data?.display_name ?? "Kanban"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Per-project board for agent orchestration.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {boardList.length > 1 && (
            <select
              value={selectedBoardId ?? ""}
              onChange={(e) => setSelectedBoardId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {boardList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {boardList.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              New board
            </Button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border bg-card/30">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      )}

      {!loading && boards.error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 font-mono text-xs text-rose-200">
          {(boards.error as Error).message}
        </div>
      )}

      {!loading && !boards.error && boardList.length === 0 && (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/30">
          <KanbanSquare className="h-6 w-6 text-slate-600" strokeWidth={1.5} />
          <p className="text-sm text-slate-400">
            No board yet for this project.
          </p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create a board
          </Button>
        </div>
      )}

      {!loading && selectedBoardId && (
        <div className="min-h-0 flex-1">
          <KanbanBoard boardID={selectedBoardId} />
        </div>
      )}

      {pid && (
        <CreateBoardDialog
          projectID={pid}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(boardID) => setSelectedBoardId(boardID)}
        />
      )}
    </div>
  );
}

function CreateBoardDialog({
  projectID,
  open,
  onOpenChange,
  onCreated,
}: {
  projectID: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (boardID: string) => void;
}) {
  const create = useCreateBoard(projectID);
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setName("");
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed },
      {
        onSuccess: (res) => {
          onCreated(res.board.id);
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New board</DialogTitle>
          <DialogDescription>
            Seeds the standard five columns: Backlog, Ready, In Progress,
            Review, and Done. Agents claim cards from the Ready column.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Board name</span>
              <Input
                autoFocus
                placeholder="e.g. Sprint board"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            {create.error && (
              <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-200">
                {(create.error as Error).message}
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create board
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
