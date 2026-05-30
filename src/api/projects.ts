// API surface for the Projects feature. Lands on
// platform/dashboard/apiserver through Caddy's /evo-api/* proxy.
//
// Backend handlers live in
// adamaton-platform/dashboard/apiserver/projects_endpoints.go.
//
// A project is a host folder — usually a git repo, sometimes a nested git
// worktree or submodule. Phase 1 is the registry only; the file-tree,
// persistent terminals, and per-project Kanban board land on top of
// projects.id in later phases. See docs/PROJECTS_KANBAN.md.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const EVO_BASE = "/evo-api/api/v1";

// Mirrors the CHECK constraint on evo.projects.type.
export const PROJECT_TYPES = [
  "git-repo",
  "worktree",
  "submodule",
  "folder",
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export interface Project {
  id: string;
  path: string;
  display_name: string;
  type: ProjectType;
  host?: string;
  git_remote?: string;
  parent_id?: string;
  created_at: string;
  last_accessed_at?: string;
}

export interface ProjectCreateRequest {
  path: string;
  display_name?: string;
  host?: string;
  parent_id?: string;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg =
      (parsed as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return parsed as T;
}

export const projectsApi = {
  list: (): Promise<Project[]> =>
    fetch(`${EVO_BASE}/projects`).then(jsonOrThrow<Project[]>),
  hosts: (): Promise<string[]> =>
    fetch(`${EVO_BASE}/projects/hosts`).then(jsonOrThrow<string[]>),
  get: (id: string): Promise<Project> =>
    fetch(`${EVO_BASE}/projects/${encodeURIComponent(id)}`).then(
      jsonOrThrow<Project>,
    ),
  create: (body: ProjectCreateRequest): Promise<Project> =>
    fetch(`${EVO_BASE}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(jsonOrThrow<Project>),
  remove: (id: string): Promise<void> =>
    fetch(`${EVO_BASE}/projects/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).then(async (res) => {
      if (!res.ok && res.status !== 204) {
        await jsonOrThrow<void>(res);
      }
    }),
};

export const projectKeys = {
  all: ["projects"] as const,
  list: () => ["projects", "list"] as const,
  hosts: () => ["projects", "hosts"] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.list(),
    queryFn: projectsApi.list,
    refetchInterval: 15_000,
  });
}

export function useProjectHosts() {
  return useQuery({
    queryKey: projectKeys.hosts(),
    queryFn: projectsApi.hosts,
    staleTime: 60_000,
  });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: id ? projectKeys.detail(id) : ["projects", "detail", "_disabled"],
    queryFn: () => projectsApi.get(id as string),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation<Project, Error, ProjectCreateRequest>({
    mutationFn: projectsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.list() });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: projectsApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.list() });
    },
  });
}
