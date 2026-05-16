import { useMemo, type CSSProperties } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BookChapterMeta, Theme } from "@/api/books";

export type ThemeMapProps = {
  themes: Theme[];
  chapters: BookChapterMeta[];
  onChapterClick?: (ordinal: number) => void;
  className?: string;
};

/**
 * Tailwind's JIT requires literal class names, so the standard
 * `bg-emerald-500/{n}` pattern can't be safely interpolated at runtime.
 * Instead we render the cell with the same emerald-500 colour using an
 * inline alpha; the tone matches `bg-emerald-500/X` exactly.
 */
const EMERALD_500_RGB = "16 185 129"; // matches Tailwind emerald-500

function cellStyle(salience: number): CSSProperties {
  const alpha = Math.max(0, Math.min(1, salience));
  return {
    backgroundColor: `rgb(${EMERALD_500_RGB} / ${alpha.toFixed(3)})`,
  };
}

export function ThemeMap({
  themes,
  chapters,
  onChapterClick,
  className,
}: ThemeMapProps) {
  const ordinals = useMemo(
    () =>
      [...chapters]
        .map((c) => c.ordinal)
        .sort((a, b) => a - b),
    [chapters],
  );

  if (themes.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-4 text-xs text-muted-foreground">
          No themes extracted yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="space-y-1 border-b border-border p-3 pb-2">
        <CardTitle className="text-sm font-medium tracking-tight">
          Theme salience by chapter
        </CardTitle>
        <p className="text-[0.65rem] text-muted-foreground">
          Each cell shows how prominent a theme is in a given chapter (0 to 1).
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-[10rem] border-b border-border bg-card px-3 py-2 text-left text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Theme
              </th>
              {ordinals.map((ord) => (
                <th
                  key={ord}
                  scope="col"
                  className="border-b border-border bg-card px-1 py-2 text-center text-[0.65rem] font-medium tabular-nums text-muted-foreground"
                >
                  <button
                    type="button"
                    onClick={() => onChapterClick?.(ord)}
                    className={cn(
                      "rounded px-1 py-0.5 text-muted-foreground",
                      onChapterClick && "hover:bg-accent hover:text-foreground",
                    )}
                    title={`Open chapter ${ord} in the Reader`}
                  >
                    {ord}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {themes.map((theme) => (
              <tr key={theme.id} className="group">
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-border bg-card px-3 py-1.5 text-left text-xs font-medium text-foreground group-last:border-b-0"
                >
                  <div className="flex flex-col">
                    <span className="truncate" title={theme.name}>
                      {theme.name}
                    </span>
                    {theme.summary ? (
                      <span
                        className="truncate text-[0.65rem] font-normal text-muted-foreground"
                        title={theme.summary}
                      >
                        {theme.summary}
                      </span>
                    ) : null}
                  </div>
                </th>
                {ordinals.map((ord) => {
                  const salience = theme.salience_by_chapter?.[String(ord)] ?? 0;
                  return (
                    <td
                      key={`${theme.id}-${ord}`}
                      className="h-7 w-7 border-b border-l border-border p-0 text-center group-last:border-b-0"
                      title={`${theme.name} · Ch. ${ord} · ${(
                        salience * 100
                      ).toFixed(0)}%`}
                      style={cellStyle(salience)}
                    >
                      {salience >= 0.5 ? (
                        <span className="text-[0.6rem] font-medium tabular-nums text-emerald-950 mix-blend-luminosity">
                          {Math.round(salience * 100)}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <Legend />
      </CardContent>
    </Card>
  );
}

function Legend() {
  const stops = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="flex items-center gap-2 border-t border-border bg-card px-3 py-2 text-[0.65rem] text-muted-foreground">
      <span>0</span>
      <div className="flex h-2 flex-1 overflow-hidden rounded-full border border-border">
        {stops.map((s) => (
          <div key={s} className="flex-1" style={cellStyle(s)} />
        ))}
      </div>
      <span>1</span>
    </div>
  );
}

export default ThemeMap;
