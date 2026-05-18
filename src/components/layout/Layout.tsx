import { useEffect, useState } from "react";
import {
  Activity,
  BookMarked,
  BookOpen,
  Brain,
  Cable,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Database,
  Dna,
  FlaskConical,
  FlaskRound,
  HeartPulse,
  Home as HomeIcon,
  Library as LibraryIcon,
  Menu,
  Network,
  Plug,
  Search as SearchIcon,
  Server,
  Settings as SettingsIcon,
  Workflow,
  Wrench,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { SystemHealthWidget } from "@/components/layout/SystemHealthWidget";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useFleetHealth, worstStatus } from "@/api/health";
import { useConnectionStore } from "@/features/research/connectionStore";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof SearchIcon;
  end?: boolean;
  // external=true renders a plain anchor instead of a NavLink so the
  // browser leaves the SPA. Used for pages still living in the
  // (deprecated) evo dashboard until they get ported into the SPA.
  external?: boolean;
};

const NAV: readonly NavItem[] = [
  // Home is the new unified-suite landing — delegator token statuses,
  // recent tasks + workflows, evo runs. Lives at the index path so
  // hitting `/` lands here first. Search moves to /search.
  { to: "/", label: "Home", icon: HomeIcon, end: true },
  { to: "/search", label: "Search", icon: SearchIcon },
  { to: "/library", label: "Library", icon: LibraryIcon },
  // Memory = cross-agent memory store from the evo-api backend
  // (CLAUDE.md files, opencode memory, insights/entities/relationships).
  // Sits next to Library so the "user-authored knowledge" entries cluster
  // together visually.
  { to: "/memory", label: "Memory", icon: Brain },
  // SPA-native Skills page (ported 2026-05-15 from the inline-HTML evo
  // dashboard page). Surfaces the SkillRAE multi-level graph -- skill
  // CRUD on the Skills tab, KMeans communities on the Communities tab,
  // per-skill subunit extraction on the Subunits tab, and a query
  // debugger that hits /v1/rae/compile on the RAE Debug tab.
  { to: "/skills", label: "Skills", icon: Wrench },
  // Nano = autonomous research-pipeline runs. Belongs in the
  // "knowledge + agent activity" cluster (with Memory + Skills) rather
  // than the long-jobs cluster, since each run pulls from SkillRAE +
  // Memory and produces an artifact (paper.pdf) the user reads.
  { to: "/nano", label: "Research Runs", icon: FlaskRound },
  { to: "/graph/_", label: "Graph", icon: Network },
  { to: "/book/_", label: "Books", icon: BookOpen },
  { to: "/plugins", label: "Plugins", icon: Plug },
  // Connectors = workflow-node catalog (builtin checks, community YAMLs,
  // n8n bridge imports). Read-only browse of pluginLoader.All() — neighbor
  // to Plugins so the "talk to external things" cluster stays together.
  { to: "/connectors", label: "Connectors", icon: Workflow },
  { to: "/zotero", label: "Zotero", icon: BookMarked },
  { to: "/experiments", label: "Experiments", icon: FlaskConical },
  // Evolution = the evo apiserver's runs/insights view (MAP-Elites loop).
  // Sits below Experiments so the "running long jobs" section of the
  // sidebar stays grouped together.
  { to: "/evolution", label: "Evolution", icon: Dna },
  // Nodes = worker registry from evo-api /api/v1/workers. Lives in the
  // "long-jobs" cluster below Evolution because it surfaces which boxes
  // are actually executing those jobs.
  { to: "/nodes", label: "Nodes", icon: Server },
  // Fleet health — capability/role/instance rollup. Sits with Nodes
  // (the per-worker LED view) since both surface "what's actually
  // running" but from different angles: Nodes shows the workers,
  // Health shows the services + quorum + capability bundles.
  { to: "/health", label: "Health", icon: HeartPulse },
  // Datasets = evolve/dataset-manager catalog. Sits with the long-jobs
  // cluster because each "import" + "transform" runs as a Temporal
  // workflow on the dataset-mgr queue (visible on Nodes as the
  // dataset-worker rack member).
  { to: "/datasets", label: "Datasets", icon: Database },
  // Schedules = recurring Temporal schedules across the namespace (delegator
  // recurring tasks, generic workflow crons). Sits next to Nodes since
  // both surface what the cluster is doing on a fixed cadence.
  { to: "/schedules", label: "Schedules", icon: Calendar },
  // Network = read-only public dashboard for the v1.0/v1.1 on-chain
  // observability surfaces (audit-monitor, ledger-monitor,
  // federation-monitor, finalize-bot). Polls each daemon's JSON
  // endpoints via the /network-api/* vite proxy. Sits with the
  // "fleet/cluster state" cluster (Nodes / Datasets / Schedules) since
  // it surfaces what the on-chain contracts are doing in real time.
  { to: "/network", label: "Network", icon: Activity },
  // MCP Manager talks to a local workstation daemon (ldr-mcp-manager.service)
  // to manage MCP servers configured in Claude Code, Codex, and Gemini.
  // Lives next to Settings since it's primarily a config surface.
  { to: "/mcp", label: "MCP Manager", icon: Cable },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

const COLLAPSED_KEY = "dr.sidebar.collapsed";

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // ignore — private mode, sandbox, etc.
  }
}

