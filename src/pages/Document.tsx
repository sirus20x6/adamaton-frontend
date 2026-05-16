import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react";

import {
  ZERO_STAGES,
  useCorpus,
  useCorpusStages,
  useRecentResearch,
} from "@/api/library";
import { Toaster } from "@/components/ui/toast";
import { CorpusDetail } from "@/features/library/CorpusDetail";
import { CorpusDocumentList } from "@/features/library/CorpusDocumentList";
import { CorpusStageMeter } from "@/features/library/CorpusStageMeter";
import { DocumentReader } from "@/features/library/DocumentReader";
import { GraphRAGPanel } from "@/features/graphrag/GraphRAGPanel";
import { cn, formatRelative } from "@/lib/utils";

function MissingCorpus() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 p-6">
      <BackLink />
      <h1 className="text-xl font-semibold tracking-tight">Corpus</h1>
      <p className="text-sm text-muted-foreground">
        No corpus id in the URL. Open one from the{" "}
        <Link to="/library" className="text-primary hover:underline">
          Library
        </Link>
        .
      </p>
    </section>
  );
}

function BackLink() {
  return (
    <Link
      to="/library"
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Library
    </Link>
  );
}

export default function Document() {
  const { corpusId } = useParams<{ corpusId: string }>();
  if (!corpusId) return <MissingCorpus />;
  return <DocumentInner corpusId={corpusId} />;
}

function DocumentInner({ corpusId }: { corpusId: string }) {
  const corpusQuery = useCorpus(corpusId);
  const stagesQuery = useCorpusStages(corpusId);
  const recentQuery = useRecentResearch(corpusId, 5);

  if (corpusQuery.isLoading) {
    return (
      <section className="flex flex-col gap-4 p-6">
        <BackLink />
        <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-card/30 p-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading corpus…
        </div>
      </section>
    );
  }

  if (corpusQuery.isError || !corpusQuery.data) {
    return (
      <section className="flex flex-col gap-4 p-6">
        <BackLink />
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300">
          Failed to load corpus{" "}
          <code className="font-mono text-xs">{corpusId}</code>:{" "}
          {corpusQuery.error instanceof Error
            ? corpusQuery.error.message
            : String(corpusQuery.error)}
        </div>
      </section>
    );
  }

  const corpus = corpusQuery.data;
  const stages = stagesQuery.data ?? ZERO_STAGES;
  const recent = recentQuery.data ?? [];

  return (
    <section className="flex flex-col gap-6 p-6">
      <BackLink />
      <CorpusDetail corpus={corpus} />

      <CorpusStageMeter
        live={stages.total}
        indexed={stages.stage1}
        graphed={stages.stage2}
        curated={stages.stage3}
        total={stages.total}
      />

      <section aria-labelledby="documents-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2
            id="documents-heading"
            className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Documents
          </h2>
        </div>
        <CorpusDocumentList corpusId={corpus.id} />
        <DocumentReader />
      </section>

      <section aria-labelledby="graphrag-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2
            id="graphrag-heading"
            className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            GraphRAG
          </h2>
        </div>
        <GraphRAGPanel corpusId={corpus.id} />
      </section>

      {recent.length > 0 ? (
        <section
          aria-labelledby="recent-heading"
          className="flex flex-col gap-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2
              id="recent-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Recent activity
            </h2>
            <span className="text-[11px] text-muted-foreground">
              last {recent.length} research run{recent.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border bg-card/40">
            {recent.map((row) => (
              <li key={row.task_id} className="flex items-center gap-3 px-3 py-2.5">
                <ResearchStatusPill status={row.status} />
                <Link
                  to={`/research/${encodeURIComponent(row.task_id)}`}
                  className="min-w-0 flex-1 truncate text-sm hover:text-primary hover:underline"
                  title={row.query}
                >
                  {row.query || `task ${row.task_id.slice(0, 8)}`}
                </Link>
                <span className="hidden text-[11px] text-muted-foreground sm:inline">
                  {formatRelative(row.created_at ?? row.updated_at ?? null)}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Toaster />
    </section>
  );
}

function ResearchStatusPill({ status }: { status: string }) {
  const lower = status.toLowerCase();
  const tone: { dot: string; text: string; border: string } = (() => {
    if (lower === "running" || lower === "open" || lower === "pending") {
      return {
        dot: "bg-amber-400 animate-pulse-soft",
        text: "text-amber-300",
        border: "border-amber-500/40 bg-amber-500/10",
      };
    }
    if (lower === "succeeded" || lower === "done" || lower === "completed") {
      return {
        dot: "bg-emerald-400",
        text: "text-emerald-300",
        border: "border-emerald-500/40 bg-emerald-500/10",
      };
    }
    if (lower === "failed" || lower === "error") {
      return {
        dot: "bg-red-400",
        text: "text-red-300",
        border: "border-red-500/40 bg-red-500/10",
      };
    }
    if (lower === "cancelled" || lower === "interrupted") {
      return {
        dot: "bg-orange-400",
        text: "text-orange-300",
        border: "border-orange-500/40 bg-orange-500/10",
      };
    }
    return {
      dot: "bg-muted-foreground",
      text: "text-muted-foreground",
      border: "border-border bg-card/40",
    };
  })();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        tone.border,
        tone.text,
      )}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", tone.dot)} />
      {status || "unknown"}
    </span>
  );
}
