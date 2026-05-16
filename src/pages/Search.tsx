import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";

import { submitResearch } from "@/api/research";
import { listCorpora } from "@/api/library";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ADAPTERS = [
  "arxiv",
  "semantic_scholar",
  "openalex",
  "searxng",
  "github",
  "stackexchange",
  "wikipedia",
] as const;

type Adapter = (typeof ADAPTERS)[number];

type RecentEntry = {
  taskId: string;
  query: string;
  createdAt: number;
};

const RECENT_KEY = "dr.recent";
const RECENT_LIMIT = 20;

// Depth presets. ``budgetMs`` is the axios deadline for the synchronous
// ``/platform/research/`` call; pad ~25 % over the typical wall time so
// a slow upstream doesn't spuriously time out a near-finished run.
type DepthPreset = {
  id: "quick" | "standard" | "deep" | "exhaustive";
  label: string;
  hint: string;
  maxPapers: number;
  questionsPerPaper: number;
  reflectionCycles: number;
  budgetMs: number;
};

const DEPTH_PRESETS: readonly DepthPreset[] = [
  {
    id: "quick",
    label: "Quick",
    hint: "~30 s · 3 papers · 1 q · no reflection",
    maxPapers: 3,
    questionsPerPaper: 1,
    reflectionCycles: 0,
    budgetMs: 90_000,
  },
  {
    id: "standard",
    label: "Standard",
    hint: "~5 min · 5 papers · 3 q/paper · 1 reflection",
    maxPapers: 5,
    questionsPerPaper: 3,
    reflectionCycles: 1,
    budgetMs: 300_000,
  },
  {
    id: "deep",
    label: "Deep",
    hint: "~25 min · 10 papers · 8 q/paper · 2 reflections",
    maxPapers: 10,
    questionsPerPaper: 8,
    reflectionCycles: 2,
    budgetMs: 1_500_000,
  },
  {
    id: "exhaustive",
    label: "Exhaustive",
    hint: "~90 min · 50 papers · 20 q/paper · 4 reflections",
    maxPapers: 50,
    questionsPerPaper: 20,
    reflectionCycles: 4,
    budgetMs: 5_400_000,
  },
] as const;

const DEPTH_KEY = "dr.depth";

const DEFAULT_DEPTH: DepthPreset = DEPTH_PRESETS[1]!;

function readDepth(): DepthPreset {
  if (typeof window === "undefined") return DEFAULT_DEPTH;
  const stored = window.localStorage.getItem(DEPTH_KEY);
  return DEPTH_PRESETS.find((p) => p.id === stored) ?? DEFAULT_DEPTH;
}

function writeDepth(id: DepthPreset["id"]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEPTH_KEY, id);
  } catch {
    // localStorage may be disabled; ignore.
  }
}

function readRecent(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
      .map((row) => ({
        taskId: String(row.taskId ?? ""),
        query: String(row.query ?? ""),
        createdAt:
          typeof row.createdAt === "number" ? row.createdAt : Date.now(),
      }))
      .filter((row) => row.taskId !== "");
  } catch {
    return [];
  }
}

function writeRecent(entries: RecentEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = entries.slice(0, RECENT_LIMIT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage may be disabled; ignore.
  }
}

function pushRecent(entry: RecentEntry): RecentEntry[] {
  const existing = readRecent().filter((row) => row.taskId !== entry.taskId);
  const next = [entry, ...existing].slice(0, RECENT_LIMIT);
  writeRecent(next);
  return next;
}

