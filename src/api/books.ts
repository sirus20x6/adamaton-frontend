/**
 * Typed wrappers around the backend `/platform/books` endpoints.
 *
 * Backend contract (parallel agent owns these):
 *   GET /platform/books/{id}
 *   GET /platform/books/{id}/chapters/{ordinal}
 *   GET /platform/books/{id}/characters
 *   GET /platform/books/{id}/themes
 *   GET /platform/books/{id}/plot_beats
 *
 * Each function is a thin axios call returning a typed promise; pages and
 * features pair them with TanStack Query for caching, retries and invalidation.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";

export type BookChapterMeta = {
  id: string;
  ordinal: number;
  title: string;
  length: number;
  summary: string;
  tension_score: number;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  language: string;
  chapters: BookChapterMeta[];
  characters_count: number;
  themes_count: number;
  beats_count: number;
};

export type Chapter = {
  id: string;
  ordinal: number;
  title: string;
  content: string;
  summary: string;
};

export type Character = {
  id: string;
  name: string;
  aliases: string[];
  bio: string;
  mention_count: number;
  first_chapter: number;
  last_chapter: number;
  /** Map of chapter ordinal (as string) to mention count. */
  appearances: Record<string, number>;
};

export type Theme = {
  id: string;
  name: string;
  summary: string;
  /** Map of chapter ordinal (as string) to salience in [0, 1]. */
  salience_by_chapter: Record<string, number>;
};

export type PlotBeatKind =
  | "inciting"
  | "rising"
  | "climax"
  | "falling"
  | "resolution"
  | string;

export type PlotBeat = {
  id: string;
  chapter_ordinal: number;
  kind: PlotBeatKind;
  label: string;
};

const BOOKS_ROOT = "/platform/books";

/** Response shape returned by the synchronous `POST /platform/books/`. */
export type AnalyzeBookResponse = {
  book_id: string;
  title?: string;
  chapters?: number;
  characters?: number;
  themes?: number;
  beats?: number;
  [key: string]: unknown;
};

export type AnalyzeBookInput = {
  /** Absolute path returned by the upload route. */
  path: string;
  corpus_id?: string;
  owner_id?: string;
};

/**
 * Trigger the book ingest+analyze pipeline. The backend reads the file at
 * `path`, runs the chapter splitter and three extractors, and returns the
 * resulting `book_id` plus high-level counts.
 */
export async function analyzeBook(
  input: AnalyzeBookInput,
): Promise<AnalyzeBookResponse> {
  return api.post<AnalyzeBookResponse>(`${BOOKS_ROOT}/`, {
    file_path: input.path,
    corpus_id: input.corpus_id,
    owner_id: input.owner_id,
  });
}

export async function getBook(bookId: string): Promise<Book> {
  return api.get<Book>(`${BOOKS_ROOT}/${encodeURIComponent(bookId)}`);
}

export async function getChapter(
  bookId: string,
  ordinal: number,
): Promise<Chapter> {
  return api.get<Chapter>(
    `${BOOKS_ROOT}/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(
      String(ordinal),
    )}`,
  );
}

export async function getCharacters(bookId: string): Promise<Character[]> {
  return api.get<Character[]>(
    `${BOOKS_ROOT}/${encodeURIComponent(bookId)}/characters`,
  );
}

export async function getThemes(bookId: string): Promise<Theme[]> {
  return api.get<Theme[]>(
    `${BOOKS_ROOT}/${encodeURIComponent(bookId)}/themes`,
  );
}

export async function getPlotBeats(bookId: string): Promise<PlotBeat[]> {
  return api.get<PlotBeat[]>(
    `${BOOKS_ROOT}/${encodeURIComponent(bookId)}/plot_beats`,
  );
}

/* ── Query key factory ─────────────────────────────────────────────────── */

export const bookKeys = {
  all: ["books"] as const,
  book: (bookId: string) => ["books", "book", bookId] as const,
  chapter: (bookId: string, ordinal: number) =>
    ["books", "chapter", bookId, ordinal] as const,
  characters: (bookId: string) => ["books", "characters", bookId] as const,
  themes: (bookId: string) => ["books", "themes", bookId] as const,
  beats: (bookId: string) => ["books", "beats", bookId] as const,
};

/* ── TanStack Query hooks ──────────────────────────────────────────────── */

type QueryOpts<T> = Omit<
  UseQueryOptions<T, Error, T>,
  "queryKey" | "queryFn"
>;

export function useBook(bookId: string, opts?: QueryOpts<Book>) {
  return useQuery<Book, Error, Book>({
    queryKey: bookKeys.book(bookId),
    queryFn: () => getBook(bookId),
    enabled: bookId.length > 0,
    staleTime: 5 * 60_000,
    ...opts,
  });
}

export function useChapter(
  bookId: string,
  ordinal: number,
  opts?: QueryOpts<Chapter>,
) {
  return useQuery<Chapter, Error, Chapter>({
    queryKey: bookKeys.chapter(bookId, ordinal),
    queryFn: () => getChapter(bookId, ordinal),
    enabled: bookId.length > 0 && Number.isFinite(ordinal) && ordinal > 0,
    staleTime: 10 * 60_000,
    ...opts,
  });
}

export function useCharacters(bookId: string, opts?: QueryOpts<Character[]>) {
  return useQuery<Character[], Error, Character[]>({
    queryKey: bookKeys.characters(bookId),
    queryFn: () => getCharacters(bookId),
    enabled: bookId.length > 0,
    staleTime: 5 * 60_000,
    ...opts,
  });
}

export function useThemes(bookId: string, opts?: QueryOpts<Theme[]>) {
  return useQuery<Theme[], Error, Theme[]>({
    queryKey: bookKeys.themes(bookId),
    queryFn: () => getThemes(bookId),
    enabled: bookId.length > 0,
    staleTime: 5 * 60_000,
    ...opts,
  });
}

export function usePlotBeats(bookId: string, opts?: QueryOpts<PlotBeat[]>) {
  return useQuery<PlotBeat[], Error, PlotBeat[]>({
    queryKey: bookKeys.beats(bookId),
    queryFn: () => getPlotBeats(bookId),
    enabled: bookId.length > 0,
    staleTime: 5 * 60_000,
    ...opts,
  });
}
