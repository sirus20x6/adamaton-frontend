import React from "react";

import { cn } from "@/lib/utils";
import { hashContent } from "@/lib/utils";
import { Prose } from "./Prose";

export type StreamingProseProps = {
  source: string;
  isComplete: boolean;
  className?: string;
};

type Block = {
  /** Serialized markdown for the block. */
  text: string;
  /** True when the boundary that ends this block has been observed. */
  closed: boolean;
};

/**
 * Splits an in-flight markdown stream on boundaries that are stable enough that
 * the leading slice will not change as more bytes arrive. Trailing block stays
 * "open" until either (a) we observe its closing boundary or (b) isComplete is true.
 *
 * Boundaries we treat as stable:
 *   - end of a fenced code block (``` after we entered one)
 *   - end of a display math block ($$ after we entered one)
 *   - top-level ATX headings (a line that begins with `#`); the heading itself plus
 *     the prior content closes a block
 *   - blank line separating two non-code, non-math paragraphs
 */
export function splitOnStableBoundaries(
  source: string,
  isComplete: boolean,
): Block[] {
  if (!source) return [];

  const lines = source.split("\n");
  const blocks: Block[] = [];
  let buf: string[] = [];
  let inFence = false;
  let inMath = false;
  let prevWasBlank = false;

  const flush = (closed: boolean) => {
    if (buf.length === 0) return;
    blocks.push({ text: buf.join("\n"), closed });
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (inFence) {
      buf.push(line);
      if (trimmed.startsWith("```")) {
        inFence = false;
        flush(true);
      }
      prevWasBlank = false;
      continue;
    }

    if (inMath) {
      buf.push(line);
      if (trimmed === "$$" || trimmed.endsWith("$$")) {
        inMath = false;
        flush(true);
      }
      prevWasBlank = false;
      continue;
    }

    // Not inside a fence/math: detect openings first.
    if (trimmed.startsWith("```")) {
      // Starting a fence closes any pending paragraph.
      if (buf.length > 0) flush(true);
      buf.push(line);
      inFence = true;
      prevWasBlank = false;
      continue;
    }

    if (trimmed === "$$") {
      if (buf.length > 0) flush(true);
      buf.push(line);
      inMath = true;
      prevWasBlank = false;
      continue;
    }

    // ATX heading — flush prior block, then start a new buffer with the heading.
    if (/^#{1,6}\s/.test(trimmed)) {
      if (buf.length > 0) flush(true);
      buf.push(line);
      prevWasBlank = false;
      continue;
    }

    // Blank-line separator between paragraphs.
    if (trimmed === "") {
      if (prevWasBlank) {
        // collapse runs of blank lines, but we've already flushed
        continue;
      }
      // single blank: end current paragraph block (if any).
      if (buf.length > 0) {
        flush(true);
      }
      prevWasBlank = true;
      continue;
    }

    prevWasBlank = false;
    buf.push(line);
  }

  // Whatever is left is the trailing in-flight block.
  if (buf.length > 0) {
    const closed = isComplete && !inFence && !inMath;
    blocks.push({ text: buf.join("\n"), closed });
  }

  // If isComplete, mark every block closed (defensive — incomplete fence/math
  // counts as closed once the stream is officially done).
  if (isComplete) {
    for (const b of blocks) b.closed = true;
  }

  return blocks;
}

export function StreamingProse({
  source,
  isComplete,
  className,
}: StreamingProseProps) {
  const blocks = React.useMemo(
    () => splitOnStableBoundaries(source, isComplete),
    [source, isComplete],
  );

  if (blocks.length === 0) {
    if (!isComplete) {
      return (
        <div
          className={cn("text-sm text-muted-foreground", className)}
          aria-live="polite"
        >
          <span className="inline-block h-4 w-2 animate-pulse-soft bg-foreground/60 align-middle" />
        </div>
      );
    }
    return null;
  }

  return (
    <div className={className}>
      {blocks.map((block, idx) => {
        const isLast = idx === blocks.length - 1;
        if (isLast && !block.closed) {
          return (
            <pre
              key={`tail-${idx}`}
              className="whitespace-pre-wrap break-words font-sans text-sm text-foreground/90"
              aria-live="polite"
            >
              {block.text}
              <span className="ml-0.5 inline-block h-4 w-2 animate-pulse-soft bg-foreground/60 align-middle" />
            </pre>
          );
        }
        const id = hashContent(block.text);
        return (
          <Prose
            key={`b-${idx}-${id}`}
            chunkId={id}
            source={block.text}
          />
        );
      })}
    </div>
  );
}
