/**
 * PIXI v7 + d3-force graph renderer.
 *
 * Drop-in alternative to the cytoscape-based renderer in
 * :file:`useCytoscape.ts`. The core trick (lifted from
 * dianaow.com/posts/pixijs-d3-graph) is to render every node as a
 * cheap tinted Sprite of a single circle Texture rather than an
 * individual Graphics object — that's the difference between handling
 * 200 nodes and 2 000 nodes at 60fps.
 *
 * Edges are sprite-line + triangle-arrow + BitmapText label, all
 * rotated to match the edge angle. BitmapText is hardware-accelerated
 * so 500+ labels cost roughly the same as 5 — the gap the dianaow.com
 * articles never explicitly cover.
 *
 * Layout: d3-force run synchronously to convergence
 * (`Math.ceil(Math.log(alphaMin) / Math.log(1 - alphaDecay))` ticks)
 * then static. No per-frame physics, no jitter.
 */

import * as PIXI from "pixi.js";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

// NOTE: pixi-viewport intentionally not used — the @5.1 version on
// npm peers against the @pixi/* PIXI 6 modules even though it claims
// to support pixi.js@7. With pixi.js@7.4.3 installed alongside, the
// drag/pinch/wheel handlers never fire because they call PIXI 6
// InteractionManager APIs that aren't present at runtime.
//
// We roll our own pan/zoom on a single ``world`` Container — ~40
// LOC, no version hazards.

import { colorForCategory } from "@/features/graph/useCytoscape";

export type PixiNodeInput = {
  id: string;
  label: string;
  level: number;
  size: number;
  category?: string | null;
  count?: number;
};

export type PixiEdgeInput = {
  source: string;
  target: string;
  weight: number;
  predicate?: string | null;
};

export type PixiGraphData = {
  nodes: PixiNodeInput[];
  edges: PixiEdgeInput[];
};


// ────────────────────────────────────────────────────────────────────────
// Internal sim node/edge types
// ────────────────────────────────────────────────────────────────────────


interface SimNode extends SimulationNodeDatum {
  id: string;
  label: string;
  level: number;
  size: number;
  category?: string | null;
  count?: number;
  // Filled in once the node sprite is created.
  sprite?: PIXI.Sprite;
  ring?: PIXI.Sprite;
  labelText?: PIXI.Text;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  predicate?: string | null;
  weight: number;
  // True when a counterpart edge (target→source) also exists for the
  // same node pair. We offset such edges' lines and labels perpendicular
  // to the edge direction so the two predicate labels don't render
  // on top of each other at the shared midpoint.
  bidirectional?: boolean;
  // Stable ±1 used to pick which side of the line gets the offset.
  // Derived from (source.id < target.id) so A→B and B→A always land
  // on opposite sides.
  bidirSign?: number;
  // Filled in once the edge container is created.
  container?: PIXI.Container;
  line?: PIXI.Sprite;
  arrow?: PIXI.Sprite;
  labelText?: PIXI.BitmapText;
}


// ────────────────────────────────────────────────────────────────────────
// Texture cache — built once per renderer, reused across all sprites.
// ────────────────────────────────────────────────────────────────────────


type TextureCache = {
  circle: PIXI.Texture;
  ring: PIXI.Texture;
  pixel: PIXI.Texture;  // 1×1 white sprite scaled to make edge lines
  arrow: PIXI.Texture;
};

