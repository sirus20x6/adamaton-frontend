import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { Core } from "cytoscape";
/// <reference path="./cytoscape-fcose.d.ts" />
import fcose from "cytoscape-fcose";

// Cytoscape ignores duplicate ``use()`` calls, but we still flip a module-level
// flag so HMR re-imports don't even attempt re-registration. ``__cyExt`` lives
// on ``globalThis`` for the same reason — Vite gives every HMR boundary a
// fresh module scope, but the global object survives.
type ExtRegistry = Record<string, boolean | undefined>;
const globalRoot = globalThis as typeof globalThis & {
  __cyExt?: ExtRegistry;
};
if (!globalRoot.__cyExt) globalRoot.__cyExt = {};

function registerExtension(key: string, ext: unknown): void {
  const reg = globalRoot.__cyExt as ExtRegistry;
  if (reg[key]) return;
  // ``cytoscape.use`` is typed against an internal extension shape that
  // shifts across versions; cast through ``unknown`` so we don't depend on
  // the exact name.
  (cytoscape.use as unknown as (e: unknown) => void)(ext);
  reg[key] = true;
}

registerExtension("fcose", fcose);

export type CytoscapeNodeData = {
  id: string;
  label: string;
  level: number;
  size: number;
  cluster?: number;
  community_id?: string;
  category?: string | null;
  count?: number;
};

export type CytoscapeEdgeData = {
  source: string;
  target: string;
  weight: number;
  predicate?: string | null;
};

// Pre-baked category palette. The 12 colours are perceptually distinct in
// both light and dark themes and survive the cytoscape canvas blending. We
// fall through to a hash-based HSL when the category isn't in the table so
// new categories that LLMs invent still get a stable colour.
const CATEGORY_PALETTE: Record<string, { fill: string; ring: string }> = {
  Person: { fill: "#fb923c", ring: "rgba(251, 146, 60, 0.62)" },
  Organization: { fill: "#c084fc", ring: "rgba(192, 132, 252, 0.62)" },
  Concept: { fill: "#38bdf8", ring: "rgba(56, 189, 248, 0.62)" },
  Technology: { fill: "#34d399", ring: "rgba(52, 211, 153, 0.62)" },
  "AI Model": { fill: "#f472b6", ring: "rgba(244, 114, 182, 0.62)" },
  Model: { fill: "#fb7185", ring: "rgba(251, 113, 133, 0.62)" },
  Process: { fill: "#facc15", ring: "rgba(250, 204, 21, 0.58)" },
  Platform: { fill: "#22d3ee", ring: "rgba(34, 211, 238, 0.6)" },
  System: { fill: "#a3e635", ring: "rgba(163, 230, 53, 0.58)" },
  Method: { fill: "#818cf8", ring: "rgba(129, 140, 248, 0.62)" },
  Dataset: { fill: "#2dd4bf", ring: "rgba(45, 212, 191, 0.58)" },
  Event: { fill: "#fda4af", ring: "rgba(253, 164, 175, 0.58)" },
  Algorithm: { fill: "#60a5fa", ring: "rgba(96, 165, 250, 0.62)" },
  Component: { fill: "#fbbf24", ring: "rgba(251, 191, 36, 0.58)" },
  Technique: { fill: "#a78bfa", ring: "rgba(167, 139, 250, 0.62)" },
};

function hashToHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return ((h % 360) + 360) % 360;
}

export function colorForCategory(
  category: string | null | undefined,
): { fill: string; ring: string } {
  if (!category) {
    // Neutral slate for un-categorized nodes.
    return { fill: "#64748b", ring: "rgba(100, 116, 139, 0.45)" };
  }
  const hit = CATEGORY_PALETTE[category];
  if (hit) return hit;
  // Stable HSL from hash — keeps the palette consistent across reloads.
  const hue = hashToHue(category);
  return {
    fill: `hsl(${hue}, 76%, 66%)`,
    ring: `hsla(${hue}, 76%, 66%, 0.58)`,
  };
}

