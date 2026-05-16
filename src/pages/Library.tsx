import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plug, Search as SearchIcon } from "lucide-react";

import { listCorpora, type Corpus } from "@/api/library";
import { usePluginsByCategory } from "@/api/plugins";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/toast";
import { CorpusGrid } from "@/features/library/CorpusGrid";
import { CreateCorpusDialog } from "@/features/library/CreateCorpusDialog";
import { IngestPanel } from "@/features/library/IngestPanel";
import { PluginCard } from "@/features/plugins/PluginCard";
// TODO: replace with generic ImporterCTA after Phase C — once zotero is a
// plugin the CTA becomes "Connect an importer" routing into the
// Importers tab below.
import { ZoteroCTA } from "@/features/zotero/ZoteroCTA";

type ScopeTab =
  | "all"
  | "research"
  | "books"
  | "experiments"
  | "mixed"
  | "importers";

const SCOPE_TABS: ReadonlyArray<{ value: ScopeTab; label: string }> = [
  { value: "all", label: "All" },
  { value: "research", label: "Research" },
  { value: "books", label: "Books" },
  { value: "experiments", label: "Experiments" },
  { value: "mixed", label: "Mixed" },
  { value: "importers", label: "Importers" },
];

function matchesScope(corpus: Corpus, tab: ScopeTab): boolean {
  if (tab === "all") return true;
  const scope = (corpus.scope ?? "research").toLowerCase();
  const meta = (corpus.metadata ?? {}) as Record<string, unknown>;
  if (tab === "books") return scope === "book";
  if (tab === "research") return scope === "research";
  if (tab === "mixed") return scope === "mixed";
  if (tab === "experiments") {
    // Experiments tab maps onto the ``mixed`` scope flagged with an
    // ``experiment: true`` metadata bit, since the DB only allows three
    // scope values.
    return scope === "mixed" && Boolean(meta.experiment);
  }
  return false;
}

export default function Library() {
  const [tab, setTab] = React.useState<ScopeTab>("all");
  const [search, setSearch] = React.useState("");

  const corporaQuery = useQuery({
    queryKey: ["corpora"],
    queryFn: listCorpora,
  });
  // Only fetch importer plugins when the user lands on the tab — keeps
  // the All tab from paying for an extra request on every page visit.
  const importersQuery = usePluginsByCategory("importer", {
    enabled: tab === "importers",
  });

  const filtered = React.useMemo(() => {
    const list = corporaQuery.data ?? [];
    const needle = search.trim().toLowerCase();
    return list.filter((c) => {
      if (tab === "importers") return false;
      if (!matchesScope(c, tab)) return false;
      if (!needle) return true;
      return c.name.toLowerCase().includes(needle);
    });
  }, [corporaQuery.data, search, tab]);

  const importers = React.useMemo(() => {
    const list = importersQuery.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((p) => {
      const haystack = `${p.name} ${p.id} ${p.description}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [importersQuery.data, search]);

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground">
            Corpora are buckets for documents — group reading lists, books,
            and experimental pools.
          </p>
        </div>
        <CreateCorpusDialog />
      </header>

      {tab === "all" ? <ZoteroCTA /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as ScopeTab)}
          className="min-w-0"
        >
          <TabsList>
            {SCOPE_TABS.map((opt) => (
              <TabsTrigger key={opt.value} value={opt.value}>
                {opt.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative ml-auto w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name…"
            className="pl-7"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "importers" ? (
          importersQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading importers…
            </div>
          ) : importersQuery.isError ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300">
              Failed to load importers:{" "}
              {importersQuery.error instanceof Error
                ? importersQuery.error.message
                : String(importersQuery.error)}
            </div>
          ) : importers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/30 p-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
                <Plug className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium">No importers yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Once an importer plugin is registered, connect it from here
                  to pull documents into your corpora.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {importers.map((plugin) => (
                <PluginCard key={plugin.id} plugin={plugin} />
              ))}
            </div>
          )
        ) : corporaQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading corpora…
          </div>
        ) : corporaQuery.isError ? (
          <div className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300">
            Failed to load corpora:{" "}
            {corporaQuery.error instanceof Error
              ? corporaQuery.error.message
              : String(corporaQuery.error)}
          </div>
        ) : (
          <CorpusGrid corpora={filtered} />
        )}
      </div>

      {tab !== "importers" ? (
        <div className="shrink-0 space-y-2 border-t border-border pt-4">
          <h2 className="text-sm font-medium">Add documents</h2>
          <IngestPanel />
        </div>
      ) : null}

      <Toaster />
    </section>
  );
}
