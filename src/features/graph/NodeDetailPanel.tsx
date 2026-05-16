import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Copy, ExternalLink, FileText, Loader2, X } from "lucide-react";
import { Link } from "react-router-dom";

import { getNode } from "@/api/graph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { colorForCategory } from "@/features/graph/useCytoscape";

// Per-era palette. M30 (Great Crusade) leans gold; M31 (Heresy) blood
// red; M40-M42 fade through ash and warp purple. Falls through to a
// neutral slate when an unknown era surfaces (M2, M21, etc.).
const ERA_PALETTE: Record<string, { border: string; bg: string; fg: string }> = {
  M29: { border: "rgba(120, 113, 108, 0.6)", bg: "rgba(120, 113, 108, 0.18)", fg: "#d6d3d1" },
  M30: { border: "rgba(245, 158, 11, 0.6)", bg: "rgba(245, 158, 11, 0.18)", fg: "#fcd34d" },
  M31: { border: "rgba(220, 38, 38, 0.6)", bg: "rgba(220, 38, 38, 0.18)", fg: "#fca5a5" },
  M32: { border: "rgba(217, 119, 6, 0.6)", bg: "rgba(217, 119, 6, 0.18)", fg: "#fbbf24" },
  M36: { border: "rgba(202, 138, 4, 0.6)", bg: "rgba(202, 138, 4, 0.18)", fg: "#facc15" },
  M37: { border: "rgba(180, 83, 9, 0.6)", bg: "rgba(180, 83, 9, 0.18)", fg: "#f59e0b" },
  M40: { border: "rgba(100, 116, 139, 0.6)", bg: "rgba(100, 116, 139, 0.18)", fg: "#cbd5e1" },
  M41: { border: "rgba(107, 114, 128, 0.6)", bg: "rgba(107, 114, 128, 0.18)", fg: "#e5e7eb" },
  M42: { border: "rgba(124, 58, 237, 0.6)", bg: "rgba(124, 58, 237, 0.18)", fg: "#c4b5fd" },
};

function eraColor(era: string): { border: string; bg: string; fg: string } {
  return (
    ERA_PALETTE[era] ?? {
      border: "rgba(148, 163, 184, 0.5)",
      bg: "rgba(148, 163, 184, 0.15)",
      fg: "#cbd5e1",
    }
  );
}

export type NodeDetailPanelProps = {
  nodeId: string | null;
  onClose: () => void;
  // Called when the user picks a child or neighbour from the lists. The
  // GraphView wires this through to ``handleEntitySelect`` so the viewport
  // animates and the panel re-renders for the new node.
  onSelectNeighbour: (nodeId: string) => void;
  // Optional corpus context — used to render the "Open in Library" link for
  // leaf-level entities (level 0), which we treat as source-backed.
  corpusId?: string;
};

type NeighbourRow = {
  id: string;
  label: string;
  weight: number;
  direction?: "out" | "in";
  predicate?: string | null;
};

