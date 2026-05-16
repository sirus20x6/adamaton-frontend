import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  Info,
  Loader2,
} from "lucide-react";

import {
  useCorpusDocuments,
  type CorpusDocumentRow,
} from "@/api/library";
import { api } from "@/api/client";
import { TrustBadge } from "@/features/research/TrustBadge";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, formatRelative } from "@/lib/utils";

import { CorpusEmptyState } from "./CorpusEmptyState";

type SortKey = "title" | "kind" | "trust" | "stage" | "ingested";
type SortDir = "asc" | "desc";

type TrustListResponse = {
  items?: Array<{
    document_id: string;
    stage1_score?: number | null;
    stage3_score?: number | null;
  }>;
};

type DocRow = CorpusDocumentRow & {
  trust?: number;
  lastStage?: string;
  /** UI-friendly title with the file extension stripped. */
  display_title: string;
  /** Alias for created_at the existing sort code expects. */
  created_at?: string | null;
  /** Alias used by lastStageFrom. */
  id: string;
};

// Strip recognised file extensions from a doc title so the UI doesn't
// show "Foo.md". The R2R-side title is suffixed with .md by ingest_task
// to satisfy R2R's filename->DocumentType detector; we don't want that
// detail bleeding through the chrome.
const _DISPLAY_EXT_RE = /\.(md|txt|pdf|html?|epub|docx?|tex)$/i;
function _displayTitle(raw: string | null | undefined, fallback: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return fallback;
  return trimmed.replace(_DISPLAY_EXT_RE, "");
}

const COLUMNS: ReadonlyArray<{
  key: SortKey;
  label: string;
  className?: string;
  hint?: string;
}> = [
  { key: "title", label: "Title", className: "min-w-[14rem]" },
  { key: "kind", label: "Kind" },
  {
    key: "trust",
    label: "Trust",
    hint:
      "Trust score on a 0–1 scale. Stage-3 (post-graph) supersedes Stage-1 when both are available; below 0.5 is low, 0.5–0.8 medium, ≥0.8 high.",
  },
  { key: "stage", label: "Last stage" },
  { key: "ingested", label: "Ingested" },
];

function sourceKindFrom(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  const direct = metadata.source_kind ?? metadata.sourceKind;
  if (typeof direct === "string" && direct.length > 0) return direct;
  return null;
}

function lastStageFrom(row: CorpusDocumentRow): string {
  const status = row.ingestion_status;
  if (typeof status === "string" && status.length > 0) {
    return status;
  }
  return "—";
}

/**
 * One-shot fetch for the trust table. The backend serves the whole list
 * (limit=500 covers any realistic corpus) and we index it in-memory; this
 * avoids fanning out N fetches across N rows in the document table.
 *
 * 404/501 are tolerated — the column simply renders n/a badges.
 */
async function fetchTrustIndex(): Promise<Map<string, number>> {
  try {
    const resp = await api.get<TrustListResponse>("/platform/trust/?limit=500");
    const items = resp.items ?? [];
    const map = new Map<string, number>();
    for (const row of items) {
      // Stage-3 (post-graph) supersedes stage-1 if available.
      const score = row.stage3_score ?? row.stage1_score ?? null;
      if (typeof score === "number" && row.document_id) {
        map.set(row.document_id, score);
      }
    }
    return map;
  } catch {
    return new Map<string, number>();
  }
}

