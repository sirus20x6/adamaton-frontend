import { useEffect, useMemo, useRef } from "react";
import { CheckSquare, Square, X } from "lucide-react";

import type { Experiment, ExperimentSearchHit } from "@/api/experiments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { StatusPill } from "@/features/experiments/StatusPill";
import { ValBpbBadge } from "@/features/experiments/ValBpbBadge";
import { cn, formatRelative } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  status: Experiment["status"];
  val_bpb: number | null;
  parent_val_bpb?: number | null;
  tags: readonly string[];
  started_at: string;
  similarity?: number;
  hypothesis_preview?: string;
};

function rowsFromExperiments(
  experiments: readonly Experiment[],
  byId: Map<string, Experiment>,
): Row[] {
  return experiments.map((e) => ({
    id: e.id,
    name: e.name,
    status: e.status,
    val_bpb: e.val_bpb,
    parent_val_bpb: e.parent_id ? (byId.get(e.parent_id)?.val_bpb ?? null) : null,
    tags: e.tags,
    started_at: e.started_at,
    hypothesis_preview: e.hypothesis.slice(0, 200),
  }));
}

function rowsFromSearchHits(hits: readonly ExperimentSearchHit[]): Row[] {
  return hits.map((h) => ({
    id: h.id,
    name: h.name,
    status: h.status,
    val_bpb: h.val_bpb,
    tags: [],
    started_at: h.started_at,
    similarity: h.similarity,
    hypothesis_preview: h.hypothesis_preview,
  }));
}

type Props = {
  rows:
    | { kind: "list"; experiments: readonly Experiment[] }
    | { kind: "search"; hits: readonly ExperimentSearchHit[] };
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  /** True when the table is in multi-select mode. Selecting rows then no
   *  longer opens the detail drawer; instead it toggles `selection`. */
  selectionMode: boolean;
  onSelectionModeChange: (v: boolean) => void;
  selection: ReadonlySet<string>;
  onSelectionChange: (next: Set<string>) => void;
  /** Called when the user clicks "Compare (N)" with selection.size === 2. */
  onCompare?: (ids: readonly string[]) => void;
  /** Called when the user clicks "Export selected"; the parent already has the
   *  ExportButton wired up, this just hands the IDs back. */
  onExportSelected?: (ids: readonly string[]) => void;
};

