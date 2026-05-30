import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Client-side UI bookkeeping for the per-project terminal tab strip.
 *
 * The terminal *sessions* themselves live server-side in tmux (see
 * src/api/terminals.ts) and survive reloads on their own. This store only
 * remembers which sessions the user has open in the UI, which one is active,
 * and which are minimized — so the tab set is restored after a page reload.
 *
 * State is keyed by project id and persisted to localStorage. A session id
 * that no longer exists server-side (tmux killed it, reaper swept it) is
 * harmless here: the TerminalWindow's websocket will simply fail to attach,
 * and the user can close the stale tab. Call `pruneTabs` after fetching the
 * live session list to drop ids the server no longer knows about.
 */

export type ProjectTerminalState = {
  /** Ordered terminal session ids open in this project's tab strip. */
  openIds: string[];
  /** The session id whose pane is focused, or null if none. */
  activeId: string | null;
  /** Session ids whose panes are minimized (tab visible, pane hidden). */
  minimizedIds: string[];
};

type TerminalUIState = {
  /** Per-project UI state, keyed by project id. */
  byProject: Record<string, ProjectTerminalState>;

  /** Read a project's state, falling back to an empty default. */
  getProject: (projectId: string) => ProjectTerminalState;

  /** Add a terminal tab and make it active (no-op if already open). */
  openTab: (projectId: string, sid: string) => void;
  /** Remove a terminal tab; picks a neighbouring tab as the new active one. */
  closeTab: (projectId: string, sid: string) => void;
  /** Focus a terminal tab (also un-minimizes it). */
  setActive: (projectId: string, sid: string) => void;
  /** Hide a pane while keeping its tab in the strip. */
  minimize: (projectId: string, sid: string) => void;
  /** Show a previously-minimized pane and focus it. */
  restore: (projectId: string, sid: string) => void;
  /** Toggle minimized state for a tab. */
  toggleMinimize: (projectId: string, sid: string) => void;
  /**
   * Drop any open/minimized ids not present in `liveIds` (e.g. sessions the
   * server reports as dead or gone). Keeps activeId valid.
   */
  pruneTabs: (projectId: string, liveIds: string[]) => void;
};

const EMPTY: ProjectTerminalState = {
  openIds: [],
  activeId: null,
  minimizedIds: [],
};

function updateProject(
  state: TerminalUIState,
  projectId: string,
  fn: (prev: ProjectTerminalState) => ProjectTerminalState,
): Pick<TerminalUIState, "byProject"> {
  const prev = state.byProject[projectId] ?? EMPTY;
  return {
    byProject: { ...state.byProject, [projectId]: fn(prev) },
  };
}

// Pick the tab that should become active after `removed` leaves `openIds`.
function neighbour(openIds: string[], removed: string): string | null {
  const idx = openIds.indexOf(removed);
  const rest = openIds.filter((id) => id !== removed);
  if (rest.length === 0) return null;
  // Prefer the tab that was to the right; fall back to the last remaining.
  return rest[Math.min(idx, rest.length - 1)] ?? null;
}

export const useTerminalStore = create<TerminalUIState>()(
  persist(
    (set, get) => ({
      byProject: {},

      getProject: (projectId) => get().byProject[projectId] ?? EMPTY,

      openTab: (projectId, sid) =>
        set((state) =>
          updateProject(state, projectId, (prev) => {
            if (prev.openIds.includes(sid)) {
              return { ...prev, activeId: sid };
            }
            return {
              openIds: [...prev.openIds, sid],
              activeId: sid,
              minimizedIds: prev.minimizedIds.filter((id) => id !== sid),
            };
          }),
        ),

      closeTab: (projectId, sid) =>
        set((state) =>
          updateProject(state, projectId, (prev) => {
            const openIds = prev.openIds.filter((id) => id !== sid);
            const minimizedIds = prev.minimizedIds.filter((id) => id !== sid);
            const activeId =
              prev.activeId === sid
                ? neighbour(prev.openIds, sid)
                : prev.activeId;
            return { openIds, activeId, minimizedIds };
          }),
        ),

      setActive: (projectId, sid) =>
        set((state) =>
          updateProject(state, projectId, (prev) => ({
            ...prev,
            activeId: sid,
            minimizedIds: prev.minimizedIds.filter((id) => id !== sid),
          })),
        ),

      minimize: (projectId, sid) =>
        set((state) =>
          updateProject(state, projectId, (prev) => ({
            ...prev,
            minimizedIds: prev.minimizedIds.includes(sid)
              ? prev.minimizedIds
              : [...prev.minimizedIds, sid],
            activeId: prev.activeId === sid ? null : prev.activeId,
          })),
        ),

      restore: (projectId, sid) =>
        set((state) =>
          updateProject(state, projectId, (prev) => ({
            ...prev,
            minimizedIds: prev.minimizedIds.filter((id) => id !== sid),
            activeId: sid,
          })),
        ),

      toggleMinimize: (projectId, sid) => {
        const prev = get().byProject[projectId] ?? EMPTY;
        if (prev.minimizedIds.includes(sid)) {
          get().restore(projectId, sid);
        } else {
          get().minimize(projectId, sid);
        }
      },

      pruneTabs: (projectId, liveIds) =>
        set((state) => {
          const prev = state.byProject[projectId];
          if (!prev) return {};
          const live = new Set(liveIds);
          const openIds = prev.openIds.filter((id) => live.has(id));
          const minimizedIds = prev.minimizedIds.filter((id) => live.has(id));
          const activeId =
            prev.activeId && live.has(prev.activeId)
              ? prev.activeId
              : (openIds[openIds.length - 1] ?? null);
          return updateProject(state, projectId, () => ({
            openIds,
            activeId,
            minimizedIds,
          }));
        }),
    }),
    {
      name: "adam.project-terminals",
      // Only persist the tab bookkeeping; the function members are recreated
      // on each load by the store factory.
      partialize: (state) => ({ byProject: state.byProject }),
    },
  ),
);
