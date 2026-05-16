import { useSearchParams } from "react-router-dom";

import GraphView from "@/features/graph/GraphView";
import GraphCanvas from "@/features/graph/GraphCanvas";

/**
 * Graph page — defaults to the PIXI renderer (WebGL, hand-rolled
 * pan/zoom on a d3-force layout). The cytoscape implementation is
 * still accessible via ``?renderer=cytoscape`` for A/B perf
 * comparison or as a fallback if the WebGL path misbehaves on a
 * given device. Both surfaces share the same backend API + URL
 * params, so swapping the flag re-renders identical data.
 */
export default function GraphPage() {
  const [searchParams] = useSearchParams();
  if (searchParams.get("renderer") === "cytoscape") {
    return <GraphView />;
  }
  return <GraphCanvas />;
}
