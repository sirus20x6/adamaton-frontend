/**
 * FileTreePanel — a lazy, recursive file browser for one project plus a
 * read-only content preview pane. Each directory fetches its own children
 * (depth=1) only when expanded, so deep trees load incrementally.
 *
 * Backed by GET /projects/{id}/tree and /projects/{id}/file (see
 * src/api/fileTree.ts). Embedded by ProjectDetail.
 */

import { useState } from "react";
import {
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderOpen,
  Loader2,
} from "lucide-react";

import {
  useFileContents,
  useFileTree,
  type FileNode,
} from "@/api/fileTree";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

// One row in the tree. Directories are expandable and fetch their children on
// first expand; files are selectable and drive the preview pane.
function TreeNode({
  projectId,
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  projectId: string;
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (node: FileNode) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const children = useFileTree(projectId, node.path, expanded && node.is_dir);

  const isSelected = !node.is_dir && selectedPath === node.path;

  const handleClick = () => {
    if (node.is_dir) {
      setExpanded((e) => !e);
    } else {
      onSelect(node);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        title={node.path || node.name}
        className={cn(
          "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
          isSelected && "bg-accent text-accent-foreground",
        )}
        style={{ paddingLeft: depth * 12 + 6 }}
      >
        {node.is_dir ? (
          <>
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform",
                expanded && "rotate-90",
              )}
            />
            {expanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-sky-400" strokeWidth={1.5} />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-sky-400" strokeWidth={1.5} />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            <FileIcon
              className="h-4 w-4 shrink-0 text-slate-500"
              strokeWidth={1.5}
            />
          </>
        )}
        <span className="truncate">{node.name}</span>
        {!node.is_dir && node.size > 0 && (
          <span className="ml-auto shrink-0 pl-2 font-mono text-[10px] text-muted-foreground">
            {formatBytes(node.size)}
          </span>
        )}
      </button>

      {node.is_dir && expanded && (
        <div>
          {children.isLoading && (
            <div
              className="flex items-center gap-1.5 px-1.5 py-1 text-xs text-muted-foreground"
              style={{ paddingLeft: (depth + 1) * 12 + 6 }}
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </div>
          )}
          {children.error && (
            <div
              className="px-1.5 py-1 font-mono text-[11px] text-rose-300"
              style={{ paddingLeft: (depth + 1) * 12 + 6 }}
            >
              {(children.error as Error).message}
            </div>
          )}
          {children.data?.length === 0 && (
            <div
              className="px-1.5 py-1 text-xs italic text-muted-foreground"
              style={{ paddingLeft: (depth + 1) * 12 + 6 }}
            >
              empty
            </div>
          )}
          {children.data?.map((child) => (
            <TreeNode
              key={child.path}
              projectId={projectId}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Read-only preview of the currently selected file.
function PreviewPane({
  projectId,
  path,
}: {
  projectId: string;
  path: string | null;
}) {
  const file = useFileContents(projectId, path);

  if (path === null) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
        Select a file to preview its contents.
      </div>
    );
  }

  if (file.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    );
  }

  if (file.error || !file.data) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center font-mono text-xs text-rose-300">
        {(file.error as Error)?.message ?? "Failed to load file"}
      </div>
    );
  }

  const f = file.data;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <span
          className="truncate font-mono text-xs text-slate-300"
          title={f.path}
        >
          {f.path}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {formatBytes(f.size)}
          {f.truncated && " · truncated"}
        </span>
      </div>
      <ScrollArea className="flex-1">
        {f.encoding === "base64" ? (
          <div className="p-4 text-center text-xs italic text-muted-foreground">
            Binary file — preview unavailable.
          </div>
        ) : (
          <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-slate-300">
            {f.contents}
          </pre>
        )}
      </ScrollArea>
    </div>
  );
}

export interface FileTreePanelProps {
  projectId: string;
  // Optional: notified whenever a file is selected. When omitted the panel
  // manages its own selection and renders an inline preview pane.
  onOpenFile?: (node: FileNode) => void;
}

export default function FileTreePanel({
  projectId,
  onOpenFile,
}: FileTreePanelProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  // Root listing (path ""). Always enabled.
  const root = useFileTree(projectId, "");

  const handleSelect = (node: FileNode) => {
    setSelectedPath(node.path);
    onOpenFile?.(node);
  };

  return (
    <div className="grid h-full grid-cols-1 overflow-hidden rounded-xl border border-border bg-card/20 md:grid-cols-[minmax(180px,260px)_1fr]">
      <div className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-slate-400">
          Files
        </div>
        <ScrollArea className="flex-1">
          <div className="p-1">
            {root.isLoading && (
              <div className="flex items-center gap-1.5 px-2 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </div>
            )}
            {root.error && (
              <div className="px-2 py-2 font-mono text-[11px] text-rose-300">
                {(root.error as Error).message}
              </div>
            )}
            {root.data?.length === 0 && (
              <div className="px-2 py-2 text-xs italic text-muted-foreground">
                Empty project.
              </div>
            )}
            {root.data?.map((node) => (
              <TreeNode
                key={node.path}
                projectId={projectId}
                node={node}
                depth={0}
                selectedPath={selectedPath}
                onSelect={handleSelect}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      <PreviewPane projectId={projectId} path={selectedPath} />
    </div>
  );
}
