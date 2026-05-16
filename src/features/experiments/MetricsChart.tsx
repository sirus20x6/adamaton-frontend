import type { MetricPoint } from "@/api/experiments";
import { buildXTicks, buildYTicks } from "@/features/experiments/MetricsAxis";

/**
 * Inline-SVG metric chart. Two shapes:
 *   • single-series mode (default): a green/red trend line with axis ticks +
 *     gridlines + a small legend.
 *   • multi mode: pass `points` already concatenated and `multi: true`. The
 *     chart partitions by `key` and overlays each as a coloured line; the
 *     legend then enumerates the keys with a paired stroke swatch.
 *
 * Deliberately no charting library — the platform's dark-default look is
 * tighter when we own the SVG.
 */

type Props = {
  points: MetricPoint[];
  width?: number;
  height?: number;
  className?: string;
  /** When true, partitions points by `key` and renders each series with a
   *  distinct colour, with a legend identifying each. */
  multi?: boolean;
  /** Optional override of the colour cycle when in `multi` mode. Defaults to
   *  a small accessible palette that reads well on the dark theme. */
  palette?: readonly string[];
};

const DEFAULT_PALETTE = [
  "rgb(96 165 250)", // sky-400
  "rgb(244 114 182)", // pink-400
  "rgb(52 211 153)", // emerald-400
  "rgb(251 191 36)", // amber-400
  "rgb(167 139 250)", // violet-400
  "rgb(248 113 113)", // red-400
];

const PAD_LEFT = 36;
const PAD_RIGHT = 12;
const PAD_TOP = 18;
const PAD_BOTTOM = 22;

export function MetricsChart({
  points,
  width = 360,
  height = 140,
  className,
  multi = false,
  palette = DEFAULT_PALETTE,
}: Props) {
  if (points.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground ${className ?? ""}`}
        style={{ width, height }}
      >
        no metrics
      </div>
    );
  }

  const innerW = width - PAD_LEFT - PAD_RIGHT;
  const innerH = height - PAD_TOP - PAD_BOTTOM;

  // Group by key so multi-mode gets one polyline per metric. Single-mode
  // collapses to one entry; either way the rendering loop is shared.
  const byKey = new Map<string, MetricPoint[]>();
  for (const p of points) {
    if (!byKey.has(p.key)) byKey.set(p.key, []);
    byKey.get(p.key)!.push(p);
  }
  const keys = Array.from(byKey.keys());
  const sortedSeries = keys.map((k) => ({
    key: k,
    points: [...byKey.get(k)!].sort((a, b) => a.step - b.step),
  }));

  const allXs = points.map((p) => p.step);
  const allYs = points.map((p) => p.value);
  const xmin = Math.min(...allXs);
  const xmax = Math.max(...allXs);
  const ymin = Math.min(...allYs);
  const ymax = Math.max(...allYs);
  const xspan = Math.max(1e-9, xmax - xmin);
  const yspan = Math.max(1e-9, ymax - ymin);

  const xToPx = (x: number) => PAD_LEFT + ((x - xmin) / xspan) * innerW;
  const yToPx = (y: number) => PAD_TOP + (1 - (y - ymin) / yspan) * innerH;

  const yTicks = buildYTicks(ymin, ymax, PAD_TOP, innerH);
  const xTicks = buildXTicks(xmin, xmax, PAD_LEFT, innerW, points.length);

  // Pick stroke colour per series. In single-mode we keep the original "trend
  // green vs red" cue based on direction; in multi-mode we cycle the palette.
  const strokeFor = (idx: number, series: MetricPoint[]): string => {
    if (multi) return palette[idx % palette.length]!;
    if (series.length < 2) return "rgb(148 163 184)"; // slate-400
    return series[series.length - 1]!.value < series[0]!.value
      ? "rgb(52 211 153)"
      : "rgb(248 113 113)";
  };

  return (
    <svg
      className={className}
      width={width}
      height={height}
      role="img"
      aria-label={
        multi
          ? `Overlay of ${keys.length} metrics over ${points.length} points`
          : `Metric ${keys[0] ?? "series"} across ${points.length} steps`
      }
    >
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        rx={6}
        fill="hsl(var(--card))"
        opacity={0.4}
      />

      {/* Gridlines — drawn before paths so the lines sit on top. */}
      {yTicks.map((t, i) => (
        <line
          key={`yg-${i}`}
          x1={PAD_LEFT}
          x2={width - PAD_RIGHT}
          y1={t.pos}
          y2={t.pos}
          stroke="hsl(var(--border))"
          strokeWidth={0.5}
          opacity={0.6}
        />
      ))}
      {xTicks.map((t, i) => (
        <line
          key={`xg-${i}`}
          x1={t.pos}
          x2={t.pos}
          y1={PAD_TOP}
          y2={height - PAD_BOTTOM}
          stroke="hsl(var(--border))"
          strokeWidth={0.5}
          opacity={0.4}
        />
      ))}

      {/* Polyline(s). */}
      {sortedSeries.map((s, idx) => {
        const path = s.points
          .map((p, i) => {
            const x = xToPx(p.step);
            const y = yToPx(p.value);
            return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ");
        return (
          <path
            key={s.key + "-" + idx}
            d={path}
            fill="none"
            stroke={strokeFor(idx, s.points)}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}

      {/* Y-axis tick labels. */}
      {yTicks.map((t, i) => (
        <text
          key={`yl-${i}`}
          x={PAD_LEFT - 6}
          y={t.pos + 3}
          textAnchor="end"
          fontSize="9"
          fontFamily="monospace"
          fill="hsl(var(--muted-foreground))"
        >
          {t.label}
        </text>
      ))}

      {/* X-axis tick labels. */}
      {xTicks.map((t, i) => (
        <text
          key={`xl-${i}`}
          x={t.pos}
          y={height - PAD_BOTTOM + 12}
          textAnchor="middle"
          fontSize="9"
          fontFamily="monospace"
          fill="hsl(var(--muted-foreground))"
        >
          {t.label}
        </text>
      ))}

      {/* Legend. Renders in the top-left so it never collides with the line's
          most-recent endpoint, which lives at the right edge. */}
      <g transform={`translate(${PAD_LEFT + 4}, ${PAD_TOP - 6})`}>
        {sortedSeries.map((s, idx) => {
          const cx = idx * 84;
          return (
            <g key={`legend-${s.key}-${idx}`} transform={`translate(${cx}, 0)`}>
              <line
                x1={0}
                x2={10}
                y1={0}
                y2={0}
                stroke={strokeFor(idx, s.points)}
                strokeWidth={2}
              />
              <text
                x={14}
                y={3}
                fontSize="9"
                fontFamily="monospace"
                fill="hsl(var(--muted-foreground))"
              >
                {s.key}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
