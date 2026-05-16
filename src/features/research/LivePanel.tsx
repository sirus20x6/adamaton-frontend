import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { SourceChip } from "./SourceChip";
import { TrustBadge } from "./TrustBadge";
import type { Snippet } from "@/api/research";

export type LivePanelProps = {
  snippets: Snippet[];
  className?: string;
};

function truncate(text: string | undefined, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export function LivePanel({ snippets, className }: LivePanelProps) {
  if (snippets.length === 0) {
    return (
      <p
        className={cn("text-xs text-muted-foreground", className)}
        aria-live="polite"
      >
        Searching primary sources…
      </p>
    );
  }
  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {snippets.map((snippet) => (
        <li key={snippet.id}>
          <Card className="overflow-hidden transition-colors hover:border-primary/40">
            <CardHeader className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <SourceChip adapter={snippet.adapter} />
                <TrustBadge score={snippet.trust} />
                {snippet.venue ? (
                  <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                    {snippet.venue}
                  </span>
                ) : null}
                {snippet.publishedAt ? (
                  <span className="text-[0.7rem] text-muted-foreground">
                    {snippet.publishedAt.slice(0, 10)}
                  </span>
                ) : null}
              </div>
              <CardTitle className="text-sm leading-snug">
                {snippet.url ? (
                  <a
                    href={snippet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {snippet.title}
                  </a>
                ) : (
                  snippet.title
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              {snippet.abstract ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {truncate(snippet.abstract, 320)}
                </p>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.7rem] text-muted-foreground">
                  {snippet.authors && snippet.authors.length > 0
                    ? snippet.authors.slice(0, 3).join(", ")
                    : null}
                </span>
                {snippet.url ? (
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                  >
                    <a
                      href={snippet.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Expand
                    </a>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
