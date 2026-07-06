/**
 * Typed WebSocket client for the research stream. Uses exponential backoff
 * (capped at 30s) and a discriminated-union event type so consumers can switch
 * exhaustively on `event.type`.
 */

export type Stage = "live" | "indexed" | "graphed" | "curated";

export type ResearchEvent =
  | { type: "stage.started"; stage: Stage; at: number; task_id?: string }
  | {
      type: "stage.progress";
      stage: Stage;
      pct: number;
      note?: string;
      at?: number;
      task_id?: string;
    }
  | {
      type: "stage.result";
      stage: Stage;
      payload: unknown;
      at?: number;
      task_id?: string;
    }
  | { type: "stage.finished"; stage: Stage; at: number; task_id?: string }
  | {
      type: "stage.error";
      stage: Stage;
      error: string;
      at?: number;
      task_id?: string;
    }
  | {
      type: "stage.skipped";
      stage: Stage;
      reason?: string | null;
      at?: number;
      task_id?: string;
    }
  | { type: "task.done"; at: number; task_id?: string }
  | { type: "heartbeat"; at: number }
  | { type: "pong"; at: number }
  | { type: "error"; error: string };

export type ResearchStreamHandle = {
  close: () => void;
  send: (msg: unknown) => void;
};

export type ResearchStreamStatus = "connecting" | "open" | "closed";

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 500;

function resolveWsUrl(taskId: string): string {
  const envBase = import.meta.env.VITE_WS_BASE;
  if (envBase) {
    const trimmed = String(envBase).replace(/\/$/, "");
    if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
      return `${trimmed}/research/${encodeURIComponent(taskId)}`;
    }
    // path-only -> upgrade to ws/wss using current page protocol
    if (typeof window !== "undefined") {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${window.location.host}${trimmed}/research/${encodeURIComponent(taskId)}`;
    }
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws/research/${encodeURIComponent(taskId)}`;
  }
  return `/ws/research/${encodeURIComponent(taskId)}`;
}

export function isResearchEvent(value: unknown): value is ResearchEvent {
  if (!value || typeof value !== "object") return false;
  const t = (value as { type?: unknown }).type;
  const known =
    t === "stage.started" ||
    t === "stage.progress" ||
    t === "stage.result" ||
    t === "stage.finished" ||
    t === "stage.error" ||
    t === "stage.skipped" ||
    t === "task.done" ||
    t === "heartbeat" ||
    t === "pong" ||
    t === "error";
  if (!known && typeof t === "string") {
    // Log unrecognised event types so new backend variants are visible in
    // the browser console rather than being silently dropped.
    // eslint-disable-next-line no-console
    console.warn("[ws] unrecognised research event type:", t, value);
  }
  return known;
}

export type OpenResearchStreamOptions = {
  onError?: (err: Error) => void;
  onStatus?: (status: ResearchStreamStatus) => void;
};

export function openResearchStream(
  taskId: string,
  onEvent: (event: ResearchEvent) => void,
  options?: OpenResearchStreamOptions,
): ResearchStreamHandle {
  let socket: WebSocket | null = null;
  let attempt = 0;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const url = resolveWsUrl(taskId);

  const setStatus = (status: ResearchStreamStatus) => {
    options?.onStatus?.(status);
  };

  const connect = () => {
    if (closed) return;
    setStatus("connecting");
    try {
      socket = new WebSocket(url);
    } catch (err) {
      options?.onError?.(err instanceof Error ? err : new Error(String(err)));
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      attempt = 0;
      setStatus("open");
    };

    socket.onmessage = (msg: MessageEvent<string | ArrayBuffer | Blob>) => {
      const data = msg.data;
      if (typeof data !== "string") return; // ignore binary frames
      try {
        const parsed: unknown = JSON.parse(data);
        if (isResearchEvent(parsed)) {
          onEvent(parsed);
        }
      } catch (err) {
        options?.onError?.(
          err instanceof Error ? err : new Error("Failed to parse WS frame"),
        );
      }
    };

    socket.onerror = () => {
      // Browsers don't surface a meaningful error object for WS failures.
      options?.onError?.(new Error("WebSocket error"));
    };

    socket.onclose = () => {
      setStatus("closed");
      if (!closed) scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (closed) return;
    attempt += 1;
    const jitter = Math.random() * 250;
    const delay = Math.min(
      BASE_BACKOFF_MS * 2 ** Math.min(attempt, 8) + jitter,
      MAX_BACKOFF_MS,
    );
    reconnectTimer = setTimeout(connect, delay);
  };

  connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket) {
        try {
          socket.close();
        } catch {
          // best-effort close
        }
        socket = null;
      }
      setStatus("closed");
    },
    send(msg: unknown) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(typeof msg === "string" ? msg : JSON.stringify(msg));
      } catch {
        // best-effort send
      }
    },
  };
}
