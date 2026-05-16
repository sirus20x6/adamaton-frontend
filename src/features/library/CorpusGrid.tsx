import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckSquare,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Pencil,
  Square,
  Trash2,
  X,
} from "lucide-react";

import {
  deleteCorpus,
  updateCorpus,
  type Corpus,
} from "@/api/library";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

type CorpusGridProps = {
  corpora: Corpus[];
};

const SCOPE_STYLES: Record<string, string> = {
  research: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  book: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  mixed: "bg-violet-500/10 text-violet-300 border-violet-500/30",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

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

type SelectionState = {
  selectionMode: boolean;
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
};

const SelectionContext = React.createContext<SelectionState | null>(null);

function useSelection(): SelectionState | null {
  return React.useContext(SelectionContext);
}

type RenameDialogState = {
  corpus: Corpus | null;
  open: boolean;
};

const RenameDispatchContext = React.createContext<
  ((corpus: Corpus) => void) | null
>(null);

export function CorpusCard({ corpus }: { corpus: Corpus }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const selection = useSelection();
  const openRename = React.useContext(RenameDispatchContext);

  const isSelected = selection?.selected.has(corpus.id) ?? false;
  const inSelectionMode = Boolean(selection?.selectionMode);

  const remove = useMutation({
    mutationFn: () => deleteCorpus(corpus.id),
    onSuccess: () => {
      toast({
        title: "Corpus deleted",
        description: corpus.name,
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["library", "corpora"] });
      queryClient.invalidateQueries({ queryKey: ["corpora"] });
    },
    onError: (err) => {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    },
  });

  const cardInner = (
    <CardContent className="flex flex-1 flex-col gap-3 p-5 pt-5">
      <div className="flex items-start justify-between gap-2">
        <ScopeChip scope={corpus.scope ?? "research"} />
        <span className="text-[11px] text-muted-foreground">
          {corpus.document_count} doc{corpus.document_count === 1 ? "" : "s"}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold tracking-tight">
          {corpus.name}
        </h3>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {formatDate(corpus.created_at)}
        </p>
      </div>
    </CardContent>
  );

  return (
    <Card
      className={cn(
        "group relative flex h-full flex-col overflow-hidden transition-colors",
        isSelected
          ? "border-primary/60 ring-2 ring-primary/30"
          : "hover:border-primary/40",
      )}
    >
      {inSelectionMode ? (
        <button
          type="button"
          onClick={() => selection?.toggle(corpus.id)}
          className="flex flex-1 flex-col text-left"
          aria-pressed={isSelected}
          aria-label={`${isSelected ? "Deselect" : "Select"} ${corpus.name}`}
        >
          {cardInner}
          <span className="pointer-events-none absolute left-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-md border border-border bg-background/80">
            {isSelected ? (
              <CheckSquare className="h-3.5 w-3.5 text-primary" />
            ) : (
              <Square className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </span>
        </button>
      ) : (
        <Link
          to={`/library/${encodeURIComponent(corpus.id)}`}
          className="flex flex-1 flex-col"
        >
          {cardInner}
        </Link>
      )}

      {!inSelectionMode ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md",
              "text-muted-foreground opacity-0 transition-opacity",
              "group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground",
              "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            aria-label={`Actions for ${corpus.name}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={`/library/${encodeURIComponent(corpus.id)}`}>
                <FolderOpen className="h-4 w-4" />
                <span>Open</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                openRename?.(corpus);
              }}
            >
              <Pencil className="h-4 w-4" />
              <span>Rename</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                if (
                  window.confirm(
                    `Delete corpus "${corpus.name}"? This is reversible.`,
                  )
                ) {
                  remove.mutate();
                }
              }}
              className="text-red-300 focus:text-red-200"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </Card>
  );
}

