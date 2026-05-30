// A single live terminal pane. Mounts an xterm.js Terminal, opens the PTY
// websocket bridge to a tmux-backed session (see src/api/terminals.ts), and
// pumps raw bytes both ways:
//   server -> client : raw terminal output, written straight to xterm
//   client -> server : raw keystrokes, sent as the ws message payload
//
// The session itself is owned by the server (tmux); this component is just a
// view onto it. Closing the pane closes the socket (which kills only the
// `tmux attach` client, not the session). Reconnects use the same capped
// exponential backoff scheme as src/api/ws.ts so a flaky link or an apiserver
// restart re-attaches transparently.
//
// @xterm/xterm and @xterm/addon-fit are installed by the integration agent;
// the imports below will not resolve (and tsc will complain) until then.

import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { cn } from "@/lib/utils";
import { terminalsApi, terminalWsUrl } from "@/api/terminals";
import type { TerminalSession } from "@/api/terminals";

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 500;

// "connecting" is the very first attach; "reconnecting" is any attach after a
// drop (we've been open at least once and are now backing off). "closed" means
// the socket is down and no retry is scheduled yet (transient, between a drop
// and the next backoff tick).
export type TerminalConnState =
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed";

export type TerminalWindowProps = {
  session: TerminalSession;
  /** Hidden panes keep their xterm + socket alive but don't render visibly. */
  active?: boolean;
  /** Surface connection-state changes to the parent (e.g. a tab indicator). */
  onConnState?: (state: TerminalConnState) => void;
  className?: string;
};

// xterm theme tuned to the app's dark surface. Kept inline so the component
// has no extra style dependency.
const XTERM_THEME = {
  background: "#0a0a0a",
  foreground: "#e4e4e7",
  cursor: "#e4e4e7",
  selectionBackground: "#3f3f46",
  black: "#18181b",
  brightBlack: "#52525b",
} as const;

