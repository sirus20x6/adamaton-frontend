/**
 * Per-version action dialogs — Transform, Make Splits, K-Fold, Record
 * Quality. Each fires a Temporal workflow on the dataset-mgr task queue
 * via the apiserver. They're co-located in one file because they share
 * the same wire shape (WorkflowStartResponse) and visual layout
 * (DialogContent + form + 202-success state).
 */
import * as React from "react";
import { Loader2 } from "lucide-react";

import {
  DATASET_TRANSFORM_FORMATS,
  type DatasetTransformFormat,
  type DatasetVersion,
  type WorkflowStartResponse,
  useMakeKFoldSplits,
  useMakeSplits,
  useRecordQuality,
  useTransformDataset,
} from "@/api/datasets";
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

function WorkflowStartResult({
  resp,
  onClose,
}: {
  resp: WorkflowStartResponse;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 font-mono text-xs text-emerald-200">
        {resp.already_running ? "Already running" : "Workflow started"}
        <div className="mt-1 text-[10px] text-emerald-300/70">
          workflow_id: {resp.workflow_id}
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Transform — pick target format (jsonl/parquet) for a ready version.
// ─────────────────────────────────────────────────────────────────────

export function TransformDialog({
  open,
  onOpenChange,
  datasetID,
  version,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  datasetID: string;
  version: DatasetVersion | null;
}) {
  const m = useTransformDataset();
  const [format, setFormat] = React.useState<DatasetTransformFormat>("parquet");
  const [notes, setNotes] = React.useState("");
  const [resp, setResp] = React.useState<WorkflowStartResponse | null>(null);

  React.useEffect(() => {
    if (open && version) {
      setFormat(version.format === "parquet" ? "jsonl" : "parquet");
      setNotes("");
      setResp(null);
      m.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, version?.id]);

  if (!version) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!version) return;
    m.mutate(
      {
        dataset_id: datasetID,
        source_version_id: version.id,
        target_format: format,
        notes: notes.trim() || undefined,
      },
      { onSuccess: setResp },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Transform v{version.version} → new version
          </DialogTitle>
          <DialogDescription>
            Converts the source version to a new format and registers it as
            the next version of <span className="font-mono">{datasetID}</span>.
          </DialogDescription>
        </DialogHeader>

        {resp ? (
          <WorkflowStartResult resp={resp} onClose={() => onOpenChange(false)} />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Source format
              </span>
              <Input value={version.format} readOnly className="font-mono" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Target format
              </span>
              <select
                value={format}
                onChange={(e) =>
                  setFormat(e.target.value as DatasetTransformFormat)
                }
                className="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm"
              >
                {DATASET_TRANSFORM_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Notes (optional)
              </span>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </label>

            {m.error && (
              <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-200">
                {(m.error as Error).message}
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
              <Button type="submit" disabled={m.isPending || format === version.format}>
                {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Transform
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Make splits — named splits with ratios summing to ~1.0.
// ─────────────────────────────────────────────────────────────────────

interface RatioRow {
  name: string;
  ratio: string;
}

export function MakeSplitsDialog({
  open,
  onOpenChange,
  datasetID,
  version,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  datasetID: string;
  version: DatasetVersion | null;
}) {
  const m = useMakeSplits();
  const [name, setName] = React.useState("standard");
  const [salt, setSalt] = React.useState("");
  const [rows, setRows] = React.useState<RatioRow[]>([
    { name: "train", ratio: "0.8" },
    { name: "val", ratio: "0.1" },
    { name: "test", ratio: "0.1" },
  ]);
  const [resp, setResp] = React.useState<WorkflowStartResponse | null>(null);

  React.useEffect(() => {
    if (open && version) {
      setName("standard");
      setSalt(version.id.slice(0, 8));
      setRows([
        { name: "train", ratio: "0.8" },
        { name: "val", ratio: "0.1" },
        { name: "test", ratio: "0.1" },
      ]);
      setResp(null);
      m.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, version?.id]);

  const ratiosNum = rows.map((r) => Number.parseFloat(r.ratio || "0"));
  const ratiosSum = ratiosNum.reduce((a, b) => a + b, 0);
  const ratiosValid = ratiosNum.every((r) => r > 0) && Math.abs(ratiosSum - 1) < 0.01;

  if (!version) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!version) return;
    m.mutate(
      {
        datasetID,
        body: {
          version_id: version.id,
          name: name.trim(),
          salt: salt.trim() || undefined,
          ratios: ratiosNum,
          split_names: rows.map((r) => r.name.trim()),
        },
      },
      { onSuccess: setResp },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Make splits on v{version.version}</DialogTitle>
          <DialogDescription>
            Deterministically partitions rows into named buckets. The salt
            pins the random seed; same salt = same assignments.
          </DialogDescription>
        </DialogHeader>

        {resp ? (
          <WorkflowStartResult resp={resp} onClose={() => onOpenChange(false)} />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Split-set name
              </span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="standard"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Salt
              </span>
              <Input
                value={salt}
                onChange={(e) => setSalt(e.target.value)}
                placeholder="random seed"
              />
            </label>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  Buckets (must sum to 1.0)
                </span>
                <span
                  className={`font-mono text-[10px] tabular-nums ${
                    ratiosValid ? "text-emerald-300" : "text-amber-300"
                  }`}
                >
                  Σ = {ratiosSum.toFixed(3)}
                </span>
              </div>
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={r.name}
                    onChange={(e) => {
                      const next = [...rows];
                      next[i] = { ...r, name: e.target.value };
                      setRows(next);
                    }}
                    className="flex-1 font-mono"
                    placeholder="bucket name"
                  />
                  <Input
                    value={r.ratio}
                    onChange={(e) => {
                      const next = [...rows];
                      next[i] = { ...r, ratio: e.target.value };
                      setRows(next);
                    }}
                    className="w-24 font-mono tabular-nums"
                    placeholder="0.0"
                    inputMode="decimal"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={rows.length <= 2}
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setRows([...rows, { name: `bucket-${rows.length + 1}`, ratio: "0.0" }])
                }
              >
                + bucket
              </Button>
            </div>

            {m.error && (
              <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-200">
                {(m.error as Error).message}
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
                disabled={m.isPending || !ratiosValid || !name.trim()}
              >
                {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Make splits
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// K-fold splits.
// ─────────────────────────────────────────────────────────────────────

export function MakeKFoldDialog({
  open,
  onOpenChange,
  datasetID,
  version,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  datasetID: string;
  version: DatasetVersion | null;
}) {
  const m = useMakeKFoldSplits();
  const [k, setK] = React.useState("5");
  const [salt, setSalt] = React.useState("");
  const [namePrefix, setNamePrefix] = React.useState("fold");
  const [resp, setResp] = React.useState<WorkflowStartResponse | null>(null);

  React.useEffect(() => {
    if (open && version) {
      setK("5");
      setSalt(version.id.slice(0, 8));
      setNamePrefix("fold");
      setResp(null);
      m.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, version?.id]);

  const kNum = Number.parseInt(k, 10);
  const kValid = Number.isFinite(kNum) && kNum >= 2;

  if (!version) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!version) return;
    m.mutate(
      {
        datasetID,
        body: {
          version_id: version.id,
          k: kNum,
          salt: salt.trim() || undefined,
          name_prefix: namePrefix.trim() || undefined,
        },
      },
      { onSuccess: setResp },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>K-fold splits on v{version.version}</DialogTitle>
          <DialogDescription>
            Produces K named split-sets ({namePrefix}-0 … {namePrefix}-{kValid ? kNum - 1 : "k-1"}).
            Each fold holds one bucket as test, the rest as train.
          </DialogDescription>
        </DialogHeader>

        {resp ? (
          <WorkflowStartResult resp={resp} onClose={() => onOpenChange(false)} />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                K (folds)
              </span>
              <Input
                value={k}
                onChange={(e) => setK(e.target.value)}
                type="number"
                min={2}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Name prefix
              </span>
              <Input
                value={namePrefix}
                onChange={(e) => setNamePrefix(e.target.value)}
                placeholder="fold"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Salt
              </span>
              <Input value={salt} onChange={(e) => setSalt(e.target.value)} />
            </label>

            {m.error && (
              <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-200">
                {(m.error as Error).message}
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
              <Button type="submit" disabled={m.isPending || !kValid}>
                {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Make k-fold
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Record quality observation — manual entry for runs that didn't write
// back automatically (or to add notes after the fact).
// ─────────────────────────────────────────────────────────────────────

export function RecordQualityDialog({
  open,
  onOpenChange,
  datasetID,
  version,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  datasetID: string;
  version: DatasetVersion | null;
}) {
  const m = useRecordQuality();
  const [distillRunID, setDistillRunID] = React.useState("");
  const [evalDelta, setEvalDelta] = React.useState("");
  const [won, setWon] = React.useState<"" | "true" | "false">("");
  const [rawMetrics, setRawMetrics] = React.useState("");
  const [resp, setResp] = React.useState<WorkflowStartResponse | null>(null);

  React.useEffect(() => {
    if (open && version) {
      setDistillRunID("");
      setEvalDelta("");
      setWon("");
      setRawMetrics("");
      setResp(null);
      m.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, version?.id]);

  let parsedMetrics: Record<string, unknown> | undefined;
  let metricsErr: string | null = null;
  if (rawMetrics.trim()) {
    try {
      const v = JSON.parse(rawMetrics);
      if (typeof v !== "object" || v === null || Array.isArray(v)) {
        metricsErr = "raw_metrics must be a JSON object";
      } else {
        parsedMetrics = v as Record<string, unknown>;
      }
    } catch (e) {
      metricsErr = (e as Error).message;
    }
  }

  const evalDeltaNum = evalDelta.trim()
    ? Number.parseFloat(evalDelta)
    : undefined;
  const hasAtLeastOne =
    evalDeltaNum !== undefined ||
    won !== "" ||
    (parsedMetrics && Object.keys(parsedMetrics).length > 0);

  if (!version) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!version) return;
    m.mutate(
      {
        datasetID,
        body: {
          version_id: version.id,
          distill_run_id: distillRunID.trim(),
          eval_delta: evalDeltaNum,
          won: won === "" ? undefined : won === "true",
          raw_metrics: parsedMetrics,
        },
      },
      { onSuccess: setResp },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record quality on v{version.version}</DialogTitle>
          <DialogDescription>
            Logs a feedback row from a training/eval run that consumed this
            version. At least one of eval_delta, won, raw_metrics must be set.
          </DialogDescription>
        </DialogHeader>

        {resp ? (
          <WorkflowStartResult resp={resp} onClose={() => onOpenChange(false)} />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Distill run ID (UUID)
              </span>
              <Input
                value={distillRunID}
                onChange={(e) => setDistillRunID(e.target.value)}
                required
                placeholder="00000000-0000-0000-0000-000000000000"
                pattern="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  Eval delta
                </span>
                <Input
                  value={evalDelta}
                  onChange={(e) => setEvalDelta(e.target.value)}
                  placeholder="0.0123"
                  inputMode="decimal"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  Won
                </span>
                <select
                  value={won}
                  onChange={(e) =>
                    setWon(e.target.value as "" | "true" | "false")
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm"
                >
                  <option value="">—</option>
                  <option value="true">yes</option>
                  <option value="false">no</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Raw metrics (JSON object)
              </span>
              <Textarea
                value={rawMetrics}
                onChange={(e) => setRawMetrics(e.target.value)}
                rows={3}
                placeholder='{"perplexity": 12.3, "bleu": 0.45}'
                className="font-mono text-xs"
              />
              {metricsErr && (
                <span className="text-[10px] text-rose-300">{metricsErr}</span>
              )}
            </label>

            {m.error && (
              <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-200">
                {(m.error as Error).message}
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
                disabled={
                  m.isPending ||
                  !distillRunID.trim() ||
                  !hasAtLeastOne ||
                  !!metricsErr
                }
              >
                {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