function buildTextures(renderer: PIXI.IRenderer): TextureCache {
  // ``multisample: HIGH`` is a WebGL2-only feature; on WebGL1 it
  // silently fails and the resulting textures come back transparent
  // (which manifests as "labels render but sprites don't"). Pinned
  // to ``NONE`` with an explicit ``region`` so the bounding box is
  // captured deterministically.
  const noMSAA = (size: number) => ({
    region: new PIXI.Rectangle(0, 0, size, size),
    resolution: 2,
    multisample: PIXI.MSAA_QUALITY.NONE,
  });

  // Circle node — radius 24 on a 48×48 canvas; we tint at sprite
  // level so this single texture serves every category.
  const circle = new PIXI.Graphics();
  circle.beginFill(0xffffff, 1);
  circle.drawCircle(24, 24, 24);
  circle.endFill();
  const circleTex = renderer.generateTexture(circle, noMSAA(48));

  // Ring (drawn behind the node sprite for category outline).
  const ring = new PIXI.Graphics();
  ring.lineStyle(2.5, 0xffffff, 1);
  ring.drawCircle(28, 28, 26);
  const ringTex = renderer.generateTexture(ring, noMSAA(56));

  // 1×1 white pixel for line segments.
  const px = new PIXI.Graphics();
  px.beginFill(0xffffff, 1);
  px.drawRect(0, 0, 1, 1);
  px.endFill();
  const pixelTex = renderer.generateTexture(px, {
    region: new PIXI.Rectangle(0, 0, 1, 1),
    resolution: 1,
    multisample: PIXI.MSAA_QUALITY.NONE,
  });

  // Triangle arrowhead, pointing right (positive x).
  const arrow = new PIXI.Graphics();
  arrow.beginFill(0xffffff, 1);
  arrow.moveTo(0, 0);
  arrow.lineTo(10, 5);
  arrow.lineTo(0, 10);
  arrow.lineTo(0, 0);
  arrow.endFill();
  const arrowTex = renderer.generateTexture(arrow, {
    region: new PIXI.Rectangle(0, 0, 10, 10),
    resolution: 2,
    multisample: PIXI.MSAA_QUALITY.NONE,
  });

  return {
    circle: circleTex,
    ring: ringTex,
    pixel: pixelTex,
    arrow: arrowTex,
  };
}


// ────────────────────────────────────────────────────────────────────────
// Bitmap font — installed once on the global FontFace registry, then
// any BitmapText("...", { fontName: "EdgeLabel" }) renders via a single
// texture atlas. Hardware-accelerated, scales-to-thousands cheap.
// ────────────────────────────────────────────────────────────────────────


const EDGE_LABEL_FONT_NAME = "EdgeLabel";

let bitmapFontInstalled = false;
function ensureEdgeLabelFont(): void {
  if (bitmapFontInstalled) return;
  if (PIXI.BitmapFont.available[EDGE_LABEL_FONT_NAME]) {
    bitmapFontInstalled = true;
    return;
  }
  // Bake the font as white so per-instance ``tint`` can recolor each
  // BitmapText freely (multiplying over white = identity). With a
  // tinted base the tint goes through twice and washes out.
  PIXI.BitmapFont.from(
    EDGE_LABEL_FONT_NAME,
    {
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: 22,  // rendered at 2× — we'll scale down per text instance
      fill: 0xffffff,
      stroke: 0x0f172a,
      strokeThickness: 4,
      fontWeight: "600",
    },
    {
      // ASCII range plus a few common symbols; covers every predicate
      // the LLM emits.
      chars: [
        ["a", "z"],
        ["A", "Z"],
        ["0", "9"],
        " _-→←↑↓.,():;",
      ],
      resolution: 2,
    },
  );
  bitmapFontInstalled = true;
}


// ────────────────────────────────────────────────────────────────────────
// Palette glue — reuse the cytoscape category palette so colors match
// across the two renderers.
// ────────────────────────────────────────────────────────────────────────


function hexFromCss(css: string): number {
  // colorForCategory returns CSS strings (#rrggbb or hsl(...)). PIXI tints
  // need 24-bit hex ints. Parse #rrggbb directly; fall back to a temporary
  // canvas resolver for hsl() / rgba().
  const trimmed = css.trim();
  if (trimmed.startsWith("#") && (trimmed.length === 7 || trimmed.length === 4)) {
    const hex = trimmed.length === 4
      ? "#" + trimmed.slice(1).split("").map((c) => c + c).join("")
      : trimmed;
    return parseInt(hex.slice(1), 16);
  }
  // hsl()/rgba() path — let the browser resolve it.
  if (typeof document !== "undefined") {
    const probe = document.createElement("canvas").getContext("2d");
    if (probe) {
      probe.fillStyle = trimmed;
      const resolved = probe.fillStyle as string;
      if (resolved.startsWith("#")) {
        return parseInt(resolved.slice(1), 16);
      }
    }
  }
  return 0x64748b; // slate fallback
}


// ────────────────────────────────────────────────────────────────────────
// Public renderer
// ────────────────────────────────────────────────────────────────────────


export type PixiGraphHandlers = {
  onNodeClick?: (id: string) => void;
  onNodeDoubleClick?: (id: string) => void;
  onBackground?: () => void;
  onNodeHoverStart?: (id: string) => void;
  onNodeHoverEnd?: () => void;
};

