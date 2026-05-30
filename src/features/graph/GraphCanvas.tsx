/**
 * PIXI-based graph view — alternative renderer behind the
 * ``?renderer=pixi`` URL flag. Mirrors :file:`GraphView.tsx`'s shell
 * (sidebar, controls, detail panel) but swaps the cytoscape canvas
 * for the PIXI + d3-force pipeline in :file:`usePixiGraph.ts`.
 *
 * Same backend API (``getCommunities`` / ``expandCommunity`` /
 * ``getNode``), same expand-mode semantics, same NodeDetailPanel —
 * only the canvas implementation differs.
 */
import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Library as LibraryIcon, Loader2, Network } from "lucide-react";

import {
  expandCommunity,
  getCommunities,
  getNode,
  type GraphExpandMode,
  type GraphResponse,
} from "@/api/graph";
import { Button } from "@/components/ui/button";
import { Toaster, useToast } from "@/components/ui/toast";
import { ClusterControls } from "@/features/graph/ClusterControls";
import { NodeDetailPanel } from "@/features/graph/NodeDetailPanel";
import {
  createPixiGraph,
  type PixiGraphData,
  type PixiGraphHandle,
} from "@/features/graph/usePixiGraph";
import type { LayoutName } from "@/features/graph/useCytoscape";

function MissingCorpus() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 p-6">
      <h1 className="text-xl font-semibold tracking-tight">Graph</h1>
      <p className="text-sm text-muted-foreground">
        No corpus id in the URL. Open one from the{" "}
        <Link to="/library" className="text-primary hover:underline">
          Library
        </Link>
        .
      </p>
    </section>
  );
}

function toPixiData(resp: GraphResponse): PixiGraphData {
  return {
    nodes: resp.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      level: n.level,
      size: Math.max(8, n.size),
      category: n.category ?? null,
      count: n.count,
    })),
    edges: resp.edges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
      predicate: e.predicate ?? null,
    })),
  };
}

export default function GraphCanvas() {
  const params = useParams<{ corpusId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const initialCorpusId = params.corpusId && params.corpusId !== "_" ? params.corpusId : "_";

  const [corpusId, setCorpusId] = React.useState(initialCorpusId);
  const [level, setLevel] = React.useState(2);
  const [layout, setLayout] = React.useState<LayoutName>("fcose");
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [expandMode, setExpandMode] = React.useState<GraphExpandMode>("auto");

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const handleRef = React.useRef<PixiGraphHandle | null>(null);
  const detailPanelRef = React.useRef<HTMLElement | null>(null);
  const { toast } = useToast();

  const communities = useQuery({
    queryKey: ["graphCommunities", corpusId, level],
    queryFn: () => getCommunities(corpusId, level),
  });

  // Mount PIXI once per container.
  React.useEffect(() => {
    if (!containerRef.current) return;
    const handle = createPixiGraph(containerRef.current, {
      onNodeClick: (id) => setSelectedNodeId(id),
      onBackground: () => setSelectedNodeId(null),
      onNodeDoubleClick: async (id) => {
        try {
          const expanded = await queryClient.fetchQuery({
            queryKey: ["graphExpand", corpusId, id, expandMode],
            queryFn: () => expandCommunity(id, corpusId, 1_000, expandMode),
            staleTime: 30_000,
          });
          handle.setData(toPixiData(expanded));
        } catch (err) {
          console.error("pixi expand failed", err);
        }
      },
    });
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      handle.destroy();
    };
    // We intentionally don't depend on ``corpusId`` / ``expandMode`` here —
    // the handle is created once per mount; data updates flow through
    // ``handle.setData``.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push fresh data whenever the level-N community fetch settles.
  React.useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    const data = communities.data;
    if (!data) return;
    handle.setData(toPixiData(data));
  }, [communities.data]);

  // Reflect selection back into the renderer for hover/highlight.
  React.useEffect(() => {
    handleRef.current?.setSelection(selectedNodeId);
  }, [selectedNodeId]);

  const handleCorpusChange = React.useCallback(
    (next: string) => {
      setCorpusId(next);
      const qs = searchParams.toString();
      navigate(`/graph/${encodeURIComponent(next)}${qs ? `?${qs}` : ""}`, {
        replace: true,
      });
    },
    [navigate, searchParams],
  );

  const handleLayoutChange = React.useCallback((value: LayoutName) => {
    setLayout(value);
    // Layout-name change in the PIXI renderer just re-runs the d3-force
    // simulation against the existing data.
    const handle = handleRef.current;
    const data = communities.data;
    if (!handle || !data) return;
    handle.setData(toPixiData(data));
  }, [communities.data]);

  const handleResetView = React.useCallback(() => {
    handleRef.current?.fitToView();
  }, []);

  const handleCenterOnSelection = React.useCallback(() => {
    if (!selectedNodeId) return;
    handleRef.current?.centerOn(selectedNodeId);
  }, [selectedNodeId]);

  const handleEntitySelect = React.useCallback(
    async (node: { id: string }) => {
      setSelectedNodeId(node.id);
      const handle = handleRef.current;
      if (!handle) return;
      // Try to focus directly first; if the node isn't in the current
      // graph, fetch its parent community + expand.
      try {
        const detail = await queryClient.fetchQuery({
          queryKey: ["graphNode", corpusId, node.id],
          queryFn: () => getNode(node.id, corpusId),
          staleTime: 10_000,
        });
        if (detail.community_id) {
          const expanded = await queryClient.fetchQuery({
            queryKey: ["graphExpand", corpusId, detail.community_id, expandMode],
            queryFn: () =>
              expandCommunity(detail.community_id!, corpusId, 1_000, expandMode),
            staleTime: 30_000,
          });
          handle.setData(toPixiData(expanded));
          requestAnimationFrame(() => handle.centerOn(node.id));
        } else {
          handle.centerOn(node.id);
        }
      } catch (err) {
        toast({
          title: "Could not expand to node",
          description: err instanceof Error ? err.message : "Entity expand failed.",
          variant: "error",
        });
      }
    },
    [corpusId, queryClient, expandMode, toast],
  );

  // Keyboard: Esc deselects, Cmd/Ctrl+0 fits, ``f`` fits.
  React.useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && selectedNodeId !== null) {
        setSelectedNodeId(null);
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
  }, [handleResetView, selectedNodeId]);

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

          {communities.isLoading ? (
            <div className="absolute inset-0 grid place-items-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading graph…
              </div>
            </div>
          ) : null}

          {isEmpty ? (
            <div className="absolute inset-0 grid place-items-center">
              <div className="max-w-md rounded-md border border-border bg-card/70 p-4 text-center text-sm text-muted-foreground shadow-sm backdrop-blur">
                <Network className="mx-auto h-5 w-5 text-muted-foreground/70" />
                <p className="mt-2">
                  This corpus has no graph data yet — once documents finish KG
                  extraction the graph fills in.
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

        <NodeDetailPanel
          ref={detailPanelRef}
          nodeId={selectedNodeId}
          onClose={() => setSelectedNodeId(null)}
          onSelectNeighbour={(id) => {
            void handleEntitySelect({ id });
          }}
          corpusId={corpusId}
        />
      </div>

      <Toaster />
    </section>
  );
}

export { MissingCorpus };
