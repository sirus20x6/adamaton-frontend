import * as React from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Github,
  Globe,
  Library,
  Loader2,
  MessageSquareText,
  Plus,
  ScrollText,
  Share2,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Prose } from "@/components/markdown/Prose";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TrustScorecard } from "@/features/trust/TrustScorecard";
import {
  attachDocumentsToCorpus,
  listCorpora,
  type Corpus,
} from "@/api/library";
import type { Chunk } from "@/features/research/IndexedPanel";
import type { CuratedDoc } from "@/features/research/CuratedPanel";
import { cn } from "@/lib/utils";

export type AnswerPanelProps = {
  /** Curated GraphRAG community summaries — preferred when available. */
  curated: CuratedDoc[];
  /** Indexed retrieval chunks — fallback when curated is empty. */
  indexed: Chunk[];
  /** Currently selected stage states; used to surface "still working" copy. */
  isWorking: boolean;
  /** Original user query for the share/copy citation block. */
  query: string | null;
  className?: string;
};

type ChosenAnswer =
  | { kind: "curated"; doc: CuratedDoc }
  | { kind: "indexed"; chunk: Chunk }
  | { kind: "empty" };

/** UUIDs the trust API understands. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SourceMeta = {
  /** Display label for the source ("arXiv", "OpenReview", ...). */
  label: string;
  /** Lucide icon component to render as a glyph. */
  Icon: React.ComponentType<{ className?: string }>;
  /** Tailwind classes for the icon's tint when used standalone. */
  iconClass: string;
};

const SOURCE_META: Record<string, SourceMeta> = {
  arxiv: {
    label: "arXiv",
    Icon: FileText,
    iconClass: "text-rose-600",
  },
  openreview: {
    label: "OpenReview",
    Icon: MessageSquareText,
    iconClass: "text-violet-600",
  },
  hf_papers: {
    label: "Hugging Face",
    Icon: BookOpen,
    iconClass: "text-amber-600",
  },
  semantic_scholar: {
    label: "Semantic Scholar",
    Icon: ScrollText,
    iconClass: "text-sky-600",
  },
  openalex: {
    label: "OpenAlex",
    Icon: ScrollText,
    iconClass: "text-emerald-600",
  },
  github: {
    label: "GitHub",
    Icon: Github,
    iconClass: "text-foreground",
  },
  wikipedia: {
    label: "Wikipedia",
    Icon: BookOpen,
    iconClass: "text-muted-foreground",
  },
  doi: {
    label: "DOI",
    Icon: Globe,
    iconClass: "text-cyan-600",
  },
};

const FALLBACK_SOURCE: SourceMeta = {
  label: "Source",
  Icon: Globe,
  iconClass: "text-muted-foreground",
};

function sourceMetaFor(kind: string | null | undefined): SourceMeta {
  if (!kind) return FALLBACK_SOURCE;
  return SOURCE_META[kind] ?? FALLBACK_SOURCE;
}

/** Best-available citation label: arxiv id > 8-char doc UUID > index. */
function citationLabel(
  token: CitationToken,
  paper: PaperInfo | undefined,
): string {
  if (paper?.externalId) return paper.externalId;
  if (token.documentId) return token.documentId.slice(0, 8);
  if (token.index !== null) return `#${token.index}`;
  return token.raw;
}

type PaperInfo = {
  documentId: string;
  title: string;
  url: string | undefined;
  sourceKind: string | undefined;
  externalId: string | undefined;
};

/**
 * Replace each ``[<uuid>]`` / ``[uuid]`` token in the markdown source
 * with a custom-protocol link the Prose ``a`` override can intercept.
 *
 * Why a markdown-link rewrite instead of a remark plugin: react-markdown
 * already exposes a clean ``components.a`` hook, and using a markdown
 * anchor means rehype-raw isn't needed (no security headache around
 * arbitrary HTML). The bracketed UUID label survives in the body text
 * via the link's display string but renders as a styled inline pill.
 */
function preprocessInlineCitations(source: string): string {
  return source.replace(
    /\[(<?)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>?\]/gi,
    (_match, _open, uuid) => {
      const short = String(uuid).slice(0, 8);
      return `[${short}](dr-cite://${uuid})`;
    },
  );
}

