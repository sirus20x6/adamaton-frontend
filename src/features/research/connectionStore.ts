import { create } from "zustand";

import type { ResearchStreamStatus } from "@/api/ws";
import type { SystemDeps } from "@/api/system";

export type WsStatus = ResearchStreamStatus | "idle";

const INITIAL_DEPS: SystemDeps = {
  postgres: false,
  redis: false,
  sidecar: false,
};

export type ConnectionState = {
  /** WebSocket status for the most-recent research stream (if any). */
  status: WsStatus;
  /** Mirror of `status` under a less ambiguous name for new consumers. */
  wsStatus: WsStatus;
  taskId: string | null;
  /** Last known platform dependency states from /platform/health/ready. */
  deps: SystemDeps;
  /** epoch ms of last successful health poll. 0 = never checked. */
  lastChecked: number;
  /** Existing API used by ResearchView — kept stable. */
  setStatus: (status: WsStatus, taskId?: string) => void;
  /** Update dependency status from the health poller. */
  setHealth: (deps: SystemDeps) => void;
  /** Flag the moment we last got a definitive health answer. */
  markChecked: () => void;
  reset: () => void;
};

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: "idle",
  wsStatus: "idle",
  taskId: null,
  deps: { ...INITIAL_DEPS },
  lastChecked: 0,
  setStatus: (status, taskId) =>
    set(() => ({
      status,
      wsStatus: status,
      taskId: taskId ?? null,
    })),
  setHealth: (deps) => set(() => ({ deps: { ...deps } })),
  markChecked: () => set(() => ({ lastChecked: Date.now() })),
  /**
   * Clear only the WS-stream state. Dependency status is owned by the
   * Layout-level health poller and survives route changes.
   */
  reset: () =>
    set(() => ({
      status: "idle",
      wsStatus: "idle",
      taskId: null,
    })),
}));
