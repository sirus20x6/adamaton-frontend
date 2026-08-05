/**
 * KanbanBoard -- horizontal, drag-and-drop board for one project board.
 *
 * Columns render left-to-right by position; cards are @dnd-kit sortable and
 * draggable across columns. Dropping a card onto another column fires an
 * optimistic useMoveCard (rolls back on server rejection). Cards surface
 * priority + difficulty badges and a "claimed by <agent>" indicator.
 *
 * Reads/writes go through src/api/kanban.ts. Page chrome lives in
 * src/pages/ProjectKanban.tsx.
 */

import * as React from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  FileText,
  GitBranch,
  GitPullRequest,
  Hash,
  Link2,
  ListFilter,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  TimerReset,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

import {
  CARD_DIFFICULTIES,
  CARD_PRIORITIES,
  useAddComment,
  useAddDependency,
  useArchiveCard,
  useArchiveDoneCards,
  useCreateCard,
  useDeleteDependency,
  useKanbanBoard,
  useMoveCard,
  useReleaseStaleCards,
  useReopenCard,
  useRestoreCard,
  type Card as KanbanCard,
  type CardDifficulty,
  type CardPriority,
  type CardClaimStatus,
  type CardLink,
  type Comment as KanbanComment,
  type Column as KanbanColumn,
} from "@/api/kanban";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const PRIORITY_VARIANT: Record<CardPriority, BadgeProps["variant"]> = {
  low: "outline",
  normal: "secondary",
  high: "warning",
  urgent: "danger",
};

const DIFFICULTY_TONE: Record<CardDifficulty, string> = {
  trivial: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  easy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  medium: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  hard: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  expert: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

const COLUMN_ACCENTS: readonly [string, ...string[]] = [
  "from-slate-400/70",
  "from-violet-400/70",
  "from-sky-400/70",
  "from-amber-400/70",
  "from-emerald-400/70",
  "from-rose-400/70",
] as const;

type CardStatusFilter = CardClaimStatus | "all" | "archived";
type SignalFilter = "all" | "review" | "stale" | "blocked" | "has-pr" | "no-pr";
type Density = "comfortable" | "compact";

interface CardInsight {
  isStale: boolean;
  isBlocked: boolean;
  isReview: boolean;
  hasPR: boolean;
  blockers: KanbanCard[];
  blockedByMe: KanbanCard[];
  comments: KanbanComment[];
}

const STALE_CLAIM_MINUTES = 30;
const REVIEW_WIP_LIMIT = 20;

function sortByPosition<T extends { position: number; created_at: string }>(
  a: T,
  b: T,
): number {
  if (a.position !== b.position) return a.position - b.position;
  return a.created_at.localeCompare(b.created_at);
}

function columnAccent(index: number): string {
  return COLUMN_ACCENTS[index % COLUMN_ACCENTS.length] ?? COLUMN_ACCENTS[0];
}

function minutesSince(value?: string): number | null {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 60_000));
}

function cardMatchesSignal(
  card: KanbanCard,
  insight: CardInsight,
  filter: SignalFilter,
) {
  switch (filter) {
    case "review":
      return insight.isReview;
    case "stale":
      return insight.isStale;
    case "blocked":
      return insight.isBlocked;
    case "has-pr":
      return !!card.result_pr_url;
    case "no-pr":
      return card.claim_status === "done" && !card.result_pr_url;
    default:
      return true;
  }
}

