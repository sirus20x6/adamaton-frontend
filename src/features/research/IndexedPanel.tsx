import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type Chunk = {
  id: string;
  documentId: string;
  text: string;
  score?: number;
  title?: string;
  /** Canonical URL (arxiv abs page, doi, openreview forum, ...). */
  url?: string;
  /** Adapter the paper came from: ``arxiv`` | ``openreview`` | ... */
  sourceKind?: string;
  /** External id native to ``sourceKind`` — arxiv id, DOI, etc. */
  externalId?: string;
};

export type IndexedPanelProps = {
  chunks: Chunk[];
  /** Stage state from the reducer — drives the empty-state copy. */
  state?: "pending" | "running" | "done" | "error" | "skipped";
  className?: string;
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export function IndexedPanel({ chunks, state, className }: IndexedPanelProps) {
  if (chunks.length === 0) {
    const copy =
      state === "skipped"
        ? "Indexed retrieval was skipped for this task."
        : state === "done" || state === "error"
          ? "No indexed retrieval results were produced."
          : "Waiting for indexed retrieval results…";
    return (
      <p
        className={cn("text-xs text-muted-foreground", className)}
        aria-live="polite"
      >
        {copy}
      </p>
    );
  }
  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {chunks.map((chunk) => (
        <li key={chunk.id}>
          <Card className="transition-colors hover:border-primary/40">
            <CardHeader className="flex flex-row items-center justify-between gap-2 p-4">
              <CardTitle className="text-sm leading-snug">
                {chunk.title ?? `chunk ${chunk.id.slice(0, 8)}`}
              </CardTitle>
              {typeof chunk.score === "number" ? (
                <span className="font-mono text-[0.7rem] text-muted-foreground">
                  {chunk.score.toFixed(3)}
                </span>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {truncate(chunk.text, 300)}
              </p>
              <Link
                to={`/library/${encodeURIComponent(chunk.documentId)}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <ArrowRight className="h-3 w-3" />
                Open
              </Link>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
