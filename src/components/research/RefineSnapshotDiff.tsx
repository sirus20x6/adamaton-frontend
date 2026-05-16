/**
 * RefineSnapshotDiff — side-by-side LaTeX diff for the REFINE pipeline.
 *
 * Compares any two of `paper.tex` (WRITING baseline) and `snapshots/paper_v{1,2,3}.tex`
 * (REFINE outputs) using react-diff-viewer-continued. The component is consumed via
 * React.lazy from NanoResearch so the diff viewer dependency ships in a separate
 * chunk and doesn't bloat the initial bundle.
 *
 * No new API surface — the two artifact bodies are pulled through
 * `useNanoArtifactText`, the same hook the artifact preview uses.
 */
import { useEffect, useMemo, useState } from "react";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";

import { useNanoArtifactText } from "@/api/nanoResearch";

export interface SnapshotChoice {
  /** UI label, e.g. "paper.tex (WRITING)" or "paper_v2.tex". */
  label: string;
  /** Artifact name as stored on the run, used as the `useNanoArtifactText` key. */
  name: string;
}

export interface RefineSnapshotDiffProps {
  runId: string;
  choices: SnapshotChoice[];
}

// Dark-mode palette tuned to match NanoResearch's slate-900 / slate-800 chrome.
// The library bakes a default dark theme that clashes with the rest of the
// page; we override the few tokens that surface on screen.
const SLATE_DIFF_STYLES = {
  variables: {
    dark: {
      diffViewerBackground: "#0f172a", // slate-900
      diffViewerColor: "#e2e8f0", // slate-200
      addedBackground: "#064e3b", // emerald-900-ish
      addedColor: "#a7f3d0", // emerald-200
      removedBackground: "#4c0519", // rose-950
      removedColor: "#fecdd3", // rose-200
      wordAddedBackground: "#065f46", // emerald-800
      wordRemovedBackground: "#7f1d1d", // rose-900
      addedGutterBackground: "#022c22",
      removedGutterBackground: "#450a0a",
      gutterBackground: "#0f172a",
      gutterBackgroundDark: "#020617", // slate-950
      highlightBackground: "#1e293b", // slate-800
      highlightGutterBackground: "#1e293b",
      codeFoldGutterBackground: "#1e293b",
      codeFoldBackground: "#1e293b",
      emptyLineBackground: "#0f172a",
      gutterColor: "#64748b", // slate-500
      addedGutterColor: "#a7f3d0",
      removedGutterColor: "#fecdd3",
      codeFoldContentColor: "#94a3b8",
      diffViewerTitleBackground: "#1e293b",
      diffViewerTitleColor: "#cbd5e1",
      diffViewerTitleBorderColor: "#334155",
    },
  },
  diffContainer: {
    fontSize: "11px",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
};

function pickInitialPair(choices: SnapshotChoice[]): [string, string] | null {
  if (choices.length < 2) return null;
  const baseline = choices.find((c) => c.name === "paper.tex");
  const v1 = choices.find((c) => c.name.endsWith("paper_v1.tex"));
  if (baseline && v1) return [baseline.name, v1.name];
  // Otherwise default to the two latest entries (sorted by version suffix).
  const sorted = [...choices].sort((a, b) => a.name.localeCompare(b.name));
  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  if (!last || !prev) return null;
  return [prev.name, last.name];
}

export default function RefineSnapshotDiff({
  runId,
  choices,
}: RefineSnapshotDiffProps) {
  const initial = useMemo(() => pickInitialPair(choices), [choices]);
  const [leftName, setLeftName] = useState<string | null>(initial?.[0] ?? null);
  const [rightName, setRightName] = useState<string | null>(initial?.[1] ?? null);

  // If `choices` changes (a new snapshot landed mid-run) and the current
  // selection became stale, snap back to the latest pair.
  useEffect(() => {
    if (!initial) return;
    if (!leftName || !choices.some((c) => c.name === leftName)) {
      setLeftName(initial[0]);
    }
    if (!rightName || !choices.some((c) => c.name === rightName)) {
      setRightName(initial[1]);
    }
  }, [choices, initial, leftName, rightName]);

  const left = useNanoArtifactText(runId, leftName);
  const right = useNanoArtifactText(runId, rightName);

  if (!initial) {
    return (
      <div className="rounded border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">
        need at least two snapshots to diff
      </div>
    );
  }

  const loading = left.isLoading || right.isLoading || !left.data || !right.data;
  const error = left.error?.message ?? right.error?.message;

  return (
    <div className="space-y-2 rounded border border-emerald-900/40 bg-slate-950 p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
        <span className="text-slate-400">Compare</span>
        <select
          value={leftName ?? ""}
          onChange={(e) => setLeftName(e.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px]"
        >
          {choices.map((c) => (
            <option key={c.name} value={c.name}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="text-slate-400">vs</span>
        <select
          value={rightName ?? ""}
          onChange={(e) => setRightName(e.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px]"
        >
          {choices.map((c) => (
            <option key={c.name} value={c.name}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <div className="rounded border border-rose-900 bg-rose-950/30 p-2 text-xs text-rose-300">
          {error}
        </div>
      )}
      {loading ? (
        <div className="p-2 text-xs text-slate-500">loading…</div>
      ) : (
        <div className="rounded border border-slate-800">
          <ReactDiffViewer
            oldValue={left.data ?? ""}
            newValue={right.data ?? ""}
            splitView={true}
            useDarkTheme={true}
            compareMethod={DiffMethod.WORDS}
            styles={SLATE_DIFF_STYLES}
            leftTitle={leftName ?? undefined}
            rightTitle={rightName ?? undefined}
          />
        </div>
      )}
    </div>
  );
}