// Layouts we expose in the UI. ``cose-bilkent`` and ``dagre`` are listed as
// future-friendly options; if the matching cytoscape extensions aren't
// registered we fall back to the built-in ``cose`` at run-time.
export type LayoutName =
  | "fcose"
  | "cose"
  | "cose-bilkent"
  | "dagre"
  | "circle"
  | "grid"
  | "concentric"
  | "breadthfirst";

// Cast through ``unknown`` so we don't have to track the cytoscape stylesheet
// type names across major versions — the CSS property bag is very loosely
// typed and shifts shape between releases.
type StyleEntry = {
  selector: string;
  style: Record<string, string | number>;
};

// Colour and shape rules. Per-node colour is injected onto the data
// payload (``fill`` / ``ring``) by ``makeElements`` below — pure-CSS-style
// per-category selectors don't compose well across the runtime palette so
// we just read straight off the data bag.
const STYLE: StyleEntry[] = [
  {
    selector: "node",
    style: {
      "background-color": "data(fill)",
      label: "data(label)",
      color: "#1f2937",
      "text-outline-color": "rgba(255, 255, 255, 0.82)",
      "text-outline-width": 1.2,
      "font-family": "Inter, ui-sans-serif, system-ui, sans-serif",
      "font-size": 10,
      "min-zoomed-font-size": 8,
      width: "data(size)",
      height: "data(size)",
      "text-valign": "bottom",
      "text-halign": "center",
      "text-wrap": "ellipsis",
      "text-max-width": "112px",
      "text-margin-y": 7,
      "border-width": 1.5,
      "border-color": "data(ring)",
      "border-opacity": 0.76,
      "shadow-blur": 12,
      "shadow-color": "data(fill)",
      "shadow-opacity": 0.18,
      "shadow-offset-x": 0,
      "shadow-offset-y": 0,
      "overlay-opacity": 0,
      "transition-property": "background-color, border-color, border-width, opacity, shadow-opacity",
      "transition-duration": 160,
    },
  },
  {
    selector: "node[level = 2]",
    style: {
      color: "#0f172a",
      "font-size": 12,
      "font-weight": 650,
      "text-outline-color": "rgba(255, 255, 255, 0.7)",
      "text-outline-width": 1.3,
      "text-valign": "center",
      "text-margin-y": 0,
      "text-max-width": "112px",
      "border-width": 2,
      "border-opacity": 1,
      "shadow-blur": 18,
      "shadow-opacity": 0.26,
      width: "mapData(size, 0, 60, 36, 82)",
      height: "mapData(size, 0, 60, 36, 82)",
    },
  },
  {
    selector: "node[level = 1]",
    style: {
      "font-weight": 500,
      "border-opacity": 0.7,
      width: "mapData(size, 0, 42, 18, 46)",
      height: "mapData(size, 0, 42, 18, 46)",
    },
  },
  {
    selector: "node[level = 0]",
    style: {
      "font-size": 9,
      "min-zoomed-font-size": 9,
      width: "mapData(size, 0, 24, 12, 28)",
      height: "mapData(size, 0, 24, 12, 28)",
    },
  },
  // Hover ring — fired by GraphView via ``cy.style().selector(...)``? No —
  // we use a class toggle: ``.hovered`` and ``.faded`` set by the React
  // layer when mouse enters/leaves a node.
  {
    selector: "node.hovered",
    style: {
      "border-width": 5,
      "border-color": "#f8fafc",
      "border-opacity": 1,
      "shadow-opacity": 0.44,
      "shadow-blur": 24,
      "z-index": 10,
    },
  },
  {
    selector: "node.faded",
    style: {
      opacity: 0.1,
    },
  },
  {
    selector: "edge.faded",
    style: {
      opacity: 0.05,
    },
  },
  {
    selector: "edge.hovered",
    style: {
      "line-color": "#fbbf24",
      width: "mapData(visualWeight, 0, 10, 1.8, 5.6)",
      opacity: 0.95,
      "z-index": 9,
    },
  },
  {
    selector: "node:selected",
    style: {
      "border-width": 5,
      "border-color": "#f8fafc",
      "border-opacity": 1,
      "shadow-opacity": 0.5,
      "shadow-blur": 26,
    },
  },
  {
    selector: "edge",
    style: {
      width: "mapData(visualWeight, 0, 10, 0.5, 3.0)",
      "line-color": "rgba(100, 116, 139, 0.32)",
      // bezier plus matching target-arrow makes Subject→Object readable
      // even when the reverse fact (Object→Subject) is also in the
      // graph — bezier auto-fans the two parallel edges.
      "curve-style": "bezier",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "rgba(100, 116, 139, 0.6)",
      "target-arrow-fill": "filled",
      "arrow-scale": 0.85,
      opacity: 0.7,
      // Predicate label — drives "how" the two endpoints relate. Using
      // ``data(predicateLabel)`` so we get the lower-cased / spaced
      // display form prepared in ``makeElements``. The label stays
      // dim by default so it doesn't drown the graph; hover and
      // high-weight rules below pop it forward.
      label: "data(predicateLabel)",
      "font-size": 9,
      "font-family": "ui-sans-serif, system-ui, sans-serif",
      "text-rotation": "autorotate",
      "text-margin-y": -6,
      color: "rgba(148, 163, 184, 0.85)",
      "text-background-color": "rgba(15, 23, 42, 0.55)",
      "text-background-opacity": 0.65,
      "text-background-padding": "2",
      "text-background-shape": "roundrectangle",
      "text-events": "no",
      "transition-property": "line-color, width, opacity",
      "transition-duration": 160,
    },
  },
  {
    selector: "edge[visualWeight > 7]",
    style: {
      "line-color": "rgba(14, 165, 233, 0.45)",
      "target-arrow-color": "rgba(14, 165, 233, 0.8)",
      opacity: 0.85,
      "font-size": 10,
      color: "rgba(186, 230, 253, 0.95)",
    },
  },
  // Hovered edges keep their direction colour but pop forward; the
  // amber arrowhead echoes the node-hover ring.
  {
    selector: "edge.hovered",
    style: {
      "target-arrow-color": "#fbbf24",
      "font-size": 11,
      color: "#fbbf24",
      "text-background-color": "rgba(15, 23, 42, 0.85)",
      "text-background-opacity": 0.9,
    },
  },
];

