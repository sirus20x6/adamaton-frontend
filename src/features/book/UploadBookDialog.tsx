/**
 * Two-step upload dialog for the book pipeline:
 *
 *   1. POST /platform/sources/upload      — stash the bytes server-side.
 *   2. POST /platform/books/              — analyze the file (synchronous).
 *
 * Surfaced from `BookWorkspace`'s empty/missing state so users can drop
 * an EPUB/PDF/TXT and land on `/book/<id>` without round-tripping
 * through the library page.
 */

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { BookOpen, Loader2, UploadCloud } from "lucide-react";

import { analyzeBook, type AnalyzeBookResponse } from "@/api/books";
import { uploadFile, useCorpora } from "@/api/library";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const ACCEPTED_BOOK_EXTENSIONS = ".epub,.pdf,.txt,.md";
const ACCEPTED_BOOK_EXTENSION_SET: ReadonlySet<string> = new Set(
  ACCEPTED_BOOK_EXTENSIONS.split(",").map((ext) => ext.trim().toLowerCase()),
);
const MAX_BOOK_BYTES = 256 * 1024 * 1024;

const DEFAULT_CORPUS_VALUE = "__default__";

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

function validateBook(file: File): string | null {
  const lower = file.name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : "";
  if (!ext || !ACCEPTED_BOOK_EXTENSION_SET.has(ext)) {
    return `Unsupported book type${ext ? `: ${ext}` : ""}`;
  }
  if (file.size > MAX_BOOK_BYTES) {
    return `File exceeds ${formatBytes(MAX_BOOK_BYTES)} cap`;
  }
  return null;
}

type UploadBookDialogProps = {
  /** Optional custom trigger; falls back to a sensible default button. */
  trigger?: React.ReactNode;
  /** Pre-pick a corpus (used when invoked from inside a book corpus). */
  defaultCorpusId?: string;
  /** Open state — controlled mode lets parents reuse the dialog. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function UploadBookDialog({
  trigger,
  defaultCorpusId,
  open: controlledOpen,
  onOpenChange,
}: UploadBookDialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  const [file, setFile] = React.useState<File | null>(null);
  const [validation, setValidation] = React.useState<string | null>(null);
  const [corpusValue, setCorpusValue] = React.useState<string>(
    defaultCorpusId ?? DEFAULT_CORPUS_VALUE,
  );
  const [phase, setPhase] = React.useState<
    "idle" | "uploading" | "analyzing"
  >("idle");
  const [progress, setProgress] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (defaultCorpusId) setCorpusValue(defaultCorpusId);
  }, [defaultCorpusId]);

  // Filter to book-scoped corpora plus mixed/research as a courtesy. The
  // backend creates a default ``Books`` corpus when none is passed.
  const corporaQuery = useCorpora({ enabled: open });
  const bookCorpora = React.useMemo(() => {
    const list = corporaQuery.data ?? [];
    return list.filter((c) => (c.scope ?? "research").toLowerCase() === "book");
  }, [corporaQuery.data]);

  const resolveCorpusId = (): string | undefined => {
    if (corpusValue === DEFAULT_CORPUS_VALUE || !corpusValue) return undefined;
    return corpusValue;
  };

  const reset = React.useCallback(() => {
    setFile(null);
    setValidation(null);
    setPhase("idle");
    setProgress(0);
  }, []);

  const ingest = useMutation<AnalyzeBookResponse, Error, void>({
    mutationFn: async () => {
      if (!file) throw new Error("no file selected");
      setPhase("uploading");
      setProgress(0);
      const upload = await uploadFile(file, {
        corpus_id: resolveCorpusId(),
        onProgress: (frac) => setProgress(Math.min(0.95, frac)),
      });
      setProgress(0.95);
      setPhase("analyzing");
      return analyzeBook({
        path: upload.path,
        corpus_id: resolveCorpusId(),
      });
    },
    onSuccess: (result) => {
      setProgress(1);
      const bookId = result.book_id;
      toast({
        title: "Book ingested",
        description: `${file?.name ?? "Book"} → ${bookId.slice(0, 8)}`,
        variant: "success",
      });
      setOpen(false);
      reset();
      if (bookId) {
        navigate(`/book/${encodeURIComponent(bookId)}`);
      }
    },
    onError: (err) => {
      setPhase("idle");
      setProgress(0);
      toast({
        title: "Book ingest failed",
        description: err.message,
        variant: "error",
      });
    },
  });

  const onFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const next = Array.from(files)[0];
    if (!next) return;
    const reason = validateBook(next);
    if (reason) {
      setValidation(reason);
      setFile(null);
      return;
    }
    setValidation(null);
    setFile(next);
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || ingest.isPending) return;
    ingest.mutate();
  };

  const isPending = ingest.isPending || phase !== "idle";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isPending) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button size="sm" type="button">
            <UploadCloud className="h-3.5 w-3.5" />
            Upload book
          </Button>
        </DialogTrigger>
      )}

      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Upload a book
            </DialogTitle>
            <DialogDescription>
              EPUB, PDF, plain text, or markdown. The server runs the chapter
              splitter and three extractors before opening the workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex w-full flex-col items-center gap-2 rounded-md border-2 border-dashed p-6 text-center transition-colors",
                "border-border hover:border-primary/50",
                file ? "border-primary/50 bg-primary/5" : "bg-card/30",
              )}
              disabled={isPending}
            >
              <UploadCloud className="h-5 w-5 text-muted-foreground" />
              {file ? (
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-sm font-medium">{file.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatBytes(file.size)}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-sm font-medium">Click to choose</span>
                  <span className="text-[11px] text-muted-foreground">
                    {ACCEPTED_BOOK_EXTENSIONS.split(",").join(" · ")} · max{" "}
                    {formatBytes(MAX_BOOK_BYTES)}
                  </span>
                </div>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_BOOK_EXTENSIONS}
              className="hidden"
              onChange={(event) => {
                onFiles(event.target.files);
                event.target.value = "";
              }}
            />
            {validation ? (
              <p className="text-xs text-red-300">{validation}</p>
            ) : null}

            {!defaultCorpusId ? (
              <label className="block text-xs">
                <span className="mb-1 block font-medium uppercase tracking-wide text-muted-foreground">
                  Book corpus
                </span>
                <select
                  value={corpusValue}
                  onChange={(e) => setCorpusValue(e.target.value)}
                  disabled={isPending || corporaQuery.isLoading}
                  className={cn(
                    "w-full rounded-md border border-border bg-background px-2 py-1.5",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <option value={DEFAULT_CORPUS_VALUE}>
                    Default (auto-pick &quot;Books&quot;)
                  </option>
                  {bookCorpora.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Server creates a single book corpus if no others exist.
                </span>
              </label>
            ) : null}

            {isPending ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {phase === "uploading"
                      ? "Uploading…"
                      : phase === "analyzing"
                        ? "Analyzing chapters, characters, themes, beats…"
                        : "Working…"}
                  </span>
                  <span className="font-mono tabular-nums">
                    {Math.round(progress * 100)}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full bg-sky-500 transition-all"
                    style={{
                      width: `${Math.round(
                        Math.min(1, Math.max(0, progress)) * 100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!file || isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {phase === "analyzing" ? "Analyzing…" : "Uploading…"}
                </>
              ) : (
                <>
                  <UploadCloud className="h-3.5 w-3.5" />
                  Upload &amp; analyze
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default UploadBookDialog;
