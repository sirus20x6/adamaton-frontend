import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowRight,
  ClipboardPaste,
  Loader2,
  SearchCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import {
  ingestTarget,
  uploadFile,
  type IngestResponse,
} from "@/api/library";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import { classifyTarget } from "./classifyTarget";

export { classifyTarget };

const ACCEPTED_FILE_EXTENSIONS = ".pdf,.epub,.txt,.md,.markdown,.tex,.html,.htm";

const ACCEPTED_FILE_EXTENSION_SET: ReadonlySet<string> = new Set(
  ACCEPTED_FILE_EXTENSIONS.split(",").map((ext) => ext.trim().toLowerCase()),
);

const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

function validateFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : "";
  if (!ext || !ACCEPTED_FILE_EXTENSION_SET.has(ext)) {
    return `Unsupported file type${ext ? `: ${ext}` : ""}`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `File exceeds 256 MB cap`;
  }
  return null;
}

export type CorpusEmptyStateProps = {
  corpusId: string;
  className?: string;
};

export function CorpusEmptyState({
  corpusId,
  className,
}: CorpusEmptyStateProps) {
  const { toast } = useToast();
  const [paste, setPaste] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const ingestPasted = useMutation<IngestResponse, Error, string>({
    mutationFn: (target) => ingestTarget({ target, corpus_id: corpusId }),
    onSuccess: (resp, target) => {
      const ok = resp.ok !== false;
      toast({
        title: ok ? "Ingestion queued into corpus" : "Ingestion not yet wired",
        description: resp.error ?? `target: ${target}`,
        variant: ok ? "success" : "info",
      });
      setPaste("");
    },
    onError: (err) => {
      toast({
        title: "Ingest failed",
        description: err.message,
        variant: "error",
      });
    },
  });

  const uploadAndIngest = useMutation<IngestResponse, Error, File>({
    mutationFn: async (file) => {
      const upload = await uploadFile(file, { corpus_id: corpusId });
      try {
        return await ingestTarget({
          target: `file://${upload.path}`,
          corpus_id: corpusId,
        });
      } catch (err) {
        return {
          ok: false,
          path: upload.path,
          error: err instanceof Error ? err.message : "ingest deferred",
        } satisfies IngestResponse;
      }
    },
    onSuccess: (resp, file) => {
      toast({
        title: "Uploaded",
        description: resp.ok
          ? `${file.name} ingested into corpus`
          : `${file.name} (ingest deferred)`,
        variant: resp.ok ? "success" : "info",
      });
    },
    onError: (err, file) => {
      toast({
        title: `Upload failed: ${file.name}`,
        description: err.message,
        variant: "error",
      });
    },
  });

  const handleFiles = React.useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      for (const f of arr) {
        const reason = validateFile(f);
        if (reason) {
          toast({
            title: `Skipped ${f.name}`,
            description: reason,
            variant: "error",
          });
          continue;
        }
        uploadAndIngest.mutate(f);
      }
    },
    [toast, uploadAndIngest],
  );

  const onPasteSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = classifyTarget(paste);
    if (!target) return;
    ingestPasted.mutate(target);
  };

  return (
    <Card className={cn("border-dashed", className)}>
      <CardContent className="flex flex-col gap-5 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight">
              No documents in this corpus yet
            </h3>
            <p className="text-xs text-muted-foreground">
              Drop a paper in by id, upload a file, or wire results up from
              search. Ingestion runs in the background.
            </p>
          </div>
        </div>

        <ol className="grid gap-3 md:grid-cols-3">
          <li className="flex flex-col gap-2 rounded-md border border-border bg-card/40 p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <ClipboardPaste className="h-3.5 w-3.5" />
              <span>1. Paste</span>
            </div>
            <p className="text-xs text-muted-foreground">
              arXiv id, DOI, or full URL. We pick the right adapter from the
              prefix.
            </p>
            <form
              onSubmit={onPasteSubmit}
              className="mt-auto flex items-center gap-2"
            >
              <Input
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="2401.00001 · 10.1038/nature… · https://"
                aria-label="arXiv id, DOI, or URL"
                className="h-8 text-xs"
              />
              <Button
                type="submit"
                size="icon"
                variant="secondary"
                disabled={ingestPasted.isPending || !paste.trim()}
                aria-label="Ingest target"
              >
                {ingestPasted.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
              </Button>
            </form>
          </li>

          <li className="flex flex-col gap-2 rounded-md border border-border bg-card/40 p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <UploadCloud className="h-3.5 w-3.5" />
              <span>2. Upload</span>
            </div>
            <p className="text-xs text-muted-foreground">
              PDF, EPUB, plain text, or markdown. Files land in
              {" "}
              <code className="rounded bg-muted px-1 text-[10px]">
                /var/lib/dr-uploads
              </code>
              .
            </p>
            <div className="mt-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadAndIngest.isPending}
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
              >
                {uploadAndIngest.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-3.5 w-3.5" />
                    Choose files
                  </>
                )}
              </Button>
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
          </li>

          <li className="flex flex-col gap-2 rounded-md border border-border bg-card/40 p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <SearchCheck className="h-3.5 w-3.5" />
              <span>3. Curate</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Run a research query and pick which results join this corpus.
            </p>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="mt-auto w-full"
            >
              <Link to={`/?corpus=${encodeURIComponent(corpusId)}`}>
                <SearchCheck className="h-3.5 w-3.5" />
                Open search
              </Link>
            </Button>
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}
