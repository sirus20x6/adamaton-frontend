/**
 * ProjectDetail — single project workspace. Phase 1 renders project metadata
 * plus placeholders for the features that land on top of projects.id in later
 * phases:
 *
 *   Phase 2 — file-tree browser (left pane)
 *   Phase 3 — persistent terminals (tmux-backed)
 *   Phase 4 — per-project Kanban board (/projects/:id/kanban)
 *
 * See docs/PROJECTS_KANBAN.md.
 */

import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  FolderTree,
  KanbanSquare,
  Loader2,
  TerminalSquare,
} from "lucide-react";

import { useProject } from "@/api/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function PhasePlaceholder({
  icon: Icon,
  title,
  phase,
  blurb,
}: {
  icon: typeof FolderTree;
  title: string;
  phase: string;
  blurb: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/20 p-8 text-center">
      <Icon className="h-6 w-6 text-slate-600" strokeWidth={1.5} />
      <div className="text-sm font-medium text-slate-300">{title}</div>
      <Badge
        variant="outline"
        className="border-slate-500/30 bg-slate-500/10 text-slate-400"
      >
        {phase}
      </Badge>
      <p className="max-w-xs text-xs text-muted-foreground">{blurb}</p>
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
          <Button
            variant="outline"
            size="sm"
            disabled
            title="Kanban board lands in Phase 4"
          >
            <KanbanSquare className="mr-2 h-4 w-4" />
            Kanban
          </Button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
        <PhasePlaceholder
          icon={FolderTree}
          title="File tree"
          phase="Phase 2"
          blurb="Browse the project's file structure, lazily per directory."
        />
        <PhasePlaceholder
          icon={TerminalSquare}
          title="Terminals"
          phase="Phase 3"
          blurb="Persistent tmux-backed shells that survive reloads and restarts."
        />
        <PhasePlaceholder
          icon={KanbanSquare}
          title="Kanban"
          phase="Phase 4"
          blurb="Per-project board for agent orchestration, also driven over MCP."
        />
      </div>
    </div>
  );
}
