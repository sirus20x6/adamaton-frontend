/**
 * Typed wrappers around the backend research + search HTTP endpoints. These
 * are thin axios-backed functions that the rest of the app pairs with
 * TanStack Query for caching, retries, and invalidation.
 */

import { api } from "@/api/client";

export type Snippet = {
  id: string;
  title: string;
  url: string;
  adapter: string;
  abstract?: string;
  trust?: number;
  publishedAt?: string;
  authors?: string[];
  venue?: string;
  citationCount?: number;
  sourceKind?: string;
  score?: number;
};

export type DocumentStageRow = {
  document_id: string;
  stage: string;
  stage1_at: string | null;
  stage2_at: string | null;
  stage3_at: string | null;
  stage4_at: string | null;
  error: string | null;
  updated_at: string | null;
};

export type PaperAnswer = {
  document_id: string;
  title: string;
  question: string | null;
  answer: string | null;
  bundle_id?: string | null;
  elapsed_ms?: number | null;
  error: string | null;
  /** Canonical URL for the paper (arxiv abs page, doi, openreview, ...). */
  url?: string | null;
  /** ``arxiv`` | ``doi`` | ``openreview`` | ``hf_papers`` | ... */
  source_kind?: string | null;
  /** External id native to ``source_kind`` (arxiv id, DOI, etc.). */
  external_id?: string | null;
};

export type CrossReference = {
  document_id: string;
  title: string;
  url?: string | null;
  source_kind?: string | null;
  external_id?: string | null;
};

export type ResearchResult = {
  answer: string;
  elapsed_ms: number;
  candidates: Array<{
    document_id: string;
    title: string;
    score: number;
    snippet?: string;
  }>;
  paper_answers: PaperAnswer[];
  /** Corpus papers the synthesiser cited that weren't candidates —
   *  resolved post-hoc against deepresearch.documents so the citation
   *  pills can render real titles. */
  cross_references?: CrossReference[];
};

export type ResearchTaskRow = {
  task_id: string;
  owner_id: string | null;
  query: string;
  plan: Record<string, unknown> | null;
  status: string;
  /** Populated only after the swarm finishes. ``null`` while running. */
  result: ResearchResult | null;
  /** Populated only on failure. */
  error: string | null;
  created_at: string | null;
  updated_at: string | null;
  document_stages: DocumentStageRow[];
};

export type SubmitResearchInput = {
  query: string;
  corpus_id?: string;
  sources?: string[];
  /** Cap on retrieved papers; drives swarm wall-time. */
  max_papers?: number;
  /** How many distinct questions each paper gets answered with. */
  questions_per_paper?: number;
  /** Reflection-loop iterations after the first synthesis. */
  reflection_cycles?: number;
  /**
   * Axios timeout (ms). When omitted, defaults to 10 minutes — long
   * enough for "Standard" depth. Callers asking for "Deep" or
   * "Exhaustive" should bump this in lockstep with the depth knobs.
   */
  timeoutMs?: number;
};

export type SubmitResearchResponse = {
  task_id: string;
  /** Always ``"running"`` from the new fire-and-forget endpoint. */
  status: string;
  /** Path to the WS event stream for this task. */
  ws_url: string;
  created_at?: string;
};

export type LiveSearchInput = {
  query: string;
  sources?: string[];
  limit?: number;
};

export type LiveSearchResponse = {
  hits: Snippet[];
  errors: Record<string, string>;
};

type RawHit = {
  adapter?: string;
  external_id?: string;
  title?: string;
  url?: string;
  abstract?: string | null;
  authors?: string[];
  published_at?: string | null;
  venue?: string | null;
  citation_count?: number | null;
  score?: number | null;
  source_kind?: string | null;
  raw?: Record<string, unknown>;
};

type RawSearchResponse = {
  hits?: RawHit[];
  errors?: Record<string, string>;
};

function snippetFromHit(hit: RawHit): Snippet {
  const adapter = hit.adapter ?? "unknown";
  const external = hit.external_id ?? hit.url ?? hit.title ?? "";
  return {
    id: `${adapter}:${external}`,
    title: hit.title ?? "(untitled)",
    url: hit.url ?? "",
    adapter,
    abstract: hit.abstract ?? undefined,
    trust: undefined,
    publishedAt: hit.published_at ?? undefined,
    authors: hit.authors,
    venue: hit.venue ?? undefined,
    citationCount: hit.citation_count ?? undefined,
    sourceKind: hit.source_kind ?? undefined,
    score: hit.score ?? undefined,
  };
}

export async function submitResearch(
  input: SubmitResearchInput,
): Promise<SubmitResearchResponse> {
  const body: Record<string, unknown> = { query: input.query };
  if (input.corpus_id) body.corpus_id = input.corpus_id;
  if (input.sources && input.sources.length > 0) body.sources = input.sources;
  if (typeof input.max_papers === "number") body.max_papers = input.max_papers;
  if (typeof input.questions_per_paper === "number") {
    body.questions_per_paper = input.questions_per_paper;
  }
  if (typeof input.reflection_cycles === "number") {
    body.reflection_cycles = input.reflection_cycles;
  }
  // Endpoint is fire-and-forget — should return in ms, not minutes.
  // ``timeoutMs`` is honoured so legacy callers can still bump it.
  return api.post<SubmitResearchResponse>("/platform/research/", body, {
    timeout: input.timeoutMs ?? 30_000,
  });
}

export async function getResearchTask(
  taskId: string,
): Promise<ResearchTaskRow> {
  return api.get<ResearchTaskRow>(
    `/platform/research/${encodeURIComponent(taskId)}`,
  );
}

export async function cancelResearch(taskId: string): Promise<unknown> {
  return api.post<unknown>(
    `/platform/research/${encodeURIComponent(taskId)}/cancel`,
  );
}

export type LogStepRow = {
  id: string;
  ts: string;
  agent_name: string;
  action: string;
  status: "success" | "failure" | "warning" | "running" | string;
  input_summary: string | null;
  output_summary: string | null;
  model_details: Record<string, unknown> | null;
  tool_calls: unknown[] | null;
  elapsed_ms: number | null;
  error: string | null;
};

export type GoalRow = {
  id: string;
  text: string;
  status: "active" | "addressed" | "obsolete" | string;
  source_agent: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ResearchLogResponse = {
  task_id: string;
  steps: LogStepRow[];
  goals: GoalRow[];
};

export async function getResearchLog(
  taskId: string,
  limit: number = 200,
): Promise<ResearchLogResponse> {
  return api.get<ResearchLogResponse>(
    `/platform/research/${encodeURIComponent(taskId)}/log`,
    { params: { limit } },
  );
}

export async function liveSearch(
  input: LiveSearchInput,
): Promise<LiveSearchResponse> {
  const body: Record<string, unknown> = {
    query: input.query,
    limit: input.limit ?? 12,
  };
  if (input.sources && input.sources.length > 0) body.sources = input.sources;
  // Adapter fan-out (arxiv + openalex + searxng + ...) routinely runs >60 s
  // when one upstream is slow; allow up to 3 minutes before giving up.
  // No trailing slash: FastAPI 307s ``/platform/search/`` to
  // ``/platform/search`` with an absolute backend URL that bypasses the
  // Vite proxy — and the browser's cross-origin redirect rejects it.
  const raw = await api.post<RawSearchResponse>("/platform/search", body, {
    timeout: 180_000,
  });
  const hits = (raw.hits ?? []).map(snippetFromHit);
  const errors = raw.errors ?? {};
  return { hits, errors };
}
