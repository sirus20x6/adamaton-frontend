import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Props = {
  diff: string;
  className?: string;
  /** Optional max-height for the scrollable region. Defaults to 64 (16rem). */
  maxHeightClass?: string;
};

type DiffLineKind = "add" | "del" | "hunk" | "meta" | "ctx";

type ParsedLine = {
  kind: DiffLineKind;
  text: string;
};

/**
 * Categorize a diff line by its first character. Intentionally cheap and
 * dependency-free — the tradeoff is that pathological diffs (e.g. arbitrary
 * source containing leading `-` characters) will be miscoloured. For our
 * unified-diff payloads that's an acceptable cost.
 */
function classify(line: string): DiffLineKind {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("diff ") || line.startsWith("index ")) return "meta";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "ctx";
}

function parseDiff(diff: string): ParsedLine[] {
  // Strip a trailing empty line so the gutter doesn't render a blank row.
  const text = diff.replace(/\n+$/, "");
  return text.split("\n").map((text) => ({ kind: classify(text), text }));
}

function lineClasses(kind: DiffLineKind): string {
  switch (kind) {
    case "add":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
    case "del":
      return "bg-red-500/10 text-red-600 dark:text-red-300";
    case "hunk":
      return "bg-muted/40 text-muted-foreground italic";
    case "meta":
      return "text-muted-foreground/70";
    default:
      return "text-foreground/80";
  }
}

export function CodeDiff({ diff, className, maxHeightClass = "max-h-64" }: Props) {
  const lines = useMemo(() => parseDiff(diff), [diff]);
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const counts = useMemo(() => {
    let add = 0;
    let del = 0;
    for (const l of lines) {
      if (l.kind === "add") add += 1;
      else if (l.kind === "del") del += 1;
    }
    return { add, del };
  }, [lines]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(diff);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      toast({
        title: "Copy failed",
        description: String((e as Error)?.message ?? "clipboard unavailable"),
        variant: "error",
      });
    }
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border bg-muted/30",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border bg-card/40 px-2 py-1">
        <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
          <span>Diff</span>
          <span className="font-mono text-emerald-500/80">+{counts.add}</span>
          <span className="font-mono text-red-500/80">-{counts.del}</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCopy}
          className="h-6 gap-1 px-2 text-[0.65rem] uppercase tracking-wide"
          aria-label="Copy diff"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </Button>
      </div>
      <pre
        className={cn(
          "m-0 overflow-auto font-mono text-xs leading-snug",
          maxHeightClass,
        )}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "grid grid-cols-[2.5rem_1fr] items-start",
              lineClasses(line.kind),
            )}
          >
            <span
              aria-hidden="true"
              className="select-none border-r border-border/40 bg-card/30 px-2 py-px text-right text-[0.65rem] text-muted-foreground/70 tabular-nums"
            >
              {i + 1}
            </span>
            <code className="whitespace-pre px-2 py-px">
              {line.text.length === 0 ? " " : line.text}
            </code>
          </div>
        ))}
      </pre>
    </div>
  );
}
