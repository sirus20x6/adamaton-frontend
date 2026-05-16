import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  Copy,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import {
  useDeleteCorpus,
  useUpdateCorpus,
  type Corpus,
} from "@/api/library";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn, formatRelative } from "@/lib/utils";

const SCOPE_STYLES: Record<string, string> = {
  research: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  book: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  mixed: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  experiments: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
};

function ScopeChip({ scope }: { scope: string | null | undefined }) {
  const key = (scope ?? "research").toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        SCOPE_STYLES[key] ?? "border-border bg-card text-muted-foreground",
      )}
    >
      {key}
    </span>
  );
}

export type CorpusDetailProps = {
  corpus: Corpus;
};

export function CorpusDetail({ corpus }: CorpusDetailProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(corpus.name);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setRenameValue(corpus.name);
  }, [corpus.name]);

  const remove = useDeleteCorpus({
    onSuccess: () => {
      toast({
        title: "Corpus deleted",
        description: corpus.name,
        variant: "success",
      });
      navigate("/library");
    },
    onError: (err) => {
      toast({
        title: "Delete failed",
        description: err.message,
        variant: "error",
      });
    },
  });

  const rename = useUpdateCorpus(corpus.id, {
    onSuccess: (updated) => {
      toast({
        title: "Renamed",
        description: updated.name,
        variant: "success",
      });
      setRenameOpen(false);
    },
    onError: (err) => {
      toast({
        title: "Rename failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    },
  });

  const onRenameSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === corpus.name) {
      setRenameOpen(false);
      return;
    }
    rename.mutate({ name: trimmed });
  };

  const copyId = async () => {
    if (typeof window === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(corpus.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be unavailable; the id is still shown in the page.
    }
  };

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
            Corpus
          </p>
          <h1 className="line-clamp-2 text-2xl font-semibold leading-tight tracking-tight">
            {corpus.name}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ScopeChip scope={corpus.scope ?? "research"} />
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md",
                "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              aria-label={`Actions for ${corpus.name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setRenameValue(corpus.name);
                  setRenameOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
                <span>Rename…</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setDeleteOpen(true);
                }}
                className="text-red-300 focus:text-red-200"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete…</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <dt className="uppercase tracking-wide">id</dt>
          <dd className="flex items-center gap-1">
            <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px]">
              {corpus.id.slice(0, 8)}…
            </code>
            <button
              type="button"
              onClick={copyId}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Copy corpus id"
              title={corpus.id}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="uppercase tracking-wide">created</dt>
          <dd>{formatRelative(corpus.created_at)}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="uppercase tracking-wide">scope</dt>
          <dd>{(corpus.scope ?? "research").toString().toLowerCase()}</dd>
        </div>
        {typeof corpus.document_count === "number" ? (
          <div className="flex items-center gap-1.5">
            <dt className="uppercase tracking-wide">docs</dt>
            <dd className="font-mono tabular-nums">{corpus.document_count}</dd>
          </div>
        ) : null}
      </dl>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <form onSubmit={onRenameSubmit}>
            <DialogHeader>
              <DialogTitle>Rename corpus</DialogTitle>
              <DialogDescription>
                Pick a new name for{" "}
                <span className="font-medium text-foreground">
                  {corpus.name}
                </span>
                .
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
                aria-label="New corpus name"
                placeholder="New corpus name"
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRenameOpen(false)}
                disabled={rename.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  rename.isPending ||
                  !renameValue.trim() ||
                  renameValue.trim() === corpus.name
                }
              >
                {rename.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete corpus</DialogTitle>
            <DialogDescription>
              This soft-deletes{" "}
              <span className="font-medium text-foreground">
                {corpus.name}
              </span>
              . Documents and associated artefacts stay in the database — a
              future Restore action can recover the corpus.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(false)}
              disabled={remove.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => remove.mutate(corpus.id)}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Deleting…" : "Delete corpus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
