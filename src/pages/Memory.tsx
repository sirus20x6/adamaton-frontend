import * as React from "react";
import { Brain, Loader2, Plus, Search as SearchIcon, X } from "lucide-react";

import {
  memoryApi,
  useCreateInsight,
  useCreateMemoryItem,
  useDeleteEntity,
  useDeleteInsight,
  useDeleteMemoryItem,
  useDeleteRelationship,
  useMemoryEntities,
  useMemoryInsights,
  useMemoryItems,
  useMemoryRelationships,
  useMemorySources,
  usePatchEntity,
  usePatchInsight,
  usePatchMemoryItem,
  usePatchRelationship,
  type MemoryEntity,
  type MemoryInsight,
  type MemoryItem,
  type MemoryRelationship,
  type MemorySource,
} from "@/api/memory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toaster, useToast } from "@/components/ui/toast";
import { useVirtualRows } from "@/hooks/useVirtualRows";
import { cn } from "@/lib/utils";

// Fixed pixel height of one memory row. Rows truncate title/subtitle to a
// single line each, so their height is stable — which is what lets the simple
// fixed-height virtualizer (useVirtualRows) avoid per-row measurement.
const ROW_HEIGHT = 65;

// A unified row shape — every source flattens to this so the row component
// and search filter don't care about which table/file the record came from.
type UnifiedRow = {
  key: string;
  sourceKey: string;
  sourceLabel: string;
  title: string;
  subtitle: string;
  body?: string;
  lastModified: string | undefined;
  raw:
    | { kind: "file"; data: MemoryItem }
    | { kind: "insight"; data: MemoryInsight }
    | { kind: "entity"; data: MemoryEntity }
    | { kind: "relationship"; data: MemoryRelationship };
};

const FILE_AGENTS = [
  { key: "claude-code", label: "Claude Code", kind: "files" as const },
  { key: "claude-global", label: "Claude global", kind: "file" as const },
  { key: "claude-projects", label: "Per-repo CLAUDE.md", kind: "files" as const },
  { key: "codex", label: "Codex", kind: "files" as const },
  { key: "gemini", label: "Gemini", kind: "file" as const },
  { key: "opencode", label: "OpenCode", kind: "files" as const },
];

const DB_AGENT_KEYS = ["insights", "entities", "relationships"] as const;

const SOURCE_BADGE: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "danger" | "outline"
> = {
  "claude-code": "secondary",
  "claude-global": "secondary",
  "claude-projects": "secondary",
  codex: "default",
  gemini: "warning",
  opencode: "danger",
  insights: "success",
  entities: "outline",
  relationships: "outline",
};

function badgeVariant(key: string) {
  return SOURCE_BADGE[key] ?? "default";
}

// Cheap debounce — 200ms keeps typing latency imperceptible while skipping
// cascading state churn on every keystroke for a 500-row dataset.
function useDebounced<T>(value: T, delay = 200): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

