import { useEffect, useRef } from "react";

/**
 * Subscribe to a Server-Sent Events stream. Reconnects with exponential
 * backoff (capped 30s) on transport errors. `onEvent` is called for
 * every named event; the data payload is the raw string body of the
 * event (parse it yourself if it's JSON).
 *
 * Pass `url = null` to disable the connection without un-mounting the
 * caller. The hook handles cleanup on URL change + unmount.
 */
export function useEventSource(
  url: string | null,
  onEvent: (event: string, data: string) => void,
) {
  // useRef lets us see the latest callback without re-subscribing.
  const callbackRef = useRef(onEvent);
  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!url) return;
    let es: EventSource | null = null;
    let backoff = 500;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const onAny = (event: MessageEvent) => {
      // EventSource fires `message` for unnamed events; for named
      // events we wire individual listeners below. This is a fallback.
      callbackRef.current("message", event.data);
    };
    const connect = () => {
      if (cancelled) return;
      es = new EventSource(url);
      es.onopen = () => {
        backoff = 500;
      };
      es.onerror = () => {
        if (es) {
          es.close();
          es = null;
        }
        if (cancelled) return;
        reconnectTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30_000);
      };
      es.onmessage = onAny;
      // Named events nano-research emits. The Phase P "structured
      // events" set (run.started/stage.started/stage.finished/
      // run.completed) joins the legacy hello/heartbeat/change/done so
      // older backends still light up the UI.
      const names = [
        "hello",
        "heartbeat",
        "change",
        "done",
        // delegator live-task tail (delegator_task_<id> stream)
        "chunk",
        "run.started",
        "stage.started",
        "stage.finished",
        "run.completed",
      ];
      for (const name of names) {
        es.addEventListener(name, (ev) => {
          const data = (ev as MessageEvent).data ?? "";
          callbackRef.current(name, data);
        });
      }
    };
    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (es) es.close();
    };
  }, [url]);
}
