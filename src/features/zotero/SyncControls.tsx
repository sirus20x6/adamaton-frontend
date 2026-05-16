import * as React from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { useCorpora } from "@/api/library";
import {
  isTerminalSyncStatus,
  useZoteroSync,
  useZoteroSyncJob,
  type ZoteroSyncJob,
} from "@/api/zotero";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const NO_CORPUS_VALUE = "__none__";

export type SyncControlsProps = {
  /** Currently active job id (controlled by the page). Used to disable
   * "Sync now" while a sync is in flight and to know when to swap back. */
  activeJobId: string | null;
  onJobStarted: (jobId: string) => void;
  /** Whether the connect form is satisfied — disables the kickoff if not. */
  disabled?: boolean;
};

export function SyncControls({
  activeJobId,
  onJobStarted,
  disabled = false,
}: SyncControlsProps) {
  const { toast } = useToast();
  const corporaQuery = useCorpora();
  const sync = useZoteroSync();
  const activeJob = useZoteroSyncJob(activeJobId);

  const corpora = corporaQuery.data ?? [];
  // Prefer a corpus literally named "Zotero" if one exists; otherwise let
  // the user choose, defaulting to "no corpus link" so the items land in
  // whatever the backend picks.
  const defaultZotero = React.useMemo(
    () =>
      corpora.find((c) => c.name.trim().toLowerCase() === "zotero") ?? null,
    [corpora],
  );

  const [corpusId, setCorpusId] = React.useState<string>(NO_CORPUS_VALUE);
  const userTouchedCorpusRef = React.useRef(false);
  React.useEffect(() => {
    // Auto-select a "Zotero" corpus the first time we see one in the list.
    // We deliberately gate on a ref instead of the current corpusId value so
    // that the user *can* deselect back to NO_CORPUS_VALUE without us
    // immediately re-selecting it on the next render.
    if (defaultZotero && !userTouchedCorpusRef.current) {
      setCorpusId(defaultZotero.id);
    }
  }, [defaultZotero]);

  const onCorpusChange = (value: string) => {
    userTouchedCorpusRef.current = true;
    setCorpusId(value);
  };

  const [onlyWithPdf, setOnlyWithPdf] = React.useState(false);
  const [forceFull, setForceFull] = React.useState(false);

  const isJobActive =
    Boolean(activeJobId) &&
    !(activeJob.data && isTerminalSyncStatus(activeJob.data.status));

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sync.mutate(
      {
        corpus_id: corpusId === NO_CORPUS_VALUE ? undefined : corpusId,
        only_with_pdf: onlyWithPdf || undefined,
        force_full: forceFull || undefined,
      },
      {
        onSuccess: (resp) => {
          toast({
            title: "Sync started",
            description: `Queued on ${resp.queue}`,
            variant: "info",
          });
          onJobStarted(resp.job_id);
        },
        onError: (err) => {
          toast({
            title: "Failed to start sync",
            description: err.message,
            variant: "error",
          });
        },
      },
    );
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card/40 p-4"
    >
      <div className="flex flex-col gap-2">
        <label
          htmlFor="zotero-corpus-picker"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Target corpus
        </label>
        <select
          id="zotero-corpus-picker"
          value={corpusId}
          onChange={(e) => onCorpusChange(e.target.value)}
          disabled={corporaQuery.isLoading}
          className={cn(
            "h-9 rounded-md border border-border bg-background px-2 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <option value={NO_CORPUS_VALUE}>
            {defaultZotero
              ? "No corpus link (use server default)"
              : "No corpus link — create a corpus called \"Zotero\" to auto-target it"}
          </option>
          {corpora.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.scope ? ` · ${String(c.scope)}` : ""}
            </option>
          ))}
        </select>
        {!defaultZotero && corpora.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Tip: name a corpus <code>Zotero</code> and it'll be picked
            automatically.
          </p>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Options
        </legend>
        <ToggleRow
          checked={onlyWithPdf}
          onChange={setOnlyWithPdf}
          label="Only include items with attached PDFs"
          hint="Skips reference-only entries (notes, bookmarks, items with no file)."
        />
        <ToggleRow
          checked={forceFull}
          onChange={setForceFull}
          label="Full re-sync (ignore last cursor)"
          hint="Walks the entire library again. Useful after fixing metadata in Zotero."
        />
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {isJobActive ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Sync currently running…
            </span>
          ) : (
            "Items deduplicated by DOI, arXiv id, or title hash before queueing."
          )}
        </p>
        <Button
          type="submit"
          size="md"
          disabled={
            disabled ||
            sync.isPending ||
            isJobActive ||
            corporaQuery.isLoading
          }
        >
          {sync.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting…
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Sync now
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

type ToggleRowProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint: string;
};

function ToggleRow({ checked, onChange, label, hint }: ToggleRowProps) {
  const id = React.useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background/60 p-3",
        "transition-colors hover:border-primary/40",
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {hint}
        </span>
      </span>
    </label>
  );
}

/**
 * Helper: classify a job for the consumer (page) so they can choose to
 * collapse/dismiss the SyncProgress card after success. Kept here so
 * callers don't need to re-import the union from the api module just to
 * branch on it.
 */
export function isJobTerminal(job: ZoteroSyncJob | undefined): boolean {
  return Boolean(job && isTerminalSyncStatus(job.status));
}