type ElementInput = {
  group: "nodes" | "edges";
  data: Record<string, string | number | undefined>;
};

export function makeElements(
  nodes: CytoscapeNodeData[],
  edges: CytoscapeEdgeData[],
): ElementInput[] {
  const seen = new Set<string>();
  const out: ElementInput[] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    const palette = colorForCategory(n.category);
    out.push({
      group: "nodes",
      data: {
        ...n,
        category: n.category ?? undefined,
        fill: palette.fill,
        ring: palette.ring,
      },
    });
  }
  // Same (subject, object) pair with different predicates needs distinct
  // edge ids — that's how cytoscape decides whether to fan parallel edges
  // out into separate curves.
  const edgeIdSeen = new Set<string>();
  for (const e of edges) {
    if (!seen.has(e.source) || !seen.has(e.target)) continue;
    const visualWeight = e.weight <= 1 ? e.weight * 10 : e.weight;
    const predicate = (e.predicate ?? "").toString().trim();
    const baseId = `${e.source}__${e.target}__${predicate || "rel"}`;
    let id = baseId;
    let suffix = 1;
    while (edgeIdSeen.has(id)) {
      id = `${baseId}#${suffix++}`;
    }
    edgeIdSeen.add(id);
    out.push({
      group: "edges",
      data: {
        id,
        source: e.source,
        target: e.target,
        weight: e.weight,
        visualWeight,
        predicate: predicate || undefined,
        // Display form shown on the edge label — lower-cased, underscores
        // replaced with spaces. ``MEMBER_OF`` -> ``member of``.
        predicateLabel: predicate ? predicate.replace(/_/g, " ").toLowerCase() : "",
      },
    });
  }
  return out;
}

