/**
 * ProjectDetail — single project workspace.
 *
 *   File tree (left pane)        — src/features/projects/FileTreePanel
 *   Persistent terminals (right) — src/features/projects/TerminalWindow, with
 *                                  a tmux-backed session per tab, UI state in
 *                                  src/features/projects/useTerminalStore
 *   Kanban board                 — /projects/:id/kanban (src/pages/ProjectKanban)
 *
 * See docs/PROJECTS_KANBAN.md.
 */

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  KanbanSquare,
  Loader2,
  Plus,
  TerminalSquare,
  X,
} from "lucide-react";

import { useProject } from "@/api/projects";
import {
  useCreateTerminal,
  useDeleteTerminal,
  useTerminals,
} from "@/api/terminals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import FileTreePanel from "@/features/projects/FileTreePanel";
import { KanbanPreview } from "@/features/projects/KanbanPreview";
import { TerminalWindow } from "@/features/projects/TerminalWindow";
import { useTerminalStore } from "@/features/projects/useTerminalStore";

// The terminals pane: a tmux-backed session per tab. Server owns the session
// lifecycle (src/api/terminals.ts); the store only remembers which tabs are
// open and which is active so the strip survives a reload.
function TerminalsPane({ projectId }: { projectId: string }) {
  const terminals = useTerminals(projectId);
  const createTerminal = useCreateTerminal(projectId);
  const deleteTerminal = useDeleteTerminal();

  const openIds = useTerminalStore((s) => s.getProject(projectId).openIds);
  const activeId = useTerminalStore((s) => s.getProject(projectId).activeId);
  const openTab = useTerminalStore((s) => s.openTab);
  const closeTab = useTerminalStore((s) => s.closeTab);
  const setActive = useTerminalStore((s) => s.setActive);
  const pruneTabs = useTerminalStore((s) => s.pruneTabs);

  // The session id pending a kill confirmation, or null when the dialog is
  // closed. Killing a terminal destroys its tmux session, so it's gated.
  const [pendingKill, setPendingKill] = useState<string | null>(null);

  const sessions = terminals.data ?? [];

  // Drop tabs whose server session is gone, and surface freshly-created
  // sessions (or ones opened in another tab) by auto-opening them.
  useEffect(() => {
    if (!terminals.data) return;
    const liveIds = terminals.data.map((t) => t.id);
    pruneTabs(projectId, liveIds);
    if (openIds.length === 0 && liveIds.length > 0) {
      openTab(projectId, liveIds[0]);
    }
  }, [terminals.data, projectId, pruneTabs, openTab, openIds.length]);

  const handleCreate = () => {
    createTerminal.mutate(
      {},
      {
        onSuccess: (session) => openTab(projectId, session.id),
      },
    );
  };

  const confirmKill = () => {
    const sid = pendingKill;
    if (!sid) return;
    deleteTerminal.mutate(
      { sid, projectId },
      {
        onSettled: () => {
          closeTab(projectId, sid);
          setPendingKill(null);
        },
      },
    );
  };

  const pendingSession = pendingKill
    ? sessions.find((s) => s.id === pendingKill)
    : undefined;

  const openSessions = openIds
    .map((id) => sessions.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => s != null);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/20">
      <div className="flex items-center gap-1 border-b border-border bg-card/30 px-1.5 py-1">
        <TerminalSquare className="ml-1 h-4 w-4 shrink-0 text-slate-500" />
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {openSessions.map((s) => (
            <div
              key={s.id}
              className={cn(
                "group flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
                s.id === activeId
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <button
                type="button"
                onClick={() => setActive(projectId, s.id)}
                className="max-w-[140px] truncate"
                title={s.title || s.command}
              >
                {s.title || s.command || "shell"}
              </button>
              <button
                type="button"
                onClick={() => setPendingKill(s.id)}
                aria-label="Kill terminal"
                title="Kill terminal (ends the tmux session)"
                className="rounded p-0.5 opacity-60 hover:bg-rose-500/20 hover:text-rose-300 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handleCreate}
          disabled={createTerminal.isPending}
          aria-label="New terminal"
          title="New terminal"
        >
          {createTerminal.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="relative min-h-0 flex-1">
        {terminals.isLoading && openSessions.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          </div>
        )}
        {!terminals.isLoading && openSessions.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <TerminalSquare
              className="h-6 w-6 text-slate-600"
              strokeWidth={1.5}
            />
            <p className="text-xs text-muted-foreground">
              No terminal open. Start a persistent tmux-backed shell.
            </p>
            <Button size="sm" onClick={handleCreate} disabled={createTerminal.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              New terminal
            </Button>
          </div>
        )}
        {openSessions.map((s) => (
          <div key={s.id} className="absolute inset-0">
            <TerminalWindow session={s} active={s.id === activeId} />
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={pendingKill !== null}
        onOpenChange={(open) => {
          if (!open) setPendingKill(null);
        }}
        title="Kill this terminal?"
        description={
          pendingSession
            ? `This ends the tmux session "${
                pendingSession.title || pendingSession.command || "shell"
              }" and any running process in it. This cannot be undone.`
            : "This ends the tmux session and any running process in it. This cannot be undone."
        }
        confirmLabel="Kill terminal"
        confirmVariant="destructive"
        busy={deleteTerminal.isPending}
        busyLabel="Killing…"
        onConfirm={confirmKill}
      />
    </div>
  );
}

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId ?? null);

  if (project.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    );
  }

  if (project.error || !project.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <p className="font-mono text-xs text-rose-300">
          {(project.error as Error)?.message ?? "Project not found"}
        </p>
        <Button asChild variant="ghost" size="sm">
          <Link to="/projects">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to projects
          </Link>
        </Button>
      </div>
    );
  }

  const p = project.data;

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link to="/projects" aria-label="Back to projects">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {p.display_name}
            </h1>
            <p
              className="truncate font-mono text-xs text-muted-foreground"
              title={p.path}
            >
              {p.path}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-violet-500/30 bg-violet-500/10 text-violet-300"
          >
            {p.type}
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link to={`/projects/${p.id}/kanban`}>
              <KanbanSquare className="mr-2 h-4 w-4" />
              Kanban
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <FileTreePanel projectId={p.id} />
        <TerminalsPane projectId={p.id} />
      </div>

      {/* Compact read-only board preview; full board at /projects/:id/kanban. */}
      <div className="shrink-0">
        <KanbanPreview projectId={p.id} />
      </div>
    </div>
  );
}
