import { Network } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type GraphHit = {
  id: string;
  entity: string;
  relationships?: string[];
};

export type GraphedPanelProps = {
  hits: GraphHit[];
  /** Stage state from the reducer — drives the empty-state copy. */
  state?: "pending" | "running" | "done" | "error" | "skipped";
  /** Optional explanation surfaced when the stage is skipped. */
  skipReason?: string;
  className?: string;
};

export function GraphedPanel({
  hits,
  state,
  skipReason,
  className,
}: GraphedPanelProps) {
  if (hits.length === 0) {
    const copy =
      state === "skipped"
        ? skipReason ??
          "Knowledge graph extraction is not run for this task type."
        : state === "done" || state === "error"
          ? "Knowledge graph extraction produced no results."
          : "Knowledge graph extraction has not produced results yet.";
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
      {hits.map((hit) => (
        <li key={hit.id}>
          <Card>
            <CardHeader className="flex flex-row items-start gap-2 p-4">
              <Network className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <CardTitle className="text-sm leading-snug">
                {hit.entity}
              </CardTitle>
            </CardHeader>
            {hit.relationships && hit.relationships.length > 0 ? (
              <CardContent className="p-4 pt-0">
                <ul className="flex flex-wrap gap-1.5">
                  {hit.relationships.map((rel, i) => (
                    <li
                      key={`${hit.id}-${i}`}
                      className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[0.7rem] text-muted-foreground"
                    >
                      {rel}
                    </li>
                  ))}
                </ul>
              </CardContent>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}
