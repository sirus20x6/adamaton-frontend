/**
 * Datasets — evolve/dataset-manager catalog.
 *
 * Read view over evo_datasets.{datasets,dataset_versions} via
 * /api/v1/datasets. Two actions on this page:
 *
 *   - Register: POST /api/v1/datasets — creates a new dataset row.
 *   - Import:   POST /api/v1/datasets/import — fires ImportDatasetWorkflow
 *               on the dataset-mgr queue against an existing dataset.
 *
 * The dataset-worker (evolve/dataset-manager) owns the version lifecycle;
 * this page just reads + kicks Temporal workflows.
 */

import * as React from "react";
import {
  Database,
  Download,
  Loader2,
  Plus,
} from "lucide-react";

import {
  DATASET_SOURCE_KINDS,
  DATASET_TASK_TYPES,
  type Dataset,
  type DatasetSourceKind,
  type DatasetTaskType,
  type DatasetVersionStatus,
  useCreateDataset,
  useDatasets,
  useImportDataset,
} from "@/api/datasets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<DatasetVersionStatus, string> = {
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

export default function Datasets() {
  const datasets = useDatasets();
  const [registerOpen, setRegisterOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [importTarget, setImportTarget] = React.useState<string | null>(null);

  const rows = datasets.data ?? [];

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10">
            <Database className="h-5 w-5 text-violet-300" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Datasets</h1>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-slate-500">
              evolve/dataset-manager · {rows.length} dataset{rows.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setImportTarget(null);
              setImportOpen(true);
            }}
            disabled={rows.length === 0}
            title={rows.length === 0 ? "Register a dataset first" : undefined}
          >
            <Download className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button onClick={() => setRegisterOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New dataset
          </Button>
        </div>
      </header>

      {datasets.isLoading && (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border bg-card/30">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      )}

      {datasets.error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 font-mono text-xs text-rose-200">
          {(datasets.error as Error).message}
        </div>
      )}

      {!datasets.isLoading && !datasets.error && rows.length === 0 && (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/30">
          <Database className="h-6 w-6 text-slate-600" strokeWidth={1.5} />
          <p className="text-sm text-slate-400">No datasets registered yet.</p>
          <Button size="sm" onClick={() => setRegisterOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Register your first dataset
          </Button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card/30">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-card/40 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Task</th>
                <th className="px-4 py-3 text-left">Latest version</th>
                <th className="px-4 py-3 text-right">Rows</th>
                <th className="px-4 py-3 text-right">Size</th>
                <th className="px-4 py-3 text-left">Format</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <DatasetRow
                  key={d.id}
                  d={d}
                  onImport={() => {
                    setImportTarget(d.id);
                    setImportOpen(true);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RegisterDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
      />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        datasets={rows}
        initialDatasetID={importTarget}
      />
    </div>
  );
}

function DatasetRow({ d, onImport }: { d: Dataset; onImport: () => void }) {
  const v = d.latest_version;
  return (
    <tr className="border-b border-border/40 last:border-b-0 hover:bg-white/[0.02]">
      <td className="px-4 py-3">
        <div className="font-mono text-sm font-semibold text-slate-100">{d.id}</div>
        {d.display_name !== d.id && (
          <div className="text-xs text-slate-500">{d.display_name}</div>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className="font-mono text-[10px] uppercase">
          {d.task_type}
        </Badge>
      </td>
      <td className="px-4 py-3">
        {v ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-slate-300">v{v.version}</span>
            <span
              className={cn(
                "rounded-sm border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.22em]",
                STATUS_TONE[v.status],
              )}
            >
              {v.status}
            </span>
          </div>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-600">
            no versions
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-300">
        {fmtRows(v?.row_count)}
      </td>
      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-300">
        {fmtBytes(v?.byte_count)}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-400">
        {v?.format ?? "—"}
      </td>
      <td className="px-4 py-3 text-right">
        <Button size="sm" variant="ghost" onClick={onImport}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Import
        </Button>
      </td>
    </tr>
  );
}

function RegisterDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateDataset();
  const [id, setId] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [taskType, setTaskType] = React.useState<DatasetTaskType>("sft");

  function reset() {
    setId("");
    setDisplayName("");
    setDescription("");
    setTaskType("sft");
    create.reset();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        id: id.trim(),
        display_name: displayName.trim() || undefined,
        description: description.trim() || undefined,
        task_type: taskType,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Register a new dataset</DialogTitle>
          <DialogDescription>
            Creates a row in <span className="font-mono">evo_datasets.datasets</span>.
            You can import data into it afterwards.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
              ID (slug)
            </span>
            <Input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="ultrachat-dpo"
              required
              autoFocus
              pattern="[a-z0-9][a-z0-9-]*"
              title="Lowercase letters, digits, and hyphens"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Display name (optional)
            </span>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="UltraChat DPO"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Task type
            </span>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as DatasetTaskType)}
              className="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm"
            >
              {DATASET_TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Description (optional)
            </span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this dataset for?"
              rows={2}
            />
          </label>

          {create.error && (
            <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-200">
              {(create.error as Error).message}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !id.trim()}>
              {create.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Register
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({
  open,
  onOpenChange,
  datasets,
  initialDatasetID,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  datasets: Dataset[];
  initialDatasetID: string | null;
}) {
  const startImport = useImportDataset();
  const [datasetID, setDatasetID] = React.useState("");
  const [sourceKind, setSourceKind] = React.useState<DatasetSourceKind>("huggingface");
  const [sourceRef, setSourceRef] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [done, setDone] = React.useState<{ workflow_id: string; already_running?: boolean } | null>(
    null,
  );

  React.useEffect(() => {
    if (open) {
      setDatasetID(initialDatasetID ?? datasets[0]?.id ?? "");
      setSourceRef("");
      setNotes("");
      setDone(null);
      startImport.reset();
    }
    // re-init each time the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDatasetID]);

  const sourceRefPlaceholder: Record<DatasetSourceKind, string> = {
    local: "/path/to/local/dir-on-the-worker",
    huggingface: "owner/repo[@revision]",
    kaggle: "owner/slug[?version=N]",
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startImport.mutate(
      {
        dataset_id: datasetID,
        source_kind: sourceKind,
        source_ref: sourceRef.trim(),
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (resp) => {
          setDone({ workflow_id: resp.workflow_id, already_running: resp.already_running });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import a new version</DialogTitle>
          <DialogDescription>
            Fires <span className="font-mono">ImportDatasetWorkflow</span> on
            the dataset-mgr task queue. The worker picks the next version
            number, downloads, uploads to blob storage, and flips the row
            to <span className="font-mono">ready</span>.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col gap-3">
            <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 font-mono text-xs text-emerald-200">
              {done.already_running ? "Already running" : "Import started"}
              <div className="mt-1 text-[10px] text-emerald-300/70">
                workflow_id: {done.workflow_id}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Target dataset
              </span>
              <select
                value={datasetID}
                onChange={(e) => setDatasetID(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm"
                required
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Source kind
              </span>
              <select
                value={sourceKind}
                onChange={(e) =>
                  setSourceKind(e.target.value as DatasetSourceKind)
                }
                className="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm"
              >
                {DATASET_SOURCE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Source ref
              </span>
              <Input
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
                placeholder={sourceRefPlaceholder[sourceKind]}
                required
                autoFocus
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Notes (optional)
              </span>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Anything to remember about this version?"
              />
            </label>

            {startImport.error && (
              <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-200">
                {(startImport.error as Error).message}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={startImport.isPending || !datasetID || !sourceRef.trim()}
              >
                {startImport.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Start import
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
