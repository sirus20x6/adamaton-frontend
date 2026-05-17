// ScaleWorkerDialog — Nodes-page modal for spinning up an extra worker
// container on a given physical host. Opens from a "+" button on each
// rack header (see Nodes.tsx).
//
// Flow:
//   1. on mount, GET /api/v1/nodes/<host>/scalable → headroom + per-
//      service estimates + per-service current `running` count.
//   2. user picks a worker service from the dropdown (defaults to the
//      first one). Estimate row shows live cost-per-instance vs free
//      headroom, colored amber/rose when the projected delta would
//      push past 75% / 100% of free capacity.
//   3. user picks +1 / +2 / +3 (default +1). We translate to absolute
//      `replicas = running + delta` so the deploy-agent's --scale call
//      is deterministic regardless of races.
//   4. on confirm, POST /api/v1/nodes/<host>/scale → dashboard injects
//      bearer + proxies to the host's deploy-agent. Result reports
//      before/after container counts.
import { useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";

import {
  type ScalableEntry,
  useNodeScalable,
  useSpinUpService,
} from "@/api/nodes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostname: string;
  // Optional: accent tone strings from the parent rack so the dialog
  // can match the rack's color. Keep it opt-in to avoid coupling
  // Nodes.tsx's local ACCENTS map across files.
  accentText?: string;
  accentBorder?: string;
}

const DELTAS = [1, 2, 3] as const;

