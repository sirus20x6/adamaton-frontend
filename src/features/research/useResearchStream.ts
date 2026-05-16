/**
 * useResearchStream
 *
 * Connects to the research WebSocket for a given task, layers in the live
 * Stage-0 hits from POST /platform/search/, and exposes a clean reducer-shaped
 * snapshot for the ResearchView UI.
 *
 * State is derived purely from the discriminated-union event stream so React
 * Strict Mode double-invocation, late-joining replays, and reconnects all
 * converge to the same shape.
 */

import { useEffect, useMemo, useReducer, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getResearchTask,
  liveSearch,
} from "@/api/research";
import type { Snippet } from "@/api/research";
import { openResearchStream } from "@/api/ws";
import type {
  ResearchEvent,
  ResearchStreamHandle,
  ResearchStreamStatus,
  Stage,
} from "@/api/ws";

import type { Chunk } from "./IndexedPanel";
import type { GraphHit } from "./GraphedPanel";
import type { CuratedDoc } from "./CuratedPanel";

export type StageState = "pending" | "running" | "done" | "error" | "skipped";

export type StageInfo = {
  state: StageState;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  pct?: number;
  count?: number;
};

export type ResearchState = {
  status: ResearchStreamStatus;
  stages: Record<Stage, StageInfo>;
  results: {
    live: Snippet[];
    indexed: Chunk[];
    graphed: GraphHit[];
    curated: CuratedDoc[];
  };
  events: ResearchEvent[];
};

const STAGES: readonly Stage[] = ["live", "indexed", "graphed", "curated"];

const EVENT_LIMIT = 200;

function initialState(): ResearchState {
  const stages = STAGES.reduce<Record<Stage, StageInfo>>(
    (acc, stage) => {
      acc[stage] = { state: "pending" };
      return acc;
    },
    {} as Record<Stage, StageInfo>,
  );
  return {
    status: "connecting",
    stages,
    results: { live: [], indexed: [], graphed: [], curated: [] },
    events: [],
  };
}

type Action =
  | { type: "event"; event: ResearchEvent }
  | { type: "status"; status: ResearchStreamStatus }
  | { type: "reset" };

function dedupeSnippets(existing: Snippet[], incoming: Snippet[]): Snippet[] {
  const seen = new Set(existing.map((s) => s.id));
  const merged = [...existing];
  for (const snippet of incoming) {
    if (seen.has(snippet.id)) continue;
    seen.add(snippet.id);
    merged.push(snippet);
  }
  return merged;
}

function dedupeChunks(existing: Chunk[], incoming: Chunk[]): Chunk[] {
  const seen = new Set(existing.map((c) => c.id));
  const merged = [...existing];
  for (const chunk of incoming) {
    if (seen.has(chunk.id)) continue;
    seen.add(chunk.id);
    merged.push(chunk);
  }
  return merged;
}

function dedupeGraph(existing: GraphHit[], incoming: GraphHit[]): GraphHit[] {
  const seen = new Set(existing.map((g) => g.id));
  const merged = [...existing];
  for (const hit of incoming) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    merged.push(hit);
  }
  return merged;
}

function dedupeCurated(
  existing: CuratedDoc[],
  incoming: CuratedDoc[],
): CuratedDoc[] {
  // Last-write-wins for curated docs: the curated stage holds the
  // synthesised answer, not an accumulating list, so a later event
  // (eg a successful salvage replay after a failed one) MUST replace
  // any earlier entry with the same id rather than being silently
  // deduped out. Other stages still use append-with-dedupe.
  const byId = new Map<string, CuratedDoc>();
  for (const doc of existing) byId.set(doc.id, doc);
  for (const doc of incoming) byId.set(doc.id, doc);
  return Array.from(byId.values());
}

