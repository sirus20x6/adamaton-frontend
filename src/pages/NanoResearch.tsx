/**
 * NanoResearch — autonomous research pipeline page.
 *
 * Backend: nano-research:7378 (Caddy proxies /api/v1/nano/*).
 * Pattern follows Skills.tsx + Memory.tsx (bare-fetch hooks, shadcn
 * primitives, dark theme). Layout is master-detail split-pane (run list
 * left, run detail right) with an SSE-driven cache invalidation pulse.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { FlaskRound, Plus, Cpu } from "lucide-react";

import { Prose } from "@/components/markdown/Prose";
import {
  HighlightedCode,
  languageForArtifact,
} from "@/components/research/HighlightedCode";
import type { SnapshotChoice } from "@/components/research/RefineSnapshotDiff";
import { cn } from "@/lib/utils";
import {
  STAGES,
  nanoArtifactUrl,
  useCorrectStage,
  useCreateNanoRun,
  useDistillRuns,
  useNanoArtifacts,
  useNanoArtifactText,
  useNanoEvents,
  useNanoRun,
  useNanoRuns,
  useNanoTraces,
  useTriggerDistill,
  type ArtifactRow,
  type DistillRun,
  type DistillRunStatus,
  type LiveStages,
  type ResearchRun,
  type Stage,
  type TraceRow,
} from "../api/nanoResearch";

// React.lazy keeps react-diff-viewer-continued out of the initial bundle.
const RefineSnapshotDiff = lazy(
  () => import("@/components/research/RefineSnapshotDiff"),
);

const STATUS_TONES: Record<string, string> = {
  pending: "bg-slate-700/40 text-slate-300",
  running: "bg-amber-600/30 text-amber-300 animate-pulse",
  completed: "bg-emerald-700/30 text-emerald-300",
  failed: "bg-rose-700/40 text-rose-200",
  cancelled: "bg-slate-700/40 text-slate-400",
};

function modelTone(family: string): string {
  if (family.startsWith("claude")) return "bg-slate-700/50 text-slate-200";
  if (family.startsWith("qwen")) return "bg-emerald-700/40 text-emerald-200";
  if (family === "human") return "bg-amber-700/40 text-amber-200";
  return "bg-slate-800 text-slate-400";
}

type Mode = "runs" | "distill";

export default function NanoResearch() {
  // Top-level mode toggle: the master-detail run view (existing) vs the
  // Phase Q "Distillation" tab. State lifted here so the header switch
  // can render the right title + action button per mode.
  const [mode, setMode] = useState<Mode>("runs");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [topic, setTopic] = useState("");
  const [profile, setProfile] = useState<"local_quick" | "blackwell_full">("local_quick");

  const { data: runs = [], isLoading } = useNanoRuns();
  const createRun = useCreateNanoRun();

  // Phase P: structured SSE events. The hook handles query invalidation
  // (only on stage.finished / run.completed / legacy change) and exposes
  // a `liveStages` map the detail panel uses to repaint stage chips
  // before the polled queries catch up.
  const { liveStages } = useNanoEvents(selectedId);

  const submitCreate = async () => {
    if (!topic.trim()) return;
    const r = await createRun.mutateAsync({ topic: topic.trim(), profile });
    setSelectedId(r.id);
    setShowCreate(false);
    setTopic("");
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-900/30 p-2 text-emerald-300">
            <FlaskRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Research Runs</h1>
            <p className="text-xs text-slate-400">
              9-stage autonomous research pipeline (NanoResearch on SkillRAE)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-slate-700 bg-slate-900 p-0.5 text-xs">
            <button
              className={`flex items-center gap-1 rounded px-2.5 py-1 transition ${
                mode === "runs"
                  ? "bg-emerald-700 text-white"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
              onClick={() => setMode("runs")}
            >
              <FlaskRound className="h-3.5 w-3.5" /> Runs
            </button>
            <button
              className={`flex items-center gap-1 rounded px-2.5 py-1 transition ${
                mode === "distill"
                  ? "bg-emerald-700 text-white"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
              onClick={() => setMode("distill")}
            >
              <Cpu className="h-3.5 w-3.5" /> Distillation
            </button>
          </div>
          {mode === "runs" && (
            <button
              className="flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-4 w-4" /> New run
            </button>
          )}
        </div>
      </header>

      {mode === "distill" && <DistillationTab />}
      {mode === "runs" && (
        <RunsBody
          runs={runs}
          isLoading={isLoading}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          showCreate={showCreate}
          setShowCreate={setShowCreate}
          topic={topic}
          setTopic={setTopic}
          profile={profile}
          setProfile={setProfile}
          submitCreate={submitCreate}
          createRunPending={createRun.isPending}
          createRunError={createRun.isError ? createRun.error?.message : null}
          liveStages={liveStages}
        />
      )}
    </div>
  );
}

function RunsBody(props: {
  runs: ResearchRun[];
  isLoading: boolean;
  selectedId: string | null;
  setSelectedId: (s: string | null) => void;
  showCreate: boolean;
  setShowCreate: (b: boolean) => void;
  topic: string;
  setTopic: (s: string) => void;
  profile: "local_quick" | "blackwell_full";
  setProfile: (s: "local_quick" | "blackwell_full") => void;
  submitCreate: () => Promise<void>;
  createRunPending: boolean;
  createRunError: string | null;
  liveStages: LiveStages;
}) {
  const {
    runs, isLoading, selectedId, setSelectedId, showCreate, setShowCreate,
    topic, setTopic, profile, setProfile, submitCreate, createRunPending,
    createRunError, liveStages,
  } = props;

  return (
    <>

      {showCreate && (
        <div className="rounded-md border border-emerald-900/50 bg-emerald-950/30 p-3">
          <div className="mb-2 text-sm font-medium">Start a new research run</div>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="topic — e.g. compare ReLU vs GELU on MNIST"
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
          />
          <div className="mt-2 flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={profile === "local_quick"}
                onChange={() => setProfile("local_quick")}
              />
              local_quick
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={profile === "blackwell_full"}
                onChange={() => setProfile("blackwell_full")}
              />
              blackwell_full
            </label>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              className="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-500"
              onClick={submitCreate}
              disabled={createRunPending}
            >
              {createRunPending ? "starting…" : "Start"}
            </button>
            <button
              className="rounded border border-slate-700 px-3 py-1 text-xs"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
          </div>
          {createRunError && (
            <div className="mt-2 text-xs text-rose-400">
              {createRunError}
            </div>
          )}
        </div>
      )}

      <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-[24rem_1fr]">
        <div className="flex flex-col gap-2 overflow-y-auto rounded-md border border-slate-800 bg-slate-900/50 p-2">
          {isLoading && <div className="p-2 text-xs text-slate-500">loading…</div>}
          {runs.length === 0 && !isLoading && (
            <div className="p-2 text-xs text-slate-500">No runs yet.</div>
          )}
          {runs.map((r) => (
            <button
              key={r.id}
              className={`rounded border px-3 py-2 text-left text-sm transition ${
                selectedId === r.id
                  ? "border-emerald-700 bg-emerald-950/40"
                  : "border-slate-800 bg-slate-900 hover:bg-slate-800/60"
              }`}
              onClick={() => setSelectedId(r.id)}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    STATUS_TONES[r.status] ?? STATUS_TONES.pending
                  }`}
                >
                  {r.status}
                </span>
                <span className="text-[10px] text-slate-500">
                  {new Date(r.started_at).toLocaleString()}
                </span>
              </div>
              <div className="mt-1 line-clamp-2">{r.topic}</div>
              <div className="mt-1 text-[10px] text-slate-500">{r.profile}</div>
            </button>
          ))}
        </div>

        <div className="overflow-y-auto rounded-md border border-slate-800 bg-slate-900/50 p-3">
          {selectedId ? (
            <RunDetail runId={selectedId} liveStages={liveStages} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              select a run to see its stage timeline + artifacts
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Phase Q: Distillation tab ──────────────────────────────────────

const DISTILL_STATUS_TONES: Record<DistillRunStatus, string> = {
  pending: "bg-slate-700/40 text-slate-300",
  dataprep: "bg-amber-600/30 text-amber-300 animate-pulse",
  training: "bg-amber-600/30 text-amber-300 animate-pulse",
  eval: "bg-sky-700/30 text-sky-300 animate-pulse",
  promoted: "bg-emerald-700/30 text-emerald-300",
  rejected: "bg-slate-700/40 text-slate-400",
  failed: "bg-rose-700/40 text-rose-200",
};

function DistillationTab() {
  const { data: distillRuns = [], isLoading, error } = useDistillRuns();
  const trigger = useTriggerDistill();

  const onTrigger = async () => {
    if (
      !window.confirm(
        "Kick a distillation training run? This consumes labelled candidates and (if eval passes) hot-swaps the live vLLM head.",
      )
    ) {
      return;
    }
    await trigger.mutateAsync({});
  };

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400">
          Self-distillation training runs (Phase Q — DPO via Unsloth).
          Requires ≥500 labelled <code>valid_correction</code> candidates.
        </div>
        <button
          className="flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600 disabled:opacity-50"
          onClick={onTrigger}
          disabled={trigger.isPending}
        >
          {trigger.isPending ? "kicking…" : "Trigger training"}
        </button>
      </div>
      {trigger.isError && (
        <div className="rounded border border-rose-900 bg-rose-950/30 p-2 text-xs text-rose-300">
          trigger failed: {trigger.error?.message}
        </div>
      )}
      {trigger.isSuccess && trigger.data && (
        <div className="rounded border border-emerald-900 bg-emerald-950/30 p-2 text-xs text-emerald-300">
          started distill run{" "}
          <span className="font-mono">{trigger.data.distill_run_id}</span>{" "}
          (workflow <span className="font-mono">{trigger.data.workflow_id}</span>)
        </div>
      )}
      {error && (
        <div className="rounded border border-rose-900 bg-rose-950/30 p-2 text-xs text-rose-300">
          {error.message}
        </div>
      )}
      <div className="flex-1 overflow-y-auto rounded-md border border-slate-800 bg-slate-900/50">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2">status</th>
              <th className="px-3 py-2">lineage</th>
              <th className="px-3 py-2">samples</th>
              <th className="px-3 py-2">eval Δ</th>
              <th className="px-3 py-2">started</th>
              <th className="px-3 py-2">completed</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-slate-500">
                  loading…
                </td>
              </tr>
            )}
            {!isLoading && distillRuns.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-slate-500">
                  No distillation runs yet. Trigger one above (it will
                  short-circuit if &lt;500 labelled candidates exist).
                </td>
              </tr>
            )}
            {distillRuns.map((r) => (
              <DistillRow key={r.id} r={r} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DistillRow({ r }: { r: DistillRun }) {
  const delta = r.eval_delta;
  const oldMean = r.eval_old_mean;
  const newMean = r.eval_new_mean;
  return (
    <tr className="border-t border-slate-800">
      <td className="px-3 py-2">
        <span
          className={`rounded px-1.5 py-0.5 ${
            DISTILL_STATUS_TONES[r.status] ?? "bg-slate-700/40"
          }`}
        >
          {r.status}
        </span>
        {r.error && (
          <div className="mt-1 max-w-md truncate text-[10px] text-rose-300">
            {r.error}
          </div>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-[11px]">
        <div>{r.parent_model_id}</div>
        {r.new_model_id && (
          <div className="text-emerald-400">→ {r.new_model_id}</div>
        )}
      </td>
      <td className="px-3 py-2">{r.sample_count ?? "—"}</td>
      <td className="px-3 py-2">
        {delta != null ? (
          <span
            className={
              delta >= 0.5
                ? "text-emerald-300"
                : delta >= 0
                ? "text-amber-300"
                : "text-rose-300"
            }
          >
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(2)}
          </span>
        ) : (
          "—"
        )}
        {oldMean != null && newMean != null && (
          <div className="text-[10px] text-slate-500">
            {oldMean.toFixed(2)} → {newMean.toFixed(2)}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-slate-400">
        {new Date(r.started_at).toLocaleString()}
      </td>
      <td className="px-3 py-2 text-slate-400">
        {r.completed_at ? new Date(r.completed_at).toLocaleString() : "—"}
      </td>
    </tr>
  );
}

// Canonical pipeline order. REFINE isn't part of the `Stage` union (the
// public API only enumerates the 9 generation stages) but it surfaces on
// artifact rows via `a.stage` cast to a string, so we treat the ordered
// section list as widened. The mini-ToC + section ids use these labels
// verbatim.
type StageLabel = Stage | "REFINE";
const STAGE_ORDER: StageLabel[] = [...STAGES, "REFINE"];

function RunDetail({
  runId,
  liveStages,
}: {
  runId: string;
  liveStages: LiveStages;
}) {
  const { data: run } = useNanoRun(runId);
  const { data: artifacts = [] } = useNanoArtifacts(runId);
  const { data: traces = [] } = useNanoTraces(runId);

  const tracesByStage = useMemo(() => {
    const m = new Map<StageLabel, TraceRow[]>();
    for (const t of traces) {
      if (!t.stage) continue;
      const list = m.get(t.stage as StageLabel) ?? [];
      list.push(t);
      m.set(t.stage as StageLabel, list);
    }
    return m;
  }, [traces]);

  const artifactsByStage = useMemo(() => {
    const m = new Map<StageLabel, ArtifactRow[]>();
    for (const a of artifacts) {
      const s = a.stage as StageLabel;
      const list = m.get(s) ?? [];
      list.push(a);
      m.set(s, list);
    }
    return m;
  }, [artifacts]);

  // Stages with anything to show — artifacts OR traces. Skipping empty
  // stages keeps the scroll list focused on what the run actually
  // produced. REFINE only appears when a snapshot was emitted.
  const stagesPresent: StageLabel[] = useMemo(() => {
    return STAGE_ORDER.filter(
      (s) =>
        (artifactsByStage.get(s)?.length ?? 0) > 0 ||
        (tracesByStage.get(s)?.length ?? 0) > 0,
    );
  }, [artifactsByStage, tracesByStage]);

  // Mini-ToC: only list stages that have at least one artifact. Stages
  // that only carry traces still render their section (so timeline-click
  // scrolls there), but they don't clutter the nav.
  const stagesWithArtifacts: StageLabel[] = useMemo(() => {
    return STAGE_ORDER.filter(
      (s) => (artifactsByStage.get(s)?.length ?? 0) > 0,
    );
  }, [artifactsByStage]);

  const [activeStage, setActiveStage] = useState<StageLabel | null>(null);
  const detailRootRef = useRef<HTMLDivElement | null>(null);

  // IntersectionObserver tracks which stage section is roughly mid-viewport
  // and lights up the corresponding mini-ToC entry. The scroll ancestor in
  // this app is a div with `overflow-y-auto` on the right pane (not the
  // window), so we walk up from our root to find the nearest scrollable
  // element and use it as the observer root. Fallback: viewport.
  useEffect(() => {
    if (stagesPresent.length === 0) return;
    let scrollRoot: Element | null = null;
    let node: HTMLElement | null = detailRootRef.current;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      const oy = style.overflowY;
      if (oy === "auto" || oy === "scroll") {
        scrollRoot = node;
        break;
      }
      node = node.parentElement;
    }
    const sections: HTMLElement[] = [];
    for (const s of stagesPresent) {
      const el = document.getElementById(`stage-${s}`);
      if (el) sections.push(el);
    }
    if (sections.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        // Pick the highest-ratio intersecting entry, fall back to the
        // first one in document order so we don't flicker on partial
        // overlap.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length === 0) return;
        const id = visible[0].target.getAttribute("data-stage");
        if (id) setActiveStage(id as StageLabel);
      },
      {
        root: scrollRoot,
        threshold: [0.3, 0.6],
        rootMargin: "-20% 0px -60% 0px",
      },
    );
    for (const el of sections) obs.observe(el);
    return () => obs.disconnect();
  }, [stagesPresent]);

  const scrollToStage = (s: StageLabel) => {
    const el = document.getElementById(`stage-${s}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!run)
    return <div className="text-sm text-slate-500">loading run…</div>;

  return (
    <div
      ref={detailRootRef}
      className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_10rem]"
    >
      <div className="min-w-0 space-y-4">
        <header>
          <h2 className="text-base font-semibold">{run.topic}</h2>
          <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
            <span
              className={`rounded px-1.5 py-0.5 ${
                STATUS_TONES[run.status] ?? STATUS_TONES.pending
              }`}
            >
              {run.status}
            </span>
            <span>profile: {run.profile}</span>
            <span>started: {new Date(run.started_at).toLocaleString()}</span>
            {run.completed_at && (
              <span>completed: {new Date(run.completed_at).toLocaleString()}</span>
            )}
          </div>
        </header>

        <section>
          <div className="mb-2 text-xs font-medium text-slate-400">Stage timeline</div>
          <div className="flex flex-wrap gap-2">
            {STAGES.map((stage) => {
              const stageTraces = tracesByStage.get(stage) ?? [];
              const stageArts = artifactsByStage.get(stage) ?? [];
              // liveStages from the SSE reducer wins until the polled
              // queries catch up; it surfaces "running" (workflow has
              // entered the stage but no trace row yet) and recent
              // "done"/"failed" without waiting for the next poll tick.
              const live = liveStages[stage];
              const status =
                live?.status ??
                (stageArts.length > 0 || stageTraces.length > 0
                  ? "done"
                  : run.status === "running"
                  ? "pending"
                  : "skipped");
              const family = stageTraces[0]?.model_family ?? "";
              const latMs = stageTraces[0]?.latency_ms ?? null;
              const present =
                stageArts.length > 0 || stageTraces.length > 0;
              return (
                <button
                  key={stage}
                  disabled={!present}
                  className={cn(
                    "flex flex-col items-start rounded border px-2 py-1.5 text-left text-[11px] transition",
                    activeStage === stage
                      ? "border-emerald-700 bg-emerald-950/30"
                      : "border-slate-800 bg-slate-900 hover:bg-slate-800/60",
                    !present && "cursor-default opacity-50 hover:bg-slate-900",
                  )}
                  onClick={() => present && scrollToStage(stage)}
                >
                  <span className="font-medium">{stage}</span>
                  <span className="text-[10px] text-slate-500">
                    {status}
                    {family && (
                      <span className={`ml-1 rounded px-1 ${modelTone(family)}`}>
                        {family}
                      </span>
                    )}
                  </span>
                  {latMs != null && (
                    <span className="text-[10px] text-slate-500">
                      {(latMs / 1000).toFixed(2)}s
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <RefineDiffSection runId={runId} artifacts={artifacts} />

        {stagesPresent.length === 0 && (
          <div className="text-xs text-slate-500">no artifacts yet</div>
        )}

        {stagesPresent.map((stage) => (
          <StageSection
            key={stage}
            runId={runId}
            stage={stage}
            artifacts={artifactsByStage.get(stage) ?? []}
            traces={tracesByStage.get(stage) ?? []}
          />
        ))}
      </div>

      <aside className="hidden lg:block">
        <nav className="sticky top-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Stages
          </div>
          {stagesWithArtifacts.length === 0 && (
            <div className="text-[11px] text-slate-600">none yet</div>
          )}
          {stagesWithArtifacts.map((s) => (
            <a
              key={s}
              href={`#stage-${s}`}
              onClick={(e) => {
                e.preventDefault();
                scrollToStage(s);
              }}
              className={cn(
                "block rounded px-2 py-1 text-[11px] transition hover:bg-slate-800",
                activeStage === s
                  ? "bg-slate-800 text-emerald-300"
                  : "text-slate-400",
              )}
            >
              {s}
            </a>
          ))}
        </nav>
      </aside>
    </div>
  );
}

/**
 * One stage section: sticky header with counts, every artifact rendered
 * inline open, and a collapsed `<details>` containing the StageDrawer
 * trace timeline. Sections are skipped entirely upstream when both
 * artifacts and traces are empty, so we never render a hollow header.
 */
