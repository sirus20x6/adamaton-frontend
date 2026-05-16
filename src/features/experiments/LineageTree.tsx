import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, CornerDownRight } from "lucide-react";

import type { Experiment } from "@/api/experiments";
import { ValBpbBadge } from "@/features/experiments/ValBpbBadge";
import { cn } from "@/lib/utils";

type Node = {
  id: string;
  name: string;
  val_bpb: number | null;
  children: Node[];
  depth: number;
};

function buildTree(experiments: readonly Experiment[]): Node[] {
  const byId = new Map<string, Node>();
  for (const e of experiments) {
    byId.set(e.id, {
      id: e.id,
      name: e.name,
      val_bpb: e.val_bpb,
      children: [],
      depth: 0,
    });
  }
  const roots: Node[] = [];
  for (const e of experiments) {
    const node = byId.get(e.id)!;
    if (e.parent_id && byId.has(e.parent_id)) {
      byId.get(e.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Sort children by val_bpb (best first), nulls last
  const sortNode = (n: Node, depth: number) => {
    n.depth = depth;
    n.children.sort((a, b) => {
      if (a.val_bpb === null && b.val_bpb === null) return 0;
      if (a.val_bpb === null) return 1;
      if (b.val_bpb === null) return -1;
      return a.val_bpb - b.val_bpb;
    });
    n.children.forEach((c) => sortNode(c, depth + 1));
  };
  roots.forEach((r) => sortNode(r, 0));
  return roots;
}

/** Recursively count the descendants under a node (excluding itself). */
function countDescendants(node: Node): number {
  let total = 0;
  for (const c of node.children) {
    total += 1 + countDescendants(c);
  }
  return total;
}

/**
 * Walk the tree from each root and find the descendant node with the lowest
 * val_bpb. Used by the collapse-non-best toggle to decide which path to keep
 * expanded.
 */
function findBestLeafIds(roots: readonly Node[]): Set<string> {
  const bestIds = new Set<string>();
  const findBest = (n: Node): { node: Node; val: number | null } => {
    let bestNode: Node = n;
    let bestVal: number | null = n.val_bpb;
    for (const c of n.children) {
      const childBest = findBest(c);
      if (childBest.val === null) continue;
      if (bestVal === null || childBest.val < bestVal) {
        bestVal = childBest.val;
        bestNode = childBest.node;
      }
    }
    return { node: bestNode, val: bestVal };
  };
  // Mark every ancestor of the best leaf as "kept expanded".
  const markPath = (start: Node, target: Node) => {
    // BFS/DFS with parent map; cheaper to recurse since trees are small.
    const visit = (n: Node, path: Node[]): boolean => {
      if (n.id === target.id) {
        for (const p of path) bestIds.add(p.id);
        bestIds.add(target.id);
        return true;
      }
      for (const c of n.children) {
        if (visit(c, [...path, n])) return true;
      }
      return false;
    };
    visit(start, []);
  };
  for (const root of roots) {
    const { node: best } = findBest(root);
    markPath(root, best);
  }
  return bestIds;
}

type Props = {
  experiments: readonly Experiment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const LARGE_TREE_THRESHOLD = 50;

export function LineageTree({ experiments, selectedId, onSelect }: Props) {
  const tree = useMemo(() => buildTree(experiments), [experiments]);
  const isLarge = experiments.length > LARGE_TREE_THRESHOLD;
  const [collapseNonBest, setCollapseNonBest] = useState<boolean>(isLarge);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Flip the default the first time the dataset crosses the large threshold,
  // and reset any sticky per-node user toggles so the new default is honoured.
  // Prevents stranding the user on "expanded" once a small tree grows past 50.
  useEffect(() => {
    setCollapseNonBest(isLarge);
    setCollapsed(new Set());
  }, [isLarge]);

  const bestIds = useMemo(
    () => (collapseNonBest ? findBestLeafIds(tree) : null),
    [tree, collapseNonBest],
  );

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (tree.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
        No lineage yet.
      </div>
    );
  }

  const renderNode = (node: Node): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    // The mask decides each node's *default* expansion state, then the user
    // toggle XOR-flips it. That way clicking a chevron always inverts what's
    // currently visible regardless of how the mask was set.
    const onBestPath = bestIds === null ? true : bestIds.has(node.id);
    const isCollapsedFromMask = bestIds === null ? false : !onBestPath;
    const userToggled = collapsed.has(node.id);
    const finalCollapsed = userToggled
      ? !isCollapsedFromMask
      : isCollapsedFromMask;

    const isSelected = node.id === selectedId;
    const hidden = finalCollapsed ? countDescendants(node) : 0;

    return (
      <li key={node.id} className="text-sm">
        <div
          className={cn(
            "group flex items-center gap-1 rounded px-1 py-0.5",
            "hover:bg-accent/50 cursor-pointer",
            isSelected && "bg-accent text-accent-foreground",
          )}
          style={{ paddingLeft: `${node.depth * 14 + 4}px` }}
          onClick={() => onSelect(node.id)}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={finalCollapsed ? "Expand" : "Collapse"}
              onClick={(e) => {
                e.stopPropagation();
                toggle(node.id);
              }}
              className="rounded text-muted-foreground hover:text-foreground"
            >
              {finalCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <CornerDownRight
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground/60",
                node.depth === 0 && "invisible",
              )}
            />
          )}
          <span className="flex-1 truncate">{node.name}</span>
          {hidden > 0 && (
            <span
              className="shrink-0 rounded-sm bg-muted px-1 py-px font-mono text-[0.6rem] text-muted-foreground"
              title={`${hidden} descendants hidden`}
            >
              +{hidden}
            </span>
          )}
          <ValBpbBadge value={node.val_bpb} className="shrink-0" />
        </div>
        {hasChildren && !finalCollapsed && (
          <ul className="m-0 list-none p-0">
            {node.children.map((c) => renderNode(c))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
          <input
            type="checkbox"
            checked={collapseNonBest}
            onChange={(e) => {
              setCollapseNonBest(e.target.checked);
              setCollapsed(new Set());
            }}
            className="h-3 w-3 rounded border-border bg-card accent-primary"
          />
          Collapse non-best paths
        </label>
        {isLarge && (
          <span className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">
            {experiments.length} runs
          </span>
        )}
      </div>
      <div className="max-h-[60vh] overflow-auto pr-1">
        <ul className="m-0 list-none space-y-0.5 p-0">
          {tree.map((root) => renderNode(root))}
        </ul>
      </div>
    </div>
  );
}
