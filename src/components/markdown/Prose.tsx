import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";

import { cn } from "@/lib/utils";

export type ProseProps = {
  source: string;
  /** Stable identity hint for memoization (e.g. message id, chunk index, content hash). */
  chunkId?: string | number;
  className?: string;
  /** Extra react-markdown component overrides (merged with the defaults). */
  components?: Components;
};

type CodeProps = {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>;

/** Differentiates inline `code` from fenced ```lang code blocks. */
function CodeBlock({ inline, className, children, ...rest }: CodeProps) {
  const isFenced = !inline && /language-/.test(className ?? "");
  if (isFenced) {
    return (
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-sm">
        <code className={className} {...rest}>
          {children}
        </code>
      </pre>
    );
  }
  return (
    <code
      className={cn(
        "rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]",
        className,
      )}
      {...rest}
    >
      {children}
    </code>
  );
}

/**
 * Memoized markdown + math renderer. Sanitization is the responsibility of upstream
 * ingestion; this component renders only what callers feed it.
 */
export const Prose = React.memo(
  function Prose({ source, className, components }: ProseProps) {
    const merged: Components = React.useMemo(
      () => ({
        a: ({ node: _node, ...props }) => (
          <a target="_blank" rel="noopener noreferrer" {...props} />
        ),
        code: CodeBlock as unknown as React.ComponentType<
          React.HTMLAttributes<HTMLElement>
        >,
        ...(components ?? {}),
      }),
      [components],
    );
    return (
      <div
        className={cn(
          "prose prose-neutral dark:prose-invert max-w-none",
          className,
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex, rehypeRaw]}
          components={merged}
        >
          {source}
        </ReactMarkdown>
      </div>
    );
  },
  (prev, next) =>
    prev.source === next.source &&
    prev.chunkId === next.chunkId &&
    prev.className === next.className &&
    prev.components === next.components,
);
