import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Prose } from "@/components/markdown/Prose";
import { cn } from "@/lib/utils";

export type CuratedDoc = {
  id: string;
  title: string;
  summary: string;
};

export type CuratedPanelProps = {
  docs: CuratedDoc[];
  className?: string;
};

export function CuratedPanel({ docs, className }: CuratedPanelProps) {
  if (docs.length === 0) {
    return (
      <p
        className={cn("text-xs text-muted-foreground", className)}
        aria-live="polite"
      >
        Curated synthesis has not arrived yet.
      </p>
    );
  }
  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {docs.map((doc) => (
        <li key={doc.id}>
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm leading-snug">
                {doc.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <Prose source={doc.summary} className="text-sm" />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