export function ExperimentTable({
  rows,
  selectedId,
  onSelect,
  loading,
  selectionMode,
  onSelectionModeChange,
  selection,
  onSelectionChange,
  onCompare,
  onExportSelected,
}: Props) {
  const { toast } = useToast();
  const byId = useMemo(() => {
    if (rows.kind !== "list") return new Map<string, Experiment>();
    return new Map(rows.experiments.map((e) => [e.id, e]));
  }, [rows]);

  const display: Row[] = useMemo(
    () =>
      rows.kind === "list"
        ? rowsFromExperiments(rows.experiments, byId)
        : rowsFromSearchHits(rows.hits),
    [rows, byId],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation: j/k or arrow up/down. Disabled in selection mode so
  // arrow keys don't try to navigate while the user is checking boxes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if (selectionMode) return;
      if (display.length === 0) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      const idx = display.findIndex((r) => r.id === selectedId);
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = display[Math.min(display.length - 1, idx < 0 ? 0 : idx + 1)]!;
        onSelect(next.id);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = display[Math.max(0, idx < 0 ? 0 : idx - 1)]!;
        onSelect(prev.id);
      }
    };
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [display, selectedId, onSelect, selectionMode]);

  const toggleSelection = (id: string) => {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  if (loading && display.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
        Loading experiments…
      </div>
    );
  }

  if (display.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No experiments yet. Log one with{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          dr_experiment_log
        </code>{" "}
        from your agent or click <strong>New experiment</strong>.
      </div>
    );
  }

  const colTemplate = selectionMode
    ? "grid-cols-[1.5rem_minmax(0,2fr)_auto_auto_minmax(0,1.5fr)_auto]"
    : "grid-cols-[minmax(0,2fr)_auto_auto_minmax(0,1.5fr)_auto]";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
          {display.length} {display.length === 1 ? "row" : "rows"}
          {selectionMode && selection.size > 0 && ` · ${selection.size} selected`}
        </span>
        <Button
          type="button"
          size="sm"
          variant={selectionMode ? "secondary" : "outline"}
          onClick={() => {
            const next = !selectionMode;
            onSelectionModeChange(next);
            if (!next) onSelectionChange(new Set());
          }}
          aria-pressed={selectionMode}
        >
          {selectionMode ? (
            <>
              <X className="h-3.5 w-3.5" /> Done
            </>
          ) : (
            <>
              <CheckSquare className="h-3.5 w-3.5" /> Select
            </>
          )}
        </Button>
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        role="grid"
        aria-rowcount={display.length}
        className="overflow-hidden rounded-md border border-border bg-card/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div
          className={cn(
            "grid items-center gap-3 border-b border-border bg-muted/40 px-4 py-2 text-[0.65rem] uppercase tracking-wide text-muted-foreground",
            colTemplate,
          )}
        >
          {selectionMode && <span aria-hidden="true" />}
          <span>Name</span>
          <span>Status</span>
          <span>val_bpb</span>
          <span>Tags</span>
          <span className="text-right">Started</span>
        </div>
        <ul className="divide-y divide-border">
          {display.map((r, i) => {
            const isSelected = r.id === selectedId;
            const isChecked = selection.has(r.id);
            return (
              <li
                key={r.id}
                role="row"
                aria-rowindex={i + 1}
                aria-selected={selectionMode ? isChecked : isSelected}
                aria-current={
                  !selectionMode && isSelected ? "true" : undefined
                }
                tabIndex={-1}
                onClick={() => {
                  if (selectionMode) {
                    toggleSelection(r.id);
                  } else {
                    onSelect(r.id);
                  }
                }}
                className={cn(
                  "grid cursor-pointer items-center gap-3 px-4 py-2 text-sm",
                  colTemplate,
                  "hover:bg-accent/50",
                  !selectionMode &&
                    isSelected &&
                    "bg-accent text-accent-foreground",
                  selectionMode &&
                    isChecked &&
                    "bg-accent/40 text-accent-foreground",
                )}
              >
                {selectionMode && (
                  <span
                    aria-hidden="true"
                    className="flex h-4 w-4 items-center justify-center"
                  >
                    {isChecked ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                )}
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{r.name}</span>
                  {r.hypothesis_preview && (
                    <span className="truncate text-xs text-muted-foreground">
                      {r.hypothesis_preview}
                    </span>
                  )}
                </div>
                <StatusPill status={r.status} />
                <ValBpbBadge value={r.val_bpb} relativeTo={r.parent_val_bpb} />
                <div className="flex flex-wrap gap-1">
                  {r.tags.length === 0 && r.similarity !== undefined && (
                    <Badge variant="outline">
                      sim {r.similarity.toFixed(2)}
                    </Badge>
                  )}
                  {r.tags.map((t) => (
                    <Badge key={t} variant="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
                <span className="text-right text-xs text-muted-foreground tabular-nums">
                  {formatRelative(r.started_at)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {selectionMode && selection.size > 0 && (
        <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
          <span className="text-xs text-muted-foreground">
            {selection.size} selected
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!onCompare || selection.size !== 2}
              onClick={() => {
                if (!onCompare) return;
                if (selection.size !== 2) {
                  toast({
                    title: "Pick two runs",
                    description: "Compare needs exactly two experiments.",
                    variant: "info",
                  });
                  return;
                }
                onCompare(Array.from(selection));
              }}
            >
              Compare ({selection.size})
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!onExportSelected || selection.size === 0}
              onClick={() => onExportSelected?.(Array.from(selection))}
            >
              Export selected
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onSelectionChange(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