export type PixiGraphHandle = {
  setData: (data: PixiGraphData) => void;
  setSelection: (id: string | null) => void;
  fitToView: () => void;
  centerOn: (id: string) => void;
  destroy: () => void;
};

export function createPixiGraph(
  container: HTMLElement,
  handlers: PixiGraphHandlers = {},
): PixiGraphHandle {
  ensureEdgeLabelFont();

  const initialWidth = Math.max(1, container.clientWidth);
  const initialHeight = Math.max(1, container.clientHeight);

  const app = new PIXI.Application({
    width: initialWidth,
    height: initialHeight,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 1.5),
  });
  const canvas = app.view as unknown as HTMLCanvasElement;
  // Force the canvas to absolutely fill the container — without these
  // styles, autoDensity sets explicit pixel sizes that don't react to
  // CSS layout, leaving a 0×0 render target until the first window
  // resize. With them, pointer hit-testing always lines up with what
  // the user sees.
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  // touch-action: none is required for pixi-viewport's pinch-zoom +
  // drag-pan gestures on touchpads / touchscreens — without it the
  // browser eats the gesture for native scroll/zoom.
  canvas.style.touchAction = "none";
  container.appendChild(canvas);

  // Stage is ``static`` with a hit area covering the screen — that's
  // what lets pointermove / pointerdown reach the stage at all.
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  // ``world`` is the pan/zoom-able container — pretty much what
  // pixi-viewport would have given us, minus the version hazards.
  // Layered children render in this container's local coordinate
  // space; pan = translate world.position, zoom = scale around
  // pointer.
  const world = new PIXI.Container();
  world.eventMode = "static";
  world.hitArea = new PIXI.Rectangle(-50_000, -50_000, 100_000, 100_000);
  app.stage.addChild(world);

  // ── Hand-rolled pan ──────────────────────────────────────────────
  let panActive = false;
  let panAnchorX = 0;
  let panAnchorY = 0;
  let panWorldX = 0;
  let panWorldY = 0;
  // ``movedDistance`` stays in pointer-event space (CSS pixels) so we
  // can distinguish a click from a drag without needing world coords.
  let panMoved = 0;

  app.stage.on("pointerdown", (event: PIXI.FederatedPointerEvent) => {
    // Only pan on background-stage drags. If the press lands on a
    // node sprite, the sprite's own handler runs first and we never
    // hit this branch (PIXI events bubble; the stage is the last hop).
    if (event.target !== app.stage && event.target !== world) return;
    panActive = true;
    panMoved = 0;
    panAnchorX = event.global.x;
    panAnchorY = event.global.y;
    panWorldX = world.position.x;
    panWorldY = world.position.y;
    canvas.style.cursor = "grabbing";
  });
  app.stage.on("globalpointermove", (event: PIXI.FederatedPointerEvent) => {
    if (!panActive) return;
    const dx = event.global.x - panAnchorX;
    const dy = event.global.y - panAnchorY;
    panMoved += Math.abs(dx) + Math.abs(dy);
    world.position.set(panWorldX + dx, panWorldY + dy);
  });
  const endPan = () => {
    if (!panActive) return;
    panActive = false;
    canvas.style.cursor = "default";
    // Suppress the impending click if the pointer moved more than a
    // few pixels — that was a pan, not a tap.
    if (panMoved > 6) suppressNextBackgroundTap = true;
  };
  app.stage.on("pointerup", endPan);
  app.stage.on("pointerupoutside", endPan);

  // ── Hand-rolled wheel-zoom around the cursor ─────────────────────
  let suppressNextBackgroundTap = false;
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    // Convert pointer to world space pre-zoom.
    const worldX = (px - world.position.x) / world.scale.x;
    const worldY = (py - world.position.y) / world.scale.y;
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextScale = Math.max(0.05, Math.min(6, world.scale.x * factor));
    world.scale.set(nextScale, nextScale);
    // Recenter so the cursor stays over the same world point.
    world.position.set(px - worldX * nextScale, py - worldY * nextScale);
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });

  // Layered containers so labels always render above edges, edges
  // always render below nodes. ``passive`` lets children process
  // events while the layer itself doesn't intercept.
  const edgeLayer = new PIXI.Container();
  const edgeLabelLayer = new PIXI.Container();
  const nodeLayer = new PIXI.Container();
  const nodeLabelLayer = new PIXI.Container();
  edgeLayer.eventMode = "passive";
  edgeLabelLayer.eventMode = "none";
  nodeLayer.eventMode = "passive";
  nodeLabelLayer.eventMode = "none";
  world.addChild(edgeLayer);
  world.addChild(edgeLabelLayer);
  world.addChild(nodeLayer);
  world.addChild(nodeLabelLayer);

  const textures = buildTextures(app.renderer);

  // Resize observer keeps the canvas in sync with its container.
  const doResize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    app.renderer.resize(w, h);
    app.stage.hitArea = app.screen;
  };
  const ro = new ResizeObserver(doResize);
  ro.observe(container);
  // Fire one explicit resize on the next tick — covers the case where
  // the container had a 0×0 size at construction (flex parent hadn't
  // computed yet).
  requestAnimationFrame(doResize);

  // Background-tap clears selection. ``pointertap`` fires only when
  // the press wasn't a drag — and we further suppress it when the
  // drag-distance flag was set by the pan handler.
  app.stage.on("pointertap", (event: PIXI.FederatedPointerEvent) => {
    if (suppressNextBackgroundTap) {
      suppressNextBackgroundTap = false;
      return;
    }
    if (event.target === app.stage || event.target === world) {
      handlers.onBackground?.();
    }
  });

  let nodes: SimNode[] = [];
  let links: SimLink[] = [];
  let nodeIndex = new Map<string, SimNode>();
  let simulation: Simulation<SimNode, SimLink> | null = null;
  let selectedId: string | null = null;
  let hoveredId: string | null = null;

  const setData = (data: PixiGraphData) => {
    // Clear previous frame.
    edgeLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    edgeLabelLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    nodeLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    nodeLabelLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (simulation) {
      simulation.stop();
      simulation = null;
    }

    nodes = data.nodes.map<SimNode>((n) => ({
      id: n.id,
      label: n.label,
      level: n.level,
      size: n.size,
      category: n.category,
      count: n.count,
    }));
    nodeIndex = new Map(nodes.map((n) => [n.id, n]));
    links = data.edges
      .filter((e) => nodeIndex.has(e.source) && nodeIndex.has(e.target))
      .map<SimLink>((e) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        predicate: e.predicate ?? null,
      }));

    // Detect bidirectional edges so we can render their labels on
    // opposite sides of the line instead of stacking on top of each
    // other. We use the source.id < target.id ordering to pick a stable
    // sign — A→B gets +1 (label "above"), B→A gets −1 (label "below").
    const directedKeys = new Set<string>();
    for (const link of links) {
      const s = typeof link.source === "string" ? link.source : (link.source as SimNode).id;
      const t = typeof link.target === "string" ? link.target : (link.target as SimNode).id;
      directedKeys.add(`${s}|${t}`);
    }
    for (const link of links) {
      const s = typeof link.source === "string" ? link.source : (link.source as SimNode).id;
      const t = typeof link.target === "string" ? link.target : (link.target as SimNode).id;
      if (directedKeys.has(`${t}|${s}`)) {
        link.bidirectional = true;
        link.bidirSign = s < t ? 1 : -1;
      }
    }

    // Per-node degree count. Used by the charge force below so hubs
    // (high-degree nodes) push other nodes farther — the visual
    // benefit is that hub-and-spoke clusters spread out instead of
    // bunching up, and edge labels around hubs have more room.
    const degreeBy = new Map<string, number>();
    for (const link of links) {
      const s = typeof link.source === "string" ? link.source : (link.source as SimNode).id;
      const t = typeof link.target === "string" ? link.target : (link.target as SimNode).id;
      degreeBy.set(s, (degreeBy.get(s) ?? 0) + 1);
      degreeBy.set(t, (degreeBy.get(t) ?? 0) + 1);
    }
    const degreeOf = (id: string) => degreeBy.get(id) ?? 0;

    // d3-force simulation — *dynamic* mode. Tunings are degree-aware
    // so leaves cluster tightly and hubs claim space proportionally:
    //
    //   charge       linear in degree: leaf=-400, hub-of-9=-3600.
    //                Sqrt scaling we used before over-charged leaves
    //                (every leaf-pair was pushing 1.41× base, so
    //                isolated leaves drifted apart). Linear keeps
    //                leaves dense and gives hubs the differentiation.
    //   link distance scales with the busier end's degree: leaf-leaf
    //                stays compact at ~250; hub-leaf and hub-hub get
    //                proportionally longer so hubs have room around
    //                them for their fan-out + edge labels.
    //   collide      base + degree-bonus, capped, so a 30-edge node
    //                doesn't claim the whole canvas.
    simulation = forceSimulation<SimNode>(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((n) => n.id)
          .distance((link) => {
            const s = typeof link.source === "string"
              ? link.source
              : (link.source as SimNode).id;
            const t = typeof link.target === "string"
              ? link.target
              : (link.target as SimNode).id;
            const maxDeg = Math.max(degreeOf(s), degreeOf(t));
            // 220 baseline + 28 per connection at the busier endpoint,
            // capped at 540 so a 30-edge mega-hub doesn't get
            // 1000-pixel spokes that hide the rest of the graph.
            return 220 + Math.min(320, 28 * maxDeg);
          })
          .strength(0.08),
      )
      .force(
        "charge",
        forceManyBody<SimNode>()
          .strength((node) => {
            const deg = Math.max(1, degreeOf(node.id));
            return -400 * deg;
          })
          .distanceMin(8),
      )
      .force("center", forceCenter(0, 0).strength(0.04))
      .force(
        "collide",
        forceCollide<SimNode>()
          .radius((n) => n.size + 16 + 5 * Math.min(20, degreeOf(n.id)))
          .strength(0.9),
      )
      .alphaDecay(0.025)
      .alphaMin(0.001)
      .on("tick", () => {
        updatePositions();
      });
    // Warm start — set alpha higher than the default 1 so the layout
    // ramps up quickly on the first run, then decays naturally.
    simulation.alpha(1).restart();

    // Build sprites per node.
    for (const node of nodes) {
      const palette = colorForCategory(node.category);
      const fillTint = hexFromCss(palette.fill);

      const ring = new PIXI.Sprite(textures.ring);
      ring.anchor.set(0.5);
      ring.tint = fillTint;
      ring.alpha = 0.9;
      ring.scale.set((node.size + 4) / 56);
      nodeLayer.addChild(ring);

      const sprite = new PIXI.Sprite(textures.circle);
      sprite.anchor.set(0.5);
      sprite.tint = fillTint;
      sprite.scale.set(node.size / 48);
      // ``dynamic`` rather than ``static`` because the node will be
      // repositioned during force-simulation ticks; ``static`` mode
      // caches hit-test info that goes stale when sprites move. This
      // is the eventMode the dianaow.com article recommends for
      // d3-force-driven nodes.
      sprite.eventMode = "dynamic";
      sprite.cursor = "pointer";
      sprite.alpha = 0.96;

      // Click + dbltap. PIXI 7's FederatedPointerEvent populates
      // ``detail`` with the consecutive-tap count (1 = single, 2+ =
      // double), so we don't need a 280 ms timer to disambiguate.
      // Single-clicks fire instantly; double-tap is the second of a
      // pair within the browser's native dblclick window.
      sprite.on("pointertap", (event: PIXI.FederatedPointerEvent) => {
        if (event.detail >= 2) handlers.onNodeDoubleClick?.(node.id);
        else handlers.onNodeClick?.(node.id);
      });
      sprite.on("pointerover", () => {
        hoveredId = node.id;
        applyEmphasis();
        handlers.onNodeHoverStart?.(node.id);
      });
      sprite.on("pointerout", () => {
        if (hoveredId === node.id) hoveredId = null;
        applyEmphasis();
        handlers.onNodeHoverEnd?.();
      });
      nodeLayer.addChild(sprite);

      const label = new PIXI.Text(node.label, {
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 11,
        fontWeight: "500",
        fill: 0xe2e8f0,
        stroke: 0x0f172a,
        strokeThickness: 3,
      });
      label.anchor.set(0.5, 0);
      label.resolution = 2;
      label.alpha = 0.9;
      nodeLabelLayer.addChild(label);

      node.sprite = sprite;
      node.ring = ring;
      node.labelText = label;
    }

    // Build edge containers.
    for (const link of links) {
      const lineSprite = new PIXI.Sprite(textures.pixel);
      lineSprite.anchor.set(0, 0.5);
      lineSprite.tint = 0x64748b;
      lineSprite.alpha = 0.4;
      const edgeWidth = Math.max(0.6, Math.min(3.2, link.weight * 2.4));
      lineSprite.height = edgeWidth;
      edgeLayer.addChild(lineSprite);

      const arrow = new PIXI.Sprite(textures.arrow);
      arrow.anchor.set(1, 0.5);
      arrow.tint = 0x94a3b8;
      arrow.alpha = 0.85;
      arrow.scale.set(0.9);
      edgeLayer.addChild(arrow);

      let labelText: PIXI.BitmapText | undefined;
      if (link.predicate) {
        const display = link.predicate.replace(/_/g, " ").toLowerCase();
        labelText = new PIXI.BitmapText(display, {
          fontName: EDGE_LABEL_FONT_NAME,
          fontSize: 12,
          // Gold (amber-400) — pops against the dark canvas + faded
          // grey edges. Hovered/selected emphasis pushes it brighter
          // via ``applyEmphasis`` below.
          tint: 0xfbbf24,
        });
        // BitmapText.anchor is an ObservablePoint in PIXI v7 — call
        // .set() instead of replacing the instance.
        (labelText.anchor as unknown as { set: (x: number, y: number) => void }).set(0.5, 0.5);
        labelText.alpha = 0.95;
        edgeLabelLayer.addChild(labelText);
      }

      link.line = lineSprite;
      link.arrow = arrow;
      link.labelText = labelText;
    }

    updatePositions();
    requestFitToView();
  };

  const updatePositions = () => {
    for (const node of nodes) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      if (node.sprite) {
        node.sprite.position.set(x, y);
        node.ring?.position.set(x, y);
      }
      if (node.labelText) {
        node.labelText.position.set(x, y + node.size * 0.55 + 4);
      }
    }
    for (const link of links) {
      const src = typeof link.source === "string"
        ? nodeIndex.get(link.source)
        : (link.source as SimNode);
      const tgt = typeof link.target === "string"
        ? nodeIndex.get(link.target)
        : (link.target as SimNode);
      if (!src || !tgt || !link.line || !link.arrow) continue;
      const x1 = src.x ?? 0;
      const y1 = src.y ?? 0;
      const x2 = tgt.x ?? 0;
      const y2 = tgt.y ?? 0;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const tgtRadius = (tgt.size ?? 14) / 2 + 6;
      const stop = Math.max(1, dist - tgtRadius);
      const angle = Math.atan2(dy, dx);

      // For bidirectional edges, push both line and label perpendicular
      // to the edge direction by a fixed amount in opposite signs, so
      // A→B sits "above" the canonical line and B→A sits "below".
      // perpX/perpY is the unit perpendicular to (cos angle, sin angle).
      const isBi = link.bidirectional === true;
      const sign = link.bidirSign ?? 0;
      const LINE_OFFSET = 4;   // px — visible separation between the two parallel lines
      const LABEL_GAP   = 9;   // px — extra perpendicular distance for the label past the line
      const perpX = -Math.sin(angle);
      const perpY =  Math.cos(angle);
      const lineOX = isBi ? perpX * LINE_OFFSET * sign : 0;
      const lineOY = isBi ? perpY * LINE_OFFSET * sign : 0;

      link.line.position.set(x1 + lineOX, y1 + lineOY);
      link.line.rotation = angle;
      link.line.width = stop;

      // Arrow sits at the end of the line, aimed at the target.
      link.arrow.position.set(
        x1 + Math.cos(angle) * stop + lineOX,
        y1 + Math.sin(angle) * stop + lineOY,
      );
      link.arrow.rotation = angle;

      if (link.labelText) {
        // Midpoint of the visible portion of the edge, plus the
        // bidirectional perpendicular kick to keep the two labels on
        // opposite sides of the shared edge line.
        const labelO = isBi ? (LINE_OFFSET + LABEL_GAP) * sign : 0;
        const mx = x1 + Math.cos(angle) * (stop / 2) + perpX * labelO;
        const my = y1 + Math.sin(angle) * (stop / 2) + perpY * labelO;
        link.labelText.position.set(mx, my);
        // Keep labels right-side-up: flip rotation when we'd otherwise
        // be writing upside-down.
        const a = ((angle + Math.PI / 2) % (Math.PI * 2));
        if (a > Math.PI / 2 && a < (3 * Math.PI) / 2) {
          link.labelText.rotation = angle + Math.PI;
        } else {
          link.labelText.rotation = angle;
        }
      }
    }
  };

  const applyEmphasis = () => {
    const target = hoveredId ?? selectedId;
    if (!target) {
      for (const n of nodes) {
        if (n.sprite) n.sprite.alpha = 0.96;
        if (n.ring) n.ring.alpha = 0.9;
        if (n.labelText) n.labelText.alpha = 0.9;
      }
      for (const l of links) {
        if (l.line) l.line.alpha = 0.4;
        if (l.arrow) l.arrow.alpha = 0.85;
        if (l.labelText) {
          l.labelText.alpha = 0.95;
          l.labelText.tint = 0xfbbf24;  // gold base
        }
      }
      return;
    }
    const focusNode = nodeIndex.get(target);
    const focusNeighbours = new Set<string>();
    for (const l of links) {
      const s = typeof l.source === "string" ? l.source : (l.source as SimNode).id;
      const t = typeof l.target === "string" ? l.target : (l.target as SimNode).id;
      if (s === target) focusNeighbours.add(t);
      if (t === target) focusNeighbours.add(s);
    }
    for (const n of nodes) {
      const isInFocus = n.id === target || focusNeighbours.has(n.id);
      if (n.sprite) n.sprite.alpha = isInFocus ? 1 : 0.18;
      if (n.ring) n.ring.alpha = isInFocus ? 0.95 : 0.12;
      if (n.labelText) n.labelText.alpha = isInFocus ? 1 : 0.18;
    }
    for (const l of links) {
      const s = typeof l.source === "string" ? l.source : (l.source as SimNode).id;
      const t = typeof l.target === "string" ? l.target : (l.target as SimNode).id;
      const incident = s === target || t === target;
      if (l.line) l.line.alpha = incident ? 0.85 : 0.06;
      if (l.arrow) l.arrow.alpha = incident ? 1 : 0.12;
      if (l.labelText) {
        l.labelText.alpha = incident ? 1 : 0.04;
        // Pop incident edge labels to bright yellow; non-incident
        // stay gold but faded.
        l.labelText.tint = incident ? 0xfde047 : 0xfbbf24;
      }
    }
    void focusNode;
  };

  const setSelection = (id: string | null) => {
    selectedId = id;
    applyEmphasis();
  };

  const requestFitToView = () => {
    if (nodes.length === 0) return;
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (const n of nodes) {
      const x = n.x ?? 0, y = n.y ?? 0;
      if (x < xmin) xmin = x;
      if (y < ymin) ymin = y;
      if (x > xmax) xmax = x;
      if (y > ymax) ymax = y;
    }
    const padX = 80, padY = 80;
    const contentW = (xmax - xmin) + 2 * padX;
    const contentH = (ymax - ymin) + 2 * padY;
    if (contentW <= 0 || contentH <= 0) return;
    const scale = Math.min(
      container.clientWidth / contentW,
      container.clientHeight / contentH,
      1.6,
    );
    world.scale.set(scale, scale);
    const centerX = (xmin + xmax) / 2;
    const centerY = (ymin + ymax) / 2;
    world.position.set(
      container.clientWidth / 2 - centerX * scale,
      container.clientHeight / 2 - centerY * scale,
    );
  };

  const fitToView = () => requestFitToView();

  const centerOn = (id: string) => {
    const node = nodeIndex.get(id);
    if (!node) return;
    const scale = Math.max(world.scale.x, 1.4);
    world.scale.set(scale, scale);
    world.position.set(
      container.clientWidth / 2 - (node.x ?? 0) * scale,
      container.clientHeight / 2 - (node.y ?? 0) * scale,
    );
  };

  const destroy = () => {
    ro.disconnect();
    if (simulation) simulation.stop();
    canvas.removeEventListener("wheel", onWheel);
    // ``texture: false`` because the BitmapFont we registered globally
    // shares its texture pages — destroying them on unmount breaks the
    // font for the next mount (which is what StrictMode does in dev).
    app.destroy(true, { children: true, texture: false, baseTexture: false });
  };

  return { setData, setSelection, fitToView, centerOn, destroy };
}
