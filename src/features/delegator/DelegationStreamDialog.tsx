/**
 * DelegationStreamDialog — live tail of a running delegation.
 *
 * Opens an SSE stream on /api/v1/delegator/tasks/{id}/stream (the delegator
 * orchestrator publishes the running CLI's stdout/stderr over Postgres
 * NOTIFY; the dashboard relays it as `chunk` events). Most useful for
 * running/pending tasks — a finished task has nothing left to stream
 * (NOTIFY isn't buffered), so it just shows its terminal status.
 *
 * The chunk payload is the raw agent output (e.g. opencode's JSONL), shown
 * as a plain tail — this is "watch it work", not a parsed transcript.
 */
import { useEffect, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEventSource } from "@/hooks/useEventSource";
import { cn } from "@/lib/utils";

type Chunk = { stream: "stdout" | "stderr"; text: string };

const TERMINAL = new Set([
  "completed",
  "failed",
  "cancelled",
  "timed_out",
  "unknown",
  "done",
]);

/** Decode a base64 chunk payload as UTF-8 (handles partial multi-byte). */
function decodeB64(b64: string): string {
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

export function DelegationStreamDialog({
  taskId,
  agent,
  onClose,
}: {
  taskId: string | null;
  agent?: string;
  onClose: () => void;
}) {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [status, setStatus] = useState("");
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLSpanElement | null>(null);

  const terminal = TERMINAL.has(status);

  // Fresh state each time a task is opened.
  useEffect(() => {
    setChunks([]);
    setStatus("");
    setConnected(false);
  }, [taskId]);

  // Disable the stream once terminal: the backend closes the connection on
  // `done`, and without dropping the URL the hook would reconnect and replay
  // hello/done forever.
  const url =
    taskId && !terminal ? `/api/v1/delegator/tasks/${taskId}/stream` : null;

  useEventSource(url, (event, data) => {
    switch (event) {
      case "hello":
        setConnected(true);
        return;
      case "heartbeat":
        return;
      case "done": {
        let s = "done";
        try {
          s = (JSON.parse(data) as { status?: string }).status ?? "done";
        } catch {
          /* keep default */
        }
        setStatus(s);
        return;
      }
      case "chunk": {
        try {
          const c = JSON.parse(data) as { stream?: string; data?: string };
          const text = decodeB64(c.data ?? "");
          if (text) {
            setChunks((prev) => [
              ...prev,
              { stream: c.stream === "stderr" ? "stderr" : "stdout", text },
            ]);
          }
        } catch {
          /* ignore malformed chunk */
        }
        return;
      }
    }
  });

  // Auto-scroll to the newest output.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [chunks.length]);

  const label = status || (connected ? "running" : "connecting…");

  return (
    <Dialog
      open={taskId != null}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-sm">
            <span>live · {agent || "delegation"}</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide",
                terminal
                  ? "bg-muted text-muted-foreground"
                  : "bg-emerald-500/15 text-emerald-400",
              )}
            >
              {label}
            </span>
          </DialogTitle>
          <DialogDescription className="font-mono text-[0.7rem] text-muted-foreground">
            {taskId}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[55vh] rounded-md border border-border bg-black/40">
          <pre className="whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed text-foreground">
            {chunks.map((c, i) => (
              <span
                key={i}
                className={c.stream === "stderr" ? "text-rose-400" : undefined}
              >
                {c.text}
              </span>
            ))}
            {chunks.length === 0 && (
              <span className="text-muted-foreground">
                {terminal
                  ? "(no streamed output — the task already finished, or produced none)"
                  : "waiting for output…"}
              </span>
            )}
            <span ref={bottomRef} />
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
