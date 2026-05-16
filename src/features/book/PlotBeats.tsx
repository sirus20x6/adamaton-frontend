import { useMemo } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BookChapterMeta, PlotBeat } from "@/api/books";

export type PlotBeatsProps = {
  beats: PlotBeat[];
  chapters: BookChapterMeta[];
  onBeatClick?: (chapterOrdinal: number) => void;
  className?: string;
};

const BEAT_TONE: Record<string, { dot: string; ring: string; label: string }> =
  {
    inciting: {
      dot: "bg-amber-500",
      ring: "ring-amber-500/30",
      label: "text-amber-700",
    },
    rising: {
      dot: "bg-sky-500",
      ring: "ring-sky-500/30",
      label: "text-sky-700",
    },
    climax: {
      dot: "bg-destructive",
      ring: "ring-destructive/30",
      label: "text-destructive",
    },
    falling: {
      dot: "bg-violet-500",
      ring: "ring-violet-500/30",
      label: "text-violet-700",
    },
    resolution: {
      dot: "bg-emerald-500",
      ring: "ring-emerald-500/30",
      label: "text-emerald-700",
    },
  };

function toneFor(kind: string) {
  return (
    BEAT_TONE[kind] ?? {
      dot: "bg-primary",
      ring: "ring-primary/30",
      label: "text-primary",
    }
  );
}

export function PlotBeats({
  beats,
  chapters,
  onBeatClick,
  className,
}: PlotBeatsProps) {
  const sortedBeats = useMemo(
    () => [...beats].sort((a, b) => a.chapter_ordinal - b.chapter_ordinal),
    [beats],
  );

  const chapterByOrdinal = useMemo(() => {
    const map = new Map<number, BookChapterMeta>();
    for (const c of chapters) map.set(c.ordinal, c);
    return map;
  }, [chapters]);

  if (sortedBeats.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-4 text-xs text-muted-foreground">
          No plot beats extracted yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="space-y-1 border-b border-border p-3 pb-2">
        <CardTitle className="text-sm font-medium tracking-tight">
          Plot beats
        </CardTitle>
        <p className="text-[0.65rem] text-muted-foreground">
          Click a beat to jump to its chapter in the Reader.
        </p>
      </CardHeader>
      <CardContent className="p-4">
        <ol className="relative ml-3 border-l border-border">
          {sortedBeats.map((beat) => {
            const tone = toneFor(beat.kind);
            const chapter = chapterByOrdinal.get(beat.chapter_ordinal);
            const interactive = typeof onBeatClick === "function";
            return (
              <li key={beat.id} className="relative pb-5 pl-6 last:pb-0">
                <span
                  aria-hidden
                  className={cn(
                    "absolute -left-[7px] top-1 inline-block h-3 w-3 rounded-full ring-4",
                    tone.dot,
                    tone.ring,
                  )}
                />
                <button
                  type="button"
                  disabled={!interactive}
                  onClick={() => onBeatClick?.(beat.chapter_ordinal)}
                  className={cn(
                    "group block w-full rounded-md border border-border bg-background p-3 text-left text-xs",
                    interactive
                      ? "cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent"
                      : "cursor-default",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-[0.65rem] font-medium uppercase tracking-wide",
                        tone.label,
                      )}
                    >
                      {beat.kind}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] tabular-nums text-muted-foreground">
                      Ch. {beat.chapter_ordinal}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium leading-snug text-foreground">
                    {beat.label}
                  </p>
                  {chapter ? (
                    <p className="mt-0.5 line-clamp-2 text-[0.7rem] text-muted-foreground">
                      {chapter.title || `Chapter ${chapter.ordinal}`}
                      {chapter.summary ? ` — ${chapter.summary}` : ""}
                    </p>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

export default PlotBeats;
