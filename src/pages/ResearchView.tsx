import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Copy,
  Globe,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { cancelResearch, getResearchTask, submitResearch } from "@/api/research";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StageProgress } from "@/components/research/StageProgress";
import { Toaster } from "@/components/ui/toast";
import { AnswerPanel } from "@/features/research/AnswerPanel";
import { CuratedPanel } from "@/features/research/CuratedPanel";
import { EventLog } from "@/features/research/EventLog";
import { GraphedPanel } from "@/features/research/GraphedPanel";
import { IndexedPanel } from "@/features/research/IndexedPanel";
import { LivePanel } from "@/features/research/LivePanel";
import { MissionPanel } from "@/features/research/MissionPanel";
import { SourceBrowser } from "@/features/research/SourceBrowser";
import { useConnectionStore } from "@/features/research/connectionStore";
import { useResearchStream } from "@/features/research/useResearchStream";
import { cn } from "@/lib/utils";
import type { Stage } from "@/api/ws";

type StageMeta = { id: Stage; label: string; description: string };

const STAGE_TIMELINE: readonly StageMeta[] = [
  {
    id: "live",
    label: "Live signal",
    description:
      "Primary-source hits fanned out across registered adapters in parallel.",
  },
  {
    id: "indexed",
    label: "Indexed retrieval",
    description: "Embedded chunks scored against the query.",
  },
  {
    id: "graphed",
    label: "Knowledge graph",
    description: "Entities and relationships extracted from indexed content.",
  },
  {
    id: "curated",
    label: "Curated synthesis",
    description: "GraphRAG community summaries.",
  },
];

function MissingTask() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 p-6">
      <h1 className="text-xl font-semibold tracking-tight">Research</h1>
      <p className="text-sm text-muted-foreground">
        No task id in the URL. Open one from{" "}
        <Link to="/" className="text-primary hover:underline">
          Search
        </Link>
        .
      </p>
    </section>
  );
}

function ConnectionDot({ status }: { status: string }) {
  const live = status === "open";
  const connecting = status === "connecting";
  const label = live ? "Live" : connecting ? "Connecting" : "Closed";
  return (
    <span
      className="inline-flex items-center gap-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground"
      aria-label={`WebSocket ${label}`}
      title={`WebSocket: ${label}`}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          live
            ? "bg-emerald-500 animate-pulse-soft"
            : connecting
              ? "bg-amber-500 animate-pulse-soft"
              : "bg-muted-foreground",
        )}
      />
      {label}
    </span>
  );
}

function fmtElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function fmtAgo(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

type TaskStatus =
  | "running"
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "missing";

function TaskStatusBadge({
  status,
  createdAt,
  updatedAt,
  errorMsg,
  now,
}: {
  status: TaskStatus;
  createdAt: number | null;
  updatedAt: number | null;
  errorMsg: string | null;
  now: number;
}) {
  let icon: React.ReactNode;
  let tone: string;
  let label: string;

  if (status === "running" || status === "pending") {
    const elapsed = createdAt ? now - createdAt : 0;
    icon = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    tone = "border-primary/60 text-primary bg-primary/10";
    label = `Researching · ${fmtElapsed(elapsed)}`;
  } else if (status === "succeeded") {
    const finishedAgo = updatedAt ? now - updatedAt : 0;
    icon = <CheckCircle2 className="h-3.5 w-3.5" />;
    tone = "border-emerald-500/60 text-emerald-700 bg-emerald-500/10";
    label = `Done · finished ${fmtAgo(finishedAgo)}`;
  } else if (status === "failed") {
    icon = <XCircle className="h-3.5 w-3.5" />;
    tone = "border-destructive text-destructive bg-destructive/10";
    label = errorMsg ? `Failed · ${errorMsg.slice(0, 60)}` : "Failed";
  } else if (status === "cancelled") {
    icon = <CircleStop className="h-3.5 w-3.5" />;
    tone = "border-amber-500/60 text-amber-700 bg-amber-500/10";
    label = "Cancelled";
  } else {
    icon = <AlertTriangle className="h-3.5 w-3.5" />;
    tone = "border-muted-foreground/60 text-muted-foreground bg-muted/40";
    label = "Task not found (pre-migration)";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.75rem] font-medium",
        tone,
      )}
      aria-live="polite"
    >
      {icon}
      {label}
    </span>
  );
}

export default function ResearchView() {
  const { taskId } = useParams<{ taskId: string }>();
  if (!taskId) return <MissingTask />;
  return <ResearchViewInner taskId={taskId} />;
}

