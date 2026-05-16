/**
 * Chart.js wrapper for the training dashboard's main overlay panel.
 *
 * Mirrors the visual treatment of the moe-mla dashboard's overlay chart
 * (light grid, no point markers, bottom legend, index-mode tooltip) but
 * resolves colors from CSS vars so we stay consistent with the platform
 * dark theme rather than hard-coding hex.
 *
 * EMA smoothing layer is rendered on top of the raw line at higher
 * opacity when ``smoothing > 0`` so a noisy training-loss series
 * remains readable without losing the per-step detail.
 */

import { useEffect, useMemo, useRef } from "react";
import { Line } from "react-chartjs-2";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  LogarithmicScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartDataset,
  type ChartOptions,
  type TooltipItem,
} from "chart.js";

import { withAlpha } from "@/features/experiments/runColors";

/**
 * We extend Chart.js's per-dataset shape with a private flag so the
 * legend filter can drop the EMA "twin" entries without exposing them
 * to users. Chart.js accepts arbitrary dataset properties at runtime;
 * the type cast below stays scoped to this module.
 */
type LineDatasetWithFlag = ChartDataset<"line", Array<{ x: number; y: number }>> & {
  smoothed?: boolean;
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
);

export type ChartSeries = {
  id: string;
  label: string;
  color: string;
  points: Array<{ x: number; y: number }>;
  hidden?: boolean;
};

type TrainingChartProps = {
  metricKey: string;
  series: readonly ChartSeries[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  logY?: boolean;
  /** EMA factor in [0, 1]. 0 disables smoothing entirely. */
  smoothing?: number;
  height?: number;
  /** When true, the x-axis grows to fit incoming points without snap-back. */
  isLive?: boolean;
};

/**
 * Resolve a ``--token`` CSS variable from the document root and return
 * a usable color string for Chart.js. The shadcn semantic tokens are
 * stored as space-separated HSL components so we wrap them in
 * ``hsl(...)`` here.
 */
function readCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (!v) return fallback;
  // shadcn tokens look like "240 5% 64.9%" — wrap in hsl().
  if (/^[\d.\s%]+$/.test(v)) return `hsl(${v})`;
  return v;
}

/**
 * Exponential moving average over y-values. Skips NaN. We accept the
 * raw points and return new {x, y} objects so the caller can stash both
 * lines on the chart simultaneously without aliasing arrays.
 */
function emaSeries(
  points: ReadonlyArray<{ x: number; y: number }>,
  alpha: number,
): Array<{ x: number; y: number }> {
  if (points.length === 0 || alpha <= 0) return points.map((p) => ({ ...p }));
  const out: Array<{ x: number; y: number }> = [];
  let acc = points[0]!.y;
  for (const p of points) {
    if (Number.isFinite(p.y)) {
      acc = alpha * p.y + (1 - alpha) * acc;
    }
    out.push({ x: p.x, y: acc });
  }
  return out;
}

