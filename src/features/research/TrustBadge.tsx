import { cn } from "@/lib/utils";

export type TrustBadgeProps = {
  score?: number;
  className?: string;
};

function tone(score: number | undefined): { bg: string; label: string } {
  if (score === undefined || Number.isNaN(score)) {
    return { bg: "bg-muted text-muted-foreground border-border", label: "n/a" };
  }
  if (score >= 0.8) {
    return {
      bg: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
      label: score.toFixed(2),
    };
  }
  if (score >= 0.5) {
    return {
      bg: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
      label: score.toFixed(2),
    };
  }
  return {
    bg: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
    label: score.toFixed(2),
  };
}

export function TrustBadge({ score, className }: TrustBadgeProps) {
  const t = tone(score);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] font-medium",
        t.bg,
        className,
      )}
      title={`Trust score: ${t.label}`}
    >
      trust {t.label}
    </span>
  );
}
