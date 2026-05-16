/**
 * HighlightedCode — async syntax highlighter for nano-research artifact previews.
 *
 * Shiki is dynamically imported so the (~1 MB) WASM grammar bundle ships as a
 * separate chunk and does not bloat the initial NanoResearch page load. We only
 * pin a narrow language set (python, latex, json, bibtex, text) since those are
 * the only artifact kinds we surface in this page.
 *
 * The first render shows a "loading…" placeholder while the highlighter
 * resolves; subsequent renders hit a module-level singleton and feel
 * instantaneous.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type CodeLanguage = "python" | "latex" | "json" | "bibtex" | "text";

const THEME = "github-dark-dimmed";
const LANGS: CodeLanguage[] = ["python", "latex", "json", "bibtex", "text"];

// Module-scoped singleton + in-flight promise. Multiple highlighters in the
// same view share the same Shiki instance.
type Highlighter = {
  codeToHtml: (
    code: string,
    options: { lang: string; theme: string },
  ) => string;
};
let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((shiki) =>
      shiki.createHighlighter({
        themes: [THEME],
        langs: LANGS,
      }),
    ) as Promise<Highlighter>;
  }
  return highlighterPromise;
}

export interface HighlightedCodeProps {
  code: string;
  language: CodeLanguage;
  className?: string;
}

export function HighlightedCode({
  code,
  language,
  className,
}: HighlightedCodeProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getHighlighter()
      .then((hl) => {
        if (cancelled) return;
        try {
          const rendered = hl.codeToHtml(code, { lang: language, theme: THEME });
          setHtml(rendered);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setHtml(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  // Shared shell styles — match the existing slate-900 / slate-800 palette
  // used by sibling pre> blocks in NanoResearch.
  const shell = cn(
    "mt-2 rounded border border-slate-800 bg-slate-900 p-2 text-[11px]",
    className,
  );

  if (error) {
    return (
      <pre
        className={cn(
          shell,
          "whitespace-pre-wrap font-mono text-rose-300",
        )}
      >
        {`highlighter error: ${error}\n\n${code}`}
      </pre>
    );
  }

  if (!html) {
    return (
      <pre
        className={cn(shell, "whitespace-pre-wrap font-mono text-slate-400")}
      >
        loading…
      </pre>
    );
  }

  // Shiki emits its own <pre><code>… markup with inline colour styles; we
  // mount it inside a wrapper that supplies the panel chrome.
  return (
    <div
      className={cn(shell, "shiki-host font-mono")}
      // eslint-disable-next-line react/no-danger -- Shiki output is HTML we generated client-side from artifact text.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Map an artifact (kind, name) pair to a Shiki language. */
export function languageForArtifact(kind: string, name: string): CodeLanguage {
  const lower = name.toLowerCase();
  if (lower.endsWith(".bib") || lower.endsWith("refs.bib")) return "bibtex";
  if (lower.endsWith(".tex") || kind === "tex") return "latex";
  if (lower.endsWith(".json") || kind === "json") return "json";
  if (kind === "code") return "python"; // CODING artifacts ship python bodies
  return "text";
}