function compareDocs(
  a: DocRow,
  b: DocRow,
  key: SortKey,
  dir: SortDir,
): number {
  const sign = dir === "asc" ? 1 : -1;
  const at = (row: DocRow): string | number => {
    switch (key) {
      case "title":
        return (row.display_title ?? "").toLowerCase();
      case "kind":
        return (sourceKindFrom(row.metadata) ?? row.type ?? "").toLowerCase();
      case "trust":
        return typeof row.trust === "number" ? row.trust : -Infinity;
      case "stage":
        return (row.lastStage ?? "").toLowerCase();
      case "ingested": {
        const ts = row.created_at ? Date.parse(row.created_at) : 0;
        return Number.isNaN(ts) ? 0 : ts;
      }
    }
  };
  const av = at(a);
  const bv = at(b);
  if (typeof av === "number" && typeof bv === "number") {
    return (av - bv) * sign;
  }
  return String(av).localeCompare(String(bv)) * sign;
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  hint,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 text-left text-xs font-medium uppercase tracking-wide",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
      {hint ? (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground"
                aria-label={`About ${label}`}
                tabIndex={-1}
              >
                <Info className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              align="start"
              className="max-w-xs leading-relaxed"
            >
              {hint}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </span>
  );
}

export type CorpusDocumentListProps = {
  corpusId: string;
};

export function CorpusDocumentList({ corpusId }: CorpusDocumentListProps) {
  // Was: useR2RDocuments — that hits /v3/documents and returns the WHOLE
  // R2R index regardless of corpus, so every corpus page showed all
  // 1k+ docs. Now we go through the corpus-scoped endpoint backed by
  // platform.corpus_documents.
  const docsQuery = useCorpusDocuments(corpusId, { limit: 50, offset: 0 });
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDocId = searchParams.get("doc");

  // Toggle ?doc= when a row is clicked. The Document page mounts a
  // <DocumentReader> next to the table that watches this search param,
  // so a click here opens / closes the reader without a full navigation.
  const onSelectDoc = React.useCallback(
    (docId: string) => {
      const next = new URLSearchParams(searchParams);
      if (next.get("doc") === docId) {
        next.delete("doc");
      } else {
        next.set("doc", docId);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );
  const trustQuery = useQuery<Map<string, number>>({
    queryKey: ["library", "trust", "index"],
    queryFn: fetchTrustIndex,
    staleTime: 30_000,
    retry: false,
  });

  const [sortKey, setSortKey] = React.useState<SortKey>("ingested");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const rows = React.useMemo<DocRow[]>(() => {
    const docs = docsQuery.data?.documents ?? [];
    const trustMap = trustQuery.data ?? new Map<string, number>();
    return docs.map((doc) => ({
      ...doc,
      // Sort and detail logic expects ``id`` and ``created_at``; map
      // them off the corpus-document row's named fields.
      id: doc.document_id,
      created_at: doc.document_created_at ?? doc.added_at ?? null,
      display_title: _displayTitle(doc.title, doc.document_id),
      trust: trustMap.get(doc.document_id),
      lastStage: lastStageFrom(doc),
    }));
  }, [docsQuery.data, trustQuery.data]);

  const sorted = React.useMemo(() => {
    const next = [...rows];
    next.sort((a, b) => compareDocs(a, b, sortKey, sortDir));
    return next;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "title" || key === "kind" ? "asc" : "desc");
    }
  };

  if (docsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-card/30 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading documents…
      </div>
    );
  }

  if (docsQuery.isError) {
    return (
      <div className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300">
        Failed to load documents:{" "}
        {docsQuery.error instanceof Error
          ? docsQuery.error.message
          : String(docsQuery.error)}
      </div>
    );
  }

  if (sorted.length === 0) {
    return <CorpusEmptyState corpusId={corpusId} />;
  }

  const total = docsQuery.data?.total ?? sorted.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/35 px-3 py-2 text-xs text-muted-foreground">
        <span>
          Corpus documents
        </span>
        <span className="font-mono tabular-nums">
          {sorted.length}/{total}
        </span>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card/40">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="border-b border-border">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn("px-3 py-2 text-left", col.className)}
                >
                  <SortHeader
                    label={col.label}
                    active={sortKey === col.key}
                    dir={sortDir}
                    onClick={() => toggleSort(col.key)}
                    hint={col.hint}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((row) => {
              const kind = sourceKindFrom(row.metadata) ?? row.type ?? "—";
              const selected = selectedDocId === row.id;
              return (
                <tr
                  key={row.id}
                  onClick={() => onSelectDoc(row.id)}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-muted/30",
                    selected && "bg-primary/10 ring-1 ring-inset ring-primary/40",
                  )}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectDoc(row.id);
                    }
                  }}
                  aria-pressed={selected}
                  aria-label={`Open ${row.display_title}`}
                >
                  <td className="max-w-md px-3 py-2 align-top">
                    <div className="flex flex-col gap-0.5">
                      <span className="truncate font-medium">
                        {row.display_title || `doc ${row.id.slice(0, 8)}`}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {row.id.slice(0, 8)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {kind === "—" ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <Badge variant="outline" className="font-mono text-[10px] normal-case tracking-normal">
                        {kind}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <TrustBadge score={row.trust} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <StageBadge stage={row.lastStage ?? "—"} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(row.created_at ?? null)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {trustQuery.isError ? (
        <p className="text-[11px] text-muted-foreground">
          Trust scores unavailable — column shows n/a until the trust service
          responds.
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <a
          href="/v3/documents"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
          Raw R2R index
        </a>
      </div>
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const lower = stage.toLowerCase();
  const variant: "success" | "warning" | "danger" | "outline" =
    lower === "success" || lower === "completed" || lower === "indexed"
      ? "success"
      : lower === "failed" || lower === "error"
        ? "danger"
        : lower === "pending" || lower === "processing"
          ? "warning"
          : "outline";
  return (
    <Badge variant={variant} className="font-mono text-[10px] normal-case tracking-normal">
      {stage}
    </Badge>
  );
}