function RenameDialog({
  state,
  onClose,
}: {
  state: RenameDialogState;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const corpus = state.corpus;
  const [value, setValue] = React.useState(corpus?.name ?? "");

  React.useEffect(() => {
    setValue(corpus?.name ?? "");
  }, [corpus?.id, corpus?.name]);

  const rename = useMutation({
    mutationFn: async (name: string) => {
      if (!corpus) throw new Error("no corpus selected");
      return updateCorpus(corpus.id, { name });
    },
    onSuccess: (updated) => {
      toast({
        title: "Renamed",
        description: updated.name,
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["library", "corpora"] });
      queryClient.invalidateQueries({ queryKey: ["corpora"] });
      onClose();
    },
    onError: (err) => {
      toast({
        title: "Rename failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    },
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!corpus || !trimmed || trimmed === corpus.name) {
      onClose();
      return;
    }
    rename.mutate(trimmed);
  };

  return (
    <Dialog
      open={state.open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Rename corpus</DialogTitle>
            <DialogDescription>
              Pick a new name for{" "}
              <span className="font-medium text-foreground">
                {corpus?.name}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
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
              onClick={onClose}
              disabled={rename.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={
                rename.isPending ||
                !value.trim() ||
                value.trim() === corpus?.name
              }
            >
              {rename.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BulkDeleteDialog({
  open,
  selected,
  corporaById,
  onClose,
  onCleared,
}: {
  open: boolean;
  selected: ReadonlySet<string>;
  corporaById: Map<string, Corpus>;
  onClose: () => void;
  onCleared: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [running, setRunning] = React.useState(false);
  const [doneCount, setDoneCount] = React.useState(0);
  const [errors, setErrors] = React.useState<Array<{ id: string; message: string }>>(
    [],
  );

  const ids = React.useMemo(() => Array.from(selected), [selected]);

  React.useEffect(() => {
    if (!open) {
      setRunning(false);
      setDoneCount(0);
      setErrors([]);
    }
  }, [open]);

  const runDelete = async () => {
    setRunning(true);
    setDoneCount(0);
    setErrors([]);
    let succeeded = 0;
    const failures: Array<{ id: string; message: string }> = [];
    for (const id of ids) {
      try {
        await deleteCorpus(id);
        succeeded += 1;
        setDoneCount((c) => c + 1);
      } catch (err) {
        failures.push({
          id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    setErrors(failures);
    setRunning(false);
    queryClient.invalidateQueries({ queryKey: ["library", "corpora"] });
    queryClient.invalidateQueries({ queryKey: ["corpora"] });
    if (failures.length === 0) {
      toast({
        title: `${succeeded} corpora deleted`,
        variant: "success",
      });
      onCleared();
      onClose();
    } else {
      toast({
        title: `${failures.length} delete${failures.length === 1 ? "" : "s"} failed`,
        description: `${succeeded} succeeded, ${failures.length} failed`,
        variant: "error",
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Block close while a delete sweep is running so the user
        // doesn't lose the in-progress dialog by mis-clicking.
        if (!o && !running) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Delete {ids.length} corpus{ids.length === 1 ? "" : "es"}
          </DialogTitle>
          <DialogDescription>
            Soft-deletes the selected corpora — documents stay in the database
            for a future Restore action.
          </DialogDescription>
        </DialogHeader>
        <ul className="mt-3 max-h-40 overflow-auto rounded-md border border-border bg-card/40 p-2 text-xs">
          {ids.map((id) => {
            const corpus = corporaById.get(id);
            const failure = errors.find((e) => e.id === id);
            return (
              <li
                key={id}
                className={cn(
                  "flex items-center justify-between gap-2 px-1 py-0.5",
                  failure ? "text-red-300" : "",
                )}
              >
                <span className="truncate">
                  {corpus?.name ?? id}
                </span>
                {failure ? (
                  <span className="shrink-0 text-[10px]">{failure.message}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {running ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Deleting {doneCount} of {ids.length}…
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={running}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={runDelete}
            disabled={running || ids.length === 0}
          >
            {running ? "Deleting…" : `Delete ${ids.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CorpusGrid({ corpora }: CorpusGridProps) {
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [renameState, setRenameState] = React.useState<RenameDialogState>({
    corpus: null,
    open: false,
  });

  const corporaById = React.useMemo(() => {
    const m = new Map<string, Corpus>();
    for (const c of corpora) m.set(c.id, c);
    return m;
  }, [corpora]);

  // Drop selections that point at corpora no longer in view (e.g. filtered
  // out, deleted) so the toolbar count stays honest.
  React.useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (corporaById.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [corporaById]);

  const toggle = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = () => {
    setSelected(new Set(corpora.map((c) => c.id)));
  };
  const clearSelection = () => {
    setSelected(new Set());
  };
  const exitSelectionMode = () => {
    setSelected(new Set());
    setSelectionMode(false);
  };

  const openRename = React.useCallback((corpus: Corpus) => {
    setRenameState({ corpus, open: true });
  }, []);

  if (corpora.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/30 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No corpora match the current filters.
        </p>
      </div>
    );
  }

  const selectionState: SelectionState = {
    selectionMode,
    selected,
    toggle,
  };

  return (
    <SelectionContext.Provider value={selectionState}>
      <RenameDispatchContext.Provider value={openRename}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            {selectionMode ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card/40 px-3 py-2 text-xs">
                <span className="font-mono tabular-nums">
                  {selected.size} selected
                </span>
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-muted-foreground hover:text-foreground"
                >
                  All ({corpora.length})
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-muted-foreground hover:text-foreground"
                  disabled={selected.size === 0}
                >
                  None
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={selected.size === 0}
                  onClick={() => setBulkOpen(true)}
                  className="ml-2"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete {selected.size} corpora
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={exitSelectionMode}
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSelectionMode(true)}
              >
                <CheckSquare className="h-3.5 w-3.5" />
                Select
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {corpora.map((c) => (
              <CorpusCard key={c.id} corpus={c} />
            ))}
          </div>
        </div>

        <RenameDialog
          state={renameState}
          onClose={() => setRenameState({ corpus: null, open: false })}
        />

        <BulkDeleteDialog
          open={bulkOpen}
          selected={selected}
          corporaById={corporaById}
          onClose={() => setBulkOpen(false)}
          onCleared={exitSelectionMode}
        />
      </RenameDispatchContext.Provider>
    </SelectionContext.Provider>
  );
}
