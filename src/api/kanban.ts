// API surface for the per-project Kanban board. Lands on
// platform/dashboard/apiserver through Caddy's /evo-api/* proxy.
//
// Backend handlers live in
// adamaton-platform/dashboard/apiserver/projects_endpoints.go (kanban_*).
// The same REST surface is driven by the delegator MCP server, so the
// claim/move/complete/release contract is shared — keep the shapes exact.
//
// See docs/PROJECTS_KANBAN.md.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const EVO_BASE = "/evo-api/api/v1";

// Mirrors the CHECK constraint on evo.cards.priority.
export const CARD_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type CardPriority = (typeof CARD_PRIORITIES)[number];

// Mirrors the CHECK constraint on evo.cards.difficulty.
export const CARD_DIFFICULTIES = [
  "trivial",
  "easy",
  "medium",
  "hard",
  "expert",
] as const;
export type CardDifficulty = (typeof CARD_DIFFICULTIES)[number];

// Mirrors the CHECK constraint on evo.cards.claim_status.
export const CARD_CLAIM_STATUSES = [
  "unclaimed",
  "claimed",
  "done",
  "failed",
] as const;
export type CardClaimStatus = (typeof CARD_CLAIM_STATUSES)[number];

export interface Board {
  id: string;
  project_id: string;
  name: string;
  created_by?: string;
  created_at: string;
}

export interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  is_ready: boolean;
}

export interface Card {
  id: string;
  column_id: string;
  board_id: string;
  title: string;
  body: string;
  priority: CardPriority;
  difficulty: CardDifficulty;
  position: number;
  claim_status: CardClaimStatus;
  claimed_by?: string;
  claimed_at?: string;
  result_task_id?: string;
  result_summary?: string;
  result_pr_url?: string;
  archived_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  card_id: string;
  author: string;
  text: string;
  created_at: string;
}

export interface CardLink {
  source_card_id: string;
  target_card_id: string;
  link_type: "blocks" | "relates";
  created_at: string;
}

// GET /kanban/boards/{bid} returns the board plus its columns and cards.
export interface BoardDetail {
  board: Board;
  columns: Column[];
  cards: Card[];
  comments?: Comment[];
  links?: CardLink[];
}

// POST /projects/{id}/kanban/boards returns the new board with seeded columns.
export interface CreateBoardResponse {
  board: Board;
  columns: Column[];
}

export interface CreateBoardRequest {
  name: string;
}

export interface CreateCardRequest {
  title: string;
  body?: string;
  column_id?: string;
  priority?: CardPriority;
  difficulty?: CardDifficulty;
}

export interface MoveCardRequest {
  cardID: string;
  target_column_id: string;
  claim_token?: string;
  position?: number;
}

export interface ClaimCardRequest {
  cardID: string;
  agent_id: string;
}

export interface ClaimCardResponse {
  card: Card;
  claim_token: string;
}

export interface CompleteCardRequest {
  cardID: string;
  claim_token: string;
  result_summary?: string;
  result_task_id?: string;
  result_pr_url?: string;
}

export interface ReleaseCardRequest {
  cardID: string;
  claim_token: string;
}

export interface ReopenCardRequest {
  cardID: string;
}

export interface ArchiveCardRequest {
  cardID: string;
}

export interface RestoreCardRequest {
  cardID: string;
}

export interface ArchiveDoneCardsRequest {
  older_than_days?: number;
}

export interface ArchiveDoneCardsResponse {
  archived: number;
  board_id: string;
}

export interface ReleaseStaleCardsRequest {
  older_than_minutes?: number;
}

export interface ReleaseStaleCardsResponse {
  released: number;
  board_id: string;
}

export interface AddCommentRequest {
  cardID: string;
  author: string;
  text: string;
}

export interface AddDependencyRequest {
  cardID: string;
  depends_on_card_id: string;
}

export interface DeleteDependencyRequest {
  cardID: string;
  depends_on_card_id: string;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg =
      (parsed as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return parsed as T;
}

function postJSON<T>(url: string, body: unknown): Promise<T> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(jsonOrThrow<T>);
}

const enc = encodeURIComponent;