export function TrainingChart({
  metricKey,
  series,
  xAxisLabel,
  yAxisLabel,
  logY = false,
  smoothing = 0,
  height = 320,
  isLive = false,
}: TrainingChartProps) {
  // Refs for the resolved colors so we re-derive them when the theme flips
  // without leaving stale strings in chart options.
  const colorsRef = useRef({
    foreground: "hsl(0 0% 95%)",
    muted: "hsl(240 5% 64.9%)",
    border: "hsl(240 3.7% 15.9%)",
    card: "hsl(24 9.8% 10%)",
  });

  useEffect(() => {
    colorsRef.current = {
      foreground: readCssVar("--foreground", "hsl(0 0% 95%)"),
      muted: readCssVar("--muted-foreground", "hsl(240 5% 64.9%)"),
      border: readCssVar("--border", "hsl(240 3.7% 15.9%)"),
      card: readCssVar("--card", "hsl(24 9.8% 10%)"),
    };
  }, [metricKey, series.length, smoothing]);

  const data: ChartData<"line", Array<{ x: number; y: number }>> = useMemo(() => {
    const datasets: LineDatasetWithFlag[] = [];
    for (const s of series) {
      // The raw line is always rendered. When smoothing is on we draw it
      // dimmer so the EMA reads as the primary curve.
      const rawAlpha = smoothing > 0 ? 0.3 : 1;
      datasets.push({
        label: s.label,
        data: s.points,
        borderColor: withAlpha(s.color, rawAlpha),
        backgroundColor: withAlpha(s.color, 0.05),
        pointRadius: 0,
        pointHoverRadius: 3,
        borderWidth: 1.4,
        tension: 0,
        spanGaps: true,
        hidden: !!s.hidden,
        order: smoothing > 0 ? 2 : 1,
      });
      if (smoothing > 0) {
        datasets.push({
          label: `${s.label} (smoothed)`,
          data: emaSeries(s.points, smoothing),
          borderColor: s.color,
          backgroundColor: "transparent",
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 1.8,
          tension: 0,
          spanGaps: true,
          hidden: !!s.hidden,
          order: 1,
          smoothed: true,
        });
      }
    }
    return { datasets };
  }, [series, smoothing]);

  const options: ChartOptions<"line"> = useMemo(() => {
    const c = colorsRef.current;
    return {
      animation: false,
      maintainAspectRatio: false,
      responsive: true,
      parsing: false,
      interaction: { mode: "index", axis: "x", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: c.foreground,
            boxWidth: 10,
            boxHeight: 10,
            font: { size: 11 },
            // Suppress the smoothed-twin entries from the legend — clicking
            // a legend item toggles both via the onClick handler below.
            filter: (item, chartData) => {
              const ds = chartData.datasets[item.datasetIndex] as
                | LineDatasetWithFlag
                | undefined;
              return !ds?.smoothed;
            },
          },
          onClick: (_event, item, legend) => {
            const chart = legend.chart;
            const idx = item.datasetIndex;
            if (idx === undefined) return;
            const ds = chart.data.datasets[idx];
            if (!ds) return;
            const next = !chart.isDatasetVisible(idx);
            chart.setDatasetVisibility(idx, next);
            // Toggle the smoothed twin alongside the raw entry so they
            // remain in sync. The twin always lives at idx + 1 because we
            // emit raw-then-smoothed in pairs.
            const twin = chart.data.datasets[idx + 1] as
              | LineDatasetWithFlag
              | undefined;
            if (twin?.smoothed) {
              chart.setDatasetVisibility(idx + 1, next);
            }
            chart.update();
          },
        },
        tooltip: {
          mode: "index",
          intersect: false,
          backgroundColor: c.card,
          titleColor: c.foreground,
          bodyColor: c.foreground,
          borderColor: c.border,
          borderWidth: 1,
          padding: 8,
          // Drop EMA-twin entries entirely so the tooltip lists each run
          // exactly once, even when smoothing is on.
          filter: (item) => {
            const ds = item.dataset as LineDatasetWithFlag;
            return !ds.smoothed;
          },
          callbacks: {
            label: (ctx: TooltipItem<"line">) => {
              const y = ctx.parsed.y;
              const formatted = Number.isFinite(y)
                ? Math.abs(y) >= 1000
                  ? y.toFixed(0)
                  : Math.abs(y) >= 1
                    ? y.toFixed(3)
                    : y.toExponential(2)
                : "—";
              return `${ctx.dataset.label}: ${formatted}`;
            },
            title: (items) => {
              const x = items[0]?.parsed.x;
              if (typeof x !== "number") return "";
              return `step ${x.toLocaleString()}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          title: {
            display: !!xAxisLabel,
            text: xAxisLabel ?? "step",
            color: c.muted,
            font: { size: 11 },
          },
          ticks: { color: c.muted, font: { size: 10 } },
          grid: { color: c.border },
          // ``isLive`` is consumed by the parent (it switches refetch
          // cadence). We don't pin min/max here; Chart.js auto-fits the
          // data which is what we want when points keep arriving.
        },
        y: {
          type: logY ? "logarithmic" : "linear",
          title: {
            display: !!yAxisLabel,
            text: yAxisLabel ?? metricKey,
            color: c.muted,
            font: { size: 11 },
          },
          ticks: { color: c.muted, font: { size: 10 } },
          grid: { color: c.border },
          beginAtZero: false,
          grace: "10%",
        },
      },
    };
  }, [metricKey, xAxisLabel, yAxisLabel, logY, isLive]);

  return (
    <div style={{ height }} className="relative w-full">
      <Line data={data} options={options} />
    </div>
  );
}
