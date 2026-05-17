import * as React from "react";
import { Loader2, Search as SearchIcon, Workflow, X } from "lucide-react";

import {
  useWorkflowCatalog,
  type NodeSource,
  type WorkflowNode,
} from "@/api/connectors";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConnectorCard } from "@/features/connectors/ConnectorCard";

type Tab = "all" | NodeSource;

const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: "all", label: "All" },
  { value: "n8n", label: "n8n" },
  { value: "community", label: "Community" },
  { value: "builtin", label: "Builtin" },
];

// 200ms keystroke debounce — same budget Skills/Memory use elsewhere.
function useDebounced<T>(value: T, delay = 200): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

function matchesQuery(node: WorkflowNode, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    node.name.toLowerCase().includes(needle) ||
    node.displayName.toLowerCase().includes(needle) ||
    node.description.toLowerCase().includes(needle) ||
    node.category.toLowerCase().includes(needle) ||
    node.output_type.toLowerCase().includes(needle)
  );
}

export default function Connectors() {
  const query = useWorkflowCatalog();
  const [tab, setTab] = React.useState<Tab>("all");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 200);
  const [active, setActive] = React.useState<WorkflowNode | null>(null);

  const nodes = query.data?.nodes ?? [];
  const counts = React.useMemo(() => {
    const c: Record<Tab, number> = { all: 0, n8n: 0, community: 0, builtin: 0 };
    for (const n of nodes) {
      c.all += 1;
      c[n.source] = (c[n.source] ?? 0) + 1;
    }
    return c;
  }, [nodes]);

  const visible = React.useMemo(() => {
    return nodes
      .filter((n) => (tab === "all" ? true : n.source === tab))
      .filter((n) => matchesQuery(n, debouncedSearch));
  }, [nodes, tab, debouncedSearch]);

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Workflow className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Connectors</h1>
            <p className="text-sm text-muted-foreground">
              Workflow nodes loaded from the plugin catalog. Builtin checks
              ship with the binary; n8n entries come from{" "}
              <code className="rounded bg-muted/40 px-1 py-0.5 text-[11px]">
                go run ./cmd/n8n-import
              </code>{" "}
              in the evolve sub-repo.
            </p>
          </div>
        </div>
        {!query.isLoading && nodes.length > 0 ? (
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {counts.all.toLocaleString()} node{counts.all === 1 ? "" : "s"}{" "}
            registered
          </p>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, description, category, output type…"
            className="pl-8"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <TabsList className="self-start">
          {TABS.map((opt) => (
            <TabsTrigger key={opt.value} value={opt.value}>
              {opt.label}
              <Badge variant="outline" className="ml-2 px-1.5 py-0">
                {counts[opt.value].toLocaleString()}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
          {query.isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading connector catalog…
            </div>
          ) : null}

          {query.isError ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-200">
              <p className="font-medium">Couldn't load connectors</p>
              <p className="mt-1 text-xs text-red-300/80">
                {query.error instanceof Error
                  ? query.error.message
                  : String(query.error)}
              </p>
            </div>
          ) : null}

          {TABS.map((opt) => (
            <TabsContent
              key={opt.value}
              value={opt.value}
              className="m-0 flex flex-col gap-4"
            >
              {!query.isLoading && !query.isError && visible.length === 0 ? (
                <EmptyState
                  tab={opt.value}
                  hasSearch={debouncedSearch.length > 0}
                />
              ) : null}
              {visible.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {visible.map((node) => (
                    <ConnectorCard
                      key={`${node.source}:${node.name}`}
                      node={node}
                      onSelect={setActive}
                    />
                  ))}
                </div>
              ) : null}
            </TabsContent>
          ))}
        </div>
      </Tabs>

      <Sheet open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent>
          {active ? <ConnectorDetail node={active} /> : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function EmptyState({ tab, hasSearch }: { tab: Tab; hasSearch: boolean }) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/30 p-12 text-center">
        <p className="text-sm font-medium">No connectors match your search</p>
        <p className="text-xs text-muted-foreground">
          Try a shorter query or a different tab.
        </p>
      </div>
    );
  }
  // Tab-specific hints. The n8n bootstrap message is the load-bearing one —
  // an empty page after deploy almost always means n8n-import hasn't run.
  const copy =
    tab === "n8n"
      ? {
          title: "No n8n nodes imported yet",
          body: "Run `go run ./cmd/n8n-import <npm-package>` from evolve/workflow-builder/ with the n8n-bridge sidecar running on :5679. New YAMLs land in evolve/workflow-builder/plugins/n8n/.",
        }
      : tab === "community"
        ? {
            title: "No community nodes registered",
            body: "Drop YAML node definitions into evolve/workflow-builder/plugins/community/ and restart evo-api.",
          }
        : tab === "builtin"
          ? {
              title: "No builtin nodes loaded",
              body: "This usually means the apiserver's plugin search paths are wrong. Set EVO_PLUGIN_DIRS or verify the bind-mount in deploy/pi5/docker-compose.yml.",
            }
          : {
              title: "Catalog is empty",
              body: "The plugin loader found nothing. Check EVO_PLUGIN_DIRS or the deploy bind-mount.",
            };
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/30 p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
        <Workflow className="h-6 w-6" />
      </div>
      <div className="max-w-md">
        <p className="text-sm font-medium">{copy.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{copy.body}</p>
      </div>
    </div>
  );
}