function ResearchViewInner({ taskId }: { taskId: string }) {
  const navigate = useNavigate();
  const stream = useResearchStream(taskId);
  const setConnection = useConnectionStore((s) => s.setStatus);
  const reset = useConnectionStore((s) => s.reset);
  const [copied, setCopied] = useState(false);
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  // Read the persisted task row from the same TanStack Query cache the
  // hook populates — gives us status / error / timestamps for free.
  const { data: task, isError: taskMissing } = useQuery({
    queryKey: ["research", "task", taskId],
    queryFn: () => getResearchTask(taskId),
    retry: false,
    staleTime: 60_000,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return 5_000;
      return d.status === "running" || d.status === "pending"
        ? 5_000
        : false;
    },
  });

  // Tick once a second while the task is running so the elapsed
  // counter advances without relying on event-driven re-renders.
  const [now, setNow] = useState(() => Date.now());
  const isRunning = task?.status === "running" || task?.status === "pending";
  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const taskStatus: TaskStatus = task?.status
    ? (task.status as TaskStatus)
    : taskMissing
      ? "missing"
      : "running";

  const createdAtMs = task?.created_at ? Date.parse(task.created_at) : null;
  const updatedAtMs = task?.updated_at ? Date.parse(task.updated_at) : null;

  const isWorking = useMemo(() => {
    return Object.values(stream.stages).some(
      (s) => s.state === "running" || s.state === "pending",
    );
  }, [stream.stages]);

  useEffect(() => {
    setConnection(stream.status, taskId);
    return () => reset();
  }, [stream.status, taskId, setConnection, reset]);

  const cancel = useMutation({
    mutationFn: () => cancelResearch(taskId),
    onSuccess: () => setCancelMsg("Cancellation request sent."),
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Failed to cancel research task";
      setCancelMsg(msg);
    },
  });

  // Pull the persisted query (or the localStorage fallback) for the
  // header AND the re-run button.
  const headerQuery = useHeaderQuery(taskId);

  const rerun = useMutation({
    mutationFn: async () => {
      if (!headerQuery) throw new Error("No query to re-run");
      return submitResearch({ query: headerQuery });
    },
    onSuccess: (data) => {
      navigate(`/research/${encodeURIComponent(data.task_id)}`);
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Failed to start research task";
      setCancelMsg(msg);
    },
  });

  const copyLink = async () => {
    if (typeof window === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore - the user can still copy the URL manually
    }
  };

  return (
    <section className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-0">
      <div className="border-b border-border bg-background/60 px-6 py-4 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
              Task {taskId.slice(0, 8)}
            </p>
            <h1 className="line-clamp-2 max-w-3xl text-lg font-semibold leading-snug tracking-tight">
              {headerQuery ?? "Loading research task…"}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <TaskStatusBadge
              status={taskStatus}
              createdAt={createdAtMs}
              updatedAt={updatedAtMs}
              errorMsg={task?.error ?? null}
              now={now}
            />
            <ConnectionDot status={stream.status} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyLink}
              className="gap-1.5"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => rerun.mutate()}
              disabled={rerun.isPending || !headerQuery}
              title={
                headerQuery
                  ? "Submit this query as a fresh research task"
                  : "Original query not available"
              }
              className="gap-1.5"
            >
              {rerun.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Re-run
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
              className="gap-1.5"
            >
              {cancel.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CircleStop className="h-3.5 w-3.5" />
              )}
              Cancel
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <StageProgress stages={stream.stages} />
        </div>
        {cancelMsg ? (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {cancelMsg}
          </p>
        ) : null}
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-h-0 overflow-auto px-6 py-5">
          <div className="flex max-w-3xl flex-col gap-5">
            <AnswerSection
              curated={stream.results.curated}
              indexed={stream.results.indexed}
              isWorking={isWorking}
              query={headerQuery}
              taskStatus={taskStatus}
            />
            {STAGE_TIMELINE.map((meta) => (
              <StageSection
                key={meta.id}
                meta={meta}
                stream={stream}
              />
            ))}
          </div>
        </div>
        <aside className="min-h-0 overflow-auto border-t border-border lg:border-l lg:border-t-0">
          <SourcesRailSection
            open={sourcesOpen}
            onToggle={() => setSourcesOpen((v) => !v)}
          />
          <MissionPanel taskId={taskId} isWorking={isWorking} />
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-t border-border bg-card/60 px-4 py-2 backdrop-blur">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Event log
            </h2>
            <span className="text-[0.7rem] text-muted-foreground">
              {stream.events.length} event
              {stream.events.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="px-4 py-3">
            <EventLog events={stream.events} limit={50} />
          </div>
        </aside>
      </div>
      <Toaster />
    </section>
  );
}

