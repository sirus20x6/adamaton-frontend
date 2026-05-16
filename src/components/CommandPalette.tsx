import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Compass,
  Database,
  FlaskConical,
  Globe,
  Library,
  Network,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";

import { useCorpora } from "@/api/library";
import { useExperiments } from "@/api/experiments";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type PaletteSection = "Routes" | "Recent research" | "Corpora" | "Experiments";

type PaletteItem = {
  id: string;
  section: PaletteSection;
  title: string;
  subtitle?: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Extra haystack tokens to widen fuzzy matches without bloating the title. */
  keywords?: string[];
};

type RecentResearchEntry = {
  taskId: string;
  query: string;
  createdAt: number;
};

const RECENT_KEY = "dr.recent";
const RECENT_LIMIT = 8;

function readRecentResearch(): RecentResearchEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: RecentResearchEntry[] = [];
    for (const v of parsed) {
      if (!v || typeof v !== "object") continue;
      const row = v as Record<string, unknown>;
      const taskId = typeof row.taskId === "string" ? row.taskId : "";
      const query = typeof row.query === "string" ? row.query : "";
      const createdAt =
        typeof row.createdAt === "number" ? row.createdAt : Date.now();
      if (!taskId) continue;
      out.push({ taskId, query, createdAt });
    }
    return out.slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

/* ── Fuzzy scoring ─────────────────────────────────────────────────────── */

/**
 * Score the haystack against the needle. Higher is better; 0 means "no
 * match". The algorithm is intentionally tiny:
 *   - case-insensitive substring → big bonus, scaled by position
 *   - subsequence (each needle char appears in order) → smaller bonus,
 *     penalized by total span
 *   - trailing tokens / word starts boost the score so "exp" matches
 *     "Experiments" before "expression-something".
 */
function fuzzyScore(needle: string, haystack: string): number {
  if (!needle) return 1; // empty query → everything matches with a tiny baseline
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (!h) return 0;

  const direct = h.indexOf(n);
  if (direct >= 0) {
    const positionBonus = Math.max(0, 100 - direct * 2);
    const wordStart = direct === 0 || /\W/.test(h.charAt(direct - 1)) ? 50 : 0;
    return 1000 + positionBonus + wordStart + (n.length / h.length) * 50;
  }

  // Subsequence match: walk both strings, accumulating positions.
  let hi = 0;
  let firstHit = -1;
  let lastHit = -1;
  let hits = 0;
  for (let ni = 0; ni < n.length; ni++) {
    const ch = n.charAt(ni);
    let found = -1;
    for (let j = hi; j < h.length; j++) {
      if (h.charAt(j) === ch) {
        found = j;
        break;
      }
    }
    if (found < 0) return 0;
    if (firstHit < 0) firstHit = found;
    lastHit = found;
    hits++;
    hi = found + 1;
  }
  if (hits !== n.length) return 0;
  const span = lastHit - firstHit + 1;
  return Math.max(1, 200 + (n.length * 30) - span);
}

function scoreItem(item: PaletteItem, needle: string): number {
  const tokens = [item.title, item.section, ...(item.keywords ?? [])];
  let best = 0;
  for (const tok of tokens) {
    const score = fuzzyScore(needle, tok);
    if (score > best) best = score;
  }
  if (item.subtitle) {
    const subScore = Math.floor(fuzzyScore(needle, item.subtitle) * 0.6);
    if (subScore > best) best = subScore;
  }
  return best;
}

/* ── Static routes ─────────────────────────────────────────────────────── */

const ROUTE_ITEMS: PaletteItem[] = [
  {
    id: "route:search",
    section: "Routes",
    title: "Search",
    subtitle: "Compose a research query",
    to: "/",
    icon: SearchIcon,
    keywords: ["query", "research", "ask"],
  },
  {
    id: "route:library",
    section: "Routes",
    title: "Library",
    subtitle: "Corpora and ingestion",
    to: "/library",
    icon: Library,
    keywords: ["corpora", "ingest", "documents"],
  },
  {
    id: "route:graph",
    section: "Routes",
    title: "Graph",
    subtitle: "Knowledge graph view",
    to: "/graph/_",
    icon: Network,
    keywords: ["entities", "relationships"],
  },
  {
    id: "route:books",
    section: "Routes",
    title: "Books",
    subtitle: "Long-form workspace",
    to: "/book/_",
    icon: BookOpen,
    keywords: ["chapters", "reader", "manuscript"],
  },
  {
    id: "route:experiments",
    section: "Routes",
    title: "Experiments",
    subtitle: "Auto-research / training runs",
    to: "/experiments",
    icon: FlaskConical,
    keywords: ["runs", "lineage", "metrics"],
  },
  {
    id: "route:sources",
    section: "Routes",
    title: "Sources",
    subtitle: "Curated trust catalog",
    to: "/sources",
    icon: Globe,
    keywords: ["journals", "trust", "weights"],
  },
  {
    id: "route:settings",
    section: "Routes",
    title: "Settings",
    subtitle: "Configuration",
    to: "/settings",
    icon: SettingsIcon,
    keywords: ["preferences", "configuration"],
  },
];

