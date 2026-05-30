/**
 * Projects — registry of host folders (git repos, worktrees, submodules, or
 * plain folders) surfaced in the sidebar. Read view over evo.projects via
 * /evo-api/api/v1/projects with register + unregister actions.
 *
 * This is Phase 1 (registry only). The file-tree browser, persistent
 * terminals, and per-project Kanban board land on the detail view in later
 * phases. See docs/PROJECTS_KANBAN.md.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import {
  Folder,
  FolderGit2,
  GitBranch,
  GitFork,
  Loader2,
  Plus,
  Server,
  Trash2,
} from "lucide-react";

import {
  type Project,
  type ProjectType,
  useCreateProject,
  useDeleteProject,
  useProjectHosts,
  useProjects,
} from "@/api/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const TYPE_TONE: Record<ProjectType, string> = {
  "git-repo": "bg-violet-500/10 text-violet-300 border-violet-500/30",
  worktree: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  submodule: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  folder: "bg-slate-500/10 text-slate-300 border-slate-500/30",
};

function typeIcon(type: ProjectType) {
  switch (type) {
    case "worktree":
      return GitBranch;
    case "submodule":
      return GitFork;
    case "folder":
      return Folder;
    default:
      return FolderGit2;
  }
}

export default function Projects() {
  const projects = useProjects();
  const [registerOpen, setRegisterOpen] = React.useState(false);
  const list = projects.data ?? [];

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10">
            <FolderGit2 className="h-5 w-5 text-violet-300" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="text-sm text-muted-foreground">
              Folders, repos, and worktrees you work in.
            </p>
          </div>
        </div>
        <Button onClick={() => setRegisterOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Register
        </Button>
      </div>

      {projects.isLoading && (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border bg-card/30">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      )}

      {projects.error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 font-mono text-xs text-rose-200">
          {(projects.error as Error).message}
        </div>
      )}

      {!projects.isLoading && !projects.error && list.length === 0 && (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/30">
          <FolderGit2 className="h-6 w-6 text-slate-600" strokeWidth={1.5} />
          <p className="text-sm text-slate-400">No projects registered yet.</p>
          <Button size="sm" onClick={() => setRegisterOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Register your first project
          </Button>
        </div>
      )}

      {list.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}

      <RegisterDialog open={registerOpen} onOpenChange={setRegisterOpen} />
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const del = useDeleteProject();
  const Icon = typeIcon(project.type);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  return (
    <div className="group relative flex flex-col gap-2 rounded-xl border border-border bg-card/30 p-4 transition-colors hover:border-border/80 hover:bg-card/50">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/projects/${project.id}`}
          className="flex min-w-0 items-center gap-2 hover:underline"
        >
          <Icon className="h-4 w-4 shrink-0 text-violet-300" />
          <span className="truncate font-semibold text-slate-100">
            {project.display_name}
          </span>
        </Link>
        <button
          type="button"
          aria-label="Unregister project"
          title="Unregister (does not delete files)"
          disabled={del.isPending}
          onClick={() => setConfirmOpen(true)}
          className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-rose-500/10 hover:text-rose-300 focus-visible:opacity-100 group-hover:opacity-100"
        >
          {del.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Unregister "${project.display_name}"?`}
        description="This only removes the project from the dashboard. Your files on disk are untouched."
        confirmLabel="Unregister"
        confirmVariant="destructive"
        busy={del.isPending}
        busyLabel="Unregistering…"
        onConfirm={() =>
          del.mutate(project.id, {
            onSettled: () => setConfirmOpen(false),
          })
        }
      />

      <p
        className="truncate font-mono text-xs text-slate-500"
        title={project.path}
      >
        {project.path}
      </p>

      <div className="mt-1 flex items-center gap-2">
        <Badge variant="outline" className={TYPE_TONE[project.type]}>
          {project.type}
        </Badge>
        {project.host && (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          >
            <Server className="h-3 w-3" />
            {project.host}
          </Badge>
        )}
        {project.git_remote && (
          <span
            className="truncate font-mono text-[10px] text-slate-500"
            title={project.git_remote}
          >
            {project.git_remote}
          </span>
        )}
      </div>
    </div>
  );
}

function RegisterDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateProject();
  const hosts = useProjectHosts();
  const [path, setPath] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [host, setHost] = React.useState("");

  const hostOptions = hosts.data ?? [];

  React.useEffect(() => {
    if (open) {
      setPath("");
      setDisplayName("");
      setHost("");
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Default to the first (local) host once the list loads.
  React.useEffect(() => {
    if (open && !host && hostOptions.length > 0) {
      setHost(hostOptions[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hostOptions]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = path.trim();
    if (!trimmed) return;
    create.mutate(
      {
        path: trimmed,
        display_name: displayName.trim() || undefined,
        host: host || undefined,
      },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Register a project</DialogTitle>
          <DialogDescription>
            Point at an absolute host path. The folder type (git repo,
            worktree, submodule, or plain folder) and origin remote are
            detected automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Absolute path</span>
              <Input
                autoFocus
                placeholder="/thearray/git/my-repo"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                className="font-mono"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Host</span>
              <select
                value={host}
                onChange={(e) => setHost(e.target.value)}
                disabled={hosts.isLoading || hostOptions.length === 0}
                className={cn(
                  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm",
                  "ring-offset-background",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {hostOptions.length === 0 && (
                  <option value="">
                    {hosts.isLoading ? "Loading hosts…" : "No hosts available"}
                  </option>
                )}
                {hostOptions.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">
                Display name{" "}
                <span className="text-xs text-slate-500">(optional)</span>
              </span>
              <Input
                placeholder="defaults to the folder name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
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
            <Button type="submit" disabled={create.isPending || !path.trim()}>
              {create.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Register
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