/**
 * Wraps `AnswerPanel` and adds a "scroll into view when the synthesis
 * lands" behaviour. Without this, finished tasks open with the focus
 * stuck at the page top and the user has to scroll to see the answer.
 */
function AnswerSection({
  curated,
  indexed,
  isWorking,
  query,
  taskStatus,
}: {
  curated: ReturnType<typeof useResearchStream>["results"]["curated"];
  indexed: ReturnType<typeof useResearchStream>["results"]["indexed"];
  isWorking: boolean;
  query: string | null;
  taskStatus: TaskStatus;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const scrolledRef = useRef(false);
  const hasAnswer = curated.length > 0;

  useEffect(() => {
    if (scrolledRef.current) return;
    if (!hasAnswer) return;
    if (taskStatus !== "succeeded") return;
    scrolledRef.current = true;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hasAnswer, taskStatus]);

  return (
    <div ref={ref}>
      <AnswerPanel
        curated={curated}
        indexed={indexed}
        isWorking={isWorking}
        query={query}
      />
    </div>
  );
}

function SourcesRailSection({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section
      aria-label="Trusted sources"
      className="border-b border-border bg-card/40"
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center justify-between gap-2 px-4 py-2",
          "text-left text-xs font-medium uppercase tracking-wide text-muted-foreground",
          "transition-colors hover:bg-accent/40",
        )}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5" />
          Trusted sources
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>
      {open ? (
        <div className="px-4 pb-3">
          <p className="mb-2 text-[0.7rem] text-muted-foreground">
            Pre-select trusted journals before refining your query.
          </p>
          <SourceBrowser variant="panel" limit={100} />
        </div>
      ) : null}
    </section>
  );
}

function StageSection({
  meta,
  stream,
}: {
  meta: StageMeta;
  stream: ReturnType<typeof useResearchStream>;
}) {
  const info = stream.stages[meta.id];
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 p-4 pb-2">
        <div className="min-w-0">
          <CardTitle className="text-sm font-medium tracking-tight">
            {meta.label}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>
        <StageStateLabel state={info.state} count={info.count} />
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-2">
        {meta.id === "live" ? (
          <LivePanel snippets={stream.results.live} />
        ) : null}
        {meta.id === "indexed" ? (
          <IndexedPanel
            chunks={stream.results.indexed}
            state={info.state}
          />
        ) : null}
        {meta.id === "graphed" ? (
          <GraphedPanel
            hits={stream.results.graphed}
            state={info.state}
            skipReason={info.error}
          />
        ) : null}
        {meta.id === "curated" ? (
          <CuratedPanel docs={stream.results.curated} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function StageStateLabel({
  state,
  count,
}: {
  state: string;
  count: number | undefined;
}) {
  const tone =
    state === "running"
      ? "border-primary text-primary bg-primary/10"
      : state === "done"
        ? "border-primary/60 text-primary bg-primary/5"
        : state === "error"
          ? "border-destructive text-destructive bg-destructive/10"
          : "border-border text-muted-foreground bg-muted/40";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide",
        tone,
      )}
    >
      {state}
      {typeof count === "number" && count > 0 ? ` · ${count}` : ""}
    </span>
  );
}

/**
 * Pulls the query string for the task header.
 *
 * Order of preference:
 *   1. The persisted ``research_jobs`` row, via the same TanStack Query
 *      cache `useResearchStream` populates (free read).
 *   2. The ``dr.recent`` localStorage entry written by the Search page
 *      when the user submitted the task.
 *
 * The fallback exists for legacy tasks created before
 * INSERT-on-create landed: those tasks 404 on the GET and the
 * Search page is the only place their query was ever recorded.
 */
function useHeaderQuery(taskId: string): string | null {
  const { data } = useQuery({
    queryKey: ["research", "task", taskId],
    queryFn: () => getResearchTask(taskId),
    // 404 is a permanent state for legacy tasks; don't keep retrying.
    retry: false,
    staleTime: 60_000,
  });
  if (data?.query) return data.query;
  return readRecentQuery(taskId);
}

const RECENT_KEY = "dr.recent";

function readRecentQuery(taskId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (r.taskId === taskId && typeof r.query === "string" && r.query) {
        return r.query;
      }
    }
  } catch {
    // localStorage unavailable / corrupt; ignore.
  }
  return null;
}
