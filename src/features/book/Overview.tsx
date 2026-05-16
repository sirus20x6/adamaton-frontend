import { useMemo } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Book } from "@/api/books";

import { ChapterTimeline } from "./ChapterTimeline";

export type OverviewProps = {
  book: Book;
  /** Called when the user clicks a chapter card; navigates to the Reader tab. */
  onChapterClick?: (ordinal: number) => void;
  className?: string;
};

type StatProps = {
  label: string;
  value: number | string;
  hint?: string;
};

function Stat({ label, value, hint }: StatProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-1 p-4">
        <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </p>
        {hint ? (
          <p className="text-[0.7rem] text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Tiny inline SVG line chart. Plots `values` as a polyline over a fixed
 * viewBox; designed for at-a-glance density per chapter, not pixel precision.
 */
function TensionSparkline({
  values,
  width = 200,
  height = 60,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const { points, ymin, ymax } = useMemo(() => {
    if (values.length === 0) {
      return { points: "", ymin: 0, ymax: 1 };
    }
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = hi - lo || 1;
    const stepX = values.length > 1 ? width / (values.length - 1) : 0;
    const pts = values.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - lo) / span) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return { points: pts.join(" "), ymin: lo, ymax: hi };
  }, [values, width, height]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="Tension across chapters"
      className={cn("overflow-visible text-primary", className)}
      preserveAspectRatio="none"
    >
      <line
        x1={0}
        y1={height}
        x2={width}
        y2={height}
        stroke="hsl(var(--border))"
        strokeWidth={1}
      />
      {points ? (
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      <text
        x={2}
        y={10}
        fill="hsl(var(--muted-foreground))"
        className="text-[8px] tabular-nums"
      >
        {ymax.toFixed(2)}
      </text>
      <text
        x={2}
        y={height - 2}
        fill="hsl(var(--muted-foreground))"
        className="text-[8px] tabular-nums"
      >
        {ymin.toFixed(2)}
      </text>
    </svg>
  );
}

export function Overview({ book, onChapterClick, className }: OverviewProps) {
  const tensions = useMemo(
    () =>
      [...book.chapters]
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((c) => c.tension_score),
    [book.chapters],
  );

  const avgLength = useMemo(() => {
    if (book.chapters.length === 0) return 0;
    const total = book.chapters.reduce((acc, c) => acc + c.length, 0);
    return Math.round(total / book.chapters.length);
  }, [book.chapters]);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Chapters" value={book.chapters.length} />
        <Stat label="Characters" value={book.characters_count} />
        <Stat label="Themes" value={book.themes_count} />
        <Stat label="Plot beats" value={book.beats_count} />
      </div>

      <Card>
        <CardHeader className="space-y-1 p-4 pb-2">
          <CardTitle className="text-sm font-medium tracking-tight">
            Tension across chapters
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Avg chapter length{" "}
            <span className="tabular-nums">{avgLength.toLocaleString()}</span>{" "}
            chars
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {tensions.length > 0 ? (
            <TensionSparkline values={tensions} />
          ) : (
            <p className="text-xs text-muted-foreground">
              No chapter data available yet.
            </p>
          )}
        </CardContent>
      </Card>

      <ChapterTimeline
        chapters={book.chapters}
        onChapterClick={onChapterClick}
      />
    </div>
  );
}

export default Overview;
