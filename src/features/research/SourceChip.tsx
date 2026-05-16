import { cn } from "@/lib/utils";

export type SourceChipProps = {
  adapter: string;
  className?: string;
};

const ADAPTER_TONE: Record<string, string> = {
  arxiv:
    "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  semantic_scholar:
    "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
  openalex:
    "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  searxng:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  github:
    "bg-slate-500/10 text-slate-700 dark:text-slate-200 border-slate-500/30",
  stackexchange:
    "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
  wikipedia:
    "bg-zinc-500/10 text-zinc-700 dark:text-zinc-200 border-zinc-500/30",
};

const FALLBACK_TONE = "bg-muted/60 text-muted-foreground border-border";

export function SourceChip({ adapter, className }: SourceChipProps) {
  const tone = ADAPTER_TONE[adapter] ?? FALLBACK_TONE;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[0.7rem] font-medium tracking-tight",
        tone,
        className,
      )}
      title={adapter}
    >
      {adapter}
    </span>
  );
}
