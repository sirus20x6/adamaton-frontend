/**
 * Chip-style metric switcher for the training dashboard. The default
 * options come from the autoresearch journal's common keys; any
 * additional keys discovered in the loaded bulk-metrics payload are
 * appended so we never hide a metric the agent recorded just because
 * we hadn't anticipated it.
 */

import { useMemo } from "react";

import { cn } from "@/lib/utils";

/**
 * "Static" defaults that always render even before the bulk-metrics
 * fetch returns. ``val_bpb`` is special: when no metric points exist
 * for any selected run, we still synthesize a single-step series from
 * the experiments table itself (see TrainingDashboard.tsx) so the
 * chart remains populated.
 */
export const DEFAULT_METRIC_KEYS: readonly string[] = [
  "val_bpb",
  "lr",
  "loss",
  "peak_memory_mb",
  "train_loss",
  "eval_loss",
  "gnorm",
  "tok_per_sec",
];

type Props = {
  /** Keys discovered in the loaded metric payload — merged with DEFAULTS. */
  discoveredKeys: readonly string[];
  selected: string;
  onSelect: (key: string) => void;
  className?: string;
};

export function MetricSelector({
  discoveredKeys,
  selected,
  onSelect,
  className,
}: Props) {
  const allKeys = useMemo(() => {
    const set = new Set<string>(DEFAULT_METRIC_KEYS);
    for (const k of discoveredKeys) {
      if (k && k.length > 0) set.add(k);
    }
    return [...set].sort((a, b) => {
      // Pin the defaults to the top in their declared order; anything
      // else is alpha-sorted underneath so the user can scan a long tail
      // of agent-specific keys without surprises.
      const ai = DEFAULT_METRIC_KEYS.indexOf(a);
      const bi = DEFAULT_METRIC_KEYS.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [discoveredKeys]);

  return (
    <div
      role="radiogroup"
      aria-label="Active metric"
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {allKeys.map((key) => {
        const active = key === selected;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(key)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 font-mono text-[0.7rem] transition-colors",
              active
                ? "border-foreground/60 bg-foreground/10 text-foreground"
                : "border-border bg-card/40 text-muted-foreground hover:bg-accent/40 hover:text-foreground",
            )}
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}
