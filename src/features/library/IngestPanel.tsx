import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  Loader2,
  RefreshCw,
  UploadCloud,
  X,
} from "lucide-react";

import {
  ingestTarget,
  uploadFile,
  useCorpora,
  type IngestResponse,
} from "@/api/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import { classifyTarget } from "./classifyTarget";

const ACCEPTED_FILE_EXTENSIONS = ".pdf,.epub,.txt,.md,.markdown,.tex,.html,.htm";

const ACCEPTED_FILE_EXTENSION_SET: ReadonlySet<string> = new Set(
  ACCEPTED_FILE_EXTENSIONS.split(",").map((ext) => ext.trim().toLowerCase()),
);

// Hard cap to mirror the backend `_MAX_UPLOAD_BYTES` default; reject early
// so the user gets a clear message instead of a 413 from a 500 MB PDF.
const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

type UploadStatus =
  | "queued"
  | "uploading"
  | "ingesting"
  | "done"
  | "error"
  | "skipped";

type UploadRow = {
  id: string;
  file: File;
  filename: string;
  size: number;
  status: UploadStatus;
  progress: number;
  message?: string;
  /** Last successful upload path, kept so retries can re-call ingest only. */
  uploadedPath?: string;
};

type QueueAction =
  | { type: "enqueue"; rows: UploadRow[] }
  | { type: "remove"; id: string }
  | { type: "patch"; id: string; patch: Partial<UploadRow> }
  | { type: "clear-finished" };

function queueReducer(state: UploadRow[], action: QueueAction): UploadRow[] {
  switch (action.type) {
    case "enqueue":
      return [...state, ...action.rows];
    case "remove":
      return state.filter((row) => row.id !== action.id);
    case "patch":
      return state.map((row) =>
        row.id === action.id ? { ...row, ...action.patch } : row,
      );
    case "clear-finished":
      return state.filter(
        (row) => row.status !== "done" && row.status !== "skipped",
      );
    default:
      return state;
  }
}

function makeRowId(): string {
  return `up-${Date.now().toString(36)}-${Math.floor(
    Math.random() * 1e9,
  ).toString(36)}`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function validateFile(file: File): string | null {
  const lowerName = file.name.toLowerCase();
  const dot = lowerName.lastIndexOf(".");
  const ext = dot >= 0 ? lowerName.slice(dot) : "";
  if (!ext || !ACCEPTED_FILE_EXTENSION_SET.has(ext)) {
    return `Unsupported file type${ext ? `: ${ext}` : ""}`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `File exceeds ${formatBytes(MAX_UPLOAD_BYTES)} cap`;
  }
  return null;
}

function statusLabel(status: UploadStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "uploading":
      return "Uploading";
    case "ingesting":
      return "Ingesting";
    case "done":
      return "Done";
    case "error":
      return "Error";
    case "skipped":
      return "Skipped";
  }
}

function StatusIcon({ status }: { status: UploadStatus }) {
  switch (status) {
    case "queued":
      return <UploadCloud className="h-3.5 w-3.5 text-muted-foreground" />;
    case "uploading":
    case "ingesting":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />;
    case "done":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
    case "error":
      return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
    case "skipped":
      return <AlertCircle className="h-3.5 w-3.5 text-amber-400" />;
  }
}

const DEFAULT_CORPUS_VALUE = "__default__";

export type IngestPanelProps = {
  /**
   * When provided, all uploads/pastes are pinned to this corpus and the
   * inline corpus picker is hidden. Used by the corpus detail page where
   * the active corpus is already determined by the URL.
   */
  corpusId?: string;
};