function fmtRecent(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Search() {
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState("");
  const [selectedSources, setSelectedSources] = useState<Set<Adapter>>(
    () => new Set<Adapter>(ADAPTERS),
  );
  const [corpusId, setCorpusId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("dr.corpus") ?? "";
  });

  // Pull the user's corpora for the picker. Network only fires once
  // per page load (staleTime=60s); the dropdown stays disabled until
  // the request resolves so we can't submit a stale id.
  const { data: corpora, isLoading: corporaLoading } = useQuery({
    queryKey: ["library", "corpora"],
    queryFn: () => listCorpora(),
    staleTime: 60_000,
  });

  // If the persisted corpus_id no longer matches a real corpus (deleted
  // since the last visit), reset to "Default (auto)" so the form is
  // never submitting a phantom id.
  useEffect(() => {
    if (!corpora || !corpusId) return;
    if (corpora.some((c) => c.id === corpusId)) return;
    setCorpusId("");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("dr.corpus");
    }
  }, [corpora, corpusId]);
  const [recent, setRecent] = useState<RecentEntry[]>(() => readRecent());
  const [error, setError] = useState<string | null>(null);
  const [depthIndex, setDepthIndex] = useState<number>(() => {
    const stored = readDepth();
    return DEPTH_PRESETS.findIndex((p) => p.id === stored.id);
  });
  const depth: DepthPreset = DEPTH_PRESETS[depthIndex] ?? DEFAULT_DEPTH;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const submit = useMutation({
    mutationFn: async (input: {
      query: string;
      sources: Adapter[];
      preset: DepthPreset;
    }) => {
      const body: Parameters<typeof submitResearch>[0] = {
        query: input.query,
        max_papers: input.preset.maxPapers,
        questions_per_paper: input.preset.questionsPerPaper,
        reflection_cycles: input.preset.reflectionCycles,
        timeoutMs: input.preset.budgetMs,
      };
      if (corpusId) body.corpus_id = corpusId;
      if (input.sources.length > 0 && input.sources.length < ADAPTERS.length) {
        body.sources = input.sources;
      }
      return submitResearch(body);
    },
    onSuccess: (data, variables) => {
      const next = pushRecent({
        taskId: data.task_id,
        query: variables.query,
        createdAt: Date.now(),
      });
      setRecent(next);
      navigate(`/research/${encodeURIComponent(data.task_id)}`);
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Failed to start research task";
      setError(msg);
    },
  });

  const sortedAdapters = useMemo(() => [...ADAPTERS].sort(), []);

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    setError(null);
    const trimmed = query.trim();
    if (!trimmed) return;
    submit.mutate({
      query: trimmed,
      sources: Array.from(selectedSources).sort(),
      preset: depth,
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  };

  const toggleSource = (adapter: Adapter) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(adapter)) next.delete(adapter);
      else next.add(adapter);
      return next;
    });
  };

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Deep Research
        </h1>
        <p className="text-sm text-muted-foreground">
          Compose a question; the platform fans out across primary sources,
          indexes the haul, builds a knowledge graph, and curates a synthesis.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Card>
            <CardHeader className="space-y-1.5 p-4 pb-2">
              <CardTitle className="text-sm font-medium tracking-tight">
                Query
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Press Cmd/Ctrl+Enter to submit.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-0">
              <Textarea
                ref={textareaRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                rows={6}
                placeholder="What would you like to research?"
                className="text-sm"
                aria-label="Research query"
              />

              <div className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Sources
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {sortedAdapters.map((adapter) => {
                    const active = selectedSources.has(adapter);
                    return (
                      <button
                        key={adapter}
                        type="button"
                        onClick={() => toggleSource(adapter)}
                        aria-pressed={active}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {adapter}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <label
                    htmlFor="depth"
                    className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Depth
                  </label>
                  <span className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {depth.label}
                    </span>
                    <span className="ml-2">{depth.hint}</span>
                  </span>
                </div>
                <input
                  id="depth"
                  type="range"
                  min={0}
                  max={DEPTH_PRESETS.length - 1}
                  step={1}
                  value={depthIndex}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    const preset = DEPTH_PRESETS[idx];
                    if (!preset) return;
                    setDepthIndex(idx);
                    writeDepth(preset.id);
                  }}
                  aria-label="Research depth"
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                  {DEPTH_PRESETS.map((preset, idx) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setDepthIndex(idx);
                        writeDepth(preset.id);
                      }}
                      className={cn(
                        "transition-colors hover:text-foreground",
                        idx === depthIndex && "text-foreground",
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <label
                    htmlFor="corpus"
                    className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Corpus
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {corpusId
                      ? "Cited papers will be added to this corpus"
                      : "Cited papers stay in the global library"}
                  </span>
                </div>
                <select
                  id="corpus"
                  value={corpusId}
                  onChange={(e) => {
                    setCorpusId(e.target.value);
                    if (typeof window !== "undefined") {
                      if (e.target.value) {
                        window.localStorage.setItem(
                          "dr.corpus",
                          e.target.value,
                        );
                      } else {
                        window.localStorage.removeItem("dr.corpus");
                      }
                    }
                  }}
                  disabled={corporaLoading}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
                >
                  <option value="">
                    {corporaLoading
                      ? "Loading corpora…"
                      : "Default (no corpus)"}
                  </option>
                  {corpora?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.scope ? ` · ${c.scope}` : ""}
                      {typeof c.document_count === "number"
                        ? ` · ${c.document_count} docs`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>

              {error ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {selectedSources.size} of {ADAPTERS.length} sources selected
                </p>
                <Button
                  type="submit"
                  size="md"
                  disabled={submit.isPending || query.trim().length === 0}
                  className="gap-1.5"
                >
                  {submit.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Research
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>

        <aside aria-label="Recent research" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent
            </h2>
            {recent.length > 0 ? (
              <button
                type="button"
                className="text-[0.7rem] text-muted-foreground hover:text-foreground"
                onClick={() => {
                  writeRecent([]);
                  setRecent([]);
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
          {recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Submitted queries appear here.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {recent.map((entry) => (
                <li key={entry.taskId}>
                  <Link
                    to={`/research/${encodeURIComponent(entry.taskId)}`}
                    className="block rounded-md border border-border bg-card/40 px-3 py-2 text-xs transition-colors hover:bg-accent"
                  >
                    <span className="line-clamp-2 font-medium text-foreground">
                      {entry.query}
                    </span>
                    <span className="mt-0.5 block text-[0.65rem] text-muted-foreground">
                      {fmtRecent(entry.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
}
