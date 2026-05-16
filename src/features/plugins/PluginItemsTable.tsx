import * as React from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Trash2,
  X,
} from "lucide-react";

import {
  useBulkDeletePluginItems,
  useDeletePluginItem,
  usePluginItems,
  type PluginItemRow,
  type PluginItemStatus,
} from "@/api/plugins";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { cn, formatRelative } from "@/lib/utils";

const PAGE_SIZE = 25;

type FilterChip = {
  value: string;
  label: string;
  /** Server-side ``status=`` parameter; ``""`` means no filter. */
  status: string;
};

const FILTER_CHIPS: ReadonlyArray<FilterChip> = [
  { value: "all", label: "All", status: "" },
  { value: "fetched", label: "Fetched", status: "queued" },
  { value: "ingested", label: "Ingested", status: "ingested" },
  { value: "duplicate", label: "Duplicate", status: "duplicate" },
  { value: "errored", label: "Errored", status: "errored" },
  { value: "pending", label: "Pending", status: "pending" },
];

const STATUS_VARIANT: Record<
  PluginItemStatus,
  "default" | "success" | "warning" | "danger" | "outline" | "secondary"
> = {
  pending: "outline",
  queued: "secondary",
  ingested: "success",
  duplicate: "default",
  errored: "danger",
  skipped: "warning",
};

const STATUS_LABEL: Record<PluginItemStatus, string> = {
  pending: "Pending",
  queued: "Fetched",
  ingested: "Ingested",
  duplicate: "Duplicate",
  errored: "Errored",
  skipped: "Skipped",
};

