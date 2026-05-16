/**
 * Nodes — fleet console.
 *
 * Worker registry from /evo-api/api/v1/workers. Device-class grouping +
 * live CPU/RAM telemetry sampled by core/workerregistry/telemetry.go.
 * Read-only. Visual: terminal-HUD aesthetic — segmented LED meters,
 * pulsing status orbs, per-class accent washes, scanning data beams.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Cpu,
  Flame,
  Gauge as GaugeIcon,
  HardDrive,
  MemoryStick,
  Microchip,
  Monitor,
  Network,
  Radio,
  Server,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const EVO_BASE = "/evo-api/api/v1";

interface Worker {
  id: string;
  identity?: string;
  hostname: string;
  status: "online" | "stale" | "offline" | "active" | "draining" | "maintenance" | "banned" | string;
  cpu_arch?: string;
  cpu_count?: number;
  ram_gb?: number;
  ram_used_gb?: number;
  cpu_pct?: number;
  load_avg_1m?: number;
  gpu_model?: string;
  gpu_count?: number;
  gpu_vram_gb?: number;
  driver_version?: string;
  declared_queues?: string[];
  tags?: string[];
  version?: string;
  last_heartbeat?: string;
  last_heartbeat_at?: string;
}

async function listWorkers(): Promise<Worker[]> {
  const res = await fetch(`${EVO_BASE}/workers`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? body : body.workers ?? [];
}

// ─────────────────────────────────────────────────────────────────────
// Color tokens — per device-class accent suite. Bundles every variant
// so a component only deals with one DeviceClass.accent rather than
// composing strings inline.
// ─────────────────────────────────────────────────────────────────────

interface AccentTone {
  text: string;
  textMuted: string;
  bg: string;
  bgStrong: string;
  border: string;
  borderStrong: string;
  fromGradient: string;
  glowRGB: string; // rgb triple for inline shadow color
}

const ACCENTS = {
  rose: {
    text: "text-rose-300",
    textMuted: "text-rose-400/70",
    bg: "bg-rose-500/10",
    bgStrong: "bg-rose-500/20",
    border: "border-rose-500/25",
    borderStrong: "border-rose-500/40",
    fromGradient: "from-rose-500/[0.04]",
    glowRGB: "251,113,133",
  },
  lime: {
    text: "text-lime-300",
    textMuted: "text-lime-400/70",
    bg: "bg-lime-500/10",
    bgStrong: "bg-lime-500/20",
    border: "border-lime-500/30",
    borderStrong: "border-lime-500/50",
    fromGradient: "from-lime-500/[0.04]",
    glowRGB: "163,230,53",
  },
  orange: {
    text: "text-orange-300",
    textMuted: "text-orange-400/70",
    bg: "bg-orange-500/10",
    bgStrong: "bg-orange-500/20",
    border: "border-orange-500/30",
    borderStrong: "border-orange-500/50",
    fromGradient: "from-orange-500/[0.04]",
    glowRGB: "251,146,60",
  },
  sky: {
    text: "text-sky-300",
    textMuted: "text-sky-400/70",
    bg: "bg-sky-500/10",
    bgStrong: "bg-sky-500/20",
    border: "border-sky-500/30",
    borderStrong: "border-sky-500/50",
    fromGradient: "from-sky-500/[0.04]",
    glowRGB: "56,189,248",
  },
  indigo: {
    text: "text-indigo-300",
    textMuted: "text-indigo-400/70",
    bg: "bg-indigo-500/10",
    bgStrong: "bg-indigo-500/20",
    border: "border-indigo-500/30",
    borderStrong: "border-indigo-500/50",
    fromGradient: "from-indigo-500/[0.04]",
    glowRGB: "129,140,248",
  },
  slate: {
    text: "text-slate-300",
    textMuted: "text-slate-400/70",
    bg: "bg-slate-500/10",
    bgStrong: "bg-slate-500/20",
    border: "border-slate-500/30",
    borderStrong: "border-slate-500/50",
    fromGradient: "from-slate-500/[0.04]",
    glowRGB: "148,163,184",
  },
} satisfies Record<string, AccentTone>;

interface DeviceClass {
  key: string;
  label: string;
  blurb: string;
  Icon: LucideIcon;
  accent: AccentTone;
}

const CLASS_NODE: DeviceClass = {
  key: "node",
  label: "Node",
  blurb: "Unclassified host",
  Icon: HardDrive,
  accent: ACCENTS.slate,
};

const CLASS_PI: DeviceClass = {
  key: "raspberry-pi",
  label: "Raspberry Pi",
  blurb: "ARM single-board edge compute",
  Icon: Cpu,
  accent: ACCENTS.rose,
};

const CLASS_JETSON: DeviceClass = {
  key: "jetson",
  label: "Jetson / ARM·GPU",
  blurb: "ARM host with accelerator on board",
  Icon: Microchip,
  accent: ACCENTS.lime,
};

const CLASS_GPU_RIG: DeviceClass = {
  key: "gpu-rig",
  label: "GPU Rig",
  blurb: "High-VRAM training silicon",
  Icon: Flame,
  accent: ACCENTS.orange,
};

const CLASS_WORKSTATION: DeviceClass = {
  key: "workstation",
  label: "Workstation",
  blurb: "Desktop-class compute",
  Icon: Monitor,
  accent: ACCENTS.sky,
};

const CLASS_SERVER: DeviceClass = {
  key: "server",
  label: "Server",
  blurb: "Multi-core headless host",
  Icon: Server,
  accent: ACCENTS.indigo,
};

const CLASS_ORDER = [
  CLASS_GPU_RIG.key,
  CLASS_WORKSTATION.key,
  CLASS_SERVER.key,
  CLASS_JETSON.key,
  CLASS_PI.key,
  CLASS_NODE.key,
];

const STATUS_ORDER: Record<string, number> = {
  online: 0,
  active: 0,
  stale: 1,
  draining: 1,
  maintenance: 2,
  offline: 3,
  banned: 4,
};

function hasGPU(w: Worker): boolean {
  return Boolean(w.gpu_model && (w.gpu_count ?? 0) > 0);
}

function isOnline(w: Worker): boolean {
  return w.status === "online" || w.status === "active";
}

function classify(w: Worker): DeviceClass {
  const arm = w.cpu_arch === "arm64" || w.cpu_arch === "aarch64";
  if (arm && hasGPU(w)) return CLASS_JETSON;
  if (arm && !hasGPU(w) && (w.ram_gb ?? 0) <= 16) return CLASS_PI;
  if (hasGPU(w) && (w.gpu_vram_gb ?? 0) >= 24) return CLASS_GPU_RIG;
  if (hasGPU(w)) return CLASS_WORKSTATION;
  if ((w.cpu_count ?? 0) >= 16) return CLASS_SERVER;
  return CLASS_NODE;
}

// ─────────────────────────────────────────────────────────────────────
// Threshold tones — drives meter color + numeric readout tint. Same
// emerald < 60% < amber < 85% < rose semantics as before.
// ─────────────────────────────────────────────────────────────────────

type Threshold = "cool" | "warn" | "hot";

function thresholdOf(pct: number): Threshold {
  if (pct >= 85) return "hot";
  if (pct >= 60) return "warn";
  return "cool";
}

const THRESHOLD: Record<
  Threshold,
  { fill: string; text: string; glowRGB: string }
> = {
  cool: { fill: "bg-emerald-400", text: "text-emerald-300", glowRGB: "52,211,153" },
  warn: { fill: "bg-amber-400", text: "text-amber-300", glowRGB: "251,191,36" },
  hot: { fill: "bg-rose-400", text: "text-rose-300", glowRGB: "251,113,133" },
};

// ─────────────────────────────────────────────────────────────────────
// Status pills — small, monospace, uppercase. Used in node rows.
// ─────────────────────────────────────────────────────────────────────

interface StatusTone {
  dot: string;
  text: string;
  bg: string;
  border: string;
  label: string;
  glowRGB: string;
  alive: boolean;
}

const STATUS_TONES = {
  online: {
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    label: "ONLINE",
    glowRGB: "52,211,153",
    alive: true,
  },
  active: {
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    label: "ONLINE",
    glowRGB: "52,211,153",
    alive: true,
  },
  stale: {
    dot: "bg-amber-400",
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    label: "STALE",
    glowRGB: "251,191,36",
    alive: false,
  },
  draining: {
    dot: "bg-amber-400",
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    label: "DRAINING",
    glowRGB: "251,191,36",
    alive: false,
  },
  maintenance: {
    dot: "bg-slate-400",
    text: "text-slate-300",
    bg: "bg-slate-500/10",
    border: "border-slate-500/30",
    label: "MAINT",
    glowRGB: "148,163,184",
    alive: false,
  },
  offline: {
    dot: "bg-rose-500",
    text: "text-rose-300",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    label: "OFFLINE",
    glowRGB: "244,63,94",
    alive: false,
  },
  banned: {
    dot: "bg-rose-500",
    text: "text-rose-300",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    label: "BANNED",
    glowRGB: "244,63,94",
    alive: false,
  },
} satisfies Record<string, StatusTone>;

function toneFor(status: string): StatusTone {
  return (STATUS_TONES as Record<string, StatusTone | undefined>)[status]
    ?? STATUS_TONES.offline;
}

// ─────────────────────────────────────────────────────────────────────
// Hardware specs — what each known host *is*. Static lookup because
// /proc doesn't expose theoretical TOPS, memory bandwidth, or NVMe
// model. Backend probes (lsblk, dmidecode) could fill this in later;
// for now we hand-curate per hostname so the right column has something
// to render.
// ─────────────────────────────────────────────────────────────────────

interface HostSpec {
  // Peak theoretical compute, free-form ("~10 GFLOPS" / "104 TFLOPS")
  compute?: string;
  // Memory bandwidth, free-form ("~17 GB/s" / "75 GB/s DDR5")
  memBw?: string;
  // Persistent storage summary
  storage?: string;
}

const HOST_SPECS: Record<string, HostSpec> = {
  pi: {
    compute: "~10 GFLOPS",
    memBw: "17 GB/s",
    storage: "NVMe",
  },
};

// Map gpu_model substrings to FP32 TFLOPS estimates. First-match wins.
const GPU_TFLOPS: Array<[RegExp, string]> = [
  [/RTX\s*5090/i, "104 TFLOPS"],
  [/RTX\s*4090/i, "83 TFLOPS"],
  [/RTX\s*4080/i, "49 TFLOPS"],
  [/RTX\s*3090/i, "36 TFLOPS"],
  [/RTX\s*3080/i, "30 TFLOPS"],
  [/A100/i, "19.5 TFLOPS"],
  [/H100/i, "67 TFLOPS"],
  [/L40/i, "91 TFLOPS"],
];

function gpuTflops(model: string | undefined): string | null {
  if (!model) return null;
  for (const [re, val] of GPU_TFLOPS) if (re.test(model)) return val;
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Worker profiles — which resources each worker *type* leans on. Drives
// the row of resource icons below the identity. Keyed on the bare
// identity (the part before @ in evo.workers.id).
// ─────────────────────────────────────────────────────────────────────

type ResourceTag = "cpu" | "ram" | "disk" | "net" | "gpu";

const WORKER_USES: Record<string, ResourceTag[]> = {
  "skills-worker": ["cpu", "net"],
  "dispatch-worker": ["cpu"],
  "evo-worker": ["cpu", "ram"],
  "reindex-worker": ["cpu", "net", "disk"],
  "nano-research-worker": ["cpu", "ram", "net"],
  "workflow-worker": ["cpu", "net"],
  "host-agent": [],
};

const RESOURCE_META: Record<
  ResourceTag,
  { Icon: LucideIcon; label: string; tone: string }
> = {
  cpu: { Icon: Cpu, label: "cpu-bound", tone: "text-sky-300" },
  ram: { Icon: MemoryStick, label: "memory-bound", tone: "text-violet-300" },
  disk: { Icon: HardDrive, label: "disk-bound", tone: "text-amber-300" },
  net: { Icon: Network, label: "network-bound", tone: "text-emerald-300" },
  gpu: { Icon: Zap, label: "gpu-bound", tone: "text-orange-300" },
};

function ResourceIcons({ tags }: { tags: ResourceTag[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      {tags.map((t) => {
        const meta = RESOURCE_META[t];
        return (
          <span
            key={t}
            title={meta.label}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-md border border-border/60 bg-card/60",
              meta.tone,
            )}
          >
            <meta.Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
        );
      })}
    </div>
  );
}

// SpecLine — one labeled spec on the right side of a row.
function SpecLine({
  Icon,
  label,
  value,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5 font-mono text-xs text-slate-200"
      title={`${label}: ${value}`}
    >
      <Icon className="h-3.5 w-3.5 text-slate-500" strokeWidth={2} />
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// StatusOrb — pulsing dot. When `alive`, two concentric ghost rings
// expand outward on a stagger to suggest a heartbeat.
// ─────────────────────────────────────────────────────────────────────

function StatusOrb({ status }: { status: string }) {
  const tone = toneFor(status);
  return (
    <span className="relative inline-flex h-3 w-3 shrink-0 items-center justify-center">
      <span
        className={cn("relative block h-2 w-2 rounded-full", tone.dot)}
        style={{
          boxShadow: `0 0 8px rgba(${tone.glowRGB},0.6)`,
          animation: tone.alive
            ? "node-fade 3.4s ease-in-out infinite"
            : undefined,
        }}
      />
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SegmentMeter — LED-style horizontal bar. 24 segments, lit by
// threshold-tinted blocks with a soft glow. Missing telemetry collapses
// to a dashed "no data" line so dark-screen vs zero-utilization stays
// distinguishable at a glance.
// ─────────────────────────────────────────────────────────────────────

const SEGMENTS = 24;

interface MeterProps {
  label: string;
  pct: number | null | undefined;
  caption: string;
  // when true, render the missing-data placeholder
  missing: boolean;
}

function SegmentMeter({ label, pct, caption, missing }: MeterProps) {
  const clamped = typeof pct === "number" && Number.isFinite(pct)
    ? Math.max(0, Math.min(100, pct))
    : 0;
  const tone = THRESHOLD[thresholdOf(clamped)];
  const filled = missing ? 0 : Math.round((clamped / 100) * SEGMENTS);
  return (
    <div className="grid grid-cols-[2.25rem_1fr_5.25rem] items-center gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </span>
      {missing ? (
        <div className="flex items-center gap-2">
          <span className="block h-px flex-1 bg-slate-800" />
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-slate-600">
            no data
          </span>
          <span className="block h-px flex-1 bg-slate-800" />
        </div>
      ) : (
        <div className="flex h-3 items-center gap-[2px]">
          {Array.from({ length: SEGMENTS }).map((_, i) => {
            const isOn = i < filled;
            return (
              <span
                key={i}
                className={cn(
                  "h-full flex-1 rounded-[1px] transition-colors duration-500",
                  isOn ? tone.fill : "bg-slate-800/70",
                )}
                style={
                  isOn
                    ? {
                        boxShadow: `0 0 5px rgba(${tone.glowRGB},0.65)`,
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      )}
      <span
        className={cn(
          "text-right font-mono text-[11px] tabular-nums tracking-tight",
          missing ? "text-slate-700" : tone.text,
        )}
      >
        {missing ? "—" : caption}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Corner brackets — L-shaped scope-viewfinder marks at all 4 corners
// of a panel. Pure CSS, just borders on absolutely-positioned spans.
// ─────────────────────────────────────────────────────────────────────

function CornerBrackets({ tone }: { tone: AccentTone }) {
  const common = cn("pointer-events-none absolute h-3 w-3", tone.borderStrong);
  return (
    <>
      <span className={cn(common, "left-1 top-1 border-l border-t")} />
      <span className={cn(common, "right-1 top-1 border-r border-t")} />
      <span className={cn(common, "left-1 bottom-1 border-l border-b")} />
      <span className={cn(common, "right-1 bottom-1 border-r border-b")} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HBClock — re-renders every second so the "Xs ago" heartbeat caption
// counts up live, even between 5s react-query refetches.
// ─────────────────────────────────────────────────────────────────────

function useTick(ms: number): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

function formatHbAge(t: Date, now: number): string {
  const ms = now - t.getTime();
  if (ms < 0) return "now";
  if (ms < 1000) return "now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}

// ─────────────────────────────────────────────────────────────────────
// NodeRow — one worker. Three columns: identity (orb + hostname + meta
// chips), dual meters (CPU + RAM), and the right-side hardware chips
// (GPU, queues, heartbeat).
// ─────────────────────────────────────────────────────────────────────

interface NodeRowProps {
  w: Worker;
  accent: AccentTone;
  now: number;
}

function NodeRow({ w, accent, now }: NodeRowProps) {
  const cpuMissing = typeof w.cpu_pct !== "number";
  const cpuCaption = cpuMissing
    ? ""
    : `${(w.cpu_pct as number).toFixed(0)}%${
        w.cpu_count ? ` · ${w.cpu_count}c` : ""
      }`;

  const ramTotal = w.ram_gb ?? 0;
  const ramUsed = typeof w.ram_used_gb === "number" ? w.ram_used_gb : null;
  const ramPct =
    ramUsed != null && ramTotal > 0 ? (ramUsed / ramTotal) * 100 : null;
  const ramMissing = ramPct == null;
  const ramCaption = ramMissing
    ? ""
    : `${ramUsed!.toFixed(1)}/${ramTotal}G`;

  const gpu = hasGPU(w)
    ? `${w.gpu_model}${
        w.gpu_count && w.gpu_count > 1 ? `×${w.gpu_count}` : ""
      }`
    : null;

  const hbRaw = w.last_heartbeat ?? w.last_heartbeat_at;
  const hb = hbRaw ? new Date(hbRaw) : null;
  const hbValid = hb && !Number.isNaN(hb.getTime()) ? hb : null;

  const tone = toneFor(w.status);

  // identity = worker TYPE (what it does). hostname = WHERE it runs.
  const identity = w.identity ?? w.id.split("@")[0] ?? w.id;
  const host = HOST_SPECS[w.hostname];
  const uses = WORKER_USES[identity] ?? [];

  // Compute readout: per-host CPU figure overridden by GPU TFLOPS if a
  // GPU is attached (since GPU compute dominates in those cases).
  const gpuCompute = gpuTflops(w.gpu_model);
  const computeStr = gpuCompute ?? host?.compute ?? null;

  return (
    <li className="group/row relative grid grid-cols-12 items-start gap-4 px-5 py-4 transition-colors hover:bg-white/[0.025]">
      {/* hover accent stripe */}
      <span
        className={cn(
          "absolute left-0 top-1/2 h-10 w-px -translate-y-1/2 opacity-0 transition-opacity group-hover/row:opacity-100",
          accent.bgStrong,
        )}
      />

      {/* Identity — hero column */}
      <div className="col-span-4 flex min-w-0 items-center gap-3">
        <StatusOrb status={w.status} />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* Identity text block */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3 className="font-mono text-[17px] font-semibold leading-tight tracking-tight text-slate-50">
                {identity}
              </h3>
              <span className="font-mono text-[11px] text-slate-500">
                @ {w.hostname}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.18em]">
              <span
                className={cn(
                  "shrink-0 rounded-sm border px-1.5 py-px tracking-[0.22em]",
                  tone.bg,
                  tone.border,
                  tone.text,
                )}
              >
                {tone.label}
              </span>
              <span className="text-slate-500">{w.cpu_arch ?? "—"}</span>
              <span className="text-slate-700">·</span>
              <span className="tabular-nums text-slate-500">
                {w.cpu_count ?? "—"}c
              </span>
              {typeof w.load_avg_1m === "number" && (
                <>
                  <span className="text-slate-700">·</span>
                  <span className="tabular-nums text-slate-500">
                    L{w.load_avg_1m.toFixed(2)}
                  </span>
                </>
              )}
            </div>
          </div>
          {/* Resource icons — sized to roughly span the two text lines */}
          <ResourceIcons tags={uses} />
        </div>
      </div>

      {/* Meters */}
      <div className="col-span-5 flex flex-col gap-2 pt-1">
        <SegmentMeter
          label="CPU"
          pct={w.cpu_pct}
          caption={cpuCaption}
          missing={cpuMissing}
        />
        <SegmentMeter
          label="RAM"
          pct={ramPct}
          caption={ramCaption}
          missing={ramMissing}
        />
      </div>

      {/* Right side: GPU + 4 stats in 2 lines */}
      <div className="col-span-3 flex flex-col items-end gap-2 pt-1">
        {gpu ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px]",
              ACCENTS.orange.border,
              ACCENTS.orange.bg,
              ACCENTS.orange.text,
            )}
            title={`${gpu}${w.gpu_vram_gb ? ` · ${w.gpu_vram_gb} GB VRAM` : ""}${w.driver_version ? ` · driver ${w.driver_version}` : ""}`}
          >
            <Zap className="h-2.5 w-2.5" strokeWidth={2.5} />
            <span className="truncate max-w-[140px]">{gpu}</span>
            {w.gpu_vram_gb ? (
              <span className="text-orange-400/80">·{w.gpu_vram_gb}G</span>
            ) : null}
          </span>
        ) : null}

        {/* 2 lines × up to 2 stats each: compute · mem-bw / storage · ♥+queue */}
        <div className="flex flex-col items-end gap-1.5">
          {(computeStr || host?.memBw) && (
            <div className="flex items-center gap-4">
              {computeStr && (
                <SpecLine
                  Icon={gpuCompute ? Zap : GaugeIcon}
                  label="compute"
                  value={computeStr}
                />
              )}
              {host?.memBw && (
                <SpecLine
                  Icon={MemoryStick}
                  label="memory bandwidth"
                  value={host.memBw}
                />
              )}
            </div>
          )}
          {(host?.storage || hbValid) && (
            <div className="flex items-center gap-4">
              {host?.storage && (
                <SpecLine
                  Icon={HardDrive}
                  label="storage"
                  value={host.storage}
                />
              )}
              {hbValid && (
                <span
                  className="flex items-center gap-1.5 font-mono text-xs text-slate-200"
                  title={`heartbeat${w.declared_queues?.length ? ` · ${w.declared_queues.join(", ")}` : ""}`}
                >
                  <span
                    className="block h-2 w-2 rounded-full bg-emerald-400/90"
                    style={{
                      animation: "node-fade 3.4s ease-in-out infinite",
                      boxShadow: "0 0 4px rgba(52,211,153,0.5)",
                    }}
                  />
                  <span className="tabular-nums">
                    {formatHbAge(hbValid, now)}
                  </span>
                  {w.declared_queues && w.declared_queues.length > 0 && (
                    <span className="text-slate-500">
                      · {w.declared_queues.length}q
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────
// GroupRack — one device-class card. Big icon + RACK label + class
// title + online ratio. Scanning beam across the top edge, corner
// brackets, accent gradient fading from the left.
// ─────────────────────────────────────────────────────────────────────

interface GroupRackProps {
  cls: DeviceClass;
  members: Worker[];
  rackId: string;
  now: number;
}

function GroupRack({ cls, members, rackId, now }: GroupRackProps) {
  const Icon = cls.Icon;
  const onlineCount = members.filter(isOnline).length;
  const allOnline = onlineCount === members.length;
  const anyOnline = onlineCount > 0;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card/30 backdrop-blur-sm",
        cls.accent.border,
      )}
      style={{
        boxShadow: `0 0 32px -16px rgba(${cls.accent.glowRGB},0.25)`,
      }}
    >
      {/* accent wash, gradient from left edge */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent",
          cls.accent.fromGradient,
        )}
        style={{ maskImage: "linear-gradient(to right, black, transparent 60%)" }}
      />

      {/* left accent stripe */}
      <div
        className={cn(
          "absolute left-0 top-0 h-full w-[3px]",
          cls.accent.bgStrong,
        )}
        style={{
          background: `linear-gradient(180deg, rgba(${cls.accent.glowRGB},0.9), rgba(${cls.accent.glowRGB},0.15))`,
        }}
      />

      <CornerBrackets tone={cls.accent} />

      <header
        className={cn(
          "relative flex items-center justify-between gap-4 border-b px-5 py-4",
          cls.accent.border,
        )}
      >
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border",
              cls.accent.bg,
              cls.accent.borderStrong,
            )}
            style={{
              boxShadow: `inset 0 0 20px rgba(${cls.accent.glowRGB},0.15), 0 0 12px rgba(${cls.accent.glowRGB},0.25)`,
            }}
          >
            <Icon
              className={cn("h-6 w-6", cls.accent.text)}
              strokeWidth={1.5}
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-baseline gap-3">
              <span
                className={cn(
                  "font-mono text-[10px] uppercase tracking-[0.28em]",
                  cls.accent.text,
                )}
              >
                {rackId}
              </span>
              <h2 className="text-base font-semibold tracking-tight text-slate-100">
                {cls.label}
              </h2>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">{cls.blurb}</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Activity
              className={cn(
                "h-3.5 w-3.5",
                allOnline
                  ? "text-emerald-400"
                  : anyOnline
                    ? "text-amber-400"
                    : "text-rose-400",
              )}
              strokeWidth={2.5}
            />
            <span className="font-mono text-sm tabular-nums">
              <span
                className={cn(
                  "font-semibold",
                  allOnline
                    ? "text-emerald-300"
                    : anyOnline
                      ? "text-amber-300"
                      : "text-rose-300",
                )}
              >
                {onlineCount}
              </span>
              <span className="mx-1 text-slate-700">/</span>
              <span className="text-slate-400">{members.length}</span>
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
              online
            </span>
          </div>
        </div>
      </header>

      <ul className="relative divide-y divide-border/40">
        {members.map((m) => (
          <NodeRow key={m.id} w={m} accent={cls.accent} now={now} />
        ))}
      </ul>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HUD header — fleet name + ticking clock + aggregate stat tiles.
// ─────────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "emerald" | "amber" | "rose";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "amber"
        ? "text-amber-300"
        : tone === "rose"
          ? "text-rose-300"
          : "text-slate-100";
  return (
    <div className="flex flex-col items-end gap-px">
      <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-slate-500">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-lg font-semibold leading-none tabular-nums",
          toneCls,
        )}
      >
        {value}
      </span>
    </div>
  );
}