function StatusPill() {
  const status = useConnectionStore((s) => s.status);
  const fleet = useFleetHealth();

  const wsLive = status === "open";
  const wsConnecting = status === "connecting";

  const fleetStatus = fleet.data
    ? worstStatus(fleet.data.capabilities.map((c) => c.status))
    : "unknown";
  const allCapsOk = fleetStatus === "ok";
  const anyCapDown = fleetStatus === "degraded" || fleetStatus === "offline";

  // Resolve to one of: live | connecting | degraded | idle
  let kind: "live" | "connecting" | "degraded" | "idle" = "idle";
  if (wsLive || (status === "idle" && allCapsOk)) {
    kind = "live";
  } else if (wsConnecting) {
    kind = "connecting";
  } else if (anyCapDown) {
    kind = "degraded";
  }

  const labels: Record<typeof kind, string> = {
    live: "Live",
    connecting: "Connecting",
    degraded: "Degraded",
    idle: "Idle",
  };

  const textTone: Record<typeof kind, string> = {
    live: "text-primary",
    connecting: "text-amber-700 dark:text-amber-300",
    degraded: "text-red-700 dark:text-red-300",
    idle: "text-muted-foreground",
  };

  const dotTone: Record<typeof kind, string> = {
    live: "bg-primary animate-pulse-soft",
    connecting: "bg-amber-500 animate-pulse-soft",
    degraded: "bg-red-500",
    idle: "bg-muted-foreground",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card/40 px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide",
        textTone[kind],
      )}
      aria-live="polite"
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", dotTone[kind])} />
      {labels[kind]}
    </span>
  );
}

type NavProps = {
  collapsed: boolean;
  onNavigate?: () => void;
};

function NavList({ collapsed, onNavigate }: NavProps) {
  const itemClass = cn(
    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
    "hover:bg-accent hover:text-accent-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    "text-muted-foreground",
    collapsed && "justify-center px-2",
  );
  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {NAV.map(({ to, label, icon: Icon, end, external }) => {
        if (external) {
          // Plain anchor so the browser leaves the SPA -- the target
          // page is server-rendered HTML behind Caddy's @evoapi block.
          return (
            <a
              key={to}
              href={to}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              className={itemClass}
              aria-label={collapsed ? label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {collapsed ? null : <span className="truncate">{label}</span>}
            </a>
          );
        }
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground",
                collapsed && "justify-center px-2",
              )
            }
            aria-label={collapsed ? label : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {collapsed ? null : <span className="truncate">{label}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={cn(
        "flex h-14 items-center gap-2 border-b border-border px-4",
        collapsed && "justify-center px-2",
      )}
    >
      <div className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
      {collapsed ? null : (
        <span className="text-sm font-semibold tracking-tight">
          Deep Research
        </span>
      )}
    </div>
  );
}

// HealthPoller removed 2026-05-18 — useFleetHealth() in SystemHealthWidget
// + StatusPill is the single source of truth now. The old /platform/health/ready
// poll wrote into connectionStore.deps; nothing reads those fields anymore.

export function Layout() {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    writeCollapsed(collapsed);
  }, [collapsed]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar (md+) */}
      <aside
        className={cn(
          "no-print hidden shrink-0 flex-col border-r border-border bg-card/40 md:flex",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <SidebarBrand collapsed={collapsed} />
        <div className="flex min-h-0 flex-1 flex-col">
          <NavList collapsed={collapsed} />
        </div>
        <div
          className={cn(
            "border-t border-border p-2",
            collapsed ? "flex justify-center" : "flex justify-end",
          )}
        >
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="no-print w-64 max-w-[85vw] border-r border-l-0"
        >
          <SheetHeader>
            <SheetTitle>
              <span className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full bg-primary"
                  aria-hidden="true"
                />
                Deep Research
              </span>
            </SheetTitle>
          </SheetHeader>
          <SheetBody className="px-2 py-2">
            <NavList
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/60 px-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              title="Open navigation"
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border md:hidden",
                "bg-card/40 text-muted-foreground transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <Menu className="h-4 w-4" />
            </button>
            <h1 className="text-sm font-medium tracking-tight">Deep Research</h1>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill />
            <SystemHealthWidget />
            <ThemeToggle />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