export function TerminalWindow({
  session,
  active = true,
  onConnState,
  className,
}: TerminalWindowProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  // Reconnect bookkeeping kept in refs so the connect closure stays stable.
  const attemptRef = useRef(0);
  const closedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True once we've had at least one successful open — used to label later
  // attaches as "reconnecting" rather than the initial "connecting".
  const everOpenedRef = useRef(false);
  // Bound by the connect effect so the manual "Reconnect now" button (declared
  // before the effect runs) can trigger an immediate retry.
  const reconnectNowRef = useRef<(() => void) | null>(null);

  // Last dimensions we told the server about, to suppress redundant resizes.
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);

  const [connState, setConnStateRaw] = useState<TerminalConnState>(
    "connecting",
  );
  // Surfaced so the overlay can show "reconnecting (attempt N)".
  const [attempt, setAttempt] = useState(0);

  const setConnState = useCallback(
    (state: TerminalConnState) => {
      setConnStateRaw(state);
      onConnState?.(state);
    },
    [onConnState],
  );

  const sid = session.id;

  // POST the current fitted dimensions to the resize endpoint. Best-effort:
  // the server also drives a pty.Setsize, so a dropped request just means the
  // next fit will retry.
  const pushResize = useCallback(
    (cols: number, rows: number) => {
      const last = lastSizeRef.current;
      if (last && last.cols === cols && last.rows === rows) return;
      lastSizeRef.current = { cols, rows };
      void terminalsApi.resize(sid, { cols, rows }).catch(() => {
        // Allow a retry on the next fit if this one failed.
        lastSizeRef.current = null;
      });
    },
    [sid],
  );

  const doFit = useCallback(() => {
    const fit = fitRef.current;
    const term = termRef.current;
    if (!fit || !term) return;
    try {
      fit.fit();
    } catch {
      return;
    }
    pushResize(term.cols, term.rows);
  }, [pushResize]);

  // Create the xterm instance once and attach it to the DOM node.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      scrollback: 5_000,
      theme: { ...XTERM_THEME },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);

    termRef.current = term;
    fitRef.current = fit;

    // Forward keystrokes as raw bytes to the PTY.
    const dataSub = term.onData((data) => {
      const ws = socketRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Initial fit after layout settles.
    requestAnimationFrame(doFit);

    return () => {
      dataSub.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [doFit]);

  // Open (and keep open) the websocket bridge to the tmux session.
  useEffect(() => {
    closedRef.current = false;
    attemptRef.current = 0;
    everOpenedRef.current = false;
    setAttempt(0);

    const clearReconnect = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (closedRef.current) return;
      attemptRef.current += 1;
      setAttempt(attemptRef.current);
      // Show the reconnecting state immediately while the backoff timer runs,
      // not just at the moment the next socket opens.
      setConnState("reconnecting");
      const jitter = Math.random() * 250;
      const delay = Math.min(
        BASE_BACKOFF_MS * 2 ** Math.min(attemptRef.current, 8) + jitter,
        MAX_BACKOFF_MS,
      );
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    function connect() {
      if (closedRef.current) return;
      setConnState(everOpenedRef.current ? "reconnecting" : "connecting");

      let ws: WebSocket;
      try {
        ws = new WebSocket(terminalWsUrl(sid));
      } catch {
        scheduleReconnect();
        return;
      }
      // Server writes raw output as binary frames; decode them ourselves.
      ws.binaryType = "arraybuffer";
      socketRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        setAttempt(0);
        everOpenedRef.current = true;
        setConnState("open");
        // Re-assert our size on (re)connect so a freshly attached pty matches
        // the rendered viewport.
        const term = termRef.current;
        if (term) pushResize(term.cols, term.rows);
      };

      ws.onmessage = (ev: MessageEvent<string | ArrayBuffer>) => {
        const term = termRef.current;
        if (!term) return;
        const data = ev.data;
        if (typeof data === "string") {
          term.write(data);
        } else {
          term.write(new Uint8Array(data));
        }
      };

      ws.onerror = () => {
        // Browsers don't surface a useful error; rely on onclose to reconnect.
      };

      ws.onclose = () => {
        if (socketRef.current === ws) socketRef.current = null;
        setConnState("closed");
        scheduleReconnect();
      };
    }

    // Expose an immediate-retry entry point for the manual "Reconnect now"
    // button: cancel any pending backoff, drop the dead socket, retry at once.
    reconnectNowRef.current = () => {
      if (closedRef.current) return;
      clearReconnect();
      attemptRef.current = 0;
      setAttempt(0);
      const ws = socketRef.current;
      socketRef.current = null;
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        try {
          ws.close();
        } catch {
          // best-effort close
        }
      }
      connect();
    };

    connect();

    return () => {
      closedRef.current = true;
      clearReconnect();
      reconnectNowRef.current = null;
      const ws = socketRef.current;
      socketRef.current = null;
      if (ws) {
        try {
          ws.close();
        } catch {
          // best-effort close
        }
      }
    };
    // sid identifies the session; pushResize/setConnState are stable callbacks.
  }, [sid, pushResize, setConnState]);

  const reconnectNow = useCallback(() => {
    reconnectNowRef.current?.();
  }, []);

  // Refit on container resize and when this pane becomes the active one.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      // Skip work while hidden (offsetParent null) — fit would read zero size.
      if (container.offsetParent !== null) doFit();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [doFit]);

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        doFit();
        termRef.current?.focus();
      });
    }
  }, [active, doFit]);

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden bg-[#0a0a0a]",
        !active && "hidden",
        className,
      )}
      data-conn-state={connState}
    >
      {connState !== "open" && (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-2 rounded bg-black/60 px-2 py-1 text-xs text-muted-foreground">
          {connState === "connecting" ? (
            <span>connecting…</span>
          ) : connState === "reconnecting" ? (
            <span className="text-amber-300">
              reconnecting…
              {attempt > 0 ? ` (attempt ${attempt})` : ""}
            </span>
          ) : (
            <span className="text-rose-300">disconnected</span>
          )}
          {connState !== "connecting" && (
            <button
              type="button"
              onClick={reconnectNow}
              className="rounded border border-border/60 px-1.5 py-0.5 text-[11px] text-foreground transition-colors hover:bg-accent/50"
            >
              Reconnect now
            </button>
          )}
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

export default TerminalWindow;