function tsFromEvent(at: unknown, fallback: number): number {
  if (typeof at === "number") {
    return at < 1e12 ? at * 1000 : at;
  }
  if (typeof at === "string") {
    const parsed = Date.parse(at);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function snippetsFromPayload(payload: unknown): Snippet[] {
  if (!payload || typeof payload !== "object") return [];
  const maybe = (payload as { hits?: unknown; snippets?: unknown }).hits
    ?? (payload as { snippets?: unknown }).snippets;
  if (!Array.isArray(maybe)) return [];
  return maybe
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((raw, idx) => {
      const adapter = String(raw.adapter ?? "unknown");
      const externalId = String(
        raw.external_id ?? raw.id ?? raw.url ?? `${idx}`,
      );
      const id = String(raw.id ?? `${adapter}:${externalId}`);
      return {
        id,
        title: String(raw.title ?? "(untitled)"),
        url: String(raw.url ?? ""),
        adapter,
        abstract:
          typeof raw.abstract === "string" ? raw.abstract : undefined,
        trust:
          typeof raw.trust === "number"
            ? raw.trust
            : typeof raw.score === "number"
              ? raw.score
              : undefined,
      } satisfies Snippet;
    });
}

function chunksFromPayload(payload: unknown): Chunk[] {
  if (!payload || typeof payload !== "object") return [];
  const maybe = (payload as { chunks?: unknown; results?: unknown }).chunks
    ?? (payload as { results?: unknown }).results;
  if (!Array.isArray(maybe)) return [];
  return maybe
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((raw, idx) => {
      const documentId = String(
        raw.document_id ?? raw.documentId ?? raw.doc_id ?? "",
      );
      const id = String(raw.id ?? `${documentId}:${idx}`);
      const text = String(raw.text ?? raw.content ?? raw.body ?? "");
      const title =
        typeof raw.title === "string" ? raw.title : undefined;
      const score =
        typeof raw.score === "number" ? raw.score : undefined;
      const url =
        typeof raw.url === "string" && raw.url ? raw.url : undefined;
      const sourceKind =
        typeof raw.source_kind === "string" && raw.source_kind
          ? raw.source_kind
          : typeof raw.sourceKind === "string" && raw.sourceKind
            ? raw.sourceKind
            : undefined;
      const externalId =
        typeof raw.external_id === "string" && raw.external_id
          ? raw.external_id
          : typeof raw.externalId === "string" && raw.externalId
            ? raw.externalId
            : undefined;
      return {
        id,
        documentId,
        text,
        score,
        title,
        url,
        sourceKind,
        externalId,
      } satisfies Chunk;
    });
}

function graphFromPayload(payload: unknown): GraphHit[] {
  if (!payload || typeof payload !== "object") return [];
  const maybe = (payload as { entities?: unknown; hits?: unknown }).entities
    ?? (payload as { hits?: unknown }).hits;
  if (!Array.isArray(maybe)) return [];
  return maybe
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((raw, idx) => {
      const entity = String(raw.entity ?? raw.name ?? `entity-${idx}`);
      const id = String(raw.id ?? entity);
      const rels = Array.isArray(raw.relationships)
        ? raw.relationships.filter(
            (r): r is string => typeof r === "string",
          )
        : undefined;
      return { id, entity, relationships: rels } satisfies GraphHit;
    });
}

function curatedFromPayload(payload: unknown): CuratedDoc[] {
  if (!payload || typeof payload !== "object") return [];
  const maybe =
    (payload as { docs?: unknown; communities?: unknown; summaries?: unknown }).docs
    ?? (payload as { communities?: unknown }).communities
    ?? (payload as { summaries?: unknown }).summaries;
  if (!Array.isArray(maybe)) return [];
  return maybe
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((raw, idx) => {
      const id = String(raw.id ?? `curated-${idx}`);
      const title = String(raw.title ?? `Cluster ${idx + 1}`);
      const summary = String(
        raw.summary ?? raw.body ?? raw.text ?? "",
      );
      return { id, title, summary } satisfies CuratedDoc;
    });
}

function reducer(state: ResearchState, action: Action): ResearchState {
  if (action.type === "reset") return initialState();
  if (action.type === "status") {
    if (state.status === action.status) return state;
    return { ...state, status: action.status };
  }
  const ev = action.event;
  const events =
    state.events.length >= EVENT_LIMIT
      ? [...state.events.slice(state.events.length - EVENT_LIMIT + 1), ev]
      : [...state.events, ev];

  switch (ev.type) {
    case "heartbeat":
      // Confirms connection liveness; reducer otherwise no-ops.
      return { ...state, status: "open", events };

    case "pong":
      return { ...state, events };

    case "error":
      return { ...state, events };

    case "stage.started": {
      const startedAt = tsFromEvent(ev.at, Date.now());
      const stages: Record<Stage, StageInfo> = { ...state.stages };
      stages[ev.stage] = {
        ...state.stages[ev.stage],
        state: "running",
        startedAt,
        error: undefined,
      };
      return { ...state, stages, events };
    }

    case "stage.progress": {
      const stages: Record<Stage, StageInfo> = { ...state.stages };
      const prev = state.stages[ev.stage];
      stages[ev.stage] = {
        ...prev,
        state: "running",
        pct: typeof ev.pct === "number" ? ev.pct : prev.pct,
      };
      return { ...state, stages, events };
    }

    case "stage.result": {
      const results = { ...state.results };
      let added = 0;
      if (ev.stage === "live") {
        const incoming = snippetsFromPayload(ev.payload);
        added = incoming.length;
        results.live = dedupeSnippets(state.results.live, incoming);
      } else if (ev.stage === "indexed") {
        const incoming = chunksFromPayload(ev.payload);
        added = incoming.length;
        results.indexed = dedupeChunks(state.results.indexed, incoming);
      } else if (ev.stage === "graphed") {
        const incoming = graphFromPayload(ev.payload);
        added = incoming.length;
        results.graphed = dedupeGraph(state.results.graphed, incoming);
      } else if (ev.stage === "curated") {
        const incoming = curatedFromPayload(ev.payload);
        added = incoming.length;
        results.curated = dedupeCurated(state.results.curated, incoming);
      }
      const previous = state.stages[ev.stage];
      const stages: Record<Stage, StageInfo> = { ...state.stages };
      stages[ev.stage] = {
        ...previous,
        state: previous.state === "pending" ? "running" : previous.state,
        count: (previous.count ?? 0) + added,
      };
      return { ...state, stages, results, events };
    }

    case "stage.finished": {
      const stages: Record<Stage, StageInfo> = { ...state.stages };
      stages[ev.stage] = {
        ...state.stages[ev.stage],
        state: "done",
        finishedAt: tsFromEvent(ev.at, Date.now()),
      };
      return { ...state, stages, events };
    }

    case "stage.error": {
      const stages: Record<Stage, StageInfo> = { ...state.stages };
      stages[ev.stage] = {
        ...state.stages[ev.stage],
        state: "error",
        error: ev.error,
        finishedAt: tsFromEvent(ev.at, Date.now()),
      };
      return { ...state, stages, events };
    }

    case "stage.skipped": {
      const stages: Record<Stage, StageInfo> = { ...state.stages };
      stages[ev.stage] = {
        ...state.stages[ev.stage],
        state: "skipped",
        // Carry the reason in ``error`` so the panel-level UI can show
        // it without inventing a separate field; the StageStateLabel
        // ignores ``error`` when state==="skipped".
        error: ev.reason ?? undefined,
        finishedAt: tsFromEvent(ev.at, Date.now()),
      };
      return { ...state, stages, events };
    }

    case "task.done": {
      const at = tsFromEvent(ev.at, Date.now());
      const stages = STAGES.reduce<Record<Stage, StageInfo>>(
        (acc, stage) => {
          const prev = state.stages[stage];
          if (prev.state === "done" || prev.state === "error") {
            acc[stage] = prev;
          } else {
            acc[stage] = {
              ...prev,
              state: "done",
              finishedAt: prev.finishedAt ?? at,
            };
          }
          return acc;
        },
        {} as Record<Stage, StageInfo>,
      );
      return { ...state, stages, events };
    }

    default: {
      // Exhaustive check: all event variants handled above.
      const _exhaustive: never = ev;
      void _exhaustive;
      return state;
    }
  }
}

export type UseResearchStreamResult = ResearchState & {
  send: (msg: unknown) => void;
};

export function useResearchStream(taskId: string): UseResearchStreamResult {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState());
  const handleRef = useRef<ResearchStreamHandle | null>(null);
  const liveSeededRef = useRef(false);
  const resultSeededRef = useRef(false);

  // Pull the persisted task row so we have the query string for live search.
  const { data: task } = useQuery({
    queryKey: ["research", "task", taskId],
    queryFn: () => getResearchTask(taskId),
    enabled: Boolean(taskId),
    // Re-poll while the swarm is still running, in case the user lands
    // here without an open WS (eg deep-link from another tab).
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 5_000;
      return data.status === "running" || data.status === "pending"
        ? 5_000
        : false;
    },
    staleTime: 60_000,
  });

  // Open the WS once per taskId.
  useEffect(() => {
    if (!taskId) return;
    dispatch({ type: "reset" });
    liveSeededRef.current = false;
    resultSeededRef.current = false;

    const handle = openResearchStream(
      taskId,
      (event) => dispatch({ type: "event", event }),
      {
        onStatus: (status) => dispatch({ type: "status", status }),
      },
    );
    handleRef.current = handle;
    return () => {
      handle.close();
      handleRef.current = null;
    };
  }, [taskId]);

  // Kick off the live search synthetic event once we know the query.
  useEffect(() => {
    if (!task?.query) return;
    if (liveSeededRef.current) return;
    liveSeededRef.current = true;
    let cancelled = false;
    void liveSearch({ query: task.query, limit: 12 })
      .then((res) => {
        if (cancelled) return;
        dispatch({
          type: "event",
          event: {
            type: "stage.result",
            stage: "live",
            task_id: taskId,
            at: Date.now(),
            payload: { hits: res.hits },
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        dispatch({
          type: "event",
          event: {
            type: "stage.error",
            stage: "live",
            task_id: taskId,
            at: Date.now(),
            error: "live search failed",
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [task?.query, taskId]);

  // Refresh-survival hydration: when the persisted row carries a
  // ``result`` (status=succeeded), synthesise the same stage.result
  // event the live runner would emit. The reducer dedupes by id so
  // arriving WS replay events are no-ops.
  useEffect(() => {
    if (!taskId) return;
    if (resultSeededRef.current) return;
    const persisted = task?.result;
    if (!persisted) return;
    if (typeof persisted.answer !== "string" || persisted.answer.length === 0) {
      return;
    }
    resultSeededRef.current = true;

    // Seed an ``indexed`` stage from ``paper_answers`` so the citation
    // pill lookup finds titles + provenance for every cited UUID after
    // a hard refresh. Without this, ``paperLookup(indexed)`` is empty
    // on reload and pills fall back to the bare 8-char doc-id slice —
    // which looks identical to the broken-citations bug we already
    // fixed at write-time. One row per unique document_id; dedupe
    // here because each PaperAnswer is question-scoped (many share a
    // document_id).
    const seenDocs = new Set<string>();
    const chunks: Array<Record<string, unknown>> = [];
    for (const pa of persisted.paper_answers ?? []) {
      const docId = pa.document_id;
      if (!docId || seenDocs.has(docId)) continue;
      seenDocs.add(docId);
      chunks.push({
        id: docId,
        document_id: docId,
        text: pa.answer ?? "",
        title: pa.title,
        url: pa.url ?? undefined,
        source_kind: pa.source_kind ?? undefined,
        external_id: pa.external_id ?? undefined,
      });
    }
    // Cross-referenced papers — citations the synthesiser made to
    // corpus docs that were never candidates. Seeding them into
    // ``indexed`` here is what makes the citation pills show titles
    // instead of falling back to the bare 8-char hex.
    for (const cr of persisted.cross_references ?? []) {
      const docId = cr.document_id;
      if (!docId || seenDocs.has(docId)) continue;
      seenDocs.add(docId);
      chunks.push({
        id: docId,
        document_id: docId,
        text: "",
        title: cr.title,
        url: cr.url ?? undefined,
        source_kind: cr.source_kind ?? undefined,
        external_id: cr.external_id ?? undefined,
      });
    }
    if (chunks.length > 0) {
      dispatch({
        type: "event",
        event: {
          type: "stage.result",
          stage: "indexed",
          task_id: taskId,
          at: Date.now(),
          payload: { chunks },
        },
      });
    }

    dispatch({
      type: "event",
      event: {
        type: "stage.result",
        stage: "curated",
        task_id: taskId,
        at: Date.now(),
        payload: {
          docs: [
            {
              id: taskId,
              title: task?.query ?? "Synthesis",
              summary: persisted.answer,
            },
          ],
        },
      },
    });
    dispatch({
      type: "event",
      event: {
        type: "stage.finished",
        stage: "curated",
        task_id: taskId,
        at: Date.now(),
      },
    });
    dispatch({
      type: "event",
      event: {
        type: "task.done",
        task_id: taskId,
        at: Date.now(),
      },
    });
  }, [taskId, task?.result, task?.query]);

  const send = useMemo(
    () =>
      (msg: unknown) => {
        handleRef.current?.send(msg);
      },
    [],
  );

  return { ...state, send };
}
