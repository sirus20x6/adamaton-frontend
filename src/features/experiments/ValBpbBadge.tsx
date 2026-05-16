import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  value: number | null | undefined;
  /** Compare against this value to color (lower = better). */
  relativeTo?: number | null;
  className?: string;
};

export function ValBpbBadge({ value, relativeTo, className }: Props) {
  if (value === null || value === undefined) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-border bg-card/40 px-2 py-0.5 font-mono text-xs text-muted-foreground",
          className,
        )}
        title="No val_bpb recorded"
      >
        —
      </span>
    );
  }

  let tone: "neutral" | "better" | "worse" | "tie" = "neutral";
  if (relativeTo !== null && relativeTo !== undefined && Number.isFinite(relativeTo)) {
    const delta = value - relativeTo;
    if (Math.abs(delta) < 1e-4) tone = "tie";
    else if (delta < 0) tone = "better";
    else tone = "worse";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs tabular-nums",
        tone === "neutral" && "border-border bg-card/40 text-foreground",
        tone === "tie" && "border-border bg-card/40 text-muted-foreground",
        tone === "better" &&
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 dark:text-emerald-300",
        tone === "worse" && "border-red-500/40 bg-red-500/10 text-red-500 dark:text-red-300",
        className,
      )}
      title={
        relativeTo !== null && relativeTo !== undefined
          ? `${value.toFixed(3)} vs parent ${relativeTo.toFixed(3)}`
          : `val_bpb = ${value.toFixed(3)}`
      }
    >
      {value.toFixed(3)}
      {tone === "better" && <ArrowDown className="h-3 w-3" aria-label="better" />}
      {tone === "worse" && <ArrowUp className="h-3 w-3" aria-label="worse" />}
      {tone === "tie" && <Minus className="h-3 w-3" aria-label="tie" />}
    </span>
  );
}