function paperLookup(indexed: Chunk[]): Map<string, PaperInfo> {
  const map = new Map<string, PaperInfo>();
  for (const c of indexed) {
    if (!c.documentId) continue;
    if (map.has(c.documentId)) continue;
    map.set(c.documentId, {
      documentId: c.documentId,
      title: c.title ?? `Document ${c.documentId.slice(0, 8)}`,
      url: c.url,
      sourceKind: c.sourceKind,
      externalId: c.externalId,
    });
  }
  return map;
}

/**
 * Pick the answer to render. Curated synthesis wins, else the highest-scored
 * indexed chunk; empty when neither stage has produced anything yet.
 *
 * "Highest trust" semantics: curated docs don't carry a trust score in the
 * stream so we fall back to "first-arrived"; indexed chunks expose ``score``
 * which we use as a proxy.
 */
function pickAnswer(
  curated: CuratedDoc[],
  indexed: Chunk[],
): ChosenAnswer {
  if (curated.length > 0) {
    const first = curated[0];
    if (first) return { kind: "curated", doc: first };
  }
  if (indexed.length > 0) {
    const sorted = [...indexed].sort((a, b) => {
      const sa = typeof a.score === "number" ? a.score : -Infinity;
      const sb = typeof b.score === "number" ? b.score : -Infinity;
      return sb - sa;
    });
    const top = sorted[0];
    if (top) return { kind: "indexed", chunk: top };
  }
  return { kind: "empty" };
}

/** Citation token shape: ``[uuid]`` or ``[N]`` where N is a small integer. */
type CitationToken = {
  raw: string;
  documentId: string | null;
  index: number | null;
};

/**
 * Walk the rendered Markdown source and collect every ``[id]`` citation token.
 * Pure read-only — we don't rewrite the source, instead we render the prose
 * inside one block and overlay clickable popovers in a second block beneath
 * the prose. This keeps Markdown rendering simple while still giving each
 * citation a reachable trust-scorecard popover.
 */
function extractCitations(source: string): CitationToken[] {
  const out: CitationToken[] = [];
  const seen = new Set<string>();
  // Match [uuid], [<uuid>], or [number]. The synthesizer's citation
  // contract emits ``[<full-uuid>]`` — the angle brackets disambiguate
  // citations from regular Markdown link labels which the next-char
  // check below also rules out.
  const re = /\[([^\]\n]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const raw = (match[1] ?? "").trim();
    const after = source.charAt(match.index + match[0].length);
    if (after === "(") continue; // Markdown link body
    if (!raw) continue;
    // Strip optional <> wrappers to canonicalise the UUID form.
    const inner =
      raw.startsWith("<") && raw.endsWith(">")
        ? raw.slice(1, -1).trim()
        : raw;
    if (!inner) continue;
    if (seen.has(inner)) continue;
    seen.add(inner);
    if (UUID_RE.test(inner)) {
      out.push({ raw: match[0], documentId: inner, index: null });
      continue;
    }
    const asInt = Number.parseInt(inner, 10);
    if (Number.isFinite(asInt) && String(asInt) === inner) {
      out.push({ raw: match[0], documentId: null, index: asInt });
    }
  }
  return out;
}

/** Resolve a citation index/uuid → underlying document id we can ask trust about. */
function resolveCitationDocumentId(
  token: CitationToken,
  indexed: Chunk[],
  curated: CuratedDoc[],
): string | null {
  if (token.documentId) return token.documentId;
  if (token.index === null) return null;
  // 1-based index into the indexed list (most common research convention).
  const idx = token.index - 1;
  const fromIndexed = indexed[idx];
  if (fromIndexed && UUID_RE.test(fromIndexed.documentId)) {
    return fromIndexed.documentId;
  }
  const fromCurated = curated[idx];
  if (fromCurated && UUID_RE.test(fromCurated.id)) {
    return fromCurated.id;
  }
  return null;
}

