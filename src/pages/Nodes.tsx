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
  Plus,
  Radio,
  Server,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ScaleWorkerDialog } from "@/features/nodes/ScaleWorkerDialog";

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

// ─────────────────────────────────────────────────────────────────────
// Heartbeat staleness — a crashed worker stops heartbeating but the API
// may keep reporting status:"online" until it's reaped. Derive liveness
// client-side from heartbeat age so the orb goes amber → red instead of
// staying green forever (issue #124).
//
//   fresh   (< 90s)   → trust backend status (online/active)
//   stale   (≥ 90s)   → amber          (matches backend heartbeat_max_age: 90s)
//   offline (≥ 450s)  → red            (5× the stale threshold)
// ─────────────────────────────────────────────────────────────────────
const STALE_MS = 90_000;
const OFFLINE_MS = STALE_MS * 5; // 450_000 — 7.5 min with no heartbeat → offline

function heartbeatDate(w: Worker): Date | null {
  const raw = w.last_heartbeat ?? w.last_heartbeat_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// effectiveStatus folds the client-side heartbeat-age calc into the
// reported status. A backend-supplied non-alive status (stale/offline/
// draining/maintenance/banned) is always authoritative and passes through
// untouched. For a worker the backend still calls online/active we
// downgrade it to "stale"/"offline" once its heartbeat ages past the
// thresholds. If there's no heartbeat to reason about, the reported
// status stands.
function effectiveStatus(w: Worker, now: number): string {
  // Trust any explicit non-alive signal from the backend (incl. a future
  // derived "status" field) — it knows more than a wall-clock diff does.
  if (w.status && w.status !== "online" && w.status !== "active") {
    return w.status;
  }
  const hb = heartbeatDate(w);
  if (!hb) return w.status;
  const age = now - hb.getTime();
  if (age >= OFFLINE_MS) return "offline";
  if (age >= STALE_MS) return "stale";
  return w.status;
}

function isOnline(w: Worker, now: number): boolean {
  const s = effectiveStatus(w, now);
  return s === "online" || s === "active";
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

// HOST_ALIASES collapses hostnames that name the same physical box.
// The blackwell GPU stack and the workstation Linux desktop run on the
// same machine: workers from the blackwell compose dir register with
// hostname=blackwell while workers from the workstation dir register
// with hostname=workstation. Without this alias, the Nodes view would
// show that one machine as two racks ("RACK·01" + "RACK·02").
// Keep in sync with platform/dashboard/apiserver/racks.yaml aliases.
const HOST_ALIASES: Record<string, string> = {
  blackwell: "workstation",
};
function canonicalHost(h: string): string {
  return HOST_ALIASES[h] ?? h;
}

const HOST_SPECS: Record<string, HostSpec> = {
  pi: {
    compute: "~10 GFLOPS",
    memBw: "17 GB/s",
    storage: "NVMe",
  },
  // EPYC 7473X — 24c/48t Zen 3 + 3D V-Cache, AVX2 (no AVX-512).
  // Compute: 24c × 16 FP32 ops/cycle × ~3.5 GHz ≈ 1.3 TFLOPS sustained.
  // MemBw: 8-channel DDR4-3200 ≈ 205 GB/s peak.
  // Storage: 2× Sabrent Rocket 4 Plus (PCIe 4.0, ~7 GB/s) + 4× 970 PRO.
  workstation: {
    compute: "~1.3 TFLOPS",
    memBw: "205 GB/s",
    storage: "NVMe",
  },
};

// Map gpu_model substrings to FP32 TFLOPS estimates. First-match wins.
// Order: more-specific patterns must come BEFORE more-general ones
// (e.g. "RTX PRO 6000" before "RTX 6000" if both existed).
const GPU_TFLOPS: Array<[RegExp, string]> = [
  // GB202 chip — same silicon as RTX 5090, 24064 CUDA cores @ ~2.6 GHz.
  [/RTX\s*PRO\s*6000.*Blackwell/i, "125 TFLOPS"],
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

// Collect one spec tuple per distinct host within a rack, deduped so that
// identical tuples coalesce. GPU info (model + VRAM) and GPU TFLOPS come
// from the first worker on each host that has a GPU; CPU compute, memory
// bandwidth, and storage come straight from HOST_SPECS.
interface RackHostSpec {
  gpu: string | null;     // "RTX PRO 6000 Blackwell · 96G"
  compute: string | null; // "125 TFLOPS" (GPU) or "~10 GFLOPS" (CPU)
  memBw: string | null;
  storage: string | null;
}

function rackSpecs(members: Worker[]): RackHostSpec[] {
  // Canonicalize the dedup key so a single physical machine that spans
  // multiple compose stacks (e.g. blackwell + workstation) doesn't
  // produce two spec rows in the same rack panel.
  const byHost = new Map<string, RackHostSpec>();
  for (const w of members) {
    const key = canonicalHost(w.hostname);
    if (byHost.has(key)) continue;
    const host = HOST_SPECS[key];
    const gpuLabel = hasGPU(w)
      ? `${w.gpu_model}${w.gpu_vram_gb ? ` · ${w.gpu_vram_gb}G` : ""}`
      : null;
    byHost.set(key, {
      gpu: gpuLabel,
      compute: gpuTflops(w.gpu_model) ?? host?.compute ?? null,
      memBw: host?.memBw ?? null,
      storage: host?.storage ?? null,
    });
  }
  const seen = new Set<string>();
  const out: RackHostSpec[] = [];
  for (const s of byHost.values()) {
    if (!s.gpu && !s.compute && !s.memBw && !s.storage) continue;
    const k = `${s.gpu ?? ""}|${s.compute ?? ""}|${s.memBw ?? ""}|${s.storage ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
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
  "cluster-sidecar": ["cpu", "ram", "net"],
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

// RackSpecChip — one labeled hardware spec rendered in the rack header.
// Larger than the previous per-row SpecLine: 5-px icon + stacked
// label/value so the value reads as the dominant figure.
function RackSpecChip({
  Icon,
  label,
  value,
  accent,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  accent: AccentTone;
}) {
  return (
    <div
      className="flex items-center gap-2.5"
      title={`${label}: ${value}`}
    >
      <Icon
        className={cn("h-5 w-5 shrink-0", accent.text)}
        strokeWidth={1.75}
      />
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-slate-500">
          {label}
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-slate-100">
          {value}
        </span>
      </div>
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

  const hbValid = heartbeatDate(w);

  // Liveness is derived from heartbeat age (issue #124): a crashed worker
  // the backend still calls "online" gets shown amber/red here.
  const status = effectiveStatus(w, now);
  const tone = toneFor(status);

  // identity = worker TYPE (what it does). hostname = WHERE it runs.
  const identity = w.identity ?? w.id.split("@")[0] ?? w.id;
  const uses = WORKER_USES[identity] ?? [];

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
        <StatusOrb status={status} />
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

      {/* Right side: heartbeat + queue count. GPU lives on the rack
          header now since it's a host-level fact, not a per-worker one. */}
      <div className="col-span-3 flex flex-col items-end gap-2 pt-1">

        {hbValid && (
          <span
            className="flex items-center gap-1.5 font-mono text-xs text-slate-200"
            title={`heartbeat${w.declared_queues?.length ? ` · ${w.declared_queues.join(", ")}` : ""}`}
          >
            <span
              className={cn("block h-2 w-2 rounded-full", tone.dot)}
              style={{
                animation: tone.alive
                  ? "node-fade 3.4s ease-in-out infinite"
                  : undefined,
                boxShadow: `0 0 4px rgba(${tone.glowRGB},0.5)`,
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
  hostname: string;
  members: Worker[];
  rackId: string;
  now: number;
}

function GroupRack({ cls, hostname, members, rackId, now }: GroupRackProps) {
  const Icon = cls.Icon;
  const onlineCount = members.filter((m) => isOnline(m, now)).length;
  const allOnline = onlineCount === members.length;
  const anyOnline = onlineCount > 0;
  const specs = rackSpecs(members);
  const [scaleOpen, setScaleOpen] = useState(false);

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
              <h2 className="font-mono text-base font-semibold tracking-tight text-slate-50">
                {hostname}
              </h2>
              <span
                className={cn(
                  "font-mono text-[10px] uppercase tracking-[0.22em]",
                  cls.accent.textMuted,
                )}
              >
                {cls.label}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">{cls.blurb}</p>
          </div>
        </div>

        {/* Rack-level hardware specs — inline, larger than per-row stats.
            One group per distinct host-spec triplet, separated by a thin
            divider when a rack spans heterogeneous hosts. */}
        {specs.length > 0 && (
          <div className="hidden flex-wrap items-center gap-x-6 gap-y-2 md:flex">
            {specs.map((s, idx) => (
              <div key={idx} className="flex items-center gap-6">
                {idx > 0 && (
                  <span className="block h-8 w-px bg-border/40" aria-hidden />
                )}
                {s.gpu && (
                  <RackSpecChip
                    Icon={Zap}
                    label="gpu"
                    value={s.gpu}
                    accent={cls.accent}
                  />
                )}
                {s.compute && (
                  <RackSpecChip
                    Icon={GaugeIcon}
                    label="compute"
                    value={s.compute}
                    accent={cls.accent}
                  />
                )}
                {s.memBw && (
                  <RackSpecChip
                    Icon={MemoryStick}
                    label="mem bw"
                    value={s.memBw}
                    accent={cls.accent}
                  />
                )}
                {s.storage && (
                  <RackSpecChip
                    Icon={HardDrive}
                    label="storage"
                    value={s.storage}
                    accent={cls.accent}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4">
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
          <button
            type="button"
            onClick={() => setScaleOpen(true)}
            title={`Spin up a worker on ${hostname}`}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
              cls.accent.border,
              "hover:" + cls.accent.bgStrong,
              cls.accent.text,
            )}
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </header>

      <ScaleWorkerDialog
        open={scaleOpen}
        onOpenChange={setScaleOpen}
        hostname={hostname}
        accentText={cls.accent.text}
        accentBorder={cls.accent.border}
      />

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
    <header className="relative rounded-xl border border-border bg-card/40 px-6 py-5">
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

  // Each physical compute device gets its own rack — bucket by hostname,
  // not device class. Device class is still derived (from the first worker
  // on that host) so the rack gets the right accent color, icon, and class
  // label; it just becomes a secondary descriptor instead of the group key.
  // canonicalHost() collapses HOST_ALIASES so multiple compose stacks on
  // one physical machine don't show up as separate racks.
  const groups = useMemo(() => {
    const buckets = new Map<string, { hostname: string; cls: DeviceClass; members: Worker[] }>();
    for (const w of workers) {
      const raw = w.hostname || w.id || "unknown";
      const host = canonicalHost(raw);
      let bucket = buckets.get(host);
      if (!bucket) {
        bucket = { hostname: host, cls: classify(w), members: [] };
        buckets.set(host, bucket);
      }
      bucket.members.push(w);
    }
    for (const bucket of buckets.values()) {
      bucket.members.sort((a, b) => {
        // Sort by *derived* status so a worker that just went stale/offline
        // sinks below its still-live siblings (issue #124).
        const sa = STATUS_ORDER[effectiveStatus(a, now)] ?? 9;
        const sb = STATUS_ORDER[effectiveStatus(b, now)] ?? 9;
        if (sa !== sb) return sa - sb;
        return (a.identity ?? a.id).localeCompare(b.identity ?? b.id);
      });
    }
    // Sort racks by device-class order first (GPU rigs at top, then
    // workstations, servers, jetson, pi, unclassified), then alpha by
    // hostname within a class — so the page reads top-down from most-
    // capable iron to least.
    const classRank = new Map(CLASS_ORDER.map((k, i) => [k, i] as const));
    return [...buckets.values()].sort((a, b) => {
      const ra = classRank.get(a.cls.key) ?? 99;
      const rb = classRank.get(b.cls.key) ?? 99;
      if (ra !== rb) return ra - rb;
      return a.hostname.localeCompare(b.hostname);
    });
  }, [workers, now]);

  const aggregates = useMemo(() => {
    // Nodes / online are per-worker — each row in the page counts.
    const total = workers.length;
    const online = workers.filter((w) => isOnline(w, now)).length;

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
  }, [workers, now]);

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
              key={g.hostname}
              cls={g.cls}
              hostname={g.hostname}
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
