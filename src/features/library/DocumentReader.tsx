/**
 * Inline document reader for the corpus detail page.
 *
 * Mounts as a sibling of ``CorpusDocumentList`` and watches the ``?doc=``
 * query param. When set:
 *
 * 1. Pulls the R2R document metadata via ``GET /v3/documents/{id}``.
 * 2. Pulls the document's chunks via ``GET /v3/chunks?...`` (R2R supports
 *    a ``filters={"document_id":{"$eq": ...}}`` query) so we can render
 *    body text without re-uploading the markdown.
 * 3. Renders chunks in ``chunk_order`` via the existing ``Prose``
 *    markdown component so KaTeX + GFM keep working.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ExternalLink, Loader2, X } from "lucide-react";

import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Prose } from "@/components/markdown/Prose";
import { cn } from "@/lib/utils";

type R2RChunk = {
  id: string;
  document_id: string;
  text?: string | null;
  metadata?: Record<string, unknown> | null;
};

type R2RChunksResponse = {
  results: R2RChunk[];
  total_entries: number;
};

type R2RDocumentMeta = {
  results?: {
    id: string;
    title?: string | null;
    type?: string | null;
    metadata?: Record<string, unknown> | null;
    created_at?: string | null;
  }[];
};

const _DISPLAY_EXT_RE = /\.(md|txt|pdf|html?|epub|docx?|tex)$/i;

function _displayTitle(raw: string | null | undefined, fallback: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return fallback;
  return trimmed.replace(_DISPLAY_EXT_RE, "");
}

function _externalUrl(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  for (const key of [
    "source_url",
    "external_url",
    "url",
    "open_access_pdf_url",
    "pdf_url",
  ]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const doi = metadata.doi;
  if (typeof doi === "string" && doi.trim()) {
    return `https://doi.org/${doi.trim()}`;
  }
  const arxivId = metadata.arxiv_id;
  if (typeof arxivId === "string" && arxivId.trim()) {
    return `https://arxiv.org/abs/${arxivId.trim()}`;
  }
  return null;
}

async function fetchDocMeta(docId: string): Promise<R2RDocumentMeta["results"][0] | null> {
  const params = new URLSearchParams();
  params.set("ids", docId);
  const raw = await api.get<R2RDocumentMeta>(`/v3/documents?${params.toString()}`);
  const list = raw.results ?? [];
  return list[0] ?? null;
}

async function fetchDocChunks(docId: string): Promise<R2RChunk[]> {
  // R2R's chunks list supports per-doc filtering. We over-fetch (limit=500)
  // because no realistic document we ingest has more than a couple hundred
  // chunks; if we ever get a giant one we can paginate.
  const params = new URLSearchParams();
  params.set("limit", "500");
  params.set("offset", "0");
  // R2R's chunks endpoint takes ``document_id`` directly.
  params.set("document_id", docId);
  const raw = await api.get<R2RChunksResponse>(`/v3/chunks?${params.toString()}`);
  const rows = raw.results ?? [];
  // Sort by chunk_order if present in metadata; fall back to id order.
  return [...rows].sort((a, b) => {
    const ao = Number((a.metadata as { chunk_order?: number } | null)?.chunk_order ?? 0);
    const bo = Number((b.metadata as { chunk_order?: number } | null)?.chunk_order ?? 0);
    if (ao !== bo) return ao - bo;
    return (a.id ?? "").localeCompare(b.id ?? "");
  });
}

export function DocumentReader() {
  const [searchParams, setSearchParams] = useSearchParams();
  const docId = searchParams.get("doc");

  const close = React.useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("doc");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const metaQuery = useQuery({
    queryKey: ["doc-reader", "meta", docId],
    queryFn: () => (docId ? fetchDocMeta(docId) : Promise.resolve(null)),
    enabled: !!docId,
    staleTime: 30_000,
  });

  const chunksQuery = useQuery({
    queryKey: ["doc-reader", "chunks", docId],
    queryFn: () => (docId ? fetchDocChunks(docId) : Promise.resolve([])),
    enabled: !!docId,
    staleTime: 30_000,
  });

  if (!docId) return null;

  const meta = metaQuery.data;
  const chunks = chunksQuery.data ?? [];
  const title = _displayTitle(meta?.title ?? null, `doc ${docId.slice(0, 8)}`);
  const externalUrl = _externalUrl(meta?.metadata ?? null);

  // Concatenate chunks into one markdown blob. Preserves blank lines
  // between chunks so paragraphs don't run into each other.
  const body = chunks
    .map((c) => (c.text ?? "").trim())
    .filter(Boolean)
    .join("\n\n");

  return (
    <section
      className={cn(
        "flex flex-col gap-3 overflow-hidden rounded-md border border-border bg-card/30 p-4",
        "max-h-[70vh]",
      )}
      aria-labelledby="doc-reader-heading"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="doc-reader-heading"
            className="truncate text-base font-semibold tracking-tight"
            title={meta?.title ?? title}
          >
            {title}
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            <span className="font-mono">{docId.slice(0, 8)}</span>
            {chunks.length > 0 ? (
              <>
                {" · "}
                {chunks.length} chunk{chunks.length === 1 ? "" : "s"}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {externalUrl ? (
            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
              <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-3 w-3" />
                Source
              </a>
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            onClick={close}
            aria-label="Close reader"
            className="h-7 w-7"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {chunksQuery.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading document…
        </div>
      ) : chunksQuery.isError ? (
        <p className="rounded border border-red-500/40 bg-red-500/5 p-2 text-xs text-red-300">
          Failed to load chunks:{" "}
          {chunksQuery.error instanceof Error
            ? chunksQuery.error.message
            : String(chunksQuery.error)}
        </p>
      ) : body.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No body text — R2R has the document but no chunks were returned.
        </p>
      ) : (
        <div className="overflow-y-auto pr-2">
          <Prose source={body} />
        </div>
      )}
    </section>
  );
}

export default DocumentReader;
