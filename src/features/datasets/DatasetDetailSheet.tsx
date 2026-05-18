/**
 * DatasetDetailSheet — full drill-down for one dataset.
 *
 * Opens as a side Sheet from the Datasets table row click. Shows:
 *   - header: id, display_name, task_type, archive button
 *   - tags: chip row with add/remove
 *   - versions: table with per-row Transform/Splits/K-Fold/Quality actions
 *   - quality observations: read-only feed
 *
 * The dataset is refetched every 5s while the sheet is open so version
 * status transitions (pending -> importing -> ready) show up live.
 */
import * as React from "react";
import {
  AlertTriangle,
  Archive,
  ChevronDown,
  ChevronRight,
  Download,
  GitBranch,
  Hash,
  Layers,
  Loader2,
  Plus,
  Split,
  X,
} from "lucide-react";

import {
  type DatasetVersion,
  useAddDatasetTag,
  useArchiveDataset,
  useDatasetDetail,
  useDatasetQuality,
  useRemoveDatasetTag,
} from "@/api/datasets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import {
  MakeKFoldDialog,
  MakeSplitsDialog,
  RecordQualityDialog,
  TransformDialog,
} from "./ActionDialogs";

const STATUS_TONE: Record<string, string> = {
  pending: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  importing: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  transforming: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  ready: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  failed: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  deleted: "bg-slate-500/10 text-slate-500 border-slate-500/30",
};

