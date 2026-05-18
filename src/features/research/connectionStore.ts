import { create } from "zustand";

import type { ResearchStreamStatus } from "@/api/ws";

export type WsStatus = ResearchStreamStatus | "idle";

/**
 * Research-stream WebSocket connection state. Used by ResearchView to
 * surface "connecting / live / closed" in the run UI, and by the
 * Layout's StatusPill to roll WS status into the header indicator.
 *
 * Platform dependency status (postgres / redis / sidecar) used to live
 * here too but has moved to useFleetHealth() in src/api/health.ts —
 * the SystemHealthWidget reads it directly without a Zustand mirror.
 */
export type ConnectionState = {
  /** WebSocket status for the most-recent research stream (if any). */
  status: WsStatus;
  /** Mirror of `status` under a less ambiguous name for new consumers. */
  wsStatus: WsStatus;
  taskId: string | null;
  /** Existing API used by ResearchView — kept stable. */
  setStatus: (status: WsStatus, taskId?: string) => void;
  reset: () => void;
};

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: "idle",
  wsStatus: "idle",
  taskId: null,
  setStatus: (status, taskId) =>
    set(() => ({
      status,
      wsStatus: status,
      taskId: taskId ?? null,
    })),
  /**
   * Clear only the WS-stream state.
   */
  reset: () =>
    set(() => ({
      status: "idle",
      wsStatus: "idle",
      taskId: null,
    })),
}));
