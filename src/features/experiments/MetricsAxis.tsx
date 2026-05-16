/**
 * Helpers shared by MetricsChart for axis ticks. Kept in its own module so the
 * chart file stays focused on rendering and so future axis additions do not
 * bloat the chart component.
 */

export type Tick = {
  /** Pixel coordinate along the axis (already padded). */
  pos: number;
  /** Underlying value at this tick (used for label formatting). */
  value: number;
  /** Pre-formatted label string. */
  label: string;
};

function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 10) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

function formatStep(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(1)}k`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(2)}k`;
  return v.toFixed(0);
}

/**
 * Build evenly-spaced numeric ticks across [min, max], mapped to the given
 * pixel range. Always returns three ticks (min, midpoint, max) for the y-axis,
 * which keeps the chart legible without a tick library.
 */
export function buildYTicks(
  min: number,
  max: number,
  yPadTop: number,
  innerHeight: number,
): Tick[] {
  const span = Math.max(1e-9, max - min);
  return [0, 0.5, 1].map((t) => {
    const value = min + span * (1 - t);
    return {
      pos: yPadTop + t * innerHeight,
      value,
      label: formatNumber(value),
    };
  });
}

/**
 * Three-to-five evenly spaced x-axis ticks. We pick the count based on series
 * length so a 3-point series doesn't get five overlapping labels.
 */
export function buildXTicks(
  min: number,
  max: number,
  xPadLeft: number,
  innerWidth: number,
  pointCount: number,
): Tick[] {
  const span = Math.max(1e-9, max - min);
  const ticks = Math.min(5, Math.max(3, Math.ceil(pointCount / 4)));
  return Array.from({ length: ticks }, (_, i) => {
    const t = i / (ticks - 1);
    const value = min + span * t;
    return {
      pos: xPadLeft + t * innerWidth,
      value,
      label: formatStep(value),
    };
  });
}