/* ── Dynamic items ─────────────────────────────────────────────────────── */

function useDynamicItems(open: boolean): PaletteItem[] {
  // Both queries gate on ``open`` so we don't slam the API at app start —
  // the palette is always-mounted but rarely-used. ``staleTime`` keeps the
  // results around between opens.
  const corpora = useCorpora({
    enabled: open,
    staleTime: 60_000,
    retry: false,
  });
  const experiments = useExperiments(
    { sort_by: "recent", limit: 12 },
    { enabled: open, staleTime: 60_000, retry: false },
  );

  // Re-read localStorage every time the palette opens so a freshly-submitted
  // query shows up without waiting for a full reload.
  const [recent, setRecent] = React.useState<RecentResearchEntry[]>(
    () => readRecentResearch(),
  );
  React.useEffect(() => {
    if (open) setRecent(readRecentResearch());
  }, [open]);

  return React.useMemo(() => {
    const items: PaletteItem[] = [];

    for (const job of recent) {
      items.push({
        id: `recent:${job.taskId}`,
        section: "Recent research",
        title: job.query || `Task ${job.taskId.slice(0, 8)}`,
        subtitle: new Date(job.createdAt).toLocaleString(),
        to: `/research/${encodeURIComponent(job.taskId)}`,
        icon: Sparkles,
        keywords: [job.taskId],
      });
    }

    for (const c of corpora.data ?? []) {
      items.push({
        id: `corpus:${c.id}`,
        section: "Corpora",
        title: c.name,
        subtitle: `corpus · ${c.scope ?? "research"}`,
        to: `/library/${encodeURIComponent(c.id)}`,
        icon: Database,
        keywords: [c.id, String(c.scope ?? "")],
      });
    }

    for (const e of experiments.data?.items ?? []) {
      items.push({
        id: `experiment:${e.id}`,
        section: "Experiments",
        title: e.name,
        subtitle: e.hypothesis.slice(0, 80),
        // Experiments page filters via state; deep-link would need a query
        // param it doesn't currently honor. Land on /experiments and let the
        // user pick — matching the existing UX.
        to: `/experiments`,
        icon: FlaskConical,
        keywords: [e.id, e.status, ...(e.tags ?? [])],
      });
    }

    return items;
  }, [corpora.data, experiments.data?.items, recent]);
}

/* ── Hotkey wiring ─────────────────────────────────────────────────────── */

function isInsideEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  const editable = (target as HTMLElement).isContentEditable;
  return Boolean(editable);
}

function usePaletteHotkey(setOpen: (next: boolean) => void): void {
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        setOpen(true);
        return;
      }
      // "/" outside an input/textarea opens the palette — same convention as
      // GitHub, Linear, etc.
      if (event.key === "/" && !meta) {
        if (!isInsideEditableTarget(event.target)) {
          event.preventDefault();
          setOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setOpen]);
}

/* ── Component ─────────────────────────────────────────────────────────── */

type PaletteRow = {
  item: PaletteItem;
  score: number;
};

