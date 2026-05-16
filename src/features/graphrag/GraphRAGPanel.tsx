import * as React from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import {
  useGraphragCommunities,
  useGraphragCommunity,
  useGraphragSummary,
  type GraphragCommunity,
} from "@/api/graphrag";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Prose } from "@/components/markdown/Prose";
import { cn } from "@/lib/utils";

export type GraphRAGPanelProps = {
  corpusId: string;
};

const EMPTY_COPY =
  "GraphRAG hasn't produced a curated index for this corpus yet. The curated stage runs in the background once enabled.";

export function GraphRAGPanel({ corpusId }: GraphRAGPanelProps) {
  const summaryQuery = useGraphragSummary(corpusId);

  // Hierarchy levels come from the summary. Default to the deepest available
  // (best-summarised communities live at the highest level number).
  const levels = React.useMemo<number[]>(
    () => summaryQuery.data?.levels ?? [],
    [summaryQuery.data?.levels],
  );
  const [level, setLevel] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (level === null && levels.length > 0) {
      setLevel(Math.max(...levels));
    }
  }, [levels, level]);

  const communitiesQuery = useGraphragCommunities(
    corpusId,
    { level: level ?? undefined, limit: 200 },
    { enabled: corpusId.length > 0 && level !== null },
  );

  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Reset the selection whenever the level changes — community ids are
  // scoped to a level and otherwise the right column shows the wrong row.
  React.useEffect(() => {
    setSelectedId(null);
  }, [level, corpusId]);

  // Auto-select the first (best-ranked) community once a list arrives, but
  // only when the user hasn't picked one yet — preserve manual selection
  // across background refetches.
  React.useEffect(() => {
    const list = communitiesQuery.data;
    if (!list || list.length === 0) return;
    if (selectedId && list.some((c) => c.id === selectedId)) return;
    setSelectedId(list[0].id);
  }, [communitiesQuery.data, selectedId]);

  const summaryLoading = summaryQuery.isLoading;
  const summaryError = summaryQuery.isError;

  if (summaryError) {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 p-4 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Failed to load GraphRAG summary:{" "}
            {summaryQuery.error instanceof Error
              ? summaryQuery.error.message
              : String(summaryQuery.error)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const summary = summaryQuery.data;
  const isEmpty =
    !summaryLoading && summary !== undefined && summary.communities === 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 border-b border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            GraphRAG
          </CardTitle>
          <LevelPicker
            levels={levels}
            value={level}
            onChange={setLevel}
            disabled={summaryLoading || levels.length === 0}
          />
        </div>
        <SummaryStrip summary={summary} loading={summaryLoading} />
      </CardHeader>

      <CardContent className="p-0">
        {isEmpty ? (
          <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
            {EMPTY_COPY}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-0 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            <CommunityList
              communities={communitiesQuery.data ?? []}
              isLoading={
                communitiesQuery.isLoading ||
                (summaryLoading && !summary) ||
                level === null
              }
              isError={communitiesQuery.isError}
              error={communitiesQuery.error}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <CommunityDetail communityUuid={selectedId} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Header pieces ─────────────────────────────────────────────────────── */

function LevelPicker({
  levels,
  value,
  onChange,
  disabled,
}: {
  levels: number[];
  value: number | null;
  onChange: (next: number) => void;
  disabled: boolean;
}) {
  const id = React.useId();
  return (
    <label
      htmlFor={id}
      className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
    >
      Level
      <select
        id={id}
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (!Number.isNaN(next)) onChange(next);
        }}
        className={cn(
          "h-7 rounded-md border border-border bg-background px-2 text-xs font-mono",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {levels.length === 0 ? (
          <option value="">–</option>
        ) : (
          levels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))
        )}
      </select>
    </label>
  );
}

function SummaryStrip({
  summary,
  loading,
}: {
  summary:
    | {
        entities: number;
        relationships: number;
        communities: number;
        reports: number;
        text_units: number;
      }
    | undefined;
  loading: boolean;
}) {
  const cells: Array<{ key: string; label: string; value: number | null }> = [
    { key: "entities", label: "Entities", value: summary?.entities ?? null },
    {
      key: "relationships",
      label: "Relationships",
      value: summary?.relationships ?? null,
    },
    {
      key: "communities",
      label: "Communities",
      value: summary?.communities ?? null,
    },
    { key: "reports", label: "Reports", value: summary?.reports ?? null },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {cells.map((cell, idx) => (
        <React.Fragment key={cell.key}>
          {idx > 0 ? (
            <span aria-hidden className="text-muted-foreground/40">
              •
            </span>
          ) : null}
          <span className="inline-flex items-baseline gap-1">
            <span className="font-mono tabular-nums text-foreground">
              {loading || cell.value === null
                ? "—"
                : formatCount(cell.value)}
            </span>
            <span>{cell.label}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/* ── Left column: scrollable community list ───────────────────────────── */

function CommunityList({
  communities,
  isLoading,
  isError,
  error,
  selectedId,
  onSelect,
}: {
  communities: GraphragCommunity[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="border-b border-border md:border-b-0 md:border-r">
        <ListSkeleton />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex items-start gap-2 border-b border-border p-4 text-sm text-red-300 md:border-b-0 md:border-r">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Failed to load communities:{" "}
          {error instanceof Error ? error.message : String(error)}
        </div>
      </div>
    );
  }
  if (communities.length === 0) {
    return (
      <div className="flex items-center justify-center border-b border-border p-6 text-xs text-muted-foreground md:border-b-0 md:border-r">
        No communities at this level.
      </div>
    );
  }
  return (
    <ScrollArea className="h-[28rem] border-b border-border md:border-b-0 md:border-r">
      <ul className="divide-y divide-border">
        {communities.map((c) => {
          const selected = c.id === selectedId;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                aria-pressed={selected}
                className={cn(
                  "flex w-full flex-col items-start gap-1 px-3 py-2.5 text-left transition-colors",
                  "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  selected && "bg-primary/10 ring-1 ring-inset ring-primary/40",
                )}
              >
                <div className="flex w-full items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {c.title || `Community ${c.community_id}`}
                  </span>
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] normal-case tracking-normal"
                  >
                    {c.size}
                  </Badge>
                </div>
                {c.report_summary ? (
                  <p className="line-clamp-1 text-[11px] text-muted-foreground">
                    {c.report_summary}
                  </p>
                ) : (
                  <p className="text-[11px] italic text-muted-foreground/70">
                    No report summary
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}

function ListSkeleton() {
  return (
    <ul className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, idx) => (
        <li key={idx} className="flex flex-col gap-1.5 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted/50" />
            <div className="ml-auto h-3 w-8 animate-pulse rounded bg-muted/50" />
          </div>
          <div className="h-2.5 w-11/12 animate-pulse rounded bg-muted/40" />
        </li>
      ))}
    </ul>
  );
}

/* ── Right column: report detail ──────────────────────────────────────── */

function CommunityDetail({ communityUuid }: { communityUuid: string | null }) {
  const detailQuery = useGraphragCommunity(communityUuid);

  if (!communityUuid) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Select a community to read its report.
      </div>
    );
  }

  if (detailQuery.isLoading) {
    return <DetailSkeleton />;
  }

  if (detailQuery.isError) {
    return (
      <div className="flex items-start gap-2 p-4 text-sm text-red-300">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Failed to load community report:{" "}
          {detailQuery.error instanceof Error
            ? detailQuery.error.message
            : String(detailQuery.error)}
        </div>
      </div>
    );
  }

  const data = detailQuery.data;
  if (!data) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No data returned for this community.
      </div>
    );
  }

  const { community, report } = data;
  const hasReport =
    report &&
    (report.full_content ||
      report.summary ||
      (report.findings && report.findings.length > 0));

  return (
    <ScrollArea className="h-[28rem]">
      <div className="flex flex-col gap-4 p-4">
        <header className="flex flex-col gap-2 border-b border-border pb-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-base font-semibold tracking-tight">
              {community.title || `Community ${community.community_id}`}
            </h3>
            <Badge
              variant="outline"
              className="font-mono text-[10px] normal-case tracking-normal"
            >
              level {community.level}
            </Badge>
            <Badge
              variant="outline"
              className="font-mono text-[10px] normal-case tracking-normal"
            >
              size {community.size}
            </Badge>
            {typeof report?.rating === "number" ? (
              <Badge
                variant="secondary"
                className="font-mono text-[10px] normal-case tracking-normal"
              >
                rating {report.rating.toFixed(1)}
              </Badge>
            ) : null}
          </div>
          {report?.rating_explanation ? (
            <p className="text-xs text-muted-foreground">
              {report.rating_explanation}
            </p>
          ) : null}
        </header>

        {!hasReport ? (
          <p className="text-sm text-muted-foreground">
            No report has been generated for this community yet.
          </p>
        ) : (
          <>
            {report?.full_content ? (
              <Prose
                source={report.full_content}
                chunkId={community.id}
                className="text-sm"
              />
            ) : report?.summary ? (
              <Prose
                source={report.summary}
                chunkId={community.id}
                className="text-sm"
              />
            ) : null}

            {report?.findings && report.findings.length > 0 ? (
              <section className="flex flex-col gap-2 border-t border-border pt-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Findings
                </h4>
                <ul className="flex flex-col gap-3">
                  {report.findings.map((f, idx) => (
                    <li
                      key={`${community.id}-finding-${idx}`}
                      className="rounded-md border border-border bg-card/40 p-3"
                    >
                      <p className="text-sm font-medium">{f.summary}</p>
                      {f.explanation ? (
                        <Prose
                          source={f.explanation}
                          chunkId={`${community.id}-${idx}`}
                          className="mt-1 text-[13px]"
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </ScrollArea>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading report…</span>
      </div>
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted/40" />
      <div className="h-3 w-11/12 animate-pulse rounded bg-muted/30" />
      <div className="h-3 w-10/12 animate-pulse rounded bg-muted/30" />
      <div className="h-3 w-9/12 animate-pulse rounded bg-muted/30" />
      <div className="mt-3 h-3 w-1/3 animate-pulse rounded bg-muted/40" />
      <div className="h-12 w-full animate-pulse rounded bg-muted/30" />
      <div className="h-12 w-full animate-pulse rounded bg-muted/30" />
    </div>
  );
}

export default GraphRAGPanel;
