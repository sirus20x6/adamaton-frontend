import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  Loader2,
  Search as SearchIcon,
  Star,
} from "lucide-react";

import {
  KNOWN_SOURCE_KINDS,
  sortSources,
  useSourceKinds,
  useSources,
  type Source,
  type SourceListArgs,
  type SourceSortKey,
} from "@/api/sources";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SourceBrowserProps = {
  /** Compact rendering for the right-rail collapsible variant. */
  variant?: "panel" | "page";
  /** Cap on rows fetched per request. */
  limit?: number;
  /** Optional renderer override for each card — e.g. to add per-source actions. */
  onPickSource?: (source: Source) => void;
  className?: string;
};

const SORTS: ReadonlyArray<{ value: SourceSortKey; label: string }> = [
  { value: "weight", label: "Weight" },
  { value: "h5", label: "h5 index" },
  { value: "name", label: "Name" },
];

function useDebounced<T>(value: T, delay = 200): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return v;
}

function KindChip({
  kind,
  active,
  onClick,
}: {
  kind: string | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-accent",
      )}
    >
      {kind ?? "All"}
    </button>
  );
}

function WeightBadge({ weight }: { weight: number | null }) {
  if (weight === null) {
    return <Badge variant="outline">no weight</Badge>;
  }
  const tone =
    weight >= 0.85
      ? "success"
      : weight >= 0.6
        ? "default"
        : weight >= 0.4
          ? "warning"
          : "outline";
  return (
    <Badge variant={tone}>
      <Star className="h-3 w-3" />
      {weight.toFixed(2)}
    </Badge>
  );
}

function SourceCard({
  source,
  onPickSource,
}: {
  source: Source;
  onPickSource?: (source: Source) => void;
}) {
  return (
    <li>
      <article
        className={cn(
          "group flex flex-col gap-2 rounded-lg border border-border bg-card p-3",
          "transition-colors hover:border-primary/40",
        )}
      >
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <h3 className="truncate text-sm font-medium leading-snug text-foreground">
              {source.name}
            </h3>
            <p className="flex items-center gap-1.5 truncate font-mono text-[0.7rem] text-muted-foreground">
              <Globe className="h-3 w-3 shrink-0" />
              <span className="truncate">{source.domain}</span>
            </p>
          </div>
          <WeightBadge weight={source.default_weight} />
        </header>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="lowercase">
            {String(source.kind)}
          </Badge>
          {source.peer_reviewed ? (
            <Badge variant="success">
              <CheckCircle2 className="h-3 w-3" />
              peer-reviewed
            </Badge>
          ) : null}
          {typeof source.h5_index === "number" ? (
            <Badge variant="default">h5 {source.h5_index}</Badge>
          ) : null}
        </div>
        {onPickSource ? (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onPickSource(source)}
            >
              Use source
            </Button>
          </div>
        ) : null}
      </article>
    </li>
  );
}

export function SourceBrowser({
  variant = "panel",
  limit,
  onPickSource,
  className,
}: SourceBrowserProps) {
  const [kind, setKind] = React.useState<string | null>(null);
  const [peerOnly, setPeerOnly] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<SourceSortKey>("weight");
  const debouncedSearch = useDebounced(search, 200);

  const kindsQuery = useSourceKinds();
  const sourcesArgs: SourceListArgs = React.useMemo(
    () => ({
      kind: kind ?? undefined,
      peer_reviewed: peerOnly ? true : undefined,
      q: debouncedSearch.trim() || undefined,
      limit: limit ?? (variant === "page" ? 200 : 100),
    }),
    [kind, peerOnly, debouncedSearch, limit, variant],
  );
  const sourcesQuery = useSources(sourcesArgs);

  const items = React.useMemo(() => {
    const rows = sourcesQuery.data?.items ?? [];
    return sortSources(rows, sort);
  }, [sourcesQuery.data?.items, sort]);

  const kinds = React.useMemo<string[]>(() => {
    const fromServer = kindsQuery.data?.kinds;
    if (fromServer && fromServer.length > 0) return fromServer;
    return [...KNOWN_SOURCE_KINDS];
  }, [kindsQuery.data?.kinds]);

  const totalDisplay = sourcesQuery.data
    ? `${items.length} of ${sourcesQuery.data.total}`
    : "…";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="space-y-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Filter by name or domain"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label="Filter sources"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <KindChip
            kind={null}
            active={kind === null}
            onClick={() => setKind(null)}
          />
          {kinds.map((k) => (
            <KindChip
              key={k}
              kind={k}
              active={kind === k}
              onClick={() => setKind(kind === k ? null : k)}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex select-none items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={peerOnly}
              onChange={(e) => setPeerOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input accent-primary"
            />
            Peer-reviewed only
          </label>
          <div className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
            <span className="hidden sm:inline">Sort</span>
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              {SORTS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSort(opt.value)}
                  className={cn(
                    "px-2 py-1 text-[0.7rem] transition-colors",
                    sort === opt.value
                      ? "bg-primary/10 text-foreground"
                      : "bg-background text-muted-foreground hover:bg-accent",
                  )}
                  aria-pressed={sort === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[0.7rem] text-muted-foreground">
        <span>{totalDisplay} sources</span>
        {sourcesQuery.isFetching ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-label="loading" />
        ) : null}
      </div>

      {sourcesQuery.isError ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            Failed to load sources:{" "}
            {sourcesQuery.error?.message ?? "unknown error"}
          </p>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          {sourcesQuery.isLoading
            ? "Loading sources…"
            : "No sources match the current filters."}
        </p>
      ) : (
        <ul
          className={cn(
            "flex flex-col gap-2",
            variant === "page" &&
              "grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
          )}
        >
          {items.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              onPickSource={onPickSource}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