export const kanbanApi = {
  // Boards.
  listBoards: (projectID: string): Promise<Board[]> =>
    fetch(`${EVO_BASE}/projects/${enc(projectID)}/kanban/boards`).then(
      jsonOrThrow<Board[]>,
    ),
  createBoard: (
    projectID: string,
    body: CreateBoardRequest,
  ): Promise<CreateBoardResponse> =>
    postJSON<CreateBoardResponse>(
      `${EVO_BASE}/projects/${enc(projectID)}/kanban/boards`,
      body,
    ),
  getBoard: (boardID: string, includeArchived = false): Promise<BoardDetail> =>
    fetch(
      `${EVO_BASE}/kanban/boards/${enc(boardID)}${
        includeArchived ? "?include_archived=true" : ""
      }`,
    ).then(jsonOrThrow<BoardDetail>),
  ready: (boardID: string): Promise<Card[]> =>
    fetch(`${EVO_BASE}/kanban/boards/${enc(boardID)}/ready`).then(
      jsonOrThrow<Card[]>,
    ),

  // Cards.
  createCard: (boardID: string, body: CreateCardRequest): Promise<Card> =>
    postJSON<Card>(`${EVO_BASE}/kanban/boards/${enc(boardID)}/cards`, body),
  moveCard: ({ cardID, ...body }: MoveCardRequest): Promise<Card> =>
    postJSON<Card>(`${EVO_BASE}/kanban/cards/${enc(cardID)}/move`, body),
  claimCard: ({
    cardID,
    ...body
  }: ClaimCardRequest): Promise<ClaimCardResponse> =>
    postJSON<ClaimCardResponse>(
      `${EVO_BASE}/kanban/cards/${enc(cardID)}/claim`,
      body,
    ),
  completeCard: ({ cardID, ...body }: CompleteCardRequest): Promise<Card> =>
    postJSON<Card>(`${EVO_BASE}/kanban/cards/${enc(cardID)}/complete`, body),
  releaseCard: ({ cardID, ...body }: ReleaseCardRequest): Promise<Card> =>
    postJSON<Card>(`${EVO_BASE}/kanban/cards/${enc(cardID)}/release`, body),
  reopenCard: ({ cardID }: ReopenCardRequest): Promise<Card> =>
    postJSON<Card>(`${EVO_BASE}/kanban/cards/${enc(cardID)}/reopen`, {}),
  archiveCard: ({ cardID }: ArchiveCardRequest): Promise<Card> =>
    postJSON<Card>(`${EVO_BASE}/kanban/cards/${enc(cardID)}/archive`, {}),
  restoreCard: ({ cardID }: RestoreCardRequest): Promise<Card> =>
    postJSON<Card>(`${EVO_BASE}/kanban/cards/${enc(cardID)}/restore`, {}),
  archiveDoneCards: (
    boardID: string,
    body: ArchiveDoneCardsRequest,
  ): Promise<ArchiveDoneCardsResponse> =>
    postJSON<ArchiveDoneCardsResponse>(
      `${EVO_BASE}/kanban/boards/${enc(boardID)}/archive-done`,
      body,
    ),
  releaseStaleCards: (
    boardID: string,
    body: ReleaseStaleCardsRequest,
  ): Promise<ReleaseStaleCardsResponse> =>
    postJSON<ReleaseStaleCardsResponse>(
      `${EVO_BASE}/kanban/boards/${enc(boardID)}/release-stale`,
      body,
    ),
  comment: ({ cardID, ...body }: AddCommentRequest): Promise<Comment> =>
    postJSON<Comment>(`${EVO_BASE}/kanban/cards/${enc(cardID)}/comment`, body),
  addDependency: ({
    cardID,
    ...body
  }: AddDependencyRequest): Promise<CardLink> =>
    postJSON<CardLink>(
      `${EVO_BASE}/kanban/cards/${enc(cardID)}/dependencies`,
      body,
    ),
  deleteDependency: ({
    cardID,
    depends_on_card_id,
  }: DeleteDependencyRequest): Promise<{ deleted: boolean }> =>
    fetch(
      `${EVO_BASE}/kanban/cards/${enc(cardID)}/dependencies/${enc(
        depends_on_card_id,
      )}`,
      { method: "DELETE" },
    ).then(jsonOrThrow<{ deleted: boolean }>),
};

export const kanbanKeys = {
  all: ["kanban"] as const,
  boards: (projectID: string) => ["kanban", "boards", projectID] as const,
  board: (boardID: string, includeArchived = false) =>
    [
      "kanban",
      "board",
      boardID,
      includeArchived ? "with-archive" : "active",
    ] as const,
  ready: (boardID: string) => ["kanban", "ready", boardID] as const,
};

export function useKanbanBoards(projectID: string | null) {
  return useQuery({
    queryKey: projectID
      ? kanbanKeys.boards(projectID)
      : ["kanban", "boards", "_disabled"],
    queryFn: () => kanbanApi.listBoards(projectID as string),
    enabled: !!projectID,
  });
}

export function useKanbanBoard(
  boardID: string | null,
  includeArchived = false,
) {
  return useQuery({
    queryKey: boardID
      ? kanbanKeys.board(boardID, includeArchived)
      : ["kanban", "board", "_disabled"],
    queryFn: () => kanbanApi.getBoard(boardID as string, includeArchived),
    enabled: !!boardID,
    refetchInterval: 5_000,
  });
}

export function useReadyCards(boardID: string | null) {
  return useQuery({
    queryKey: boardID
      ? kanbanKeys.ready(boardID)
      : ["kanban", "ready", "_disabled"],
    queryFn: () => kanbanApi.ready(boardID as string),
    enabled: !!boardID,
  });
}

export function useCreateBoard(projectID: string) {
  const qc = useQueryClient();
  return useMutation<CreateBoardResponse, Error, CreateBoardRequest>({
    mutationFn: (body) => kanbanApi.createBoard(projectID, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kanbanKeys.boards(projectID) });
    },
  });
}