// Returns the safe layout name to hand to cytoscape — if the requested layout
// requires an unregistered extension, fall back to ``cose`` (built-in).
function resolveLayoutName(name: LayoutName): LayoutName {
  if (name === "cose-bilkent" || name === "dagre") {
    // These ship as separate packages and aren't bundled with cytoscape; fall
    // back to the built-in ``cose`` if the extension isn't registered.
    const reg = globalRoot.__cyExt as Record<string, boolean | undefined>;
    if (!reg[name]) return "cose";
  }
  return name;
}

export type RunLayoutOptions = {
  animate?: boolean;
  animationDuration?: number;
  fit?: boolean;
  padding?: number;
  onStop?: () => void;
};

function _anyNodeHasPosition(cy: Core): boolean {
  // Iterate the raw nodes collection so we can call .position() on
  // each typed Singular instead of the broader CollectionArgument.
  let any = false;
  cy.nodes().forEach((n) => {
    const pos = (n as unknown as { position: () => { x: number; y: number } }).position();
    if (pos.x !== 0 || pos.y !== 0) any = true;
  });
  return any;
}


export function runLayout(
  cy: Core,
  name: LayoutName = "fcose",
  options: RunLayoutOptions = {},
): void {
  const resolved = resolveLayoutName(name);
  const elementCount = cy.elements().length;
  // Layout animation is the dominant cost on dense graphs — at 60fps
  // a 600ms animation re-renders the whole graph 36 times while every
  // node interpolates to its final position. Snap directly to the
  // final layout when there's enough on screen to make animation
  // expensive; small graphs still animate for the nicer feel.
  const animate = options.animate ?? elementCount < 200;
  const animationDuration = options.animationDuration ?? 400;
  const fit = options.fit ?? true;
  const padding = options.padding ?? (cy.width() < 640 ? 36 : 80);

  const opts: Record<string, unknown> = {
    name: resolved,
    animate,
    animationDuration,
    fit,
    padding,
  };
  if (resolved === "fcose") {
    Object.assign(opts, {
      // 'default' runs the force-directed pass which is what actually
      // honours nodeRepulsion / idealEdgeLength / nodeSeparation. The
      // 'draft' mode skips that and just does spectral decomposition
      // — much faster but the spacing knobs become no-ops, so nodes
      // collapse into a tight cluster.
      quality: "default",
      // Don't randomise initial positions when re-laying out on top
      // of existing nodes (e.g. expand-mode flip). Carrying the prior
      // positions over means fcose only has to iterate a small delta
      // instead of solving from scratch.
      randomize: !_anyNodeHasPosition(cy),
      // Edge labels need physical space — dense character graphs with
      // hundreds of nodes and multiple edges per pair collapse into
      // an unreadable hairball at the original tighter spacing.
      nodeRepulsion: 16_000,
      idealEdgeLength: 240,
      edgeElasticity: 0.18,
      nestingFactor: 0.78,
      gravity: 0.06,
      gravityRange: 3.6,
      // Cut from the original 3500 — 'default' quality + warm-start
      // positions converge well before 2000 iters on graphs <500
      // nodes. Bigger graphs auto-trigger more refinement internally.
      numIter: 2_000,
      tile: true,
      nodeSeparation: 60,
      packComponents: true,
    });
  }
  if (resolved === "concentric") {
    Object.assign(opts, {
      concentric: (node: { data: (key: string) => unknown }) =>
        (node.data("level") as number | undefined) ?? 0,
      levelWidth: () => 1,
    });
  }
  // The cytoscape ``LayoutOptions`` union type is very strict; we feed an
  // open-shape options bag and rely on cy.js to ignore unknown keys.
  const layout = cy.layout(opts as unknown as Parameters<Core["layout"]>[0]);
  if (options.onStop) {
    // Cytoscape's layout-event typing leaks LayoutEventObject across versions;
    // a thin wrapper avoids depending on the exact shape.
    type LayoutWithEvents = ReturnType<Core["layout"]> & {
      one: (event: string, handler: () => void) => void;
    };
    const withEvents = layout as unknown as LayoutWithEvents;
    if (typeof withEvents.one === "function") {
      withEvents.one("layoutstop", options.onStop);
    }
  }
  layout.run();
}

