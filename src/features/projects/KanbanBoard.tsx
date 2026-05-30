/**
 * KanbanBoard — horizontal, drag-and-drop board for one project board.
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
import { Loader2, Plus, UserRound } from "lucide-react";

import {
  CARD_DIFFICULTIES,
  CARD_PRIORITIES,
  useCreateCard,
  useKanbanBoard,
  useMoveCard,
  type Card as KanbanCard,
  type CardDifficulty,
  type CardPriority,
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
import { ScrollArea } from "@/components/ui/scroll-area";
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

function sortByPosition<T extends { position: number; created_at: string }>(
  a: T,
  b: T,
): number {
  if (a.position !== b.position) return a.position - b.position;
  return a.created_at.localeCompare(b.created_at);
}

export function KanbanBoard({ boardID }: { boardID: string }) {
  const board = useKanbanBoard(boardID);
  const move = useMoveCard(boardID);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [addColumnId, setAddColumnId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const columns = React.useMemo(
    () => [...(board.data?.columns ?? [])].sort((a, b) => a.position - b.position),
    [board.data?.columns],
  );

  // cards grouped by column_id, each group sorted by position.
  const cardsByColumn = React.useMemo(() => {
    const map = new Map<string, KanbanCard[]>();
    for (const col of columns) map.set(col.id, []);
    for (const card of board.data?.cards ?? []) {
      const bucket = map.get(card.column_id);
      if (bucket) bucket.push(card);
      else map.set(card.column_id, [card]);
    }
    for (const bucket of map.values()) bucket.sort(sortByPosition);
    return map;
  }, [board.data?.cards, columns]);

  const activeCard = React.useMemo(
    () => board.data?.cards.find((c) => c.id === activeId) ?? null,
    [activeId, board.data?.cards],
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const cardID = String(active.id);
    const card = board.data?.cards.find((c) => c.id === cardID);
    if (!card) return;

    // `over` is either a column droppable (id = column id) or another card
    // (id = card id). Resolve to the destination column either way.
    const overId = String(over.id);
    const overCard = board.data?.cards.find((c) => c.id === overId);
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
        <div className="flex h-full items-stretch gap-4 overflow-x-auto pb-4">
          {columns.map((col) => (
            <BoardColumn
              key={col.id}
              column={col}
              cards={cardsByColumn.get(col.id) ?? []}
              onAddCard={() => setAddColumnId(col.id)}
            />
          ))}
        </div>

        <DragOverlay>
          {activeCard ? (
            <CardTile card={activeCard} dragging overlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      <AddCardDialog
        boardID={boardID}
        columnId={addColumnId}
        onClose={() => setAddColumnId(null)}
      />
    </>
  );
}

function BoardColumn({
  column,
  cards,
  onAddCard,
}: {
  column: KanbanColumn;
  cards: KanbanCard[];
  onAddCard: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div className="flex h-full min-w-[16rem] max-w-[26rem] flex-1 basis-0 flex-col rounded-xl border border-border bg-card/20">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-200">
            {column.name}
          </span>
          {column.is_ready && (
            <Badge variant="success" className="shrink-0">
              ready
            </Badge>
          )}
          <span className="text-xs text-slate-500">{cards.length}</span>
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

      <ScrollArea className="flex-1">
        <div
          ref={setNodeRef}
          className={cn(
            "flex min-h-[120px] flex-col gap-2 p-2 transition-colors",
            isOver && "bg-accent/30",
          )}
        >
          <SortableContext
            items={cards.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {cards.map((card) => (
              <SortableCard key={card.id} card={card} />
            ))}
          </SortableContext>
          {cards.length === 0 && (
            <p className="px-1 py-6 text-center text-xs text-slate-600">
              No cards
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SortableCard({ card }: { card: KanbanCard }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CardTile card={card} dragging={isDragging} />
    </div>
  );
}

function CardTile({
  card,
  dragging,
  overlay,
}: {
  card: KanbanCard;
  dragging?: boolean;
  overlay?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div
      className={cn(
        "flex min-h-[5rem] cursor-grab flex-col gap-2.5 rounded-lg border border-border bg-card/60 p-3.5 text-left shadow-sm transition-colors hover:border-border/80",
        dragging && "cursor-grabbing",
        overlay && "rotate-2 shadow-lg ring-1 ring-violet-500/40",
      )}
    >
      <p className="break-words text-sm font-medium leading-snug text-slate-100">
        {card.title}
      </p>

      {card.body && (
        <button
          type="button"
          title={card.body}
          aria-expanded={expanded}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className={cn(
            "whitespace-pre-wrap break-words text-left text-xs leading-relaxed text-slate-500 transition-colors hover:text-slate-400",
            !expanded && "line-clamp-3",
          )}
        >
          {card.body}
        </button>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={PRIORITY_VARIANT[card.priority]}>{card.priority}</Badge>
        <Badge variant="outline" className={DIFFICULTY_TONE[card.difficulty]}>
          {card.difficulty}
        </Badge>
        {card.claim_status === "done" && (
          <Badge variant="success">done</Badge>
        )}
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
          onPointerDown={(e) => e.stopPropagation()}
          className="truncate text-xs text-sky-400 hover:underline"
        >
          {card.result_pr_url}
        </a>
      )}
    </div>
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
                placeholder="Details, acceptance criteria, links…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Priority</span>
                <select
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as CardPriority)
                  }
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
