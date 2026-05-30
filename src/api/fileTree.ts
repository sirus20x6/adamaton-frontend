// API surface for the per-project file tree browser. Lands on
// platform/dashboard/apiserver through Caddy's /evo-api/* proxy.
//
// Backend handlers live in
// adamaton-platform/dashboard/apiserver/projects_endpoints.go:
//   GET /api/v1/projects/{id}/tree?path=<rel>&depth=1 -> FileNode[]
//   GET /api/v1/projects/{id}/file?path=<rel>         -> FileContents
//
// The tree is browsed lazily: each expanded directory issues its own /tree
// request for its direct children (depth=1). path is relative to the project
// root, with "" meaning the root itself.

import { useQuery } from "@tanstack/react-query";

const EVO_BASE = "/evo-api/api/v1";

export interface FileNode {
  name: string;
  // Relative to the project root. "" is the root directory itself.
  path: string;
  is_dir: boolean;
  size: number;
}

export interface FileContents {
  path: string;
  contents: string;
  encoding: "utf8" | "base64";
  size: number;
  truncated: boolean;
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

export const fileTreeApi = {
  // List the direct children of <path> (depth=1). "" lists the project root.
  tree: (projectId: string, path: string): Promise<FileNode[]> => {
    const qs = new URLSearchParams({ path, depth: "1" });
    return fetch(
      `${EVO_BASE}/projects/${encodeURIComponent(projectId)}/tree?${qs}`,
    ).then(jsonOrThrow<FileNode[]>);
  },
  file: (projectId: string, path: string): Promise<FileContents> => {
    const qs = new URLSearchParams({ path });
    return fetch(
      `${EVO_BASE}/projects/${encodeURIComponent(projectId)}/file?${qs}`,
    ).then(jsonOrThrow<FileContents>);
  },
};

export const fileTreeKeys = {
  all: ["fileTree"] as const,
  tree: (projectId: string, path: string) =>
    ["fileTree", "tree", projectId, path] as const,
  file: (projectId: string, path: string) =>
    ["fileTree", "file", projectId, path] as const,
};

// useFileTree fetches the direct children of one directory. Mount one hook per
// expanded directory so the tree loads lazily as the user drills in. The query
// is disabled until the directory is actually expanded (enabled flag) to avoid
// fetching every level up front.
export function useFileTree(
  projectId: string | null,
  path: string,
  enabled = true,
) {
  return useQuery({
    queryKey:
      projectId !== null
        ? fileTreeKeys.tree(projectId, path)
        : ["fileTree", "tree", "_disabled", path],
    queryFn: () => fileTreeApi.tree(projectId as string, path),
    enabled: !!projectId && enabled,
    staleTime: 30_000,
  });
}

// useFileContents fetches a single file's contents for the preview pane.
// Disabled when path is null (nothing selected).
export function useFileContents(projectId: string | null, path: string | null) {
  return useQuery({
    queryKey:
      projectId !== null && path !== null
        ? fileTreeKeys.file(projectId, path)
        : ["fileTree", "file", "_disabled"],
    queryFn: () => fileTreeApi.file(projectId as string, path as string),
    enabled: !!projectId && path !== null,
    staleTime: 30_000,
  });
}
