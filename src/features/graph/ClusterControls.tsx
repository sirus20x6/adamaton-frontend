import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Crosshair,
  Loader2,
  Maximize2,
  Search as SearchIcon,
} from "lucide-react";

import { searchEntities, type GraphNode } from "@/api/graph";
import { listCorpora } from "@/api/library";
import { Button } from "@/components/ui/button";
import { colorForCategory } from "@/features/graph/useCytoscape";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { LayoutName } from "@/features/graph/useCytoscape";
import { cn } from "@/lib/utils";

const LAYOUT_OPTIONS: ReadonlyArray<{ value: LayoutName; label: string }> = [
  { value: "fcose", label: "Force" },
  { value: "concentric", label: "Concentric" },
  { value: "cose", label: "Organic" },
  { value: "breadthfirst", label: "Tree" },
  { value: "grid", label: "Grid" },
  { value: "circle", label: "Circle" },
  { value: "cose-bilkent", label: "Bilkent" },
  { value: "dagre", label: "Dagre" },
];

export type ExpandModeValue = "auto" | "members" | "all";

export type ClusterControlsProps = {
  corpusId: string;
  onCorpusChange: (corpusId: string) => void;
  level: number;
  onLevelChange: (level: number) => void;
  layout: LayoutName;
  onLayoutChange: (layout: LayoutName) => void;
  onEntitySelect: (node: GraphNode) => void;
  onResetView?: () => void;
  onCenterOnSelection?: () => void;
  hasSelection?: boolean;
  expandMode?: ExpandModeValue;
  onExpandModeChange?: (mode: ExpandModeValue) => void;
};

export function ClusterControls(props: ClusterControlsProps) {
  const {
    corpusId,
    onCorpusChange,
    level,
    onLevelChange,
    layout,
    onLayoutChange,
    onEntitySelect,
    onResetView,
    onCenterOnSelection,
    hasSelection = false,
    expandMode = "auto",
    onExpandModeChange,
  } = props;

  const [search, setSearch] = React.useState("");
  const trimmed = search.trim();

  const corporaQuery = useQuery({
    queryKey: ["corpora"],
    queryFn: listCorpora,
  });

  const entitySearch = useQuery({
    queryKey: ["entitySearch", corpusId, trimmed],
    queryFn: () => searchEntities(trimmed, corpusId, 10),
    enabled: trimmed.length > 1,
    staleTime: 10_000,
  });

  const currentLayoutLabel =
    LAYOUT_OPTIONS.find((o) => o.value === layout)?.label ?? layout;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-background/85 p-3 shadow-sm backdrop-blur">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wide">Corpus</span>
        <select
          value={corpusId}
          onChange={(event) => onCorpusChange(event.target.value)}
          className={cn(
            "h-8 rounded-md border border-input bg-card/70 px-2 text-xs shadow-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <option value="_">All corpora</option>
          {(corporaQuery.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wide">Level</span>
        <div className="inline-flex overflow-hidden rounded-md border border-input bg-card/70 shadow-sm">
          {[2, 1, 0].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onLevelChange(value)}
              className={cn(
                "h-8 w-8 text-xs tabular-nums transition-colors",
                value === level
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              aria-pressed={value === level}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {onExpandModeChange ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium uppercase tracking-wide">Expand</span>
          <div className="inline-flex overflow-hidden rounded-md border border-input bg-card/70 shadow-sm">
            {(
              [
                { value: "auto", label: "Auto", title: "Members for taxonomic categories, all edges otherwise" },
                { value: "members", label: "Members", title: "Inbound MEMBER_OF / IS_A / WORSHIPS edges" },
                { value: "all", label: "All", title: "Every incident edge regardless of predicate" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onExpandModeChange(opt.value)}
                title={opt.title}
                className={cn(
                  "h-8 px-2 text-xs transition-colors",
                  opt.value === expandMode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                aria-pressed={opt.value === expandMode}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wide">Layout</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 min-w-28 justify-between gap-1 bg-card/70 px-2 text-xs shadow-sm"
              aria-label="Choose layout"
            >
              <span>{currentLayoutLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[10rem]">
            <DropdownMenuLabel>Layout</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {LAYOUT_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onSelect={() => onLayoutChange(opt.value)}
                className={cn(
                  "font-mono text-xs",
                  opt.value === layout && "bg-accent text-accent-foreground",
                )}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-1.5">
        {onResetView ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 bg-card/70 p-0 shadow-sm"
            onClick={onResetView}
            title="Fit graph to screen (f)"
            aria-label="Fit graph to screen"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {onCenterOnSelection ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 bg-card/70 p-0 shadow-sm"
            onClick={onCenterOnSelection}
            disabled={!hasSelection}
            title={
              hasSelection
                ? "Center viewport on the selected node"
                : "Select a node first"
            }
            aria-label="Center selected node"
          >
            <Crosshair className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>

      <div className="relative ml-auto w-full max-w-xs">
        <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find entity by name…"
          className="h-8 border-input bg-card/70 pl-7 pr-8 text-xs shadow-sm"
        />
        {entitySearch.isFetching && trimmed.length > 1 ? (
          <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}

        {trimmed.length > 1 && entitySearch.data && entitySearch.data.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
            {entitySearch.data.map((hit) => (
              <button
                key={hit.id}
                type="button"
                onClick={() => {
                  onEntitySelect(hit);
                  setSearch("");
                }}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: colorForCategory(hit.category).fill,
                    }}
                  />
                  <span className="truncate">{hit.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
                  {hit.category ? (
                    <span className="truncate max-w-[6rem]">{hit.category}</span>
                  ) : null}
                  {typeof hit.count === "number" ? (
                    <span className="tabular-nums">{hit.count}</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