export function ScaleWorkerDialog({
  open,
  onOpenChange,
  hostname,
  accentText,
  accentBorder,
}: Props) {
  const scalable = useNodeScalable(hostname, open);
  const scale = useSpinUpService(hostname);

  // Selected service: default to the first scalable entry as soon as
  // the response lands. Reset on dialog close so a reopen shows the
  // current default rather than the previously-picked one.
  const [picked, setPicked] = useState<string | null>(null);
  const [delta, setDelta] = useState<(typeof DELTAS)[number]>(1);

  const entries = scalable.data?.scalable ?? [];
  const headroom = scalable.data?.headroom;

  const current: ScalableEntry | null = useMemo(() => {
    if (entries.length === 0) return null;
    const want = picked ?? entries[0]?.service ?? null;
    return entries.find((e) => e.service === want) ?? entries[0] ?? null;
  }, [entries, picked]);

  const projected = useMemo(() => {
    if (!current) return null;
    return {
      cpu: current.estimate.cpu_pct * delta,
      ram: current.estimate.ram_gb * delta,
    };
  }, [current, delta]);

  const heat = useMemo<"ok" | "warn" | "hot">(() => {
    if (!projected || !headroom) return "ok";
    const cpuFrac = projected.cpu / Math.max(1, headroom.cpu_pct_free);
    const ramFrac = projected.ram / Math.max(0.01, headroom.ram_gb_free);
    const worst = Math.max(cpuFrac, ramFrac);
    if (worst >= 1) return "hot";
    if (worst >= 0.75) return "warn";
    return "ok";
  }, [projected, headroom]);

  const heatColor =
    heat === "hot"
      ? "text-rose-300 border-rose-500/40 bg-rose-500/10"
      : heat === "warn"
        ? "text-amber-300 border-amber-500/40 bg-amber-500/10"
        : "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";

  const handleConfirm = () => {
    if (!current) return;
    scale.mutate(
      {
        service: current.service,
        replicas: current.running + delta,
        provisioned: current.provisioned,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setPicked(null);
          setDelta(1);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setPicked(null);
          setDelta(1);
          scale.reset();
        }
      }}
    >
      <DialogContent className={cn("max-w-md", accentBorder)}>
        <DialogHeader>
          <DialogTitle className={cn("flex items-center gap-2", accentText)}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            Spin up a worker on <span className="font-mono">{hostname}</span>
          </DialogTitle>
          <DialogDescription>
            Adds one or more replicas of a scalable worker to this rack.
            Resource estimate is derived from live telemetry of the same
            worker type elsewhere in the fleet.
          </DialogDescription>
        </DialogHeader>

        {/* Loading / empty / error states */}
        {scalable.isLoading && (
          <div className="flex h-24 items-center justify-center font-mono text-xs uppercase tracking-[0.25em] text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> probing
          </div>
        )}
        {scalable.error && (
          <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-200">
            {String((scalable.error as Error).message)}
          </div>
        )}
        {scalable.data && entries.length === 0 && (
          <div className="rounded border border-dashed border-border bg-card/30 p-4 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-slate-500">
            No scalable workers declared for {hostname}.
          </div>
        )}

        {/* Headroom strip */}
        {headroom && (
          <div className="grid grid-cols-2 gap-3 rounded border border-border/60 bg-background/40 px-3 py-2">
            <Metric
              label="cpu free"
              value={`${headroom.cpu_pct_free.toFixed(0)}%`}
              source={headroom.source}
            />
            <Metric
              label="ram free"
              value={
                headroom.ram_gb_total > 0
                  ? `${headroom.ram_gb_free.toFixed(1)} / ${headroom.ram_gb_total.toFixed(1)} G`
                  : "—"
              }
              source={headroom.source}
            />
          </div>
        )}

        {entries.length > 0 && (
          <>
            {/* Service picker */}
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                worker
              </span>
              <select
                className="h-9 rounded border border-input bg-background px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={current?.service ?? ""}
                onChange={(e) => setPicked(e.target.value)}
              >
                {entries.map((e) => (
                  <option key={e.service} value={e.service}>
                    {e.service}
                    {e.provisioned
                      ? ` · running ${e.running}`
                      : " · ✨ new on this host"}
                  </option>
                ))}
              </select>
            </label>

            {current && !current.provisioned && (
              <div className="rounded border border-sky-500/30 bg-sky-500/10 px-3 py-2 font-mono text-[11px] text-sky-200">
                First spin will render a compose block + pull the image
                (~30s). Subsequent spins of this worker are fast.
              </div>
            )}

            {/* Delta picker */}
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                add
              </span>
              <div className="flex overflow-hidden rounded border border-border">
                {DELTAS.map((d) => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => setDelta(d)}
                    className={cn(
                      "h-8 w-12 font-mono text-xs transition-colors",
                      delta === d
                        ? "bg-primary text-primary-foreground"
                        : "text-slate-400 hover:bg-accent",
                    )}
                  >
                    +{d}
                  </button>
                ))}
              </div>
            </div>

            {/* Estimate row */}
            {current && projected && (
              <div
                className={cn(
                  "rounded border px-3 py-2 font-mono text-xs",
                  heatColor,
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="uppercase tracking-[0.2em] opacity-70">
                    estimated cost
                  </span>
                  <span className="text-[10px] opacity-50">
                    {current.estimate.source}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-3 tabular-nums">
                  <span>
                    cpu +{projected.cpu.toFixed(1)}%{" "}
                    <span className="opacity-50">
                      (={current.estimate.cpu_pct.toFixed(1)}% ×{delta})
                    </span>
                  </span>
                  <span>·</span>
                  <span>
                    ram +{(projected.ram * 1024).toFixed(0)} MB{" "}
                    <span className="opacity-50">
                      (={(current.estimate.ram_gb * 1024).toFixed(0)} MB ×{delta})
                    </span>
                  </span>
                </div>
                {heat === "hot" && (
                  <div className="mt-1 text-[11px]">
                    Exceeds free headroom. Confirm only if you're sure.
                  </div>
                )}
                {heat === "warn" && (
                  <div className="mt-1 text-[11px]">
                    Will use &gt; 75% of free headroom.
                  </div>
                )}
              </div>
            )}

            {scale.error && (
              <div className="rounded border border-rose-500/40 bg-rose-500/10 p-2 font-mono text-xs text-rose-200">
                {String((scale.error as Error).message)}
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={scale.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!current || scale.isPending}
          >
            {scale.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                {current && !current.provisioned ? "Provisioning" : "Spinning"}
              </>
            ) : current && !current.provisioned ? (
              <>Provision +{delta}</>
            ) : (
              <>Spin up {current ? `+${delta}` : ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({
  label,
  value,
  source,
}: {
  label: string;
  value: string;
  source: string;
}) {
  return (
    <div
      className="flex flex-col"
      title={`source: ${source}`}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </span>
      <span className="font-mono text-sm font-semibold tabular-nums text-slate-100">
        {value}
      </span>
    </div>
  );
}