function ConnectorDetail({ node }: { node: WorkflowNode }) {
  return (
    <>
      <SheetHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xl">
            {node.icon || "🧩"}
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate">
              {node.displayName || node.name}
            </SheetTitle>
            <SheetDescription className="font-mono text-[11px]">
              {node.name}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-foreground">
          {node.description || "No description provided."}
        </p>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">source: {node.source}</Badge>
          {node.category ? (
            <Badge variant="outline">category: {node.category}</Badge>
          ) : null}
          <Badge variant="outline">executor: {node.executor.type}</Badge>
          <Badge variant="outline">v{node.version}</Badge>
          {node.mutating ? (
            <Badge variant="warning">mutating</Badge>
          ) : null}
        </div>

        {node.parseErrors && node.parseErrors.length > 0 ? (
          <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-300">
              Parse errors
            </h3>
            <ul className="mt-2 space-y-1 text-xs text-amber-100">
              {node.parseErrors.map((err, i) => (
                <li key={i} className="font-mono">
                  • {err}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Inputs
            <span className="ml-2 font-mono text-[11px] normal-case">
              ({node.properties.length})
            </span>
          </h3>
          {node.properties.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No inputs declared.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {node.properties.map((p) => (
                <li
                  key={p.name}
                  className="rounded-md border border-border bg-card/40 p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-medium">
                      {p.name}
                    </span>
                    <Badge variant="outline" className="font-mono">
                      {p.type}
                    </Badge>
                    {p.required ? (
                      <Badge variant="warning">required</Badge>
                    ) : null}
                  </div>
                  {p.description ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {node.output_type ? (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Output
            </h3>
            <p className="mt-2 font-mono text-sm">{node.output_type}</p>
          </section>
        ) : null}

        {node.credentials && node.credentials.length > 0 ? (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Credentials
            </h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {node.credentials.map((c) => (
                <li key={c.name}>
                  <Badge variant={c.required ? "warning" : "outline"}>
                    {c.name}
                    {c.required ? " · required" : ""}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {node.executor.type === "n8n_bridge" && node.executor.package ? (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              n8n bridge
            </h3>
            <p className="mt-2 text-xs">
              Package:{" "}
              <code className="rounded bg-muted/40 px-1 py-0.5">
                {node.executor.package}
              </code>
              {node.executor.nodeName ? (
                <>
                  {" "}
                  · Node:{" "}
                  <code className="rounded bg-muted/40 px-1 py-0.5">
                    {node.executor.nodeName}
                  </code>
                </>
              ) : null}
            </p>
          </section>
        ) : null}
      </SheetBody>
    </>
  );
}
