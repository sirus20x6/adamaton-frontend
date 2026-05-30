import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Library as LibraryIcon, Loader2, Network } from "lucide-react";
import type { Core, EventObject } from "cytoscape";

import {
  expandCommunity,
  getCommunities,
  getNode,
  type GraphExpandMode,
  type GraphResponse,
} from "@/api/graph";
import { Button } from "@/components/ui/button";
import { Toaster, useToast } from "@/components/ui/toast";
import { ErrorBoundary, ScopedErrorFallback } from "@/components/ErrorBoundary";
import { ClusterControls } from "@/features/graph/ClusterControls";
import { NodeDetailPanel } from "@/features/graph/NodeDetailPanel";
import {
  colorForCategory,
  makeElements,
  runLayout,
  runLayoutAnimated,
  useCytoscape,
  type LayoutName,
} from "@/features/graph/useCytoscape";

// Animate the viewport to a node and select it. Centralised so the search
// box, the detail-panel children/neighbour buttons, and the keyboard handlers
// all behave the same way.
function focusNode(cy: Core, nodeId: string, zoom = 1.4): boolean {
  const target = cy.getElementById(nodeId);
  if (!target || target.length === 0) return false;
  cy.elements().unselect();
  target.select();
  // Cytoscape's animate() options union is strict across versions; we feed
  // an open-shape bag and rely on cy.js to ignore unknown keys.
  const animateOpts = {
    center: { eles: target },
    zoom,
  };
  cy.animate(
    animateOpts as unknown as Parameters<typeof cy.animate>[0],
    { duration: 250 },
  );
  return true;
}

type LegendEntry = { category: string; count: number; fill: string };

function buildLegend(nodes: ReadonlyArray<{ category?: string | null; count?: number }>): LegendEntry[] {
  const totals = new Map<string, number>();
  for (const n of nodes) {
    if (!n.category) continue;
    totals.set(n.category, (totals.get(n.category) ?? 0) + (n.count ?? 1));
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([category, count]) => ({
      category,
      count,
      fill: colorForCategory(category).fill,
    }));
}

