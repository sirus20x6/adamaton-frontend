import * as React from "react";
import { Loader2, Plug, PlugZap } from "lucide-react";

import { usePlugins, type PluginCategory } from "@/api/plugins";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/toast";
import { PluginCard } from "@/features/plugins/PluginCard";

type CategoryTab = "all" | PluginCategory;

const CATEGORY_TABS: ReadonlyArray<{ value: CategoryTab; label: string }> = [
  { value: "all", label: "All" },
  { value: "importer", label: "Importers" },
  { value: "search", label: "Search" },
  { value: "marketplace", label: "Marketplace" },
];

// Single fetch + client-side filter beats four parallel category fetches:
// the manifest list is small, paying one round-trip avoids the loading
// flicker when switching tabs.
function filterByCategory(
  plugins: ReturnType<typeof usePlugins>["data"],
  tab: CategoryTab,
) {
  const list = plugins ?? [];
  if (tab === "all") return list;
  return list.filter((p) => p.category === tab);
}

export default function Plugins() {
  const query = usePlugins();
  const [tab, setTab] = React.useState<CategoryTab>("all");
  const plugins = query.data ?? [];
  const filtered = React.useMemo(
    () => filterByCategory(plugins, tab),
    [plugins, tab],
  );

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <PlugZap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Plugins</h1>
            <p className="text-sm text-muted-foreground">
              Pull data from external sources. Each plugin advertises its own
              args schema; runs land in the platform ingestion queue.
            </p>
          </div>
        </div>
        {!query.isLoading && plugins.length > 0 ? (
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {plugins.length.toLocaleString()} plugin
            {plugins.length === 1 ? "" : "s"} registered
          </p>
        ) : null}
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as CategoryTab)}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <TabsList className="self-start">
          {CATEGORY_TABS.map((opt) => (
            <TabsTrigger key={opt.value} value={opt.value}>
              {opt.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
          {query.isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading registered plugins…
            </div>
          ) : null}

          {query.isError ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-200">
              <p className="font-medium">Couldn't load plugins</p>
              <p className="mt-1 text-xs text-red-300/80">
                {query.error instanceof Error
                  ? query.error.message
                  : String(query.error)}
              </p>
            </div>
          ) : null}

          {CATEGORY_TABS.map((opt) => {
            const rows =
              opt.value === tab ? filtered : filterByCategory(plugins, opt.value);
            return (
              <TabsContent
                key={opt.value}
                value={opt.value}
                className="m-0 flex flex-col gap-4"
              >
                {!query.isLoading && !query.isError && rows.length === 0 ? (
                  <EmptyState category={opt.value} />
                ) : null}
                {rows.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {rows.map((plugin) => (
                      <PluginCard key={plugin.id} plugin={plugin} />
                    ))}
                  </div>
                ) : null}
              </TabsContent>
            );
          })}
        </div>
      </Tabs>

      <Toaster />
    </section>
  );
}

function EmptyState({ category }: { category: CategoryTab }) {
  const copy =
    category === "all"
      ? {
          title: "No plugins registered",
          body: "Once the backend registers a plugin, it will appear here as a card you can configure and run.",
        }
      : {
          title: `No ${category} plugins yet`,
          body: "Nothing in this category has been registered. Check back after the next plugin lands.",
        };
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/30 p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
        <Plug className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-medium">{copy.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{copy.body}</p>
      </div>
    </div>
  );
}