function DismissButton({
  rowKey,
  status,
  busy,
  onClick,
}: {
  rowKey: string;
  status: PluginItemStatus;
  busy: boolean;
  onClick: () => void;
}) {
  // Destructive coloring for rows that are already linked to a real
  // document, so accidental clicks on ingested/duplicate items are warned.
  const destructive = status === "ingested" || status === "duplicate";
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            disabled={busy}
            aria-label={`Dismiss item ${rowKey}`}
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors",
              "text-muted-foreground hover:bg-accent hover:text-foreground",
              destructive && "hover:bg-red-500/10 hover:text-red-500",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {destructive
            ? "Drop from the items journal (won't delete the linked document)"
            : "Dismiss"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ErrorTooltip({ message }: { message: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-red-300">
            <AlertCircle className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="left"
          className="max-w-xs whitespace-normal break-words"
        >
          {message}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * The set of statuses we let the user dismiss in bulk. ``ingested`` and
 * ``duplicate`` are intentionally excluded — those carry real linkage that
 * we don't want to wipe by mistake.
 */
const BULK_DISMISSABLE = new Set(["pending", "queued", "errored", "skipped"]);

export type PluginItemsTableProps = {
  pluginId: string;
};

export function PluginItemsTable({ pluginId }: PluginItemsTableProps) {
  const [filter, setFilter] = React.useState<FilterChip>(
    FILTER_CHIPS[0] as FilterChip,
  );
  const [offset, setOffset] = React.useState(0);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(
    null,
  );

  const params = React.useMemo(
    () => ({
      plugin_id: pluginId,
      status: filter.status || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    [pluginId, filter.status, offset],
  );

  const query = usePluginItems(params);
  const { toast } = useToast();
  const deleteOne = useDeletePluginItem({
    onError: (err) =>
      toast({
        title: "Couldn't dismiss",
        description: err.message,
        variant: "error",
      }),
  });
  const deleteBulk = useBulkDeletePluginItems({
    onSuccess: (resp) =>
      toast({
        title: `Dismissed ${resp.deleted.toLocaleString()} ${resp.status}`,
        variant: "success",
      }),
    onError: (err) =>
      toast({
        title: "Bulk dismiss failed",
        description: err.message,
        variant: "error",
      }),
  });

  // Reset pagination when the filter or plugin changes.
  React.useEffect(() => {
    setOffset(0);
  }, [filter.value, pluginId]);

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const start = items.length > 0 ? offset + 1 : 0;
  const end = offset + items.length;

  const canPrev = offset > 0;
  const canNext = end < total;

  const onDismissOne = (row: PluginItemRow) => {
    setPendingDeleteId(row.id);
    deleteOne.mutate(row.id, {
      onSettled: () => setPendingDeleteId(null),
    });
  };

  const bulkStatus = filter.status;
  const canBulkDismiss =
    bulkStatus !== "" && BULK_DISMISSABLE.has(bulkStatus) && total > 0;
  const onBulkDismiss = () => {
    if (!bulkStatus) return;
    const ok = window.confirm(
      `Dismiss all ${total.toLocaleString()} ${filter.label.toLowerCase()} items? ` +
        "This removes the rows from the items journal but doesn't touch any " +
        "documents that already made it into a corpus.",
    );
    if (!ok) return;
    deleteBulk.mutate({ plugin_id: pluginId, status: bulkStatus });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setFilter(chip)}
              className={cn(
                "rounded-full border px-3 py-0.5 text-[11px] font-medium uppercase tracking-wider transition-colors",
                filter.value === chip.value
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border bg-card/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {canBulkDismiss ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onBulkDismiss}
              disabled={deleteBulk.isPending}
              className="text-[11px]"
            >
              {deleteBulk.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              Dismiss all {filter.label.toLowerCase()}
            </Button>
          ) : null}
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {query.isLoading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading…
              </span>
            ) : total === 0 ? (
              "0 items"
            ) : (
              `${start}–${end} of ${total.toLocaleString()}`
            )}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card/40">
        <div className="grid grid-cols-[1fr_220px_120px_140px_36px_36px] items-center gap-3 border-b border-border bg-card/60 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>Title</span>
          <span>External id</span>
          <span>Status</span>
          <span>Fetched</span>
          <span aria-label="Error" />
          <span aria-label="Actions" />
        </div>

        {query.isError ? (
          <div className="p-4 text-sm text-red-300">
            Failed to load items:{" "}
            {query.error instanceof Error
              ? query.error.message
              : String(query.error)}
          </div>
        ) : null}

        {!query.isError && !query.isLoading && items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No items yet.{" "}
            {filter.value === "all"
              ? "Run the plugin to populate this list."
              : "Try the All filter — there may be items under other statuses."}
          </div>
        ) : null}

        <ul className="divide-y divide-border">
          {items.map((row) => {
            const status = row.ingest_status;
            const docHref =
              row.document_id && status === "ingested"
                ? `/library?doc=${encodeURIComponent(row.document_id)}`
                : null;
            const externalHref = row.external_url ?? null;
            const titleText = row.title ?? "(untitled)";
            return (
              <li
                key={row.id}
                className="grid grid-cols-[1fr_220px_120px_140px_36px_36px] items-center gap-3 px-4 py-2 text-xs"
              >
                <div className="min-w-0">
                  {docHref ? (
                    <Link
                      to={docHref}
                      className="block truncate text-sm text-foreground hover:text-primary"
                      title={titleText}
                    >
                      {titleText}
                    </Link>
                  ) : externalHref ? (
                    <a
                      href={externalHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1 truncate text-sm text-foreground hover:text-primary"
                      title={titleText}
                    >
                      <span className="truncate">{titleText}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </a>
                  ) : (
                    <span
                      className="block truncate text-sm text-foreground"
                      title={titleText}
                    >
                      {titleText}
                    </span>
                  )}
                  {externalHref && docHref ? (
                    <a
                      href={externalHref}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate font-mono text-[10px] text-muted-foreground hover:text-primary"
                      title={externalHref}
                    >
                      {externalHref}
                    </a>
                  ) : null}
                </div>
                <div className="min-w-0 truncate">
                  <span
                    className="font-mono text-[11px] text-muted-foreground"
                    title={row.external_id}
                  >
                    {row.external_id}
                  </span>
                </div>
                <div>
                  <Badge variant={STATUS_VARIANT[status]}>
                    {STATUS_LABEL[status]}
                  </Badge>
                </div>
                <div
                  className="truncate text-[11px] text-muted-foreground"
                  title={row.fetched_at ?? row.created_at}
                >
                  {formatRelative(row.fetched_at ?? row.created_at)}
                </div>
                <div className="flex justify-end">
                  {row.ingest_error ? (
                    <ErrorTooltip message={row.ingest_error} />
                  ) : null}
                </div>
                <div className="flex justify-end">
                  <DismissButton
                    rowKey={row.external_id}
                    status={status}
                    busy={pendingDeleteId === row.id}
                    onClick={() => onDismissOne(row)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          disabled={!canPrev || query.isLoading}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
          disabled={!canNext || query.isLoading}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
