/**
 * Sidebar list of experiments with checkbox selection + per-row color
 * swatch matching the chart.
 *
 * Sort modes mirror the Experiments table (val_bpb / recent / name /
 * status) and the "Select best 5 by val_bpb" quick action runs against
 * the currently filtered list (so it respects the session picker
 * upstream). Selection cap is 12 — past that point the chart legend
 * becomes unreadable, so we hard-stop further toggles and surface the
 * limit in the header rather than silently swallowing clicks.
 */

import { useMemo, useState } from "react";
import { ArrowUpDown, Filter, Sparkles } from "lucide-react";

import type { Experiment } from "@/api/experiments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusPill } from "@/features/experiments/StatusPill";
import { colorForRun, INACTIVE_RUN_COLOR } from "@/features/experiments/runColors";
import { cn, formatRelative } from "@/lib/utils";

export const MAX_ACTIVE_RUNS = 12;

export type RunSortKey = "val_bpb" | "recent" | "name" | "status";

type Props = {
  experiments: readonly Experiment[];
  activeIds: readonly string[];
  onChange: (ids: string[]) => void;
  className?: string;
};

const SORT_LABEL: Record<RunSortKey, string> = {
  val_bpb: "val_bpb",
  recent: "recent",
  name: "name",
  status: "status",
};

const STATUS_RANK: Record<string, number> = {
  running: 0,
  pending: 1,
  succeeded: 2,
  interrupted: 3,
  failed: 4,
};

function sortRows(
  rows: readonly Experiment[],
  sortKey: RunSortKey,
): Experiment[] {
  const out = [...rows];
  if (sortKey === "val_bpb") {
    out.sort((a, b) => {
      const av = a.val_bpb ?? Number.POSITIVE_INFINITY;
      const bv = b.val_bpb ?? Number.POSITIVE_INFINITY;
      if (av !== bv) return av - bv;
      return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
    });
  } else if (sortKey === "recent") {
    out.sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    );
  } else if (sortKey === "name") {
    out.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    out.sort((a, b) => {
      const ra = STATUS_RANK[a.status] ?? 99;
      const rb = STATUS_RANK[b.status] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  }
  return out;
}

export function RunSelector({
  experiments,
  activeIds,
  onChange,
  className,
}: Props) {
  const [sortKey, setSortKey] = useState<RunSortKey>("val_bpb");
  const [filter, setFilter] = useState("");

  const sorted = useMemo(() => sortRows(experiments, sortKey), [
    experiments,
    sortKey,
  ]);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.hypothesis ?? "").toLowerCase().includes(q),
    );
  }, [sorted, filter]);

  const activeSet = useMemo(() => new Set(activeIds), [activeIds]);

  const toggle = (id: string) => {
    if (activeSet.has(id)) {
      onChange(activeIds.filter((x) => x !== id));
      return;
    }
    if (activeIds.length >= MAX_ACTIVE_RUNS) {
      return;
    }
    onChange([...activeIds, id]);
  };

  const selectBestFive = () => {
    const ranked = sortRows(experiments, "val_bpb").filter(
      (e) => e.val_bpb !== null,
    );
    const next = ranked.slice(0, 5).map((e) => e.id);
    onChange(next);
  };

  const clearAll = () => onChange([]);

  return (
    <div className={cn("flex h-full flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
          {activeIds.length} of {experiments.length} selected
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-1.5 text-[0.7rem]"
            >
              <ArrowUpDown className="h-3 w-3" />
              {SORT_LABEL[sortKey]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Sort runs</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={sortKey}
              onValueChange={(v) => setSortKey(v as RunSortKey)}
            >
              <DropdownMenuRadioItem value="val_bpb">
                val_bpb (best first)
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="recent">
                Most recent
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="status">
                Status
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative">
        <Filter className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter runs…"
          className="h-7 pl-7 text-xs"
          aria-label="Filter runs"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-[0.7rem]"
          onClick={selectBestFive}
          disabled={experiments.length === 0}
        >
          <Sparkles className="h-3 w-3" />
          Best 5
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[0.7rem] text-muted-foreground"
          onClick={clearAll}
          disabled={activeIds.length === 0}
        >
          Clear
        </Button>
      </div>

      {activeIds.length >= MAX_ACTIVE_RUNS && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[0.65rem] text-amber-300">
          Hit the {MAX_ACTIVE_RUNS}-run cap. Deselect one to add another.
        </div>
      )}

      <ScrollArea className="-mx-1 min-h-0 flex-1 rounded-md">
        <ul className="flex flex-col gap-0.5 px-1 pb-2">
          {filtered.length === 0 && (
            <li className="px-2 py-3 text-center text-[0.7rem] text-muted-foreground">
              No runs match the filter.
            </li>
          )}
          {filtered.map((e) => {
            const checked = activeSet.has(e.id);
            const swatch = checked
              ? colorForRun(e.id, activeIds)
              : INACTIVE_RUN_COLOR;
            const disabled = !checked && activeIds.length >= MAX_ACTIVE_RUNS;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => toggle(e.id)}
                  disabled={disabled}
                  aria-pressed={checked}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
                    checked
                      ? "border-border bg-accent/40"
                      : "border-transparent hover:bg-accent/30",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    aria-label={`Toggle ${e.name}`}
                    readOnly
                    checked={checked}
                    disabled={disabled}
                    className="h-3 w-3 accent-foreground"
                    tabIndex={-1}
                  />
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ background: swatch }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-foreground">
                        {e.name}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[0.65rem] text-muted-foreground">
                      {e.val_bpb !== null && (
                        <Badge
                          variant="outline"
                          className="h-4 px-1 py-0 font-mono text-[0.6rem] tabular-nums"
                        >
                          {e.val_bpb.toFixed(3)}
                        </Badge>
                      )}
                      <span className="truncate">
                        {formatRelative(e.started_at)}
                      </span>
                    </div>
                  </div>
                  <StatusPill
                    status={e.status}
                    className="ml-auto h-4 px-1.5 py-0 text-[0.55rem]"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
}