export function KanbanBoard({ boardID }: { boardID: string }) {
  const [showArchived, setShowArchived] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] =
    React.useState<CardStatusFilter>("all");
  const [signalFilter, setSignalFilter] = React.useState<SignalFilter>("all");
  const [priorityFilter, setPriorityFilter] = React.useState<
    CardPriority | "all"
  >("all");
  const [difficultyFilter, setDifficultyFilter] = React.useState<
    CardDifficulty | "all"
  >("all");
  const [agentFilter, setAgentFilter] = React.useState("all");
  const [density, setDensity] = React.useState<Density>("comfortable");
  const [archiveDoneOpen, setArchiveDoneOpen] = React.useState(false);
  const [releaseStaleOpen, setReleaseStaleOpen] = React.useState(false);

  const board = useKanbanBoard(boardID, showArchived);
  const move = useMoveCard(boardID, showArchived);
  const archiveCard = useArchiveCard(boardID);
  const restoreCard = useRestoreCard(boardID);
  const reopenCard = useReopenCard(boardID);
  const addComment = useAddComment(boardID);
  const addDependency = useAddDependency(boardID);
  const deleteDependency = useDeleteDependency(boardID);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [addColumnId, setAddColumnId] = React.useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = React.useState<string | null>(
    null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const columns = React.useMemo(
    () =>
      [...(board.data?.columns ?? [])].sort((a, b) => a.position - b.position),
    [board.data?.columns],
  );

  const cards = React.useMemo(
    () => board.data?.cards ?? [],
    [board.data?.cards],
  );
  const comments = React.useMemo(
    () => board.data?.comments ?? [],
    [board.data?.comments],
  );
  const links = React.useMemo(
    () => board.data?.links ?? [],
    [board.data?.links],
  );
  const cardsById = React.useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards],
  );
  const insights = React.useMemo(() => {
    const commentsByCard = new Map<string, KanbanComment[]>();
    for (const comment of comments) {
      const bucket = commentsByCard.get(comment.card_id) ?? [];
      bucket.push(comment);
      commentsByCard.set(comment.card_id, bucket);
    }
    const blockersByTarget = new Map<string, KanbanCard[]>();
    const blockedBySource = new Map<string, KanbanCard[]>();
    for (const link of links) {
      if (link.link_type !== "blocks") continue;
      const source = cardsById.get(link.source_card_id);
      const target = cardsById.get(link.target_card_id);
      if (!source || !target) continue;
      blockersByTarget.set(link.target_card_id, [
        ...(blockersByTarget.get(link.target_card_id) ?? []),
        source,
      ]);
      blockedBySource.set(link.source_card_id, [
        ...(blockedBySource.get(link.source_card_id) ?? []),
        target,
      ]);
    }
    const out = new Map<string, CardInsight>();
    for (const card of cards) {
      const blockers = blockersByTarget.get(card.id) ?? [];
      out.set(card.id, {
        blockers,
        blockedByMe: blockedBySource.get(card.id) ?? [],
        comments: commentsByCard.get(card.id) ?? [],
        hasPR: !!card.result_pr_url,
        isBlocked: blockers.some((blocker) => blocker.claim_status !== "done"),
        isReview: card.claim_status === "done" && !card.archived_at,
        isStale:
          card.claim_status === "claimed" &&
          (minutesSince(card.claimed_at) ?? 0) >= STALE_CLAIM_MINUTES,
      });
    }
    return out;
  }, [cards, cardsById, comments, links]);
  const agentOptions = React.useMemo(
    () =>
      Array.from(
        new Set(
          cards
            .map((card) => card.claimed_by)
            .filter((agent): agent is string => !!agent),
        ),
      ).sort(),
    [cards],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleCards = React.useMemo(
    () =>
      cards.filter((card) => {
        const insight = insights.get(card.id);
        if (!insight) return false;
        const archived = !!card.archived_at;
        if (!showArchived && archived) return false;
        if (statusFilter === "archived" && !archived) return false;
        if (
          statusFilter !== "all" &&
          statusFilter !== "archived" &&
          card.claim_status !== statusFilter
        ) {
          return false;
        }
        if (priorityFilter !== "all" && card.priority !== priorityFilter) {
          return false;
        }
        if (
          difficultyFilter !== "all" &&
          card.difficulty !== difficultyFilter
        ) {
          return false;
        }
        if (agentFilter !== "all" && card.claimed_by !== agentFilter) {
          return false;
        }
        if (!cardMatchesSignal(card, insight, signalFilter)) return false;
        if (!normalizedSearch) return true;
        return [
          card.title,
          card.body,
          card.claimed_by,
          card.result_summary,
          card.result_task_id,
          card.result_pr_url,
        ]
          .filter(Boolean)
          .some((value) =>
            value!.toLocaleLowerCase().includes(normalizedSearch),
          );
      }),
    [
      agentFilter,
      cards,
      difficultyFilter,
      insights,
      normalizedSearch,
      priorityFilter,
      showArchived,
      signalFilter,
      statusFilter,
    ],
  );

  const archiveableDoneCount = cards.filter(
    (card) => card.claim_status === "done" && !card.archived_at,
  ).length;
  const visibleArchivedCount = cards.filter((card) => card.archived_at).length;
  const claimedCount = cards.filter(
    (card) => card.claim_status === "claimed" && !card.archived_at,
  ).length;
  const staleCount = cards.filter(
    (card) => insights.get(card.id)?.isStale && !card.archived_at,
  ).length;
  const blockedCount = cards.filter(
    (card) => insights.get(card.id)?.isBlocked && !card.archived_at,
  ).length;
  const reviewCount = cards.filter(
    (card) => insights.get(card.id)?.isReview,
  ).length;

  // cards grouped by column_id, each group sorted by position.
  const cardsByColumn = React.useMemo(() => {
    const map = new Map<string, KanbanCard[]>();
    for (const col of columns) map.set(col.id, []);
    for (const card of visibleCards) {
      const bucket = map.get(card.column_id);
      if (bucket) bucket.push(card);
      else map.set(card.column_id, [card]);
    }
    for (const bucket of map.values()) bucket.sort(sortByPosition);
    return map;
  }, [visibleCards, columns]);

  const activeCard = React.useMemo(
    () => cards.find((c) => c.id === activeId) ?? null,
    [activeId, cards],
  );
  const selectedCard = React.useMemo(
    () => cards.find((c) => c.id === selectedCardId) ?? null,
    [selectedCardId, cards],
  );
  const selectedColumn = React.useMemo(
    () => columns.find((c) => c.id === selectedCard?.column_id) ?? null,
    [columns, selectedCard?.column_id],
  );
  const selectedInsight = selectedCard
    ? (insights.get(selectedCard.id) ?? null)
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const cardID = String(active.id);
    const card = cards.find((c) => c.id === cardID);
    if (card?.archived_at) return;
    if (!card) return;

    // `over` is either a column droppable (id = column id) or another card
    // (id = card id). Resolve to the destination column either way.
    const overId = String(over.id);
    const overCard = cards.find((c) => c.id === overId);
    const targetColumnId = overCard ? overCard.column_id : overId;

    const destColumn = columns.find((c) => c.id === targetColumnId);
    if (!destColumn) return;

    // Compute the drop position within the destination column.
    const destCards = (cardsByColumn.get(targetColumnId) ?? []).filter(
      (c) => c.id !== cardID,
    );
    let position = destCards.length;
    if (overCard) {
      const idx = destCards.findIndex((c) => c.id === overCard.id);
      if (idx >= 0) position = idx;
    }

    const sameColumn = card.column_id === targetColumnId;
    if (sameColumn && card.position === position) return;

    move.mutate({
      cardID,
      target_column_id: targetColumnId,
      position,
      claim_token: undefined,
    });
  }

  if (board.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    );
  }

  if (board.error) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 font-mono text-xs text-rose-200">
        {(board.error as Error).message}
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex h-full min-h-0 gap-4">
          <div className="flex h-full min-h-0 min-w-0 flex-1 items-stretch gap-4 overflow-x-auto pb-2">
            <div className="flex h-full min-h-0 min-w-max flex-col gap-3">
              <BoardToolbar
                search={search}
                onSearchChange={setSearch}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                signalFilter={signalFilter}
                onSignalFilterChange={setSignalFilter}
                priorityFilter={priorityFilter}
                onPriorityFilterChange={setPriorityFilter}
                difficultyFilter={difficultyFilter}
                onDifficultyFilterChange={setDifficultyFilter}
                agentFilter={agentFilter}
                onAgentFilterChange={setAgentFilter}
                agentOptions={agentOptions}
                density={density}
                onDensityChange={setDensity}
                showArchived={showArchived}
                onShowArchivedChange={setShowArchived}
                visibleCards={visibleCards.length}
                activeCards={cards.length - visibleArchivedCount}
                claimedCards={claimedCount}
                staleCards={staleCount}
                blockedCards={blockedCount}
                reviewCards={reviewCount}
                archivedCards={visibleArchivedCount}
                archiveableDoneCards={archiveableDoneCount}
                onArchiveDone={() => setArchiveDoneOpen(true)}
                onReleaseStale={() => setReleaseStaleOpen(true)}
              />
              <AgentActivity cards={cards} insights={insights} />
              <div className="flex min-h-0 flex-1 items-stretch gap-4">
                {columns.map((col, index) => (
                  <BoardColumn
                    key={col.id}
                    column={col}
                    cards={cardsByColumn.get(col.id) ?? []}
                    accent={columnAccent(index)}
                    insights={insights}
                    density={density}
                    onAddCard={() => setAddColumnId(col.id)}
                    onOpenCard={setSelectedCardId}
                  />
                ))}
              </div>
            </div>
          </div>

          {selectedCard && (
            <CardDetailPanel
              card={selectedCard}
              column={selectedColumn}
              cards={cards}
              comments={selectedInsight?.comments ?? []}
              blockers={selectedInsight?.blockers ?? []}
              blockedByMe={selectedInsight?.blockedByMe ?? []}
              links={links}
              pending={
                archiveCard.isPending ||
                restoreCard.isPending ||
                reopenCard.isPending ||
                addComment.isPending ||
                addDependency.isPending ||
                deleteDependency.isPending
              }
              onArchive={() =>
                archiveCard.mutate(
                  { cardID: selectedCard.id },
                  { onSuccess: () => setSelectedCardId(null) },
                )
              }
              onRestore={() => restoreCard.mutate({ cardID: selectedCard.id })}
              onReopen={() => reopenCard.mutate({ cardID: selectedCard.id })}
              onAddComment={(text) =>
                addComment.mutate({
                  cardID: selectedCard.id,
                  author: "human",
                  text,
                })
              }
              onAddDependency={(dependsOnCardID) =>
                addDependency.mutate({
                  cardID: selectedCard.id,
                  depends_on_card_id: dependsOnCardID,
                })
              }
              onDeleteDependency={(dependsOnCardID) =>
                deleteDependency.mutate({
                  cardID: selectedCard.id,
                  depends_on_card_id: dependsOnCardID,
                })
              }
              onClose={() => setSelectedCardId(null)}
            />
          )}
        </div>

        <DragOverlay>
          {activeCard ? (
            <CardTile
              card={activeCard}
              insight={insights.get(activeCard.id)}
              density={density}
              dragging
              overlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <AddCardDialog
        boardID={boardID}
        columnId={addColumnId}
        onClose={() => setAddColumnId(null)}
      />
      <ArchiveDoneDialog
        boardID={boardID}
        open={archiveDoneOpen}
        candidateCount={archiveableDoneCount}
        onOpenChange={setArchiveDoneOpen}
        onArchived={() => setArchiveDoneOpen(false)}
      />
      <ReleaseStaleDialog
        boardID={boardID}
        open={releaseStaleOpen}
        candidateCount={staleCount}
        onOpenChange={setReleaseStaleOpen}
        onReleased={() => setReleaseStaleOpen(false)}
      />
    </>
  );
}

function BoardToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  signalFilter,
  onSignalFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  difficultyFilter,
  onDifficultyFilterChange,
  agentFilter,
  onAgentFilterChange,
  agentOptions,
  density,
  onDensityChange,
  showArchived,
  onShowArchivedChange,
  visibleCards,
  activeCards,
  claimedCards,
  staleCards,
  blockedCards,
  reviewCards,
  archivedCards,
  archiveableDoneCards,
  onArchiveDone,
  onReleaseStale,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: CardStatusFilter;
  onStatusFilterChange: (value: CardStatusFilter) => void;
  signalFilter: SignalFilter;
  onSignalFilterChange: (value: SignalFilter) => void;
  priorityFilter: CardPriority | "all";
  onPriorityFilterChange: (value: CardPriority | "all") => void;
  difficultyFilter: CardDifficulty | "all";
  onDifficultyFilterChange: (value: CardDifficulty | "all") => void;
  agentFilter: string;
  onAgentFilterChange: (value: string) => void;
  agentOptions: string[];
  density: Density;
  onDensityChange: (value: Density) => void;
  showArchived: boolean;
  onShowArchivedChange: (value: boolean) => void;
  visibleCards: number;
  activeCards: number;
  claimedCards: number;
  staleCards: number;
  blockedCards: number;
  reviewCards: number;
  archivedCards: number;
  archiveableDoneCards: number;
  onArchiveDone: () => void;
  onReleaseStale: () => void;
}) {
  const quickViews: Array<{
    label: string;
    value: SignalFilter;
    count?: number;
  }> = [
    { label: "All", value: "all" },
    { label: "Review", value: "review", count: reviewCards },
    { label: "Stale", value: "stale", count: staleCards },
    { label: "Blocked", value: "blocked", count: blockedCards },
  ];

  return (
    <div className="flex min-h-[6.5rem] flex-col gap-2 rounded-xl border border-border bg-card/30 px-3 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative min-w-[18rem] max-w-lg flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search cards, agents, PRs"
              className="h-9 pl-8"
            />
          </div>
          <div className="flex rounded-md border border-border/70 bg-background/35 p-0.5">
            {quickViews.map((view) => (
              <button
                key={view.value}
                type="button"
                onClick={() => onSignalFilterChange(view.value)}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded px-2.5 text-xs transition",
                  signalFilter === view.value
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {view.label}
                {view.count !== undefined && view.count > 0 && (
                  <span className="tabular-nums">{view.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="hidden items-center gap-2 text-xs text-muted-foreground xl:flex">
          <span>{visibleCards} shown</span>
          <span>{activeCards} active</span>
          {claimedCards > 0 && <span>{claimedCards} claimed</span>}
          {showArchived && <span>{archivedCards} archived</span>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ListFilter className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => {
              const next = e.target.value as CardStatusFilter;
              onStatusFilterChange(next);
              if (next === "archived" && !showArchived) {
                onShowArchivedChange(true);
              }
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All statuses</option>
            <option value="unclaimed">Unclaimed</option>
            <option value="claimed">Claimed</option>
            <option value="done">Done</option>
            <option value="failed">Failed</option>
            <option value="archived">Archived</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) =>
              onPriorityFilterChange(e.target.value as CardPriority | "all")
            }
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Any priority</option>
            {CARD_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
          <select
            value={difficultyFilter}
            onChange={(e) =>
              onDifficultyFilterChange(e.target.value as CardDifficulty | "all")
            }
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Any difficulty</option>
            {CARD_DIFFICULTIES.map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {difficulty}
              </option>
            ))}
          </select>
          <select
            value={agentFilter}
            onChange={(e) => onAgentFilterChange(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Any agent</option>
            {agentOptions.map((agent) => (
              <option key={agent} value={agent}>
                {agent}
              </option>
            ))}
          </select>
          <select
            value={density}
            onChange={(e) => onDensityChange(e.target.value as Density)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant={showArchived ? "secondary" : "outline"}
            size="sm"
            onClick={() => onShowArchivedChange(!showArchived)}
          >
            {showArchived ? (
              <ArchiveRestore className="mr-2 h-4 w-4" />
            ) : (
              <Archive className="mr-2 h-4 w-4" />
            )}
            {showArchived ? "Hide archive" : "Show archive"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={staleCards === 0}
            onClick={onReleaseStale}
          >
            <TimerReset className="mr-2 h-4 w-4" />
            Release stale
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={archiveableDoneCards === 0}
            onClick={onArchiveDone}
          >
            <Archive className="mr-2 h-4 w-4" />
            Archive done
          </Button>
        </div>
      </div>
    </div>
  );
}

function AgentActivity({
  cards,
  insights,
}: {
  cards: KanbanCard[];
  insights: Map<string, CardInsight>;
}) {
  const agents = React.useMemo(() => {
    const map = new Map<
      string,
      { claimed: number; stale: number; review: number; latestClaim?: string }
    >();
    for (const card of cards) {
      const insight = insights.get(card.id);
      if (card.claim_status === "claimed" && card.claimed_by) {
        const entry = map.get(card.claimed_by) ?? {
          claimed: 0,
          stale: 0,
          review: 0,
          latestClaim: undefined,
        };
        entry.claimed += 1;
        if (insight?.isStale) entry.stale += 1;
        if (
          !entry.latestClaim ||
          (card.claimed_at && card.claimed_at > entry.latestClaim)
        ) {
          entry.latestClaim = card.claimed_at;
        }
        map.set(card.claimed_by, entry);
      }
    }
    for (const card of cards) {
      if (
        card.claim_status === "done" &&
        card.claimed_by &&
        !card.archived_at
      ) {
        const entry = map.get(card.claimed_by) ?? {
          claimed: 0,
          stale: 0,
          review: 0,
          latestClaim: undefined,
        };
        entry.review += 1;
        map.set(card.claimed_by, entry);
      }
    }
    return Array.from(map.entries())
      .map(([agent, entry]) => ({ agent, ...entry }))
      .sort((a, b) => b.stale - a.stale || b.claimed - a.claimed);
  }, [cards, insights]);

  if (agents.length === 0) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-xl border border-border/70 bg-background/20 px-3 text-xs text-muted-foreground">
        <UsersRound className="h-4 w-4" />
        No active agent claims.
      </div>
    );
  }

  return (
    <div className="flex h-12 items-center gap-2 overflow-hidden rounded-xl border border-border/70 bg-background/20 px-3">
      <UsersRound className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 gap-2 overflow-x-auto">
        {agents.map((agent) => (
          <div
            key={agent.agent}
            className={cn(
              "flex h-8 shrink-0 items-center gap-2 rounded-md border border-border/70 bg-card/45 px-2 text-xs",
              agent.stale > 0 && "border-amber-500/40 bg-amber-500/10",
            )}
          >
            <span className="max-w-[10rem] truncate font-medium text-slate-200">
              {agent.agent}
            </span>
            <span className="text-muted-foreground">
              {agent.claimed} active
            </span>
            {agent.review > 0 && (
              <span className="text-emerald-300">{agent.review} review</span>
            )}
            {agent.stale > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-300">
                <AlertTriangle className="h-3 w-3" />
                {agent.stale} stale
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BoardColumn({
  column,
  cards,
  accent,
  insights,
  density,
  onAddCard,
  onOpenCard,
}: {
  column: KanbanColumn;
  cards: KanbanCard[];
  accent: string;
  insights: Map<string, CardInsight>;
  density: Density;
  onAddCard: () => void;
  onOpenCard: (cardID: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const urgentCount = cards.filter((card) => card.priority === "urgent").length;
  const claimedCount = cards.filter(
    (card) => card.claim_status === "claimed",
  ).length;
  const staleCount = cards.filter(
    (card) => insights.get(card.id)?.isStale,
  ).length;
  const blockedCount = cards.filter(
    (card) => insights.get(card.id)?.isBlocked,
  ).length;
  const reviewWarn = column.name.toLocaleLowerCase().includes("review")
    ? cards.length > REVIEW_WIP_LIMIT
    : false;

  return (
    <div className="flex h-full min-h-0 w-[20rem] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card/25 shadow-sm">
      <div className={cn("h-1 bg-gradient-to-r to-transparent", accent)} />
      <div className="border-b border-border/60 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-100">
              {column.name}
            </span>
            <span className="rounded-full border border-border/70 bg-background/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {cards.length}
            </span>
            {column.is_ready && (
              <Badge variant="success" className="shrink-0">
                ready
              </Badge>
            )}
            {reviewWarn && (
              <Badge variant="warning" className="shrink-0">
                WIP
              </Badge>
            )}
          </div>
          <button
            type="button"
            aria-label={`Add card to ${column.name}`}
            onClick={onAddCard}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {(claimedCount > 0 ||
          urgentCount > 0 ||
          staleCount > 0 ||
          blockedCount > 0) && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            {claimedCount > 0 && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <UserRound className="h-3 w-3 shrink-0" />
                <span className="truncate">{claimedCount} claimed</span>
              </span>
            )}
            {urgentCount > 0 && (
              <span className="inline-flex items-center gap-1 text-rose-300">
                <Sparkles className="h-3 w-3 shrink-0" />
                {urgentCount} urgent
              </span>
            )}
            {staleCount > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-300">
                <TimerReset className="h-3 w-3 shrink-0" />
                {staleCount} stale
              </span>
            )}
            {blockedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-orange-300">
                <GitBranch className="h-3 w-3 shrink-0" />
                {blockedCount} blocked
              </span>
            )}
          </div>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5 transition-colors",
          isOver && "bg-accent/30",
        )}
      >
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              disabled={!!card.archived_at}
              insight={insights.get(card.id)}
              density={density}
              onOpen={() => onOpenCard(card.id)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <button
            type="button"
            onClick={onAddCard}
            className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-background/20 px-3 py-6 text-center text-xs text-muted-foreground transition-colors hover:border-border hover:bg-background/40"
          >
            <Plus className="h-4 w-4" />
            Add the first card
          </button>
        )}
      </div>
    </div>
  );
}

function SortableCard({
  card,
  disabled,
  insight,
  density,
  onOpen,
}: {
  card: KanbanCard;
  disabled?: boolean;
  insight?: CardInsight;
  density: Density;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(!disabled ? attributes : {})}
      {...(!disabled ? listeners : {})}
    >
      <CardTile
        card={card}
        insight={insight}
        density={density}
        dragging={isDragging}
        onOpen={onOpen}
      />
    </div>
  );
}

function CardTile({
  card,
  insight,
  density,
  dragging,
  overlay,
  onOpen,
}: {
  card: KanbanCard;
  insight?: CardInsight;
  density: Density;
  dragging?: boolean;
  overlay?: boolean;
  onOpen?: () => void;
}) {
  const compact = density === "compact";
  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (!onOpen) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group flex cursor-grab flex-col rounded-lg border border-border bg-card/70 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-border/90 hover:bg-card/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact
          ? "min-h-[4.75rem] gap-1.5 p-2.5"
          : "min-h-[6rem] gap-2.5 p-3.5",
        insight?.isBlocked && "border-orange-500/40 bg-orange-500/10",
        insight?.isStale && "border-amber-500/40 bg-amber-500/10",
        card.archived_at &&
          "cursor-default border-dashed bg-card/35 opacity-75 hover:translate-y-0 hover:bg-card/45",
        dragging && "cursor-grabbing",
        overlay && "rotate-2 shadow-lg ring-1 ring-violet-500/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-medium leading-snug text-slate-100">
          {card.title}
        </p>
        {insight?.isBlocked ? (
          <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
        ) : insight?.isStale ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        ) : card.claim_status === "done" ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
        ) : card.claim_status === "failed" ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
        ) : card.archived_at ? (
          <Archive className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground" />
        )}
      </div>

      {card.body && !compact && (
        <p
          title={card.body}
          className="line-clamp-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-500"
        >
          {card.body}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={PRIORITY_VARIANT[card.priority]}>{card.priority}</Badge>
        <Badge variant="outline" className={DIFFICULTY_TONE[card.difficulty]}>
          {card.difficulty}
        </Badge>
        {card.claim_status === "done" && <Badge variant="success">done</Badge>}
        {card.claim_status === "failed" && (
          <Badge variant="danger">failed</Badge>
        )}
        {insight?.isBlocked && <Badge variant="warning">blocked</Badge>}
        {insight?.isStale && <Badge variant="warning">stale</Badge>}
        {!!insight?.comments.length && (
          <Badge variant="outline">{insight.comments.length} notes</Badge>
        )}
        {!!insight?.blockers.length && (
          <Badge variant="outline">{insight.blockers.length} deps</Badge>
        )}
        {card.archived_at && <Badge variant="outline">archived</Badge>}
      </div>

      {card.claim_status === "claimed" && card.claimed_by && (
        <div className="flex items-center gap-1.5 text-xs text-violet-300">
          <UserRound className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">claimed by {card.claimed_by}</span>
        </div>
      )}

      {card.result_pr_url && (
        <a
          href={card.result_pr_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="inline-flex min-w-0 items-center gap-1 truncate text-xs text-sky-400 hover:underline"
        >
          <GitPullRequest className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{card.result_pr_url}</span>
        </a>
      )}
    </div>
  );
}

function CardDetailPanel({
  card,
  column,
  cards,
  comments,
  blockers,
  blockedByMe,
  links,
  pending,
  onArchive,
  onRestore,
  onReopen,
  onAddComment,
  onAddDependency,
  onDeleteDependency,
  onClose,
}: {
  card: KanbanCard;
  column: KanbanColumn | null;
  cards: KanbanCard[];
  comments: KanbanComment[];
  blockers: KanbanCard[];
  blockedByMe: KanbanCard[];
  links: CardLink[];
  pending: boolean;
  onArchive: () => void;
  onRestore: () => void;
  onReopen: () => void;
  onAddComment: (text: string) => void;
  onAddDependency: (dependsOnCardID: string) => void;
  onDeleteDependency: (dependsOnCardID: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = React.useState("");
  const [dependencyId, setDependencyId] = React.useState("");
  const dependencyOptions = cards.filter(
    (candidate) =>
      candidate.id !== card.id &&
      candidate.board_id === card.board_id &&
      !blockers.some((blocker) => blocker.id === candidate.id),
  );
  const staleMinutes = minutesSince(card.claimed_at);
  const blockingLinks = links.filter((link) => link.target_card_id === card.id);
  const timeline = [
    {
      at: card.created_at,
      label: "Created",
      icon: <Plus className="h-3.5 w-3.5" />,
    },
    ...(card.claimed_at
      ? [
          {
            at: card.claimed_at,
            label: `Claimed${card.claimed_by ? ` by ${card.claimed_by}` : ""}`,
            icon: <UserRound className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    ...(card.result_summary || card.result_pr_url
      ? [
          {
            at: card.updated_at,
            label: "Agent completed execution",
            icon: <Sparkles className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    ...comments.map((comment) => ({
      at: comment.created_at,
      label: `${comment.author} commented`,
      icon: <MessageSquare className="h-3.5 w-3.5" />,
    })),
    ...blockingLinks.map((link) => ({
      at: link.created_at,
      label: "Dependency added",
      icon: <GitBranch className="h-3.5 w-3.5" />,
    })),
    ...(card.archived_at
      ? [
          {
            at: card.archived_at,
            label: "Archived",
            icon: <Archive className="h-3.5 w-3.5" />,
          },
        ]
      : []),
  ].sort((a, b) => a.at.localeCompare(b.at));

  // Close on Escape, matching the affordance the old slide-over had. The panel
  // is inline (no portal/overlay), so we listen on window rather than rely on
  // a focus trap.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className="flex h-full min-h-0 w-[22rem] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card/40 shadow-sm xl:w-[26rem]">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={PRIORITY_VARIANT[card.priority]}>
              {card.priority}
            </Badge>
            <Badge
              variant="outline"
              className={DIFFICULTY_TONE[card.difficulty]}
            >
              {card.difficulty}
            </Badge>
            <Badge
              variant={
                card.claim_status === "done"
                  ? "success"
                  : card.claim_status === "failed"
                    ? "danger"
                    : "default"
              }
            >
              {card.claim_status}
            </Badge>
            {blockers.some((blocker) => blocker.claim_status !== "done") && (
              <Badge variant="warning">blocked</Badge>
            )}
            {staleMinutes !== null && staleMinutes >= STALE_CLAIM_MINUTES && (
              <Badge variant="warning">stale</Badge>
            )}
            {card.archived_at && <Badge variant="outline">archived</Badge>}
          </div>
          <h2 className="break-words text-lg font-semibold leading-snug text-slate-100">
            {card.title}
          </h2>
          <p className="text-xs text-muted-foreground">
            {column?.name ?? "Unknown column"} · updated{" "}
            {formatDateTime(card.updated_at)}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close details"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center gap-2">
          {card.archived_at ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={onRestore}
            >
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArchiveRestore className="mr-2 h-4 w-4" />
              )}
              Restore
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={card.claim_status !== "done" || pending}
              onClick={onArchive}
            >
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Archive className="mr-2 h-4 w-4" />
              )}
              Archive
            </Button>
          )}
          {!card.archived_at &&
            (card.claim_status === "done" ||
              card.claim_status === "failed") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={onReopen}
              >
                {pending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                Reopen
              </Button>
            )}
        </div>

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            Details
          </h3>
          <div className="min-h-[8rem] whitespace-pre-wrap rounded-md border border-border/70 bg-background/35 p-4 text-sm leading-relaxed text-slate-200">
            {card.body || (
              <span className="text-muted-foreground">
                No description has been added.
              </span>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" />
            Dependencies
          </h3>
          <div className="space-y-2 rounded-md border border-border/70 bg-background/25 p-3">
            {blockers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No dependencies.</p>
            ) : (
              blockers.map((blocker) => (
                <div
                  key={blocker.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background/30 px-2 py-1.5 text-xs"
                >
                  <span className="min-w-0 truncate">
                    <span className="text-muted-foreground">Depends on </span>
                    {blocker.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant={
                        blocker.claim_status === "done" ? "success" : "outline"
                      }
                    >
                      {blocker.claim_status}
                    </Badge>
                    <button
                      type="button"
                      aria-label={`Remove dependency on ${blocker.title}`}
                      onClick={() => onDeleteDependency(blocker.id)}
                      className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              ))
            )}
            {blockedByMe.length > 0 && (
              <div className="rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1.5 text-xs text-orange-200">
                Blocks {blockedByMe.length} downstream card
                {blockedByMe.length === 1 ? "" : "s"}.
              </div>
            )}
            <div className="flex gap-2">
              <select
                value={dependencyId}
                onChange={(e) => setDependencyId(e.target.value)}
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Add dependency</option>
                {dependencyOptions.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!dependencyId || pending}
                onClick={() => {
                  onAddDependency(dependencyId);
                  setDependencyId("");
                }}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </div>
        </section>

        {(card.claimed_by || card.result_summary || card.result_pr_url) && (
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Execution
            </h3>
            <div className="grid gap-2 rounded-md border border-border/70 bg-background/25 p-3 text-sm">
              {card.claimed_by && (
                <DetailRow
                  icon={<UserRound className="h-4 w-4" />}
                  label="Claimed by"
                  value={card.claimed_by}
                />
              )}
              {card.result_task_id && (
                <DetailRow
                  icon={<Hash className="h-4 w-4" />}
                  label="Task"
                  value={card.result_task_id}
                  mono
                />
              )}
              {card.result_summary && (
                <div className="space-y-1.5">
                  <div className="text-xs uppercase text-muted-foreground">
                    Result summary
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {card.result_summary}
                  </p>
                </div>
              )}
              {card.result_pr_url && (
                <a
                  href={card.result_pr_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sky-300 transition-colors hover:bg-sky-500/15"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  <span className="truncate">{card.result_pr_url}</span>
                </a>
              )}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            Human notes
          </h3>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = note.trim();
              if (!trimmed) return;
              onAddComment(trimmed);
              setNote("");
            }}
          >
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add review notes, context, or follow-up instructions"
              className="min-h-[5rem]"
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={!note.trim() || pending}
              >
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add note
              </Button>
            </div>
          </form>
          <div className="space-y-2">
            {comments.length === 0 ? (
              <p className="rounded-md border border-border/70 bg-background/25 px-3 py-2 text-xs text-muted-foreground">
                No human notes yet.
              </p>
            ) : (
              comments.map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-md border border-border/70 bg-background/25 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-200">
                      {comment.author}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatDateTime(comment.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
                    {comment.text}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="grid gap-2 text-sm sm:grid-cols-2">
          <DetailRow
            icon={<CalendarClock className="h-4 w-4" />}
            label="Created"
            value={formatDateTime(card.created_at)}
          />
          <DetailRow
            icon={<CalendarClock className="h-4 w-4" />}
            label="Updated"
            value={formatDateTime(card.updated_at)}
          />
          {card.claimed_at && (
            <DetailRow
              icon={<CalendarClock className="h-4 w-4" />}
              label="Claimed"
              value={formatDateTime(card.claimed_at)}
            />
          )}
          {card.archived_at && (
            <DetailRow
              icon={<Archive className="h-4 w-4" />}
              label="Archived"
              value={formatDateTime(card.archived_at)}
            />
          )}
          <DetailRow
            icon={<Hash className="h-4 w-4" />}
            label="Card ID"
            value={card.id}
            mono
          />
        </section>

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            Timeline
          </h3>
          <div className="space-y-2 rounded-md border border-border/70 bg-background/25 p-3">
            {timeline.map((item, index) => (
              <div key={`${item.at}-${index}`} className="flex gap-2 text-xs">
                <span className="mt-0.5 shrink-0 text-muted-foreground">
                  {item.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-slate-200">{item.label}</span>
                  <span className="block text-muted-foreground">
                    {formatDateTime(item.at)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}

function DetailRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-md border border-border/70 bg-background/25 px-3 py-2">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "block truncate text-sm text-slate-200",
            mono && "font-mono text-xs",
          )}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

function formatDateTime(value?: string) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function ArchiveDoneDialog({
  boardID,
  open,
  candidateCount,
  onOpenChange,
  onArchived,
}: {
  boardID: string;
  open: boolean;
  candidateCount: number;
  onOpenChange: (value: boolean) => void;
  onArchived: () => void;
}) {
  const archiveDone = useArchiveDoneCards(boardID);
  const [olderThanDays, setOlderThanDays] = React.useState("14");

  React.useEffect(() => {
    if (open) {
      setOlderThanDays("14");
      archiveDone.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const days = olderThanDays === "all" ? undefined : Number(olderThanDays);
    archiveDone.mutate(days === undefined ? {} : { older_than_days: days }, {
      onSuccess: onArchived,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Archive completed cards</DialogTitle>
          <DialogDescription>
            Completed cards stay searchable when archive mode is enabled.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Completed before</span>
              <select
                value={olderThanDays}
                onChange={(e) => setOlderThanDays(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="14">14 days ago</option>
                <option value="30">30 days ago</option>
                <option value="7">7 days ago</option>
                <option value="all">Any time</option>
              </select>
            </label>

            <div className="rounded-md border border-border/70 bg-background/30 px-3 py-2 text-sm text-muted-foreground">
              {candidateCount} completed active cards on this board.
            </div>

            {archiveDone.error && (
              <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-200">
                {(archiveDone.error as Error).message}
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={archiveDone.isPending || candidateCount === 0}
            >
              {archiveDone.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Archive cards
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseStaleDialog({
  boardID,
  open,
  candidateCount,
  onOpenChange,
  onReleased,
}: {
  boardID: string;
  open: boolean;
  candidateCount: number;
  onOpenChange: (value: boolean) => void;
  onReleased: () => void;
}) {
  const releaseStale = useReleaseStaleCards(boardID);
  const [olderThanMinutes, setOlderThanMinutes] = React.useState("30");

  React.useEffect(() => {
    if (open) {
      setOlderThanMinutes("30");
      releaseStale.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    releaseStale.mutate(
      { older_than_minutes: Number(olderThanMinutes) },
      { onSuccess: onReleased },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Release stale claims</DialogTitle>
          <DialogDescription>
            Claimed cards older than the threshold are returned to unclaimed
            work.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Claimed before</span>
              <select
                value={olderThanMinutes}
                onChange={(e) => setOlderThanMinutes(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="30">30 minutes ago</option>
                <option value="60">1 hour ago</option>
                <option value="120">2 hours ago</option>
                <option value="360">6 hours ago</option>
              </select>
            </label>

            <div className="rounded-md border border-border/70 bg-background/30 px-3 py-2 text-sm text-muted-foreground">
              {candidateCount} stale claimed cards are currently visible.
            </div>

            {releaseStale.error && (
              <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-200">
                {(releaseStale.error as Error).message}
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={releaseStale.isPending || candidateCount === 0}
            >
              {releaseStale.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Release claims
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddCardDialog({
  boardID,
  columnId,
  onClose,
}: {
  boardID: string;
  columnId: string | null;
  onClose: () => void;
}) {
  const create = useCreateCard(boardID);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [priority, setPriority] = React.useState<CardPriority>("normal");
  const [difficulty, setDifficulty] = React.useState<CardDifficulty>("medium");

  const open = columnId !== null;

  React.useEffect(() => {
    if (open) {
      setTitle("");
      setBody("");
      setPriority("normal");
      setDifficulty("medium");
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !columnId) return;
    create.mutate(
      {
        title: trimmed,
        body: body.trim() || undefined,
        column_id: columnId,
        priority,
        difficulty,
      },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New card</DialogTitle>
          <DialogDescription>
            Add a task to this column. Priority and difficulty feed the
            claim/route logic for agents pulling from the Ready column.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Title</span>
              <Input
                autoFocus
                placeholder="Short, actionable summary"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">
                Body <span className="text-xs text-slate-500">(optional)</span>
              </span>
              <Textarea
                placeholder="Details, acceptance criteria, links..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Priority</span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as CardPriority)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {CARD_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Difficulty</span>
                <select
                  value={difficulty}
                  onChange={(e) =>
                    setDifficulty(e.target.value as CardDifficulty)
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {CARD_DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {create.error && (
              <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-200">
                {(create.error as Error).message}
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !title.trim()}>
              {create.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Add card
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default KanbanBoard;