function fmtBytes(n?: number): string {
  if (!n) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function fmtRows(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function DatasetDetailSheet({
  datasetID,
  open,
  onOpenChange,
}: {
  datasetID: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const detail = useDatasetDetail(open ? datasetID : null);
  const quality = useDatasetQuality(open ? datasetID : null);

  // Per-version action dialog state. Keeping it local to the sheet means
  // there's only ever one open at a time and they all reset cleanly when
  // the sheet closes.
  const [actionVersion, setActionVersion] = React.useState<DatasetVersion | null>(
    null,
  );
  const [transformOpen, setTransformOpen] = React.useState(false);
  const [splitsOpen, setSplitsOpen] = React.useState(false);
  const [kfoldOpen, setKfoldOpen] = React.useState(false);
  const [qualityOpen, setQualityOpen] = React.useState(false);

  const data = detail.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-3xl overflow-y-auto sm:max-w-3xl"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <span className="font-mono">{datasetID ?? "—"}</span>
            {data?.archived_at && (
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                archived
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {data?.display_name && data.display_name !== data.id
              ? data.display_name
              : "evolve/dataset-manager"}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-5 px-4 py-4">
          {detail.isLoading && (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            </div>
          )}

          {detail.error && (
            <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-200">
              {(detail.error as Error).message}
            </div>
          )}

          {data && (
            <>
              <DatasetHeaderActions
                datasetID={data.id}
                archived={!!data.archived_at}
                taskType={data.task_type}
                description={data.description}
              />

              <TagEditor datasetID={data.id} tags={data.tags} />

              <VersionList
                versions={data.versions}
                onAction={(v, action) => {
                  setActionVersion(v);
                  switch (action) {
                    case "transform":
                      setTransformOpen(true);
                      break;
                    case "splits":
                      setSplitsOpen(true);
                      break;
                    case "kfold":
                      setKfoldOpen(true);
                      break;
                    case "quality":
                      setQualityOpen(true);
                      break;
                  }
                }}
              />

              <QualityList quality={quality.data ?? []} loading={quality.isLoading} />
            </>
          )}
        </SheetBody>
      </SheetContent>

      {/* Action dialogs — they read actionVersion lazily so we don't have
          to remount them when the user closes + reopens. */}
      <TransformDialog
        open={transformOpen}
        onOpenChange={setTransformOpen}
        datasetID={datasetID ?? ""}
        version={actionVersion}
      />
      <MakeSplitsDialog
        open={splitsOpen}
        onOpenChange={setSplitsOpen}
        datasetID={datasetID ?? ""}
        version={actionVersion}
      />
      <MakeKFoldDialog
        open={kfoldOpen}
        onOpenChange={setKfoldOpen}
        datasetID={datasetID ?? ""}
        version={actionVersion}
      />
      <RecordQualityDialog
        open={qualityOpen}
        onOpenChange={setQualityOpen}
        datasetID={datasetID ?? ""}
        version={actionVersion}
      />
    </Sheet>
  );
}

function DatasetHeaderActions({
  datasetID,
  archived,
  taskType,
  description,
}: {
  datasetID: string;
  archived: boolean;
  taskType: string;
  description: string;
}) {
  const archive = useArchiveDataset();
  const [confirming, setConfirming] = React.useState(false);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-mono text-[10px] uppercase">
            {taskType}
          </Badge>
        </div>
        {!archived && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Archive className="mr-1.5 h-3.5 w-3.5" />
                Manage
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setConfirming(true);
                }}
                className="text-rose-300 focus:text-rose-200"
              >
                <Archive className="mr-2 h-3.5 w-3.5" /> Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {description && (
        <p className="text-sm text-slate-300">{description}</p>
      )}
      {confirming && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div className="flex flex-col gap-2">
              <p className="text-xs text-amber-200">
                Archive <span className="font-mono">{datasetID}</span>? It
                won't appear in the list, but existing versions stay readable.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => {
                    archive.mutate(datasetID, {
                      onSuccess: () => setConfirming(false),
                    });
                  }}
                  disabled={archive.isPending}
                >
                  {archive.isPending && (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  )}
                  Archive
                </Button>
              </div>
              {archive.error && (
                <p className="font-mono text-[10px] text-rose-300">
                  {(archive.error as Error).message}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TagEditor({
  datasetID,
  tags,
}: {
  datasetID: string;
  tags: string[];
}) {
  const add = useAddDatasetTag();
  const remove = useRemoveDatasetTag();
  const [newTag, setNewTag] = React.useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = newTag.trim();
    if (!t) return;
    add.mutate({ id: datasetID, tag: t }, { onSuccess: () => setNewTag("") });
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
        Tags
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        {tags.length === 0 && (
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-600">
            no tags
          </span>
        )}
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-mono text-[11px] text-violet-200"
          >
            {t}
            <button
              type="button"
              onClick={() => remove.mutate({ id: datasetID, tag: t })}
              disabled={remove.isPending}
              className="opacity-60 hover:opacity-100"
              aria-label={`remove tag ${t}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <form onSubmit={submit} className="inline-flex items-center gap-1">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="add tag…"
            className="h-7 w-32 font-mono text-xs"
          />
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            disabled={add.isPending || !newTag.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
      {add.error && (
        <span className="font-mono text-[10px] text-rose-300">
          {(add.error as Error).message}
        </span>
      )}
    </section>
  );
}

function VersionList({
  versions,
  onAction,
}: {
  versions: DatasetVersion[];
  onAction: (
    v: DatasetVersion,
    action: "transform" | "splits" | "kfold" | "quality",
  ) => void;
}) {
  if (versions.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-card/30 p-6 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-slate-500">
        no versions yet
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
        Versions ({versions.length})
      </h3>
      <ul className="flex flex-col gap-2">
        {versions.map((v) => (
          <VersionRow key={v.id} v={v} onAction={onAction} />
        ))}
      </ul>
    </section>
  );
}

function VersionRow({
  v,
  onAction,
}: {
  v: DatasetVersion;
  onAction: (
    v: DatasetVersion,
    action: "transform" | "splits" | "kfold" | "quality",
  ) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const tone = STATUS_TONE[v.status] ?? STATUS_TONE.deleted;
  const isReady = v.status === "ready";

  return (
    <li className="overflow-hidden rounded-lg border border-border bg-card/30">
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="text-slate-500 hover:text-slate-300"
          aria-label={expanded ? "collapse" : "expand"}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <span className="font-mono text-sm font-semibold text-slate-100">
          v{v.version}
        </span>
        <span
          className={cn(
            "rounded-sm border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.22em]",
            tone,
          )}
        >
          {v.status}
        </span>
        <span className="font-mono text-xs text-slate-400">{v.format}</span>
        <span className="font-mono text-xs tabular-nums text-slate-400">
          {fmtRows(v.row_count)} rows
        </span>
        <span className="font-mono text-xs tabular-nums text-slate-400">
          {fmtBytes(v.byte_count)}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={!isReady}
            onClick={() => onAction(v, "transform")}
            title={isReady ? "Convert to another format" : "Version must be ready"}
          >
            <Download className="mr-1 h-3 w-3" /> Transform
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!isReady}
            onClick={() => onAction(v, "splits")}
          >
            <Split className="mr-1 h-3 w-3" /> Splits
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!isReady}
            onClick={() => onAction(v, "kfold")}
          >
            <Layers className="mr-1 h-3 w-3" /> K-fold
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction(v, "quality")}>
            <Hash className="mr-1 h-3 w-3" /> Quality
          </Button>
        </span>
      </div>
      {expanded && (
        <div className="border-t border-border/40 bg-background/30 p-3">
          <VersionDetail v={v} />
        </div>
      )}
    </li>
  );
}

function VersionDetail({ v }: { v: DatasetVersion }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Pane title={`Sources (${v.sources.length})`}>
        {v.sources.length === 0 ? (
          <Empty />
        ) : (
          <ul className="flex flex-col gap-1.5 text-xs">
            {v.sources.map((s) => (
              <li key={s.id} className="font-mono">
                <span className="text-violet-300">{s.kind}</span>{" "}
                <span className="text-slate-300">{s.ref}</span>
                {s.commit_hash && (
                  <span className="text-slate-500"> @ {s.commit_hash.slice(0, 12)}</span>
                )}
                {s.license && (
                  <div className="text-[10px] text-slate-500">license: {s.license}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Pane>
      <Pane title={`Files (${v.files.length})`}>
        {v.files.length === 0 ? (
          <Empty />
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {v.files.slice(0, 20).map((f) => (
              <li key={f.id} className="font-mono">
                <div className="truncate text-slate-300">{f.file_path}</div>
                <div className="text-[10px] text-slate-500">
                  {fmtBytes(f.byte_size)} · {fmtRows(f.row_count)} rows · {f.format}
                </div>
              </li>
            ))}
            {v.files.length > 20 && (
              <li className="text-[10px] text-slate-500">
                + {v.files.length - 20} more
              </li>
            )}
          </ul>
        )}
      </Pane>
      <Pane title={`Splits (${v.splits.length})`}>
        {v.splits.length === 0 ? (
          <Empty />
        ) : (
          <ul className="flex flex-col gap-1.5 text-xs">
            {v.splits.map((sp) => (
              <li key={sp.id} className="font-mono">
                <div className="text-slate-300">
                  {sp.kfold > 0 ? (
                    <span className="text-amber-300">k-fold-{sp.kfold}</span>
                  ) : (
                    <GitBranch className="mr-1 inline h-3 w-3 text-sky-300" />
                  )}
                  {sp.name}
                </div>
                <div className="text-[10px] text-slate-500">
                  {sp.split_names
                    .map((n, i) => `${n}=${(sp.ratios[i] ?? 0).toFixed(2)}`)
                    .join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Pane>
    </div>
  );
}

function Pane({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Empty() {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-600">
      none
    </span>
  );
}

function QualityList({
  quality,
  loading,
}: {
  quality: import("@/api/datasets").QualityObservation[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <section>
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
          Quality
        </h3>
        <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
      </section>
    );
  }
  if (quality.length === 0) {
    return (
      <section>
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
          Quality
        </h3>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-600">
          no observations yet
        </p>
      </section>
    );
  }
  return (
    <section>
      <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
        Quality ({quality.length})
      </h3>
      <ul className="flex flex-col gap-1.5">
        {quality.slice(0, 100).map((q) => (
          <li
            key={q.id}
            className="flex items-center gap-3 rounded border border-border/40 bg-card/20 px-3 py-2 font-mono text-xs"
          >
            <span className="text-slate-300">v{q.version}</span>
            {q.eval_delta !== undefined && (
              <span
                className={cn(
                  "tabular-nums",
                  q.eval_delta > 0 ? "text-emerald-300" : "text-rose-300",
                )}
              >
                Δ {q.eval_delta.toFixed(4)}
              </span>
            )}
            {q.won !== undefined && (
              <span
                className={cn(
                  "rounded-sm border px-1 py-px text-[9px] uppercase tracking-[0.22em]",
                  q.won
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-300",
                )}
              >
                {q.won ? "won" : "lost"}
              </span>
            )}
            <span className="text-[10px] text-slate-500">
              run {q.distill_run_id.slice(0, 8)}
            </span>
            <span className="ml-auto text-[10px] text-slate-600">
              {new Date(q.observed_at).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