interface FleetHeaderProps {
  total: number;
  online: number;
  avgCpu: number | null;
  ramUsed: number;
  ramTotal: number;
  now: number;
}

function FleetHeader({
  total,
  online,
  avgCpu,
  ramUsed,
  ramTotal,
  now,
}: FleetHeaderProps) {
  const clock = new Date(now).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const onlineTone =
    total === 0
      ? "default"
      : online === total
        ? "emerald"
        : online === 0
          ? "rose"
          : "amber";

  return (
    <header className="relative overflow-hidden rounded-xl border border-border bg-card/40 px-6 py-5">
      <div className="relative flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-lg border border-sky-500/25 bg-sky-500/10">
            <Radio
              className="h-6 w-6 text-sky-300"
              strokeWidth={1.75}
              style={{ animation: "node-fade 3s ease-in-out infinite" }}
            />
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-sky-400/80">
              ◢ fleet-console / live
            </div>
            <h1 className="mt-1 text-2xl font-semibold leading-none tracking-tight text-slate-50">
              Hardware Telemetry
            </h1>
            <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-slate-500">
              worker registry · refresh 5s
            </p>
          </div>
        </div>

        <div className="flex items-center gap-7">
          <StatTile label="Nodes" value={String(total)} />
          <StatTile
            label="Online"
            value={`${online}/${total}`}
            tone={onlineTone}
          />
          <StatTile
            label="Avg·CPU"
            value={avgCpu == null ? "—" : `${avgCpu.toFixed(0)}%`}
            tone={
              avgCpu == null
                ? "default"
                : avgCpu >= 85
                  ? "rose"
                  : avgCpu >= 60
                    ? "amber"
                    : "default"
            }
          />
          <StatTile
            label="RAM"
            value={
              ramTotal > 0
                ? `${ramUsed.toFixed(0)}/${ramTotal}G`
                : "—"
            }
          />
          <div className="ml-1 h-12 w-px bg-border/60" />
          <StatTile label="Local" value={clock} />
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Nodes — page entry point.
// ─────────────────────────────────────────────────────────────────────

export default function Nodes() {
  const { data: workers = [], isLoading, error } = useQuery({
    queryKey: ["nodes", "workers"],
    queryFn: listWorkers,
    refetchInterval: 5000,
  });

  const now = useTick(1000);

  const groups = useMemo(() => {
    const buckets = new Map<string, { cls: DeviceClass; members: Worker[] }>();
    for (const w of workers) {
      const cls = classify(w);
      let bucket = buckets.get(cls.key);
      if (!bucket) {
        bucket = { cls, members: [] };
        buckets.set(cls.key, bucket);
      }
      bucket.members.push(w);
    }
    for (const bucket of buckets.values()) {
      bucket.members.sort((a, b) => {
        const sa = STATUS_ORDER[a.status] ?? 9;
        const sb = STATUS_ORDER[b.status] ?? 9;
        if (sa !== sb) return sa - sb;
        return a.hostname.localeCompare(b.hostname);
      });
    }
    return CLASS_ORDER.map((k) => buckets.get(k)).filter(
      (g): g is { cls: DeviceClass; members: Worker[] } => Boolean(g),
    );
  }, [workers]);

  const aggregates = useMemo(() => {
    // Nodes / online are per-worker — each row in the page counts.
    const total = workers.length;
    const online = workers.filter(isOnline).length;

    // RAM and CPU% are *host* properties, not worker properties: every
    // worker on a host samples the same /proc/meminfo + /proc/stat, so
    // summing across workers would multiply Pi's 4 GB by however many
    // workers it runs. Dedupe by hostname before aggregating.
    const seen = new Set<string>();
    let cpuSum = 0;
    let cpuCount = 0;
    let ramUsed = 0;
    let ramTotal = 0;
    for (const w of workers) {
      if (seen.has(w.hostname)) continue;
      seen.add(w.hostname);
      if (typeof w.cpu_pct === "number") {
        cpuSum += w.cpu_pct;
        cpuCount++;
      }
      ramTotal += w.ram_gb ?? 0;
      if (typeof w.ram_used_gb === "number") ramUsed += w.ram_used_gb;
    }
    return {
      total,
      online,
      avgCpu: cpuCount > 0 ? cpuSum / cpuCount : null,
      ramUsed,
      ramTotal,
    };
  }, [workers]);

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <style>{`
        @keyframes node-fade {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1;    }
        }
      `}</style>

      <FleetHeader {...aggregates} now={now} />

      {isLoading && (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border bg-card/30">
          <span
            className="font-mono text-[11px] uppercase tracking-[0.35em] text-slate-500"
            style={{ animation: "node-fade 2.8s ease-in-out infinite" }}
          >
            ··· acquiring telemetry ···
          </span>
        </div>
      )}

      {error && (
        <div className="relative overflow-hidden rounded-xl border border-rose-500/40 bg-rose-950/30 p-4">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-rose-500/10 to-transparent" />
          <div className="relative flex items-center gap-3">
            <GaugeIcon className="h-4 w-4 text-rose-300" strokeWidth={2} />
            <div className="font-mono text-xs text-rose-200">
              <div className="text-[10px] uppercase tracking-[0.25em] text-rose-400">
                telemetry fault
              </div>
              <div className="mt-1">{String(error)}</div>
            </div>
          </div>
        </div>
      )}

      {!isLoading && !error && groups.length === 0 && (
        <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/30">
          <Radio className="h-6 w-6 text-slate-600" strokeWidth={1.5} />
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-slate-500">
            no nodes registered
          </span>
        </div>
      )}

      {!isLoading && !error && groups.length > 0 && (
        <div className="flex flex-col gap-4">
          {groups.map((g, i) => (
            <GroupRack
              key={g.cls.key}
              cls={g.cls}
              members={g.members}
              rackId={`RACK·${String(i + 1).padStart(2, "0")}`}
              now={now}
            />
          ))}
        </div>
      )}
    </div>
  );
}