function CategoryLegend({
  nodes,
}: {
  nodes: ReadonlyArray<{ category?: string | null; count?: number }>;
}) {
  const entries = React.useMemo(() => buildLegend(nodes), [nodes]);
  if (entries.length === 0) return null;
  return (
    <div className="pointer-events-none absolute left-4 top-4 max-w-[15rem] rounded-md border border-white/10 bg-background/70 p-2.5 shadow-xl shadow-black/20 backdrop-blur-md">
      <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Categories
      </p>
      <ul className="space-y-1">
        {entries.map((e) => (
          <li
            key={e.category}
            className="flex items-center justify-between gap-3 rounded px-1 py-0.5 text-[11px]"
          >
            <span className="flex items-center gap-1.5 truncate">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full shadow-sm"
                style={{
                  backgroundColor: e.fill,
                  boxShadow: `0 0 14px ${e.fill}`,
                }}
              />
              <span className="truncate">{e.category}</span>
            </span>
            <span className="tabular-nums text-muted-foreground">
              {e.count.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GraphStats({ data }: { data?: GraphResponse }) {
  if (!data) return null;
  const nodes = data.nodes?.length ?? 0;
  const edges = data.edges?.length ?? 0;
  if (nodes === 0) return null;
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2 rounded-md border border-white/10 bg-background/70 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-lg shadow-black/15 backdrop-blur-md">
      <span className="font-mono tabular-nums text-foreground">{nodes}</span>
      <span>nodes</span>
      <span className="h-3 w-px bg-border" />
      <span className="font-mono tabular-nums text-foreground">{edges}</span>
      <span>links</span>
    </div>
  );
}

export function GraphView() {
  const params = useParams<{ corpusId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const initialCorpusId = params.corpusId && params.corpusId !== "_" ? params.corpusId : "_";

  const [corpusId, setCorpusId] = React.useState(initialCorpusId);
  const [level, setLevel] = React.useState(2);
  const [layout, setLayout] = React.useState<LayoutName>("fcose");
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [expandMode, setExpandMode] = React.useState<GraphExpandMode>("auto");

  const { containerRef, cyRef } = useCytoscape();
  const detailPanelRef = React.useRef<HTMLElement | null>(null);
  const { toast } = useToast();

  const communities = useQuery({
    queryKey: ["graphCommunities", corpusId, level],
    queryFn: () => getCommunities(corpusId, level),
  });

  // When the corpus or level changes, push fresh elements into cy and re-run
  // the layout. We replace, not merge, so stale nodes from the previous level
  // don't linger.
  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const data = communities.data;
    if (!data) return;
    cy.batch(() => {
      cy.elements().remove();
      // Cytoscape's element-definition typing is fussy across versions; the
      // open-shape ElementInput we generate is accepted at runtime.
      cy.add(makeElements(data.nodes, data.edges) as Parameters<typeof cy.add>[0]);
    });
    runLayout(cy, layout);
  }, [communities.data, layout, cyRef]);

  // Tap → select; double-tap on a community → expand in place.
  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Cytoscape EventObject.target is typed as a collection; reading data()
    // returns the loose data bag. Wrap in a small helper so the coercion is
    // confined and the rest of the handlers stay typed.
    const readNodeData = (event: EventObject): Record<string, unknown> | null => {
      const target = event.target as unknown as {
        data?: () => Record<string, unknown> | undefined;
      };
      const data = typeof target?.data === "function" ? target.data() : undefined;
      return data ?? null;
    };

    const onTap = (event: EventObject) => {
      const data = readNodeData(event);
      if (data && typeof data.id === "string") {
        setSelectedNodeId(data.id);
      }
    };

    const onDblTap = async (event: EventObject) => {
      const data = readNodeData(event);
      if (!data || typeof data.id !== "string") return;
      const id: string = data.id;
      // Only expand community-style nodes (level > 0).
      if (typeof data.level === "number" && data.level <= 0) return;
      try {
        const expanded: GraphResponse = await queryClient.fetchQuery({
          queryKey: ["graphExpand", corpusId, id, expandMode],
          queryFn: () => expandCommunity(id, corpusId, 1_000, expandMode),
          staleTime: 30_000,
        });
        cy.batch(() => {
          cy.elements().remove();
          cy.add(
            makeElements(expanded.nodes, expanded.edges) as Parameters<
              typeof cy.add
            >[0],
          );
        });
        runLayout(cy, layout);
      } catch (err) {
        // Failure is non-fatal — leave the previous graph as-is.
        console.error("expand failed", err);
      }
    };

    const onBgTap = (event: EventObject) => {
      if (event.target === cy) {
        setSelectedNodeId(null);
      }
    };

    // Hover highlight: when the cursor enters a node, fade everything that
    // isn't either the node itself or one of its direct edges/neighbours.
    // Cleared on mouseleave or background tap.
    const onMouseOver = (event: EventObject) => {
      const target = event.target as unknown as {
        addClass?: (cls: string) => void;
        connectedEdges?: () => { addClass: (cls: string) => void; targets: () => unknown; sources: () => unknown };
        neighborhood?: () => { addClass: (cls: string) => void };
      };
      if (typeof target.addClass !== "function") return;
      cy.elements().addClass("faded");
      target.addClass("hovered");
      // Pull in connected edges + neighbours so they remain visible.
      if (typeof target.connectedEdges === "function") {
        const edges = target.connectedEdges() as unknown as { removeClass: (cls: string) => void; addClass: (cls: string) => void };
        edges.removeClass("faded");
        edges.addClass("hovered");
      }
      if (typeof target.neighborhood === "function") {
        const neigh = target.neighborhood() as unknown as { removeClass: (cls: string) => void };
        neigh.removeClass("faded");
      }
      const self = target as unknown as { removeClass: (cls: string) => void };
      self.removeClass("faded");
    };
    const onMouseOut = () => {
      cy.elements().removeClass("hovered faded");
    };

    cy.on("tap", "node", onTap);
    cy.on("dbltap", "node", onDblTap);
    cy.on("tap", onBgTap);
    cy.on("mouseover", "node", onMouseOver);
    cy.on("mouseout", "node", onMouseOut);

    return () => {
      cy.off("tap", "node", onTap);
      cy.off("dbltap", "node", onDblTap);
      cy.off("tap", onBgTap);
      cy.off("mouseover", "node", onMouseOver);
      cy.off("mouseout", "node", onMouseOut);
    };
  }, [corpusId, cyRef, layout, queryClient, expandMode]);

  // Scroll the right-sidebar to the top whenever the selection changes — the
  // detail panel often has a long children list, and re-selecting via the
  // search box should always land on the header.
  React.useEffect(() => {
    if (!selectedNodeId) return;
    const el = detailPanelRef.current;
    if (el) el.scrollTop = 0;
  }, [selectedNodeId]);

  // Keep the URL in sync with the corpus selection so deep links work.
  const handleCorpusChange = React.useCallback(
    (next: string) => {
      setCorpusId(next);
      navigate(`/graph/${encodeURIComponent(next)}`, { replace: true });
    },
    [navigate],
  );

  // Smooth layout switch — wraps cy in our pan/zoom-disabling helper so the
  // animation isn't fighting user input.
  const handleLayoutChange = React.useCallback(
    (value: LayoutName) => {
      setLayout(value);
      const cy = cyRef.current;
      if (cy) runLayoutAnimated(cy, value);
    },
    [cyRef],
  );

  const handleResetView = React.useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const padding = cy.width() < 640 ? 36 : 80;
    cy.animate(
      { fit: { eles: cy.elements(), padding } } as unknown as Parameters<
        typeof cy.animate
      >[0],
      { duration: 250 },
    );
  }, [cyRef]);

  const handleCenterOnSelection = React.useCallback(() => {
    const cy = cyRef.current;
    if (!cy || !selectedNodeId) return;
    focusNode(cy, selectedNodeId, 1.0);
  }, [cyRef, selectedNodeId]);

  // When a search hit (or detail-panel button) targets a node not currently
  // in the rendered subgraph, fall back to fetching its parent community and
  // expanding it before animating. This keeps the "search anywhere" promise
  // working even at deeper community levels.
  const handleEntitySelect = React.useCallback(
    async (node: { id: string }) => {
      setSelectedNodeId(node.id);
      const cy = cyRef.current;
      if (!cy) return;
      if (focusNode(cy, node.id)) return;

      // Not on screen — try to discover its parent community via the node
      // detail endpoint, expand that community, then re-attempt the focus.
      try {
        const detail = await queryClient.fetchQuery({
          queryKey: ["graphNode", corpusId, node.id],
          queryFn: () => getNode(node.id, corpusId),
          staleTime: 10_000,
        });
        const parentId = detail.community_id;
        if (!parentId) return;
        const expanded: GraphResponse = await queryClient.fetchQuery({
          queryKey: ["graphExpand", corpusId, parentId, expandMode],
          queryFn: () => expandCommunity(parentId, corpusId, 1_000, expandMode),
          staleTime: 30_000,
        });
        cy.batch(() => {
          cy.elements().remove();
          cy.add(
            makeElements(expanded.nodes, expanded.edges) as Parameters<
              typeof cy.add
            >[0],
          );
        });
        runLayout(cy, layout);
        // Layout runs animated; queue the focus on the next paint so the
        // node has positions to animate to.
        requestAnimationFrame(() => {
          focusNode(cy, node.id);
        });
      } catch (err) {
        // Best-effort — selection still updates so the side panel reflects
        // the search hit even if the canvas can't reach it.
        toast({
          title: "Could not expand to node",
          description: err instanceof Error ? err.message : "Entity expand failed.",
          variant: "error",
        });
      }
    },
    [corpusId, cyRef, queryClient, layout, toast],
  );

  // Keyboard nav: Esc deselects, Cmd/Ctrl+0 resets zoom, ``f`` fits.
  React.useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Esc should always work, even from inputs — but only if a node is
        // currently selected, otherwise let the event bubble.
        if (selectedNodeId !== null) {
          setSelectedNodeId(null);
          const cy = cyRef.current;
          if (cy) cy.elements().unselect();
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "0") {
        event.preventDefault();
        handleResetView();
        return;
      }
      if (event.key === "f" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (isEditableTarget(event.target)) return;
        event.preventDefault();
        handleResetView();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cyRef, handleResetView, selectedNodeId]);

  const data = communities.data;
  const isEmpty =
    !communities.isLoading &&
    !communities.isError &&
    !!data &&
    (data.nodes?.length ?? 0) === 0;

  return (
    <section className="flex h-full min-h-0 flex-col">
      <ClusterControls
        corpusId={corpusId}
        onCorpusChange={handleCorpusChange}
        level={level}
        onLevelChange={setLevel}
        layout={layout}
        onLayoutChange={handleLayoutChange}
        onEntitySelect={handleEntitySelect}
        onResetView={handleResetView}
        onCenterOnSelection={handleCenterOnSelection}
        hasSelection={selectedNodeId !== null}
        expandMode={expandMode}
        onExpandModeChange={setExpandMode}
      />

      <div className="flex min-h-0 flex-1">
        <div className="relative flex-1 overflow-hidden bg-background">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.055)_1px,transparent_1px)] bg-[size:32px_32px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.08),transparent_28%,rgba(0,0,0,0.12))]"
          />
          <div ref={containerRef} className="absolute inset-0" />

          <div
            className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-200 shadow-sm"
            title="Cytoscape (canvas-2D) renderer — PIXI/WebGL is the default. Drop ?renderer=cytoscape to flip back."
          >
            cytoscape (legacy)
          </div>

          {/* Legend — useful in entity views, redundant on the top category view. */}
          {level < 2 && data && data.nodes && data.nodes.length > 0 ? (
            <CategoryLegend nodes={data.nodes} />
          ) : null}
          <GraphStats data={data} />

          {communities.isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading graph…
            </div>
          ) : communities.isError ? (
            <div className="absolute left-4 top-4 rounded-md border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-300">
              Graph fetch failed:{" "}
              {communities.error instanceof Error
                ? communities.error.message
                : String(communities.error)}
            </div>
          ) : null}

          {isEmpty ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div className="pointer-events-auto max-w-md rounded-lg border border-border bg-card/95 p-6 shadow-lg backdrop-blur">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background/60 text-muted-foreground">
                  <Network className="h-5 w-5" />
                </div>
                <h2 className="text-base font-semibold tracking-tight">
                  No knowledge graph yet for this corpus.
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Documents need to complete Stage 2 (graphed) before entities
                  and relationships appear here.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ingest documents in the corpus and wait for the live KG
                  worker to extract entities.
                </p>
                <div className="mt-4">
                  <Button asChild size="sm" variant="default">
                    <Link to="/library" className="inline-flex items-center gap-1.5">
                      <LibraryIcon className="h-3.5 w-3.5" />
                      Go to Library
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <ErrorBoundary
          resetKey={selectedNodeId}
          fallback={
            <ScopedErrorFallback label="The node detail panel hit an error." />
          }
        >
          <NodeDetailPanel
            ref={detailPanelRef}
            nodeId={selectedNodeId}
            onClose={() => setSelectedNodeId(null)}
            onSelectNeighbour={(id) => {
              void handleEntitySelect({ id });
            }}
            corpusId={corpusId}
          />
        </ErrorBoundary>
      </div>

      <Toaster />
    </section>
  );
}

export default GraphView;