function NeighbourSection({
  neighbours,
  onSelectNeighbour,
}: {
  neighbours: NeighbourRow[];
  onSelectNeighbour: (id: string) => void;
}) {
  // Group by direction so the user reads "X kills Y" (outgoing) and
  // "Z killed by W" (incoming) as distinct lists. Edges that came back
  // without a direction (older backend or category-level expansions)
  // fall under "Connected" so they still render somewhere.
  const outgoing = neighbours.filter((n) => n.direction === "out");
  const incoming = neighbours.filter((n) => n.direction === "in");
  const undirected = neighbours.filter((n) => !n.direction);

  const renderList = (rows: NeighbourRow[], heading: string, hint: string) => {
    if (rows.length === 0) return null;
    return (
      <section>
        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {heading}{" "}
          <span className="text-[10px] normal-case tracking-normal text-muted-foreground/70">
            ({hint})
          </span>
        </h3>
        <ul className="space-y-0.5">
          {rows.map((neighbour) => (
            <li key={`${neighbour.direction ?? "x"}:${neighbour.id}`}>
              <button
                type="button"
                onClick={() => onSelectNeighbour(neighbour.id)}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent"
                title={neighbour.predicate ?? undefined}
              >
                <span className="flex min-w-0 items-baseline gap-1.5">
                  {neighbour.predicate ? (
                    <span className="shrink-0 text-[10px] italic text-muted-foreground">
                      {neighbour.predicate}
                    </span>
                  ) : null}
                  <span className="truncate">{neighbour.label}</span>
                </span>
                <span className="ml-2 shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {neighbour.weight.toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <>
      {renderList(outgoing, "Outgoing", "this → other")}
      {renderList(incoming, "Incoming", "other → this")}
      {renderList(undirected, "Connected", "direction unknown")}
    </>
  );
}

export const NodeDetailPanel = React.forwardRef<
  HTMLElement,
  NodeDetailPanelProps
>(function NodeDetailPanel(props, ref) {
  const { nodeId, onClose, onSelectNeighbour, corpusId } = props;

  const detail = useQuery({
    queryKey: ["graphNode", corpusId ?? "_", nodeId],
    queryFn: () =>
      nodeId
        ? getNode(nodeId, corpusId ?? "_")
        : Promise.reject(new Error("no id")),
    enabled: !!nodeId,
    staleTime: 10_000,
  });

  const [copied, setCopied] = React.useState(false);

  // Reset the "copied" badge whenever the inspected node changes so the
  // checkmark never lingers across selections.
  React.useEffect(() => {
    setCopied(false);
  }, [nodeId]);

  const handleCopyId = React.useCallback(async () => {
    if (!nodeId) return;
    try {
      // ``navigator.clipboard`` is gated to secure contexts; fall back to a
      // textarea hack on older browsers / http origins.
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(nodeId);
      } else if (typeof document !== "undefined") {
        const ta = document.createElement("textarea");
        ta.value = nodeId;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      // Non-fatal — the id is still visible inline so the user can copy by hand.
      console.warn("copy id failed", err);
    }
  }, [nodeId]);

  if (!nodeId) {
    return (
      <aside
        ref={ref}
        className="hidden w-80 shrink-0 flex-col border-l border-border bg-card/40 p-4 md:flex"
      >
        <p className="text-sm text-muted-foreground">
          Click a node to inspect it.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Double-click a community to expand its children in place.
        </p>
      </aside>
    );
  }

  const childCount = detail.data?.children?.length ?? 0;
  const neighbourCount = detail.data?.neighbours?.length ?? 0;
  const sources = detail.data?.sources ?? [];
  const corpusHref =
    corpusId && corpusId !== "_" ? `/library/${encodeURIComponent(corpusId)}` : "/library";

  return (
    <aside
      ref={ref}
      className="absolute inset-x-3 bottom-3 z-20 flex max-h-[48%] flex-col gap-3 overflow-y-auto rounded-md border border-border bg-card/95 p-4 shadow-2xl shadow-black/25 backdrop-blur md:static md:inset-auto md:z-auto md:max-h-none md:w-80 md:shrink-0 md:rounded-none md:border-y-0 md:border-r-0 md:bg-card/40 md:shadow-none md:backdrop-blur-0"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold tracking-tight">
            {detail.data?.label ?? nodeId}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <p className="truncate text-[11px] text-muted-foreground">
              ID <code className="text-[10px]">{nodeId}</code>
            </p>
            <button
              type="button"
              onClick={handleCopyId}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={copied ? "Copied node id" : "Copy node id"}
              title={copied ? "Copied" : "Copy id"}
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          aria-label="Close detail panel"
          className="h-7 w-7"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      {detail.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading…
        </div>
      ) : detail.isError ? (
        <p className="text-xs text-red-300">
          Failed to load node:{" "}
          {detail.error instanceof Error
            ? detail.error.message
            : String(detail.error)}
        </p>
      ) : detail.data ? (
        <>
          {/* Category swatch + counters in one tidy row. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {detail.data.category ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2 py-0.5 text-[11px]"
                title={`Category: ${detail.data.category}`}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: colorForCategory(detail.data.category).fill,
                  }}
                />
                {detail.data.category}
              </span>
            ) : null}
            {typeof detail.data.mentions === "number" && detail.data.mentions > 0 ? (
              <Badge variant="outline" className="font-normal">
                <span className="tabular-nums">{detail.data.mentions}</span>
                <span className="ml-1 normal-case tracking-normal text-muted-foreground">
                  mention{detail.data.mentions === 1 ? "" : "s"}
                </span>
              </Badge>
            ) : null}
            {childCount > 0 ? (
              <Badge variant="outline" className="font-normal">
                <span className="tabular-nums">{childCount}</span>
                <span className="ml-1 normal-case tracking-normal text-muted-foreground">
                  child{childCount === 1 ? "" : "ren"}
                </span>
              </Badge>
            ) : null}
            {neighbourCount > 0 ? (
              <Badge variant="outline" className="font-normal">
                <span className="tabular-nums">{neighbourCount}</span>
                <span className="ml-1 normal-case tracking-normal text-muted-foreground">
                  neighbour{neighbourCount === 1 ? "" : "s"}
                </span>
              </Badge>
            ) : null}
            {detail.data.temporal?.era ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                style={{
                  borderColor: eraColor(detail.data.temporal.era).border,
                  backgroundColor: eraColor(detail.data.temporal.era).bg,
                  color: eraColor(detail.data.temporal.era).fg,
                }}
                title={
                  detail.data.temporal.era_source
                    ? `Era from ${detail.data.temporal.era_source}`
                    : "Era data"
                }
              >
                <span aria-hidden>⏳</span>
                {detail.data.temporal.label ?? detail.data.temporal.era}
              </span>
            ) : null}
          </div>

          {/* LLM-generated description, when we have one. */}
          {detail.data.description ? (
            <p className="rounded-md border border-border/60 bg-card/40 p-2 text-[12px] leading-relaxed text-foreground/90">
              {detail.data.description}
            </p>
          ) : null}

          {sources.length > 0 ? (
            <section>
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Source documents
                </h3>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {sources.length}
                </span>
              </div>
              <ul className="space-y-1">
                {sources.map((source) => {
                  const sourceHref = `${corpusHref}?doc=${encodeURIComponent(source.document_id)}`;
                  return (
                    <li
                      key={source.document_id}
                      className="rounded-md border border-border/60 bg-card/35 p-2"
                    >
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <Link
                            to={sourceHref}
                            className="block truncate text-xs font-medium hover:text-primary hover:underline"
                            title={source.title}
                          >
                            {source.title}
                          </Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span className="font-mono">
                              {source.document_id.slice(0, 8)}
                            </span>
                            <span>
                              {source.mentions} mention{source.mentions === 1 ? "" : "s"}
                            </span>
                            {source.chunk_ids && source.chunk_ids.length > 0 ? (
                              <span>
                                {source.chunk_ids.length} chunk
                                {source.chunk_ids.length === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {source.source_url ? (
                          <a
                            href={source.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                            aria-label={`Open source for ${source.title}`}
                            title="Open original source"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {detail.data.children && detail.data.children.length > 0 ? (
            <section>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Children
              </h3>
              <ul className="space-y-0.5">
                {detail.data.children.map((child) => (
                  <li key={child.id}>
                    <button
                      type="button"
                      onClick={() => onSelectNeighbour(child.id)}
                      className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-accent"
                    >
                      <span className="truncate">{child.label}</span>
                      <ChevronRight className="h-3 w-3 opacity-60" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {detail.data.neighbours && detail.data.neighbours.length > 0 ? (
            <NeighbourSection
              neighbours={detail.data.neighbours}
              onSelectNeighbour={onSelectNeighbour}
            />
          ) : null}

          {/* NeighbourSection is defined below; intentionally not inlined
              so the outgoing/incoming split is its own focused unit. */}

          {detail.data.stub ? (
            <p className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-200">
              Stale or unrecognised node id — try selecting from the search
              box.
            </p>
          ) : null}
        </>
      ) : null}
    </aside>
  );
});