function StageSection({
  runId,
  stage,
  artifacts,
  traces,
}: {
  runId: string;
  stage: StageLabel;
  artifacts: ArtifactRow[];
  traces: TraceRow[];
}) {
  return (
    <section
      id={`stage-${stage}`}
      data-stage={stage}
      className="scroll-mt-16"
    >
      <header className="sticky top-0 z-10 -mx-1 mb-2 flex items-center gap-2 border-b border-slate-800 bg-slate-950/95 px-1 py-2 backdrop-blur">
        <h3 className="text-sm font-semibold text-emerald-300">{stage}</h3>
        <span className="text-[11px] text-slate-500">
          {artifacts.length} artifact{artifacts.length === 1 ? "" : "s"} ·{" "}
          {traces.length} trace{traces.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className="space-y-3">
        {artifacts.map((a) => (
          <ArtifactInline
            key={a.id}
            runId={runId}
            stage={a.stage}
            kind={a.kind}
            name={a.name}
            bytes={a.bytes}
          />
        ))}
        {artifacts.length === 0 && (
          <div className="text-[11px] italic text-slate-600">
            no artifacts for this stage
          </div>
        )}
        {traces.length > 0 && stage !== "REFINE" && (
          <details className="rounded border border-slate-800 bg-slate-900/40">
            <summary className="cursor-pointer px-2 py-1 text-[11px] text-slate-400">
              traces ({traces.length})
            </summary>
            <div className="p-2">
              <StageDrawer
                runId={runId}
                stage={stage as Stage}
                traces={traces}
              />
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

/**
 * Renders a "Compare snapshots" toggle when the run has produced the WRITING
 * baseline `paper.tex` and/or any REFINE `snapshots/paper_v{1,2,3}.tex`. The
 * REFINE stage isn't in the public `Stage` union so we match on artifact
 * name suffix rather than `a.stage`.
 */
function RefineDiffSection({
  runId,
  artifacts,
}: {
  runId: string;
  artifacts: ArtifactRow[];
}) {
  const [open, setOpen] = useState(false);
  const choices: SnapshotChoice[] = useMemo(() => {
    const c: SnapshotChoice[] = [];
    const seen = new Set<string>();
    const push = (name: string, label: string) => {
      if (seen.has(name)) return;
      seen.add(name);
      c.push({ name, label });
    };
    for (const a of artifacts) {
      const lower = a.name.toLowerCase();
      if (lower === "paper.tex" || lower.endsWith("/paper.tex")) {
        push(a.name, `${a.name} (baseline)`);
      } else if (/paper_v\d+\.tex$/.test(lower)) {
        // Strip the snapshots/ prefix for a tighter label.
        const tail = a.name.split("/").pop() ?? a.name;
        push(a.name, tail);
      }
    }
    // Order: baseline first, then v1, v2, v3 by version.
    c.sort((a, b) => {
      const av = /paper_v(\d+)\.tex$/i.exec(a.name);
      const bv = /paper_v(\d+)\.tex$/i.exec(b.name);
      const ai = av ? Number(av[1]) : 0; // baseline -> 0
      const bi = bv ? Number(bv[1]) : 0;
      return ai - bi;
    });
    return c;
  }, [artifacts]);

  if (choices.length < 2) return null;
  return (
    <section className="rounded border border-slate-800 bg-slate-900/30 p-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-400">
          REFINE snapshots ({choices.length} available)
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-slate-800"
        >
          {open ? "hide diff" : "Compare snapshots"}
        </button>
      </div>
      {open && (
        <div className="mt-2">
          <Suspense
            fallback={
              <div className="rounded border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">
                loading diff viewer…
              </div>
            }
          >
            <RefineSnapshotDiff runId={runId} choices={choices} />
          </Suspense>
        </div>
      )}
    </section>
  );
}

function StageDrawer({
  runId,
  stage,
  traces,
}: {
  runId: string;
  stage: Stage;
  traces: TraceRow[];
}) {
  const [note, setNote] = useState("");
  const correct = useCorrectStage();
  const submit = async () => {
    const prev = traces.at(-1)?.id;
    await correct.mutateAsync({
      runId,
      stage,
      note,
      previous_trace_id: prev,
    });
    setNote("");
  };
  if (traces.length === 0) {
    return (
      <div className="rounded border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">
        no trace for {stage} yet
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded border border-emerald-900/40 bg-slate-950 p-3">
      {traces.map((t, idx) => (
        <TraceCard key={t.id} trace={t} index={idx} total={traces.length} />
      ))}
      <div className="border-t border-slate-800 pt-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="mark this stage wrong — describe what should change…"
          rows={2}
          className="w-full rounded border border-slate-800 bg-slate-950 p-1.5 text-xs"
        />
        <div className="mt-1 flex justify-end gap-2">
          <button
            disabled={!note.trim() || correct.isPending}
            onClick={submit}
            className="rounded bg-amber-700 px-2 py-1 text-xs text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {correct.isPending ? "saving…" : "Mark wrong"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * One trace = meta line + 3-col context strip (prompt / skill / memory) + a
 * full-width response panel. Empty skill/memory panes show an inline hint
 * instead of a blank `<pre>`. All four text bodies render through <Prose> so
 * fenced code, tables and inline math come through cleanly.
 */
function TraceCard({
  trace: t,
  index,
  total,
}: {
  trace: TraceRow;
  index: number;
  total: number;
}) {
  const latency =
    t.latency_ms != null ? `${(t.latency_ms / 1000).toFixed(2)}s` : "—";
  return (
    <div className="space-y-2 rounded border border-slate-800 bg-slate-900/40 p-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className={`rounded px-1.5 py-0.5 ${modelTone(t.model_family)}`}>
          {t.model_id}
        </span>
        {t.stage && (
          <span className="rounded bg-slate-800 px-1 py-0.5 text-[10px] text-slate-300">
            {t.stage}
          </span>
        )}
        {total > 1 && (
          <span className="rounded bg-slate-800 px-1 py-0.5 text-[10px] text-slate-300">
            trace {index + 1} / {total}
          </span>
        )}
        {t.trainable && (
          <span className="rounded bg-emerald-900/40 px-1 py-0.5 text-[10px] text-emerald-300">
            trainable
          </span>
        )}
        <span className="text-slate-500">{latency}</span>
        <span className="text-slate-500">
          {t.input_tokens ?? 0} → {t.output_tokens ?? 0} tok
        </span>
        <span className="text-slate-500">
          {new Date(t.created_at).toLocaleString()}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <TracePane label="Prompt" body={t.prompt} />
        <TracePane
          label="SkillContext"
          body={t.skill_context}
          emptyHint="no skill context injected"
        />
        <TracePane
          label="MemoryContext"
          body={t.memory_context}
          emptyHint="no memory context injected"
        />
      </div>

      <details open className="rounded bg-slate-900 p-2 text-xs">
        <summary className="cursor-pointer text-slate-400">Response</summary>
        <div className="mt-2 rounded border border-slate-800 bg-slate-950 p-2">
          {t.response ? (
            <Prose source={t.response} className="prose-sm max-w-none" />
          ) : (
            <span className="text-[11px] italic text-slate-500">
              empty response
            </span>
          )}
        </div>
      </details>
    </div>
  );
}

function TracePane({
  label,
  body,
  emptyHint,
}: {
  label: string;
  body?: string | null;
  emptyHint?: string;
}) {
  return (
    <details
      open
      className="rounded border border-slate-800 bg-slate-900 p-2 text-xs"
    >
      <summary className="cursor-pointer text-slate-400">{label}</summary>
      <div className="mt-2 rounded border border-slate-800 bg-slate-950 p-2">
        {body ? (
          <Prose source={body} className="prose-sm max-w-none" />
        ) : (
          <span className="text-[11px] italic text-slate-500">
            {emptyHint ?? "empty"}
          </span>
        )}
      </div>
    </details>
  );
}

/**
 * Inline-by-default artifact card. The body renders open for every
 * previewable kind (markdown / code / tex / json / pdf / figure); only
 * unknown kinds (e.g. raw logs) get a "click open to download" hint
 * instead of an inline body. Visual chrome (rounded border, slate
 * background) matches the old ArtifactPreview so the section still
 * reads as a sequence of cards.
 */
function ArtifactInline({
  runId,
  stage,
  kind,
  name,
  bytes,
}: {
  runId: string;
  stage: Stage;
  kind: string;
  name: string;
  bytes: number;
}) {
  const url = nanoArtifactUrl(runId, name);
  const isImage =
    kind === "figure" || name.endsWith(".svg") || name.endsWith(".png");
  const isPdf = kind === "pdf";
  const isText =
    kind === "markdown" ||
    kind === "code" ||
    kind === "tex" ||
    kind === "json";
  return (
    <div className="rounded border border-slate-800 bg-slate-950 p-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="rounded bg-slate-800 px-1 py-0.5 text-[10px]">
          {stage}
        </span>
        <span className="font-mono">{name}</span>
        <span className="text-slate-500">{bytes} B</span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-emerald-400 hover:underline"
        >
          open
        </a>
      </div>
      {isPdf ? (
        <embed src={url} type="application/pdf" className="mt-2 aspect-[8.5/11] w-full" />
      ) : isImage ? (
        <img src={url} alt={name} className="mt-2 max-w-full" loading="lazy" />
      ) : isText ? (
        <InlineText runId={runId} name={name} kind={kind} />
      ) : (
        <div className="mt-2 text-[11px] italic text-slate-500">
          no inline preview — click open to download
        </div>
      )}
    </div>
  );
}

/**
 * Pretty-printed body for a textual artifact.
 *
 *  - `kind === "markdown"` and `kind === "code"` artifacts named `*.md`
 *    (CODING ships a markdown wrapper around python) render via <Prose>,
 *    which already wires remark-gfm + remark-math + rehype-katex.
 *  - Everything else (python code, *.tex, *.json, *.bib) goes through
 *    Shiki via <HighlightedCode>. JSON is pretty-printed first when it parses.
 */
function InlineText({
  runId,
  name,
  kind,
}: {
  runId: string;
  name: string;
  kind: string;
}) {
  const { data } = useNanoArtifactText(runId, name);
  if (data == null) {
    return (
      <pre className="mt-2 whitespace-pre-wrap rounded border border-slate-800 bg-slate-900 p-2 font-mono text-[11px] text-slate-400">
        loading…
      </pre>
    );
  }
  // Markdown render path: kind="markdown", or the CODING "code.md" wrapper
  // which is a markdown doc with fenced python inside.
  if (kind === "markdown" || (kind === "code" && name.toLowerCase().endsWith(".md"))) {
    return (
      <div className="mt-2 rounded border border-slate-800 bg-slate-900 p-2">
        <Prose source={data} className="prose-sm max-w-none" />
      </div>
    );
  }
  // JSON: pretty-print first, fall back to raw on parse error.
  let body = data;
  if (kind === "json" || name.toLowerCase().endsWith(".json")) {
    try {
      body = JSON.stringify(JSON.parse(data), null, 2);
    } catch {
      // leave body as-is
    }
  }
  return <HighlightedCode code={body} language={languageForArtifact(kind, name)} />;
}