// Smooth wrapper used by GraphView when the user changes layout via the
// dropdown. Disables panning/zooming during the animation and re-enables on
// ``layoutstop``. Falls back to the default ``runLayout`` behaviour if cy is
// missing.
export function runLayoutAnimated(cy: Core, name: LayoutName): void {
  if (cy.elements().length === 0) {
    // Nothing to lay out — skip the pan/zoom dance entirely so we never get
    // stuck with input disabled.
    runLayout(cy, name, { animate: false });
    return;
  }
  cy.userPanningEnabled(false);
  cy.userZoomingEnabled(false);
  // Safety: if ``layoutstop`` somehow doesn't fire (e.g. layout cancelled),
  // re-enable input shortly after the animation should have finished.
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    cy.userPanningEnabled(true);
    cy.userZoomingEnabled(true);
  };
  runLayout(cy, name, {
    animate: true,
    animationDuration: 500,
    fit: true,
    padding: cy.width() < 640 ? 36 : 80,
    onStop: restore,
  });
  // Hard fallback — slightly longer than the animation so it only fires when
  // ``layoutstop`` truly didn't.
  setTimeout(restore, 1500);
}

// Tiny debounce used by the optional viewport handler. Kept inline so we
// don't pull in lodash for one helper.
function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): ((...args: Args) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: Args) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
  wrapped.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return wrapped;
}

export type UseCytoscapeOptions = {
  // Optional handler invoked (debounced) when the viewport changes — pan or
  // zoom. Use this for "fetch more nodes near the viewport" behaviour.
  onViewportChange?: (cy: Core) => void;
  viewportDebounceMs?: number;
};

export function useCytoscape(options: UseCytoscapeOptions = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  // Stash the latest handler in a ref so the effect doesn't re-bind on every
  // render and we still always call the freshest closure.
  const onViewportRef = useRef(options.onViewportChange);
  onViewportRef.current = options.onViewportChange;
  const debounceMs = options.viewportDebounceMs ?? 300;

  useEffect(() => {
    if (!containerRef.current) return;
    // Cytoscape's stylesheet typing is overly restrictive across versions; we
    // ship an open-shape array and let cy.js validate it at runtime.
    const cyOptions = {
      container: containerRef.current,
      elements: [],
      style: STYLE,
      wheelSensitivity: 0.2,
      minZoom: 0.1,
      maxZoom: 4,
      layout: { name: "preset" as const },
      // Performance flags. None of these hide content at rest — they
      // only optimise the cost of pan / zoom and frame-loop overhead.
      //
      // ``textureOnViewport``: caches the canvas as a single GPU
      // texture mid-gesture instead of re-rendering every node + edge
      // per frame. When the gesture ends, the full graph (labels and
      // all) renders normally. Biggest single win on dense graphs.
      textureOnViewport: true,
      // ``motionBlur`` is off — it's expensive on big graphs and the
      // visual "smear" only matters for animated transitions, which we
      // also disable below.
      motionBlur: false,
      // Cap label rendering at the smallest legible font size. Below
      // 6 px the text is unreadable anyway and still costs glyph-
      // raster cycles per frame. Labels above this size always render.
      minZoomedFontSize: 6,
      // 1:1 device pixel ratio. On hi-DPI screens this halves the
      // canvas fill cost; for vector + text rendering the visual
      // difference is invisible at typical zoom levels.
      pixelRatio: 1.0,
      // We don't use box-selection (drag-rect to multi-select), so
      // turning it off skips a per-pointer-move check.
      boxSelectionEnabled: false,
    };
    const cy = cytoscape(cyOptions as never);
    cyRef.current = cy;

    // Debounced viewport handler — wired up only if a callback was supplied.
    // We always create the wrapper so the cleanup path is symmetric, but the
    // listener is conditional.
    const debounced = debounce(() => {
      const handler = onViewportRef.current;
      if (handler) handler(cy);
    }, debounceMs);
    const onViewport = () => {
      if (onViewportRef.current) debounced();
    };
    cy.on("viewport", onViewport);

    return () => {
      cy.off("viewport", onViewport);
      debounced.cancel();
      cy.destroy();
      cyRef.current = null;
    };
  }, [debounceMs]);

  return { containerRef, cyRef };
}