function groupRows(rows: PaletteRow[]): Array<[PaletteSection, PaletteRow[]]> {
  const map = new Map<PaletteSection, PaletteRow[]>();
  for (const row of rows) {
    const list = map.get(row.item.section) ?? [];
    list.push(row);
    map.set(row.item.section, list);
  }
  // Stable section order: routes always first, then recent research, then
  // corpora, then experiments.
  const order: PaletteSection[] = [
    "Routes",
    "Recent research",
    "Corpora",
    "Experiments",
  ];
  const out: Array<[PaletteSection, PaletteRow[]]> = [];
  for (const section of order) {
    const list = map.get(section);
    if (list && list.length > 0) out.push([section, list]);
  }
  return out;
}

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const navigate = useNavigate();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const dynamicItems = useDynamicItems(open);

  usePaletteHotkey(setOpen);

  const allItems = React.useMemo<PaletteItem[]>(
    () => [...ROUTE_ITEMS, ...dynamicItems],
    [dynamicItems],
  );

  const ranked = React.useMemo<PaletteRow[]>(() => {
    const needle = query.trim();
    const scored = allItems
      .map((item) => ({ item, score: scoreItem(item, needle) }))
      .filter((row) => row.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 40);
  }, [allItems, query]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  React.useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  const flatItems = ranked;
  const grouped = React.useMemo(() => groupRows(ranked), [ranked]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((idx) =>
        flatItems.length === 0
          ? 0
          : Math.min(flatItems.length - 1, idx + 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((idx) => Math.max(0, idx - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const row = flatItems[activeIndex];
      if (row) {
        runItem(row.item);
      }
      return;
    }
    if (event.key === "Escape") {
      // Dialog handles Escape, but the explicit branch makes the intent
      // obvious and gives us a hook if we add inline command modes later.
      setOpen(false);
    }
  };

  const runItem = (item: PaletteItem) => {
    setOpen(false);
    setQuery("");
    // Defer navigation to the next tick so the dialog has time to unmount
    // its focus trap before the route changes.
    window.setTimeout(() => navigate(item.to), 30);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className={cn(
          "max-w-xl overflow-hidden p-0",
          "border-border/80 bg-popover/95 backdrop-blur",
          // Hide the dialog primitive's built-in close button — the
          // palette uses Esc + the Cmd+K toggle for dismissal, and the X
          // overlaps the search input on a 0-padding layout.
          "[&>button[aria-label='Close']]:hidden",
        )}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="border-b border-border/60 px-3 py-2">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              type="text"
              placeholder="Jump to a route, corpus, experiment, or recent research…"
              aria-label="Command palette query"
              className={cn(
                "h-9 w-full bg-transparent text-sm outline-none",
                "placeholder:text-muted-foreground",
              )}
            />
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground sm:inline">
              esc
            </kbd>
          </div>
        </div>
        <div className="max-h-[60vh] min-h-[12rem] overflow-y-auto py-2">
          {flatItems.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No matches. Try fewer letters.
            </p>
          ) : (
            grouped.map(([section, rows]) => (
              <PaletteGroup
                key={section}
                section={section}
                rows={rows}
                flatItems={flatItems}
                activeIndex={activeIndex}
                onHover={setActiveIndex}
                onPick={runItem}
              />
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/40 px-3 py-1.5 text-[0.65rem] text-muted-foreground">
          <span>
            <kbd className="mr-1 rounded border border-border bg-background px-1 py-0.5 font-mono">
              ↑↓
            </kbd>
            navigate
          </span>
          <span>
            <kbd className="mr-1 rounded border border-border bg-background px-1 py-0.5 font-mono">
              ↵
            </kbd>
            open
          </span>
          <span>
            <kbd className="mr-1 rounded border border-border bg-background px-1 py-0.5 font-mono">
              ⌘K
            </kbd>
            toggle
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PaletteGroup({
  section,
  rows,
  flatItems,
  activeIndex,
  onHover,
  onPick,
}: {
  section: PaletteSection;
  rows: PaletteRow[];
  flatItems: PaletteRow[];
  activeIndex: number;
  onHover: (index: number) => void;
  onPick: (item: PaletteItem) => void;
}) {
  return (
    <div className="px-2">
      <p className="px-2 py-1 text-[0.6rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {section}
      </p>
      <ul className="flex flex-col">
        {rows.map((row) => {
          const flatIdx = flatItems.findIndex((r) => r.item.id === row.item.id);
          const isActive = flatIdx === activeIndex;
          const Icon = row.item.icon;
          return (
            <li key={row.item.id}>
              <button
                type="button"
                onClick={() => onPick(row.item)}
                onMouseEnter={() => onHover(flatIdx)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
                  "transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent/60",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="block truncate text-sm">
                    {row.item.title}
                  </span>
                  {row.item.subtitle ? (
                    <span className="block truncate text-[0.7rem] text-muted-foreground">
                      {row.item.subtitle}
                    </span>
                  ) : null}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
