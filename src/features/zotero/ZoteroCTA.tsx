import { Link } from "react-router-dom";
import { ArrowRight, BookMarked, Loader2, RefreshCw } from "lucide-react";

import { useZoteroStatus, useZoteroSync } from "@/api/zotero";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn, formatRelative } from "@/lib/utils";

/**
 * Compact "Zotero" callout for the Library page. When the user already has
 * Zotero connected we show item counts + a one-click sync; otherwise the
 * card pitches the feature and links to ``/zotero`` for full setup.
 *
 * Designed to slot above the corpora grid without dominating the layout —
 * minimal vertical real estate, dismissed visually by the muted background.
 */
export function ZoteroCTA() {
  const { toast } = useToast();
  const statusQuery = useZoteroStatus();
  const sync = useZoteroSync();

  const status = statusQuery.data;
  const connected = Boolean(status?.connected);
  const itemCount = status?.item_count ?? 0;
  const lastSync = status?.last_sync_at ?? null;

  const onSyncNow = () => {
    sync.mutate(
      {},
      {
        onSuccess: (resp) => {
          toast({
            title: "Sync started",
            description: `Queued on ${resp.queue} — track progress on the Zotero page.`,
            variant: "info",
          });
        },
        onError: (err) => {
          toast({
            title: "Sync failed to start",
            description: err.message,
            variant: "error",
          });
        },
      },
    );
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4",
        connected
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-border bg-card/40",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
            connected
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-primary/10 text-primary",
          )}
        >
          <BookMarked className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">
            {connected
              ? `Import your Zotero library — ${itemCount.toLocaleString()} paper${
                  itemCount === 1 ? "" : "s"
                }`
              : "Connect Zotero to bulk-import your reference library"}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {connected ? (
              <>
                {status?.library_name ? (
                  <span className="text-emerald-300">
                    {status.library_name}
                  </span>
                ) : (
                  "Linked"
                )}
                {lastSync ? (
                  <>
                    {" · "}last sync {formatRelative(lastSync)}
                  </>
                ) : (
                  " · never synced"
                )}
              </>
            ) : (
              "Pull DOIs, arXiv ids, and PDFs from your Zotero account in one shot."
            )}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {connected ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onSyncNow}
              disabled={sync.isPending}
            >
              {sync.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Sync now
                </>
              )}
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link to="/zotero">
                Manage
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </>
        ) : (
          <Button asChild size="sm">
            <Link to="/zotero">
              Set up
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