export function useCreateCard(boardID: string) {
  const qc = useQueryClient();
  return useMutation<Card, Error, CreateCardRequest>({
    mutationFn: (body) => kanbanApi.createCard(boardID, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kanbanKeys.board(boardID) });
      qc.invalidateQueries({ queryKey: kanbanKeys.ready(boardID) });
    },
  });
}

// useMoveCard is optimistic: it patches the card's column_id (and position
// when supplied) in the cached BoardDetail immediately so the dragged card
// stays put under the cursor, then rolls back if the server rejects the move.
export function useMoveCard(boardID: string, includeArchived = false) {
  const qc = useQueryClient();
  return useMutation<Card, Error, MoveCardRequest, { previous?: BoardDetail }>({
    mutationFn: kanbanApi.moveCard,
    onMutate: async (vars) => {
      const key = kanbanKeys.board(boardID, includeArchived);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<BoardDetail>(key);
      if (previous) {
        qc.setQueryData<BoardDetail>(key, {
          ...previous,
          cards: previous.cards.map((c) =>
            c.id === vars.cardID
              ? {
                  ...c,
                  column_id: vars.target_column_id,
                  position: vars.position ?? c.position,
                }
              : c,
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(
          kanbanKeys.board(boardID, includeArchived),
          ctx.previous,
        );
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["kanban", "board", boardID] });
    },
  });
}

// Helper so the claim/complete/release/comment mutations all refresh the
// board (and ready list) without each remembering every key shape.
function invalidateBoard(
  qc: ReturnType<typeof useQueryClient>,
  boardID: string,
) {
  qc.invalidateQueries({ queryKey: ["kanban", "board", boardID] });
  qc.invalidateQueries({ queryKey: kanbanKeys.ready(boardID) });
}

export function useClaimCard(boardID: string) {
  const qc = useQueryClient();
  return useMutation<ClaimCardResponse, Error, ClaimCardRequest>({
    mutationFn: kanbanApi.claimCard,
    onSuccess: () => invalidateBoard(qc, boardID),
  });
}

export function useCompleteCard(boardID: string) {
  const qc = useQueryClient();
  return useMutation<Card, Error, CompleteCardRequest>({
    mutationFn: kanbanApi.completeCard,
    onSuccess: () => invalidateBoard(qc, boardID),
  });
}

export function useReleaseCard(boardID: string) {
  const qc = useQueryClient();
  return useMutation<Card, Error, ReleaseCardRequest>({
    mutationFn: kanbanApi.releaseCard,
    onSuccess: () => invalidateBoard(qc, boardID),
  });
}

export function useReopenCard(boardID: string) {
  const qc = useQueryClient();
  return useMutation<Card, Error, ReopenCardRequest>({
    mutationFn: kanbanApi.reopenCard,
    onSuccess: () => invalidateBoard(qc, boardID),
  });
}

export function useArchiveCard(boardID: string) {
  const qc = useQueryClient();
  return useMutation<Card, Error, ArchiveCardRequest>({
    mutationFn: kanbanApi.archiveCard,
    onSuccess: () => invalidateBoard(qc, boardID),
  });
}

export function useRestoreCard(boardID: string) {
  const qc = useQueryClient();
  return useMutation<Card, Error, RestoreCardRequest>({
    mutationFn: kanbanApi.restoreCard,
    onSuccess: () => invalidateBoard(qc, boardID),
  });
}

export function useArchiveDoneCards(boardID: string) {
  const qc = useQueryClient();
  return useMutation<ArchiveDoneCardsResponse, Error, ArchiveDoneCardsRequest>({
    mutationFn: (body) => kanbanApi.archiveDoneCards(boardID, body),
    onSuccess: () => invalidateBoard(qc, boardID),
  });
}

export function useReleaseStaleCards(boardID: string) {
  const qc = useQueryClient();
  return useMutation<
    ReleaseStaleCardsResponse,
    Error,
    ReleaseStaleCardsRequest
  >({
    mutationFn: (body) => kanbanApi.releaseStaleCards(boardID, body),
    onSuccess: () => invalidateBoard(qc, boardID),
  });
}

export function useAddComment(boardID: string) {
  const qc = useQueryClient();
  return useMutation<Comment, Error, AddCommentRequest>({
    mutationFn: kanbanApi.comment,
    onSuccess: () => invalidateBoard(qc, boardID),
  });
}

export function useAddDependency(boardID: string) {
  const qc = useQueryClient();
  return useMutation<CardLink, Error, AddDependencyRequest>({
    mutationFn: kanbanApi.addDependency,
    onSuccess: () => invalidateBoard(qc, boardID),
  });
}

export function useDeleteDependency(boardID: string) {
  const qc = useQueryClient();
  return useMutation<{ deleted: boolean }, Error, DeleteDependencyRequest>({
    mutationFn: kanbanApi.deleteDependency,
    onSuccess: () => invalidateBoard(qc, boardID),
  });
}