function CitationChip({
  token,
  documentId,
  paper,
  fallback,
}: {
  token: CitationToken;
  documentId: string | null;
  paper: PaperInfo | undefined;
  fallback: string;
}) {
  const hasTrust = Boolean(documentId);
  const label = citationLabel(token, paper);
  const meta = sourceMetaFor(paper?.sourceKind);
  const Icon = meta.Icon;

  // Plain text-only — no UUID, no source. Renders as a muted token.
  if (!hasTrust) {
    return (
      <span
        className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[0.65rem] text-muted-foreground"
        title={fallback}
      >
        {label}
      </span>
    );
  }

  // Common pill body: source icon + label.
  const pillBody = (
    <>
      <Icon className={cn("h-3 w-3", meta.iconClass)} />
      <span className="font-mono">{label}</span>
    </>
  );
  const pillClass = cn(
    "inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5",
    "text-[0.65rem] text-primary transition-colors hover:bg-primary/15",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );

  // Wrap as a link when the paper carries a canonical URL — open the
  // arxiv abs page / OpenReview forum / DOI in a new tab on click.
  // Trust scorecard remains accessible via the tooltip.
  const trigger = paper?.url ? (
    <a
      href={paper.url}
      target="_blank"
      rel="noopener noreferrer"
      className={pillClass}
      title={`Open ${meta.label} page in a new tab`}
    >
      {pillBody}
    </a>
  ) : (
    <button type="button" className={pillClass}>
      {pillBody}
    </button>
  );

  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="w-[20rem] max-w-[90vw] p-0"
      >
        {documentId ? (
          <TrustScorecard documentId={documentId} compact />
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Markdown body of the synthesis with inline citation pills.
 *
 * Each ``[<uuid>]`` token in the source is rewritten to a
 * ``[short](dr-cite://uuid)`` markdown link in a memoised pre-pass.
 * The Prose ``a`` override below intercepts the ``dr-cite://`` href,
 * looks the paper up in the indexed-chunk lookup, and renders a small
 * source-icon pill instead of a regular anchor — opens the paper's
 * canonical page in a new tab on click.
 */
function AnswerProse({
  source,
  indexed,
}: {
  source: string;
  indexed: Chunk[];
}) {
  const papers = React.useMemo(() => paperLookup(indexed), [indexed]);
  const rendered = React.useMemo(
    () => preprocessInlineCitations(source),
    [source],
  );
  const components = React.useMemo<NonNullable<ProseComponentsProp>>(
    () => ({
      a: (props: AnchorProps) => {
        const href = props.href ?? "";
        if (href.startsWith("dr-cite://")) {
          const docId = href.slice("dr-cite://".length);
          return (
            <InlineCitationPill
              documentId={docId}
              paper={papers.get(docId)}
            />
          );
        }
        // Fall through to Prose's default anchor behaviour (new tab).
        return (
          <a
            target="_blank"
            rel="noopener noreferrer"
            {...(props as React.HTMLAttributes<HTMLAnchorElement> & {
              href?: string;
            })}
          />
        );
      },
    }),
    [papers],
  );

  return <Prose source={rendered} components={components} className="text-sm" />;
}

type AnchorProps = {
  href?: string;
} & React.HTMLAttributes<HTMLAnchorElement> & {
    children?: React.ReactNode;
  };

type ProseComponentsProp = React.ComponentProps<typeof Prose>["components"];

/** Stable DOM id for a cited paper's row — used as the scroll target. */
function citeAnchorId(documentId: string): string {
  return `cite-${documentId}`;
}

function shortTitle(title: string | undefined, max: number = 32): string {
  if (!title) return "";
  const collapsed = title.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return collapsed.slice(0, max - 1).trimEnd() + "…";
}

/**
 * In-prose citation pill: ``[icon · short title]``.
 *
 * Clicking jumps to the paper's row in "Papers consulted" below
 * rather than opening the canonical page directly — that mirrors
 * how academic papers handle citations and lets the user see the
 * full bibliography entry (link, corpus picker, badges) in context.
 * The actual external link lives on the bibliography row's title.
 */
function InlineCitationPill({
  documentId,
  paper,
}: {
  documentId: string;
  paper: PaperInfo | undefined;
}) {
  const meta = sourceMetaFor(paper?.sourceKind);
  const Icon = meta.Icon;
  const label = shortTitle(paper?.title) || documentId.slice(0, 8);
  const trustId = UUID_RE.test(documentId) ? documentId : null;
  const anchor = citeAnchorId(documentId);
  const fullTitle = paper?.title ?? `Document ${documentId.slice(0, 8)}`;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof document === "undefined") return;
    const el = document.getElementById(anchor);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Briefly flash the row so the user sees where the click landed.
    el.classList.add("ring-2", "ring-primary/60", "rounded-md");
    window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-primary/60", "rounded-md");
    }, 1400);
  };

  const trigger = (
    <a
      href={`#${anchor}`}
      onClick={handleClick}
      className={cn(
        "no-underline align-baseline",
        "mx-0.5 inline-flex max-w-[18rem] items-center gap-1 rounded-full",
        "border border-primary/30 bg-primary/5 px-2 py-0.5",
        "text-[0.7rem] text-primary transition-colors hover:bg-primary/10",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      title={`${meta.label} · ${fullTitle} (click for full citation)`}
    >
      <Icon className={cn("h-3 w-3 shrink-0", meta.iconClass)} />
      <span className="truncate leading-none">{label}</span>
    </a>
  );

  if (!trustId) return trigger;
  return (
    <Tooltip delayDuration={180}>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="w-[22rem] max-w-[90vw] p-0"
      >
        <div className="space-y-2 p-3">
          <p className="text-sm font-medium leading-snug text-foreground">
            {fullTitle}
          </p>
          {paper?.url ? (
            <a
              href={paper.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Open {meta.label} page
            </a>
          ) : null}
          <p className="text-[0.7rem] text-muted-foreground">
            Click the pill to jump to the full citation below.
          </p>
        </div>
        <div className="border-t border-border">
          <TrustScorecard documentId={trustId} compact />
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function CitationStrip({
  source,
  indexed,
  curated,
}: {
  source: string;
  indexed: Chunk[];
  curated: CuratedDoc[];
}) {
  const tokens = React.useMemo(() => extractCitations(source), [source]);
  const papers = React.useMemo(() => paperLookup(indexed), [indexed]);
  if (tokens.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2 text-[0.7rem] text-muted-foreground">
      <span className="font-medium uppercase tracking-wide">Citations</span>
      {tokens.map((token) => {
        const documentId = resolveCitationDocumentId(token, indexed, curated);
        const paper = documentId ? papers.get(documentId) : undefined;
        return (
          <CitationChip
            key={token.raw}
            token={token}
            documentId={documentId}
            paper={paper}
            fallback={token.raw}
          />
        );
      })}
    </div>
  );
}

/**
 * Library-attach panel listing every paper the swarm pulled in for
 * this query, with a "cited" badge on the ones the synthesis actually
 * referenced. Click the source-icon-prefixed title to open the paper;
 * use the dropdown to attach to any corpus. Cited papers are ordered
 * by first appearance in the prose; uncited ones follow.
 */
function CitedPapersSection({
  source,
  indexed,
}: {
  source: string;
  indexed: Chunk[];
}) {
  const tokens = React.useMemo(() => extractCitations(source), [source]);
  const papers = React.useMemo(() => paperLookup(indexed), [indexed]);
  const { ordered, citedSet } = React.useMemo(() => {
    const seen = new Set<string>();
    const cited = new Set<string>();
    const out: PaperInfo[] = [];
    // Cited first, in citation order.
    for (const t of tokens) {
      if (!t.documentId) continue;
      if (seen.has(t.documentId)) continue;
      const info = papers.get(t.documentId);
      if (!info) continue;
      seen.add(t.documentId);
      cited.add(t.documentId);
      out.push(info);
    }
    // Then any indexed paper the synthesis didn't explicitly cite —
    // the user wants to see the full retrieval, not just the slice the
    // synthesiser picked. Ordered by indexed insertion (which mirrors
    // candidate score from the swarm).
    for (const info of papers.values()) {
      if (seen.has(info.documentId)) continue;
      seen.add(info.documentId);
      out.push(info);
    }
    return { ordered: out, citedSet: cited };
  }, [tokens, papers]);

  if (ordered.length === 0) return null;
  const citedCount = citedSet.size;
  const totalCount = ordered.length;

  return (
    <div className="space-y-2 rounded-md border border-border bg-card/30 p-3">
      <div className="flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
        <Library className="h-3 w-3" />
        Papers consulted
        <span className="ml-1 normal-case tracking-normal text-[0.65rem] text-muted-foreground/80">
          {citedCount} cited · {totalCount} retrieved
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {ordered.map((paper) => (
          <CitedPaperRow
            key={paper.documentId}
            paper={paper}
            cited={citedSet.has(paper.documentId)}
          />
        ))}
      </ul>
    </div>
  );
}

function CitedPaperRow({
  paper,
  cited,
}: {
  paper: PaperInfo;
  cited: boolean;
}) {
  const meta = sourceMetaFor(paper.sourceKind);
  const Icon = meta.Icon;
  const sub =
    paper.externalId ??
    (paper.sourceKind ? meta.label : paper.documentId.slice(0, 8));
  return (
    <li
      id={citeAnchorId(paper.documentId)}
      className="flex items-start gap-2 rounded-md p-1.5 text-sm transition-shadow hover:bg-accent/40"
    >
      <Icon className={cn("mt-1 h-4 w-4 shrink-0", meta.iconClass)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          {paper.url ? (
            <a
              href={paper.url}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-2 font-medium text-foreground hover:underline"
              title={`Open ${meta.label} page`}
            >
              {paper.title}
              <ExternalLink className="ml-1 inline h-3 w-3 align-baseline text-muted-foreground" />
            </a>
          ) : (
            <span className="line-clamp-2 font-medium text-foreground">
              {paper.title}
            </span>
          )}
          {cited ? (
            <span className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-primary">
              cited
            </span>
          ) : (
            <span className="rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground">
              retrieved
            </span>
          )}
        </div>
        <p className="text-[0.7rem] text-muted-foreground">
          {meta.label}
          {sub && sub !== meta.label ? ` · ${sub}` : ""}
        </p>
      </div>
      <AddToCorpusMenu documentId={paper.documentId} />
    </li>
  );
}

/**
 * Dropdown that lets the user attach this paper's R2R document_id to
 * any corpus they own. The query for corpora is shared by name across
 * all instances of the dropdown so it only fires once per page.
 */
function AddToCorpusMenu({ documentId }: { documentId: string }) {
  const { data: corpora, isLoading } = useQuery({
    queryKey: ["library", "corpora"],
    queryFn: () => listCorpora(),
    staleTime: 60_000,
  });
  const [feedback, setFeedback] = React.useState<{
    corpusName: string;
    kind: "added" | "duplicate" | "error";
  } | null>(null);

  const attach = useMutation({
    mutationFn: async (corpus: Corpus) => {
      const resp = await attachDocumentsToCorpus(corpus.id, [documentId]);
      return { resp, corpus };
    },
    onSuccess: ({ resp, corpus }) => {
      const kind: "added" | "duplicate" =
        resp.attached > 0 ? "added" : "duplicate";
      setFeedback({ corpusName: corpus.name, kind });
      window.setTimeout(() => setFeedback(null), 2400);
    },
    onError: (_err, corpus) => {
      setFeedback({ corpusName: corpus.name, kind: "error" });
      window.setTimeout(() => setFeedback(null), 3000);
    },
  });

  if (feedback) {
    const tone =
      feedback.kind === "added"
        ? "border-emerald-500/40 text-emerald-700"
        : feedback.kind === "duplicate"
          ? "border-amber-500/40 text-amber-700"
          : "border-destructive text-destructive";
    const text =
      feedback.kind === "added"
        ? `Added to ${feedback.corpusName}`
        : feedback.kind === "duplicate"
          ? `Already in ${feedback.corpusName}`
          : `Failed to add to ${feedback.corpusName}`;
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-md border bg-card/40 px-2 py-1 text-[0.7rem]",
          tone,
        )}
      >
        <Check className="h-3 w-3" />
        {text}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          disabled={attach.isPending}
        >
          {attach.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Add to library
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[18rem]">
        <DropdownMenuLabel>Attach to corpus</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading ? (
          <DropdownMenuItem disabled>Loading corpora…</DropdownMenuItem>
        ) : !corpora || corpora.length === 0 ? (
          <DropdownMenuItem disabled>
            No corpora yet — create one from the Library page.
          </DropdownMenuItem>
        ) : (
          corpora.map((c) => (
            <DropdownMenuItem
              key={c.id}
              onSelect={(e) => {
                e.preventDefault();
                attach.mutate(c);
              }}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">{c.name}</span>
              <span className="shrink-0 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                {c.scope ?? "research"}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Build a Markdown citations block for the Copy action. */
function citationsToMarkdown(
  source: string,
  indexed: Chunk[],
  curated: CuratedDoc[],
): string {
  const tokens = extractCitations(source);
  if (tokens.length === 0) return "";
  const lines: string[] = ["## Citations"];
  for (const token of tokens) {
    const documentId = resolveCitationDocumentId(token, indexed, curated);
    if (documentId) {
      lines.push(`- ${token.raw} → document \`${documentId}\``);
    } else {
      lines.push(`- ${token.raw}`);
    }
  }
  return lines.join("\n");
}

/**
 * Rewrite each ``[<uuid>]`` / ``[uuid]`` in ``source`` to a real
 * markdown link pointing at the cited paper's canonical URL. Falls
 * back to ``[short-uuid]`` plain text when the paper has no URL.
 *
 * The output is consumable by Claude Code, ChatGPT, Obsidian, Pandoc,
 * etc — no platform-specific ``dr-cite://`` protocol leaks through.
 */
function inlineCitationsToMarkdownLinks(
  source: string,
  papers: Map<string, PaperInfo>,
): string {
  return source.replace(
    /\[(<?)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>?\]/gi,
    (_match, _open, uuid) => {
      const docId = String(uuid).toLowerCase();
      const paper = papers.get(docId);
      const label = paper?.title ?? docId.slice(0, 8);
      // Markdown text in a link can't contain ``[`` or ``]`` directly
      // — collapse them to keep the link well-formed even when the
      // paper title has bracketed authorship like ``[Anonymous]``.
      const safe = label.replace(/[\[\]]/g, "");
      if (paper?.url) return `[${safe}](${paper.url})`;
      return `[${safe}](#cite-${docId})`;
    },
  );
}

/**
 * Build a self-contained Markdown export of the synthesis.
 *
 * Layout:
 *   1. ``# Research: <query>`` header with date + counts.
 *   2. ``## Answer`` — synthesis with citations rewritten to clickable
 *      ``[Title](url)`` markdown links so the file works as Claude Code
 *      / Obsidian / pandoc input without our internal ``dr-cite://``
 *      protocol leaking through.
 *   3. ``## Papers consulted`` — numbered bibliography. Each entry has
 *      title (linked when a URL exists), source label + external id,
 *      cited / retrieved badge, and the per-paper sub-agent answer
 *      block underneath so a downstream agent has the supporting
 *      reasoning, not just titles.
 */
function buildMarkdownExport({
  query,
  source,
  indexed,
}: {
  query: string | null;
  source: string;
  indexed: Chunk[];
}): string {
  const papers = paperLookup(indexed);
  const tokens = extractCitations(source);
  const citedIds = new Set<string>();
  for (const t of tokens) {
    if (t.documentId) citedIds.add(t.documentId.toLowerCase());
  }

  const ordered: PaperInfo[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    if (!t.documentId) continue;
    const id = t.documentId.toLowerCase();
    if (seen.has(id)) continue;
    const info = papers.get(id);
    if (!info) continue;
    seen.add(id);
    ordered.push(info);
  }
  for (const info of papers.values()) {
    if (seen.has(info.documentId)) continue;
    seen.add(info.documentId);
    ordered.push(info);
  }

  // Per-document map from document_id → matching indexed Chunk so we
  // can splice the sub-agent's reasoning into the bibliography entry.
  const chunksByDoc = new Map<string, Chunk[]>();
  for (const c of indexed) {
    if (!c.documentId) continue;
    const list = chunksByDoc.get(c.documentId) ?? [];
    list.push(c);
    chunksByDoc.set(c.documentId, list);
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# Research: ${query?.trim() || "Untitled query"}`);
  lines.push("");
  lines.push(
    `> Generated by Deep Research Platform on ${dateStr} · ` +
      `${citedIds.size} cited / ${ordered.length} retrieved papers`,
  );
  lines.push("");
  lines.push("## Answer");
  lines.push("");
  lines.push(inlineCitationsToMarkdownLinks(source.trim(), papers));
  lines.push("");

  if (ordered.length > 0) {
    lines.push("## Papers consulted");
    lines.push("");
    ordered.forEach((paper, idx) => {
      const meta = sourceMetaFor(paper.sourceKind);
      const cited = citedIds.has(paper.documentId);
      const number = idx + 1;
      const title = paper.title.replace(/\s+/g, " ").trim();
      const heading = paper.url
        ? `### ${number}. [${title}](${paper.url})`
        : `### ${number}. ${title}`;
      lines.push(`<a id="cite-${paper.documentId}"></a>`);
      lines.push(heading);
      lines.push("");
      const subParts = [meta.label];
      if (paper.externalId) subParts.push(paper.externalId);
      subParts.push(cited ? "**cited**" : "retrieved");
      subParts.push(`document_id: \`${paper.documentId}\``);
      lines.push(`- ${subParts.join(" · ")}`);
      lines.push("");

      // Splice in every sub-agent answer for this paper so a
      // downstream agent has the reasoning, not just the headline.
      const chunks = chunksByDoc.get(paper.documentId) ?? [];
      for (const c of chunks) {
        const text = (c.text ?? "").trim();
        if (!text) continue;
        // Indent lightly so it reads as a quoted analysis block but
        // the headers inside the chunk still render.
        lines.push(text);
        lines.push("");
      }
    });
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function querySlug(query: string | null): string {
  const base = (query ?? "research").trim().toLowerCase();
  const cleaned = base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (cleaned || "research").slice(0, 60);
}

function downloadMarkdown(filename: string, content: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  window.document.body.appendChild(a);
  a.click();
  window.document.body.removeChild(a);
  // Revoke on the next tick so Safari has time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function focusSearchQuery(): void {
  if (typeof document === "undefined") return;
  // The Search page wires up the textarea with `aria-label="Research query"`
  // — that's the most stable hook and it survives label rewording.
  const ta = document.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Research query"]',
  );
  if (ta) {
    ta.focus();
    return;
  }
  // Fallback: any textarea on the page.
  const fallback = document.querySelector<HTMLTextAreaElement>("textarea");
  fallback?.focus();
}

function AnswerHeader({
  source,
  indexed,
  curated,
  hasAnswer,
  query,
}: {
  source: string;
  indexed: Chunk[];
  curated: CuratedDoc[];
  hasAnswer: boolean;
  query: string | null;
}) {
  const [copied, setCopied] = React.useState(false);
  const [shared, setShared] = React.useState(false);
  const [exported, setExported] = React.useState(false);

  const exportMarkdown = () => {
    if (!hasAnswer) return;
    const md = buildMarkdownExport({ query, source, indexed });
    const filename = `research-${querySlug(query)}-${
      new Date().toISOString().slice(0, 10)
    }.md`;
    downloadMarkdown(filename, md);
    setExported(true);
    window.setTimeout(() => setExported(false), 1800);
  };

  const copyAnswer = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    if (!hasAnswer) return;
    const citations = citationsToMarkdown(source, indexed, curated);
    const payload = citations ? `${source.trim()}\n\n${citations}\n` : source;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore — user can still select-and-copy
    }
  };

  const copyShareLink = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={copyAnswer}
        disabled={!hasAnswer}
        className="gap-1.5"
        title={hasAnswer ? undefined : "Waiting for an answer to copy."}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {copied ? "Copied" : "Copy answer"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={exportMarkdown}
        disabled={!hasAnswer}
        className="gap-1.5"
        title={
          hasAnswer
            ? "Download a self-contained Markdown file with the synthesis, full bibliography, and per-paper sub-agent answers."
            : "Waiting for the synthesis."
        }
      >
        {exported ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {exported ? "Downloaded" : "Export .md"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={copyShareLink}
        className="gap-1.5"
      >
        {shared ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Share2 className="h-3.5 w-3.5" />
        )}
        {shared ? "Link copied" : "Share"}
      </Button>
      <Button
        asChild
        type="button"
        size="sm"
        variant="ghost"
        className="gap-1.5"
        onClick={() => {
          // The /search route mounts the textarea on render; once we navigate
          // there, focus the query box.
          window.setTimeout(focusSearchQuery, 80);
        }}
      >
        <Link to="/">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to query
        </Link>
      </Button>
    </div>
  );
}

function EmptyAnswer({ isWorking }: { isWorking: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2 rounded-md border border-dashed border-border",
        "bg-card/40 p-4 text-sm text-muted-foreground",
      )}
      aria-live="polite"
      aria-busy={isWorking}
    >
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="font-medium text-foreground">
          Synthesizing answer…
        </span>
      </div>
      <p className="text-xs">
        Curated synthesis lands once the indexed retrieval and graph stages
        wrap up. We&apos;ll auto-promote the highest-trust chunk in the
        meantime.
      </p>
    </div>
  );
}

export function AnswerPanel({
  curated,
  indexed,
  isWorking,
  query,
  className,
}: AnswerPanelProps) {
  const choice = React.useMemo(
    () => pickAnswer(curated, indexed),
    [curated, indexed],
  );

  const { source, title, citationDocumentId } = React.useMemo(() => {
    if (choice.kind === "curated") {
      return {
        source: choice.doc.summary,
        title: choice.doc.title,
        citationDocumentId: UUID_RE.test(choice.doc.id) ? choice.doc.id : null,
      };
    }
    if (choice.kind === "indexed") {
      return {
        source: choice.chunk.text,
        title:
          choice.chunk.title ?? `Indexed chunk ${choice.chunk.id.slice(0, 8)}`,
        citationDocumentId: UUID_RE.test(choice.chunk.documentId)
          ? choice.chunk.documentId
          : null,
      };
    }
    return { source: "", title: "Answer", citationDocumentId: null };
  }, [choice]);

  return (
    <Card
      className={cn(
        "border-primary/30 bg-card shadow-md",
        className,
      )}
      aria-label="Synthesized answer"
    >
      <TooltipProvider>
        <CardHeader className="flex flex-col gap-2 p-4 pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="inline-flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-wide text-primary">
                <Sparkles className="h-3 w-3" />
                {choice.kind === "curated"
                  ? "Curated synthesis"
                  : choice.kind === "indexed"
                    ? "Top indexed chunk"
                    : "Synthesizing"}
              </p>
              <CardTitle className="text-base leading-snug tracking-tight">
                {title}
              </CardTitle>
              {query ? (
                <p className="line-clamp-2 max-w-2xl text-xs text-muted-foreground">
                  for: {query}
                </p>
              ) : null}
            </div>
            <AnswerHeader
              source={source}
              indexed={indexed}
              curated={curated}
              hasAnswer={choice.kind !== "empty"}
              query={query}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-2">
          {choice.kind === "empty" ? (
            <EmptyAnswer isWorking={isWorking} />
          ) : (
            <>
              <AnswerProse source={source} indexed={indexed} />
              <CitationStrip
                source={source}
                indexed={indexed}
                curated={curated}
              />
              <CitedPapersSection source={source} indexed={indexed} />
              {citationDocumentId &&
              extractCitations(source).length === 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2 text-[0.7rem] text-muted-foreground">
                  <span className="font-medium uppercase tracking-wide">
                    Source trust
                  </span>
                  <CitationChip
                    token={{
                      raw: `[${citationDocumentId.slice(0, 8)}]`,
                      documentId: citationDocumentId,
                      index: null,
                    }}
                    documentId={citationDocumentId}
                    paper={paperLookup(indexed).get(citationDocumentId)}
                    fallback={citationDocumentId}
                  />
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </TooltipProvider>
    </Card>
  );
}
