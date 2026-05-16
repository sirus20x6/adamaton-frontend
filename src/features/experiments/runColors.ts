/**
 * Per-run color palette for the training dashboard's overlay charts.
 *
 * The 12 colors below are tailwind 400-series shades chosen to remain
 * distinguishable on the dark theme while not clashing with the semantic
 * accent palette. ``colorForRun`` looks up the active-order index so the
 * visual mapping stays stable across re-renders even when the run-id set
 * changes — the index is taken from the *active* selection list, not the
 * full experiments table, so colors don't shift as upstream data changes.
 */

export const RUN_PALETTE: readonly string[] = [
  "rgb(96 165 250)", // sky-400
  "rgb(244 114 182)", // pink-400
  "rgb(52 211 153)", // emerald-400
  "rgb(251 191 36)", // amber-400
  "rgb(167 139 250)", // violet-400
  "rgb(248 113 113)", // red-400
  "rgb(34 211 238)", // cyan-400
  "rgb(250 204 21)", // yellow-400
  "rgb(168 85 247)", // purple-500
  "rgb(74 222 128)", // green-400
  "rgb(251 113 133)", // rose-400
  "rgb(45 212 191)", // teal-400
] as const;

/** Fallback for runs that aren't part of the active selection. */
export const INACTIVE_RUN_COLOR = "rgb(148 163 184)"; // slate-400

export function colorForRun(
  runId: string,
  activeOrder: readonly string[],
): string {
  const idx = activeOrder.indexOf(runId);
  if (idx === -1) return INACTIVE_RUN_COLOR;
  return RUN_PALETTE[idx % RUN_PALETTE.length]!;
}

/**
 * Apply alpha to an ``rgb(r g b)`` palette string. Emits the comma-form
 * ``rgba(r, g, b, a)`` because Chart.js's color parser predates the
 * space-separated CSS Color Module level 4 syntax and chokes on it
 * silently (transparent fills, etc.).
 */
export function withAlpha(rgb: string, alpha: number): string {
  const m = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\)$/.exec(rgb.trim());
  if (!m) return rgb;
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
}
