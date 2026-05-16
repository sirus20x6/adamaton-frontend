import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BookChapterMeta } from "@/api/books";

export type ChapterTimelineProps = {
  chapters: BookChapterMeta[];
  /** When set, clicking a card invokes this with the chapter ordinal. */
  onChapterClick?: (ordinal: number) => void;
  /** Highlights the chapter card for the given ordinal. */
  activeOrdinal?: number;
  className?: string;
};

function tensionTone(score: number): string {
  // Map [0,1] -> a discrete badge style. The thresholds match what the
  // backend's tension scorer produces for low/medium/high arcs.
  if (score >= 0.66) return "bg-destructive/10 text-destructive border-destructive/40";
  if (score >= 0.33) return "bg-amber-500/10 text-amber-700 border-amber-500/40";
  return "bg-primary/10 text-primary border-primary/40";
}

function fmtLength(length: number): string {
  if (length >= 10_000) return `${(length / 1_000).toFixed(0)}k`;
  if (length >= 1_000) return `${(length / 1_000).toFixed(1)}k`;
  return String(length);
}

export function ChapterTimeline({
  chapters,
  onChapterClick,
  activeOrdinal,
  className,
}: ChapterTimelineProps) {
  const ordered = [...chapters].sort((a, b) => a.ordinal - b.ordinal);

  return (
    <section
      aria-label="Chapter timeline"
      className={cn("flex flex-col gap-2", className)}
    >
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium tracking-tight">Chapters</h2>
        <span className="text-[0.7rem] text-muted-foreground">
          {ordered.length} {ordered.length === 1 ? "chapter" : "chapters"}
        </span>
      </header>
      <div
        className="flex gap-3 overflow-x-auto pb-2"
        role="list"
        style={{ scrollbarWidth: "thin" }}
      >
        {ordered.map((chapter) => {
          const active = activeOrdinal === chapter.ordinal;
          const interactive = typeof onChapterClick === "function";
          const handleClick = () => onChapterClick?.(chapter.ordinal);
          return (
            <Card
              key={chapter.id}
              role="listitem"
              tabIndex={interactive ? 0 : -1}
              onClick={interactive ? handleClick : undefined}
              onKeyDown={
                interactive
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleClick();
                      }
                    }
                  : undefined
              }
              className={cn(
                "min-w-[14rem] max-w-[16rem] shrink-0 transition-colors",
                interactive &&
                  "cursor-pointer hover:border-primary/40 focus:outline-none focus-visible:border-primary",
                active && "border-primary",
              )}
            >
              <CardHeader className="space-y-1 p-3 pb-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                    Ch. {chapter.ordinal}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide tabular-nums",
                      tensionTone(chapter.tension_score),
                    )}
                    title={`Tension ${chapter.tension_score.toFixed(2)}`}
                  >
                    {chapter.tension_score.toFixed(2)}
                  </span>
                </div>
                <CardTitle className="line-clamp-2 text-sm leading-snug">
                  {chapter.title || `Chapter ${chapter.ordinal}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0">
                <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                  {chapter.summary || "No summary available."}
                </p>
                <p className="text-[0.65rem] text-muted-foreground">
                  <span className="tabular-nums">
                    {fmtLength(chapter.length)}
                  </span>{" "}
                  chars
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

export default ChapterTimeline;