export default function Memory() {
  const sourcesQuery = useMemorySources();
  const sources = React.useMemo<MemorySource[]>(
    () => sourcesQuery.data ?? [],
    [sourcesQuery.data],
  );

  // Fan out one query per agent + the three DB tables. Each runs in
  // parallel; one failing agent doesn't wipe the whole list.
  const claudeCode = useMemoryItems("claude-code");
  const claudeGlobal = useMemoryItems("claude-global");
  const claudeProjects = useMemoryItems("claude-projects");
  const codex = useMemoryItems("codex");
  const gemini = useMemoryItems("gemini");
  const opencode = useMemoryItems("opencode");
  const insights = useMemoryInsights("");
  const entities = useMemoryEntities("");
  const relationships = useMemoryRelationships("");

  const fileQueries = React.useMemo(
    () =>
      [
        { agent: FILE_AGENTS[0], q: claudeCode },
        { agent: FILE_AGENTS[1], q: claudeGlobal },
        { agent: FILE_AGENTS[2], q: claudeProjects },
        { agent: FILE_AGENTS[3], q: codex },
        { agent: FILE_AGENTS[4], q: gemini },
        { agent: FILE_AGENTS[5], q: opencode },
      ] as const,
    [claudeCode, claudeGlobal, claudeProjects, codex, gemini, opencode],
  );

  const loading =
    sourcesQuery.isLoading ||
    fileQueries.some((f) => f.q.isLoading) ||
    insights.isLoading ||
    entities.isLoading ||
    relationships.isLoading;

  const items = React.useMemo<UnifiedRow[]>(() => {
    const all: UnifiedRow[] = [];
    for (const { agent, q } of fileQueries) {
      for (const it of q.data ?? []) {
        all.push({
          key: `${agent.key}:${it.id}`,
          sourceKey: agent.key,
          sourceLabel: agent.label,
          title: it.name || it.path.split("/").pop() || agent.label,
          subtitle: it.description || it.scope || "",
          lastModified: it.last_modified,
          raw: { kind: "file", data: it },
        });
      }
    }
    for (const i of insights.data ?? []) {
      all.push({
        key: `insights:${i.id}`,
        sourceKey: "insights",
        sourceLabel: "evo.insights",
        title: i.title,
        subtitle: `${i.domain}${i.tags.length ? " · " + i.tags.join(", ") : ""}`,
        body: i.body,
        lastModified: i.created_at,
        raw: { kind: "insight", data: i },
      });
    }
    for (const e of entities.data ?? []) {
      all.push({
        key: `entities:${e.id}`,
        sourceKey: "entities",
        sourceLabel: "entities",
        title: e.name,
        subtitle: e.category,
        body: e.description,
        lastModified: e.updated_at,
        raw: { kind: "entity", data: e },
      });
    }
    for (const r of relationships.data ?? []) {
      all.push({
        key: `relationships:${r.id}`,
        sourceKey: "relationships",
        sourceLabel: "relationships",
        title: `${r.subject} —[${r.predicate || "?"}]→ ${r.object}`,
        subtitle: r.description,
        body: r.description,
        lastModified: r.updated_at,
        raw: { kind: "relationship", data: r },
      });
    }
    all.sort((a, b) =>
      (b.lastModified ?? "").localeCompare(a.lastModified ?? ""),
    );
    return all;
  }, [
    fileQueries,
    insights.data,
    entities.data,
    relationships.data,
  ]);

  const [activeFilter, setActiveFilter] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 200);
  const [selected, setSelected] = React.useState<UnifiedRow | null>(null);
  const [creating, setCreating] = React.useState<string | null>(null);

  // Outer scroll container for the virtualized list. Only the rows currently
  // in (or near) the viewport are mounted, so the list stays smooth past the
  // ~500-row point where the old slice cap kicked in.
  const listScrollRef = React.useRef<HTMLDivElement | null>(null);

  const filtered = React.useMemo(() => {
    let rows = items;
    if (activeFilter) {
      rows = rows.filter((r) => r.sourceKey === activeFilter);
    }
    const q = debouncedSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.subtitle.toLowerCase().includes(q) ||
          (r.body?.toLowerCase().includes(q) ?? false),
      );
    }
    return rows;
  }, [items, activeFilter, debouncedSearch]);

  const virtual = useVirtualRows({
    count: filtered.length,
    rowHeight: ROW_HEIGHT,
    scrollRef: listScrollRef,
  });

  // Reset the scroll position to the top whenever the result set changes so a
  // new filter/search doesn't leave the viewport stranded past the new end.
  React.useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [activeFilter, debouncedSearch]);

  const chartData = React.useMemo(() => {
    return sources
      .filter((s) => s.count > 0)
      .map((s) => ({ key: s.key, label: s.label, count: s.count }));
  }, [sources]);

  const maxCount = chartData.reduce((m, c) => Math.max(m, c.count), 0);

  const errorMsg =
    sourcesQuery.error instanceof Error
      ? sourcesQuery.error.message
      : null;

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Memory</h1>
            <p className="text-sm text-muted-foreground">
              View, search, and edit memory across every agent and store.
            </p>
          </div>
        </div>
        <Button onClick={() => setCreating("claude-code")} size="sm">
          <Plus className="h-4 w-4" />
          New memory
        </Button>
      </header>

      {errorMsg ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-300">
          {errorMsg}
        </div>
      ) : null}

      <StatCardRow
        sources={sources}
        activeFilter={activeFilter}
        onPick={(key) =>
          setActiveFilter(activeFilter === key ? null : key)
        }
      />

      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Memory by source</h2>
          <span className="text-xs text-muted-foreground">
            Click a bar to filter the list below
          </span>
        </div>
        {chartData.length === 0 ? (
          <div className="text-sm text-muted-foreground">No memory yet.</div>
        ) : (
          <div className="space-y-1.5">
            {chartData.map((d) => {
              const widthPct =
                maxCount > 0 ? Math.max(2, (d.count / maxCount) * 100) : 0;
              const isActive = activeFilter === d.key;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() =>
                    setActiveFilter(isActive ? null : d.key)
                  }
                  className="flex w-full items-center gap-3 text-left transition-opacity hover:opacity-100"
                >
                  <span className="w-44 truncate text-xs text-muted-foreground">
                    {d.label}
                  </span>
                  <span className="h-5 flex-1 overflow-hidden rounded bg-muted/40">
                    <span
                      className={cn(
                        "block h-full rounded transition-colors",
                        isActive ? "bg-primary" : "bg-primary/60",
                      )}
                      style={{ width: `${widthPct}%` }}
                    />
                  </span>
                  <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                    {d.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search across all memory…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7"
          />
        </div>
        {activeFilter ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveFilter(null)}
          >
            <X className="h-3.5 w-3.5" />
            Clear filter
          </Button>
        ) : null}
      </div>

      {loading && items.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading memory…
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="rounded-lg border border-dashed border-border bg-card/30 p-12 text-center text-sm text-muted-foreground">
            No memory matches your search.
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <div
            ref={listScrollRef}
            className="min-h-0 flex-1 overflow-auto rounded-lg border border-border"
          >
            {/* Spacer sized to the full list keeps the scrollbar honest; the
                rendered window is absolutely positioned at its true offset. */}
            <div
              className="relative w-full"
              style={{ height: virtual.totalHeight }}
            >
              <div
                className="absolute inset-x-0 top-0 divide-y divide-border"
                style={{ transform: `translateY(${virtual.offsetY}px)` }}
              >
                {virtual.range.map((i) => {
                  const row = filtered[i];
                  if (!row) return null;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => setSelected(row)}
                      style={{ height: ROW_HEIGHT }}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                    >
                      <Badge
                        variant={badgeVariant(row.sourceKey)}
                        className="mt-0.5 shrink-0"
                      >
                        {row.sourceLabel}
                      </Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {row.title}
                        </span>
                        {row.subtitle ? (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {row.subtitle}
                          </span>
                        ) : null}
                      </span>
                      {row.lastModified ? (
                        <span className="mt-0.5 whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(row.lastModified).toLocaleDateString()}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <p className="shrink-0 px-1 text-[11px] text-muted-foreground">
            {filtered.length.toLocaleString()}{" "}
            {filtered.length === 1 ? "item" : "items"}
            {filtered.length === items.length
              ? ""
              : ` of ${items.length.toLocaleString()}`}
          </p>
        </div>
      )}

      {selected ? (
        <DetailModal
          row={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}

      {creating ? (
        <CreateModal
          defaultSource={creating}
          onClose={() => setCreating(null)}
        />
      ) : null}

      <Toaster />
    </section>
  );
}

/* ── Stat cards ────────────────────────────────────────────────────────── */

function StatCardRow({
  sources,
  activeFilter,
  onPick,
}: {
  sources: MemorySource[];
  activeFilter: string | null;
  onPick: (key: string) => void;
}) {
  if (sources.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {sources.map((s) => {
        const isActive = activeFilter === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onPick(s.key)}
            className={cn(
              "rounded-lg border bg-card/40 px-4 py-3 text-left transition-colors",
              isActive
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-accent/30",
            )}
          >
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {s.kind}
            </div>
            <div className="truncate text-sm font-medium">{s.label}</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tabular-nums">
                {Math.max(0, s.count)}
              </span>
              {!s.available ? (
                <span className="text-[10px] text-amber-500">
                  unavailable
                </span>
              ) : null}
            </div>
            {s.note ? (
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {s.note}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ── Detail modal ──────────────────────────────────────────────────────── */

type UnifiedPatch = {
  title?: string;
  body?: string;
  description?: string;
  type?: string;
  domain?: string;
  tags?: string[];
  category?: string;
  predicate?: string;
  weight?: number;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function initialBody(row: UnifiedRow): string {
  switch (row.raw.kind) {
    case "file":
      return row.raw.data.body ?? "";
    case "insight":
      return row.raw.data.body;
    case "entity":
      return row.raw.data.description;
    case "relationship":
      return row.raw.data.description;
  }
}

function initialDescription(row: UnifiedRow): string {
  if (row.raw.kind === "file") return row.raw.data.description ?? "";
  return "";
}

function initialType(row: UnifiedRow): string {
  if (row.raw.kind === "file") return row.raw.data.type ?? "";
  return "";
}

function DetailModal({
  row,
  onClose,
}: {
  row: UnifiedRow;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [body, setBody] = React.useState(() => row.body ?? initialBody(row));
  const [description, setDescription] = React.useState(() =>
    initialDescription(row),
  );
  const [type, setType] = React.useState(() => initialType(row));
  const [domain, setDomain] = React.useState(() =>
    row.raw.kind === "insight" ? row.raw.data.domain : "",
  );
  const [title, setTitle] = React.useState(() => row.title);
  const [tags, setTags] = React.useState(() =>
    row.raw.kind === "insight" ? row.raw.data.tags.join(", ") : "",
  );
  const [category, setCategory] = React.useState(() =>
    row.raw.kind === "entity" ? row.raw.data.category : "",
  );
  const [predicate, setPredicate] = React.useState(() =>
    row.raw.kind === "relationship" ? row.raw.data.predicate : "",
  );
  const [weight, setWeight] = React.useState(() =>
    row.raw.kind === "relationship" ? String(row.raw.data.weight) : "0",
  );
  const [showRaw, setShowRaw] = React.useState(false);
  const [loadingBody, setLoadingBody] = React.useState(false);

  // File-backed rows arrive in the list without their body — fetch the
  // full body on open so the editor matches the on-disk content.
  React.useEffect(() => {
    if (row.raw.kind !== "file" || row.body) return;
    let cancelled = false;
    setLoadingBody(true);
    memoryApi
      .getItem(row.raw.data.agent, row.raw.data.id)
      .then((full) => {
        if (cancelled) return;
        setBody(full.body ?? "");
        if (full.description) setDescription(full.description);
        if (full.type) setType(full.type);
      })
      .catch(() => {
        // Leave body empty; the user can still write a fresh body.
      })
      .finally(() => {
        if (!cancelled) setLoadingBody(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row]);

  const patchItem = usePatchMemoryItem();
  const patchInsightM = usePatchInsight();
  const patchEntityM = usePatchEntity();
  const patchRelM = usePatchRelationship();
  const delItem = useDeleteMemoryItem();
  const delInsight = useDeleteInsight();
  const delEntity = useDeleteEntity();
  const delRel = useDeleteRelationship();

  const buildPatch = (): UnifiedPatch => {
    switch (row.raw.kind) {
      case "file":
        return { body, description, type };
      case "insight":
        return {
          title,
          body,
          domain,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        };
      case "entity":
        return { body, category };
      case "relationship": {
        const w = parseFloat(weight);
        return {
          body,
          predicate,
          weight: Number.isFinite(w) ? w : 0,
        };
      }
    }
  };

  const handleSave = async () => {
    const patch = buildPatch();
    try {
      switch (row.raw.kind) {
        case "file":
          await patchItem.mutateAsync({
            agent: row.raw.data.agent,
            id: row.raw.data.id,
            input: {
              body: patch.body,
              description: patch.description,
              type: patch.type,
            },
          });
          break;
        case "insight":
          await patchInsightM.mutateAsync({
            id: row.raw.data.id,
            input: {
              title: patch.title,
              body: patch.body,
              domain: patch.domain,
              tags: patch.tags,
            },
          });
          break;
        case "entity":
          await patchEntityM.mutateAsync({
            id: row.raw.data.id,
            input: { description: patch.body, category: patch.category },
          });
          break;
        case "relationship":
          await patchRelM.mutateAsync({
            id: row.raw.data.id,
            input: {
              description: patch.body,
              predicate: patch.predicate,
              weight: patch.weight,
            },
          });
          break;
      }
      toast({ title: "Saved", variant: "success" });
      onClose();
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "error",
      });
    }
  };

  const handleDelete = async () => {
    const label = row.title.slice(0, 80);
    if (
      !window.confirm(`Delete "${label}"?\n\nThis cannot be undone.`)
    )
      return;
    try {
      switch (row.raw.kind) {
        case "file":
          await delItem.mutateAsync({
            agent: row.raw.data.agent,
            id: row.raw.data.id,
          });
          break;
        case "insight":
          await delInsight.mutateAsync(row.raw.data.id);
          break;
        case "entity":
          await delEntity.mutateAsync(row.raw.data.id);
          break;
        case "relationship":
          await delRel.mutateAsync(row.raw.data.id);
          break;
      }
      toast({ title: "Deleted", variant: "success" });
      onClose();
    } catch (e) {
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "error",
      });
    }
  };

  const saving =
    patchItem.isPending ||
    patchInsightM.isPending ||
    patchEntityM.isPending ||
    patchRelM.isPending;
  const deleting =
    delItem.isPending ||
    delInsight.isPending ||
    delEntity.isPending ||
    delRel.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] w-full max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2 pr-8">
            <Badge variant={badgeVariant(row.sourceKey)}>
              {row.sourceLabel}
            </Badge>
            <DialogTitle className="truncate">
              {title || row.title}
            </DialogTitle>
          </div>
          {row.raw.kind === "file" ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {row.raw.data.path}
            </p>
          ) : null}
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
          {row.raw.kind === "insight" ? (
            <>
              <Field label="Title">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label="Domain">
                <Input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
              </Field>
              <Field label="Tags (comma-separated)">
                <Input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
              </Field>
            </>
          ) : null}

          {row.raw.kind === "file" ? (
            <>
              <Field label="Description">
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
              {row.sourceKey === "claude-code" ? (
                <Field label="Type">
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="">(unset)</option>
                    <option value="user">user</option>
                    <option value="feedback">feedback</option>
                    <option value="project">project</option>
                    <option value="reference">reference</option>
                  </select>
                </Field>
              ) : null}
            </>
          ) : null}

          {row.raw.kind === "entity" ? (
            <>
              <Field label="Name (read-only — managed by extract pipeline)">
                <Input value={row.raw.data.name} readOnly />
              </Field>
              <Field label="Category">
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </Field>
            </>
          ) : null}

          {row.raw.kind === "relationship" ? (
            <>
              <Field label="Triple (read-only)">
                <Input
                  value={`${row.raw.data.subject} —[${row.raw.data.predicate}]→ ${row.raw.data.object}`}
                  readOnly
                />
              </Field>
              <Field label="Predicate">
                <Input
                  value={predicate}
                  onChange={(e) => setPredicate(e.target.value)}
                />
              </Field>
              <Field label="Weight">
                <Input
                  type="number"
                  step="0.01"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </Field>
              <p className="-mt-2 text-[11px] text-muted-foreground">
                Subject + object are managed by the extract pipeline; edit
                them by re-running extraction.
              </p>
            </>
          ) : null}

          <Field
            label={
              row.raw.kind === "entity" || row.raw.kind === "relationship"
                ? "Description"
                : "Body (Markdown)"
            }
          >
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className="font-mono"
              placeholder={loadingBody ? "Loading body…" : ""}
            />
          </Field>

          {row.raw.kind === "file" ? (
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {showRaw ? "Hide" : "Show"} raw frontmatter info
            </button>
          ) : null}
          {showRaw && row.raw.kind === "file" ? (
            <pre className="overflow-x-auto rounded border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
              {JSON.stringify(
                {
                  agent: row.raw.data.agent,
                  scope: row.raw.data.scope,
                  has_frontmatter: row.raw.data.has_matter,
                  path: row.raw.data.path,
                },
                null,
                2,
              )}
            </pre>
          ) : null}
        </div>

        <DialogFooter className="mt-0 flex flex-row items-center justify-between gap-2 border-t border-border px-5 py-3">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Create modal ──────────────────────────────────────────────────────── */

function CreateModal({
  defaultSource,
  onClose,
}: {
  defaultSource: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [source, setSource] = React.useState(defaultSource);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState("project");
  const [scope, setScope] = React.useState("");
  const [body, setBody] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [tags, setTags] = React.useState("");

  const createItem = useCreateMemoryItem();
  const createInsightM = useCreateInsight();

  const isFile = FILE_AGENTS.some((a) => a.key === source);
  const isReadOnly = ["claude-global", "gemini", "claude-projects"].includes(
    source,
  );

  const submit = async () => {
    try {
      if (source === "insights") {
        if (!domain.trim() || !title.trim() || !body.trim()) {
          toast({
            title: "Missing fields",
            description: "domain, title, and body are required",
            variant: "error",
          });
          return;
        }
        await createInsightM.mutateAsync({
          domain: domain.trim(),
          title: title.trim(),
          body,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        });
      } else if (isFile) {
        if (!name.trim() || !body.trim()) {
          toast({
            title: "Missing fields",
            description: "name and body are required",
            variant: "error",
          });
          return;
        }
        await createItem.mutateAsync({
          agent: source,
          input: {
            name: name.trim(),
            description: description.trim(),
            type: type.trim(),
            scope: scope.trim(),
            body,
          },
        });
      } else {
        toast({
          title: "Unsupported",
          description: `Creating ${source} via the dashboard is not supported. Use the upstream pipeline.`,
          variant: "error",
        });
        return;
      }
      toast({ title: "Created", variant: "success" });
      onClose();
    } catch (e) {
      toast({
        title: "Create failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "error",
      });
    }
  };

  const saving = createItem.isPending || createInsightM.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] w-full max-w-2xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>New memory</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
          <Field label="Destination">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <optgroup label="Coding agents">
                {FILE_AGENTS.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Databases">
                {DB_AGENT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>

          {isReadOnly ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              {source === "claude-projects"
                ? "Per-repo CLAUDE.md files cannot be created from the dashboard. Add the file directly under the repo root and it will appear here."
                : "Single-file memory cannot be created — edit the existing file instead."}
            </div>
          ) : null}

          {source === "insights" ? (
            <>
              <Field label="Domain">
                <Input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="e.g. gemm-rocm"
                />
              </Field>
              <Field label="Title">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label="Tags (comma-separated)">
                <Input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
              </Field>
            </>
          ) : null}

          {source === "entities" || source === "relationships" ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              Entities and relationships are populated by the extract
              pipeline. The dashboard supports editing and deleting them,
              but new rows should land via re-extraction so they round-trip
              to chunk references correctly.
            </div>
          ) : null}

          {isFile && !isReadOnly ? (
            <>
              <Field label="Name">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="short kebab-slug name"
                />
              </Field>
              <Field label="Description (one line)">
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
              {source === "claude-code" ? (
                <>
                  <Field label="Project scope (slug)">
                    <Input
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                      placeholder="-thearray-git-evo"
                    />
                  </Field>
                  <Field label="Type">
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="user">user</option>
                      <option value="feedback">feedback</option>
                      <option value="project">project</option>
                      <option value="reference">reference</option>
                    </select>
                  </Field>
                </>
              ) : null}
            </>
          ) : null}

          {isFile || source === "insights" ? (
            <Field label="Body (Markdown)">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={14}
                className="font-mono"
              />
            </Field>
          ) : null}
        </div>

        <DialogFooter className="mt-0 flex flex-row items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={
              saving ||
              isReadOnly ||
              source === "entities" ||
              source === "relationships"
            }
          >
            {saving ? "Saving…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