export function IngestPanel({ corpusId }: IngestPanelProps = {}) {
  const { toast } = useToast();
  const [dragActive, setDragActive] = React.useState(false);
  const [pasteValue, setPasteValue] = React.useState("");
  const [queue, dispatch] = React.useReducer(
    queueReducer,
    [] as UploadRow[],
  );
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Corpus picker is only relevant on the library page where the panel
  // floats free of any specific corpus. When `corpusId` is forced we skip
  // fetching the list to keep the panel lean.
  const corporaQuery = useCorpora({ enabled: !corpusId });
  const corporaList = corporaQuery.data ?? [];
  // Pick the most-recently-created corpus as the default selection. The
  // backend already returns the list ordered ``created_at DESC`` so the
  // first entry is the freshest one.
  const defaultPick = corporaList[0]?.id ?? "";
  const [selectedCorpus, setSelectedCorpus] = React.useState<string>(
    DEFAULT_CORPUS_VALUE,
  );

  // Resolve which corpus_id to send for a given upload/paste. The
  // sentinel "default" picks the most-recently-created corpus the
  // server returned (the list is ordered ``created_at DESC``); if no
  // corpora exist yet we fall through to ``undefined`` and let the
  // backend pick.
  const resolveCorpusId = React.useCallback((): string | undefined => {
    if (corpusId) return corpusId;
    if (selectedCorpus === DEFAULT_CORPUS_VALUE) {
      return defaultPick || undefined;
    }
    return selectedCorpus || undefined;
  }, [corpusId, defaultPick, selectedCorpus]);

  const corpusName = React.useCallback(
    (id: string | undefined): string | undefined => {
      if (!id) return undefined;
      return corporaList.find((c) => c.id === id)?.name;
    },
    [corporaList],
  );

  const runRow = React.useCallback(
    async (row: UploadRow) => {
      const targetCorpus = resolveCorpusId();
      try {
        // Upload phase ─ skip if a previous attempt already succeeded
        // (retry-after-ingest-failure path).
        let uploadedPath = row.uploadedPath;
        if (!uploadedPath) {
          dispatch({
            type: "patch",
            id: row.id,
            patch: { status: "uploading", progress: 0 },
          });
          const uploadResp = await uploadFile(row.file, {
            corpus_id: targetCorpus,
            onProgress: (fraction) => {
              dispatch({
                type: "patch",
                id: row.id,
                // Cap the bar at 95% during upload so the visible jump
                // to 100% lines up with the ingest call returning.
                patch: { progress: Math.min(0.95, fraction) },
              });
            },
          });
          uploadedPath = uploadResp.path;
          dispatch({
            type: "patch",
            id: row.id,
            patch: {
              uploadedPath,
              progress: 0.95,
            },
          });
        }

        dispatch({
          type: "patch",
          id: row.id,
          patch: { status: "ingesting" },
        });

        let ingestResp: IngestResponse;
        try {
          ingestResp = await ingestTarget({
            target: `file://${uploadedPath}`,
            corpus_id: targetCorpus,
          });
        } catch (err) {
          // Phase C hasn't wired ``file://`` ingestion yet — surface as a
          // soft "uploaded, ingest deferred" rather than a hard failure.
          ingestResp = {
            ok: false,
            path: uploadedPath,
            error: err instanceof Error ? err.message : "ingest deferred",
          };
        }

        if (ingestResp.ok) {
          dispatch({
            type: "patch",
            id: row.id,
            patch: {
              status: "done",
              progress: 1,
              message: targetCorpus
                ? `Ingested into ${corpusName(targetCorpus) ?? "corpus"}`
                : "Ingested",
            },
          });
        } else {
          dispatch({
            type: "patch",
            id: row.id,
            patch: {
              status: "skipped",
              progress: 1,
              message: ingestResp.error ?? "Upload stored, ingest deferred",
            },
          });
        }
      } catch (err) {
        dispatch({
          type: "patch",
          id: row.id,
          patch: {
            status: "error",
            progress: 0,
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
    },
    [corpusName, resolveCorpusId],
  );

  const handleFiles = React.useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      const newRows: UploadRow[] = [];
      for (const file of arr) {
        const reason = validateFile(file);
        if (reason) {
          toast({
            title: `Skipped ${file.name}`,
            description: reason,
            variant: "error",
          });
          continue;
        }
        newRows.push({
          id: makeRowId(),
          file,
          filename: file.name,
          size: file.size,
          status: "queued",
          progress: 0,
        });
      }
      if (newRows.length === 0) return;
      dispatch({ type: "enqueue", rows: newRows });
      // Kick uploads in parallel — small enough fanout for a typical
      // drag-and-drop, and avoids head-of-line blocking on a 200 MB PDF.
      newRows.forEach((row) => {
        void runRow(row);
      });
    },
    [runRow, toast],
  );

  const retryRow = React.useCallback(
    (id: string) => {
      const row = queue.find((r) => r.id === id);
      if (!row) return;
      dispatch({
        type: "patch",
        id,
        patch: {
          status: "queued",
          progress: 0,
          message: undefined,
        },
      });
      void runRow({
        ...row,
        status: "queued",
        progress: 0,
        message: undefined,
      });
    },
    [queue, runRow],
  );

  const ingestPasted = useMutation<IngestResponse, Error, string>({
    mutationFn: (input: string) =>
      ingestTarget({ target: input, corpus_id: resolveCorpusId() }),
    onSuccess: (resp, input) => {
      const ok = resp.ok !== false;
      const targetCorpus = resolveCorpusId();
      const corpusLabel = targetCorpus
        ? ` into ${corpusName(targetCorpus) ?? "corpus"}`
        : "";
      toast({
        title: ok ? `Ingestion queued${corpusLabel}` : "Ingestion not yet wired",
        description: resp.error ?? `target: ${input}`,
        variant: ok ? "success" : "info",
      });
      setPasteValue("");
    },
    onError: (err) => {
      toast({
        title: "Ingest failed",
        description: err.message,
        variant: "error",
      });
    },
  });

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (event.dataTransfer.files?.length) {
      handleFiles(event.dataTransfer.files);
    }
  };

  const onPasteSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = classifyTarget(pasteValue);
    if (!target) return;
    ingestPasted.mutate(target);
  };

  const totalCount = queue.length;
  const finishedCount = queue.filter(
    (row) => row.status === "done" || row.status === "skipped",
  ).length;

  return (
    <div className="flex flex-col gap-3">
      {!corpusId ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Target corpus</span>
          <select
            value={selectedCorpus}
            onChange={(e) => setSelectedCorpus(e.target.value)}
            disabled={corporaQuery.isLoading}
            className={cn(
              "min-w-[10rem] rounded-md border border-border bg-background px-2 py-1 text-xs",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            aria-label="Pick the destination corpus for new uploads"
          >
            <option value={DEFAULT_CORPUS_VALUE}>
              {defaultPick
                ? `Default (${corpusName(defaultPick) ?? "most recent"})`
                : "Default (no corpus)"}
            </option>
            {corporaList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {(c.scope ?? "research").toString()}
              </option>
            ))}
          </select>
          {selectedCorpus === DEFAULT_CORPUS_VALUE && defaultPick ? (
            <span className="text-muted-foreground">
              Falls back to the most recently created corpus.
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        <div
          onDrop={onDrop}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border bg-card/30 hover:border-primary/50",
          )}
        >
          <UploadCloud className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm">
            <span className="font-medium">Drop files</span>{" "}
            <span className="text-muted-foreground">
              (PDF, EPUB, plain text) or
            </span>{" "}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-primary underline-offset-2 hover:underline"
            >
              browse
            </button>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Files are saved to <code>/var/lib/dr-uploads</code> and queued for
            ingestion. Max {formatBytes(MAX_UPLOAD_BYTES)} each.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_EXTENSIONS}
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) {
                handleFiles(event.target.files);
                event.target.value = "";
              }
            }}
          />
        </div>

        <form
          onSubmit={onPasteSubmit}
          className="flex flex-col gap-2 rounded-lg border border-border bg-card/30 p-4"
        >
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Paste a URL, DOI, or arXiv id
          </label>
          <div className="flex items-center gap-2">
            <Input
              value={pasteValue}
              onChange={(e) => setPasteValue(e.target.value)}
              placeholder="https://arxiv.org/abs/2401.00001"
            />
            <Button
              type="submit"
              size="icon"
              variant="secondary"
              disabled={ingestPasted.isPending || !pasteValue.trim()}
              aria-label="Ingest pasted target"
            >
              {ingestPasted.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ClipboardPaste className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Routed by prefix: <code>arxiv:</code>, <code>doi:</code>, or{" "}
            <code>url:</code>.
          </p>
        </form>
      </div>

      {totalCount > 0 ? (
        <div className="rounded-lg border border-border bg-card/40">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Upload queue
            </span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">
                {finishedCount} of {totalCount} done
              </span>
              {finishedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => dispatch({ type: "clear-finished" })}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Clear finished
                </button>
              ) : null}
            </div>
          </div>
          <ul className="divide-y divide-border">
            {queue.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 px-3 py-2 text-xs"
              >
                <StatusIcon status={row.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{row.filename}</span>
                    <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                      {formatBytes(row.size)}
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted/40">
                    <div
                      className={cn(
                        "h-full transition-all",
                        row.status === "error"
                          ? "bg-red-500"
                          : row.status === "skipped"
                            ? "bg-amber-500"
                            : row.status === "done"
                              ? "bg-emerald-500"
                              : "bg-sky-500",
                      )}
                      style={{
                        width: `${Math.round(
                          Math.min(1, Math.max(0, row.progress)) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>{statusLabel(row.status)}</span>
                    {row.message ? (
                      <span
                        className={cn(
                          "truncate",
                          row.status === "error"
                            ? "text-red-300"
                            : row.status === "skipped"
                              ? "text-amber-300"
                              : "",
                        )}
                        title={row.message}
                      >
                        {row.message}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {row.status === "error" ? (
                    <button
                      type="button"
                      onClick={() => retryRow(row.id)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label={`Retry ${row.filename}`}
                      title="Retry"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {row.status === "done" ||
                  row.status === "skipped" ||
                  row.status === "error" ? (
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "remove", id: row.id })}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label={`Remove ${row.filename}`}
                      title="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
