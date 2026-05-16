import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import {
  AlertTriangle,
  BookOpen,
  ExternalLink,
  Loader2,
  UploadCloud,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  useBook,
  useCharacters,
  usePlotBeats,
  useThemes,
} from "@/api/books";
import { UploadBookDialog } from "@/features/book/UploadBookDialog";

const Overview = lazy(() => import("@/features/book/Overview"));
const Reader = lazy(() => import("@/features/book/Reader"));
const CharacterGraph = lazy(() => import("@/features/book/CharacterGraph"));
const ThemeMap = lazy(() => import("@/features/book/ThemeMap"));
const PlotBeats = lazy(() => import("@/features/book/PlotBeats"));

type TabId = "overview" | "reader" | "characters" | "themes" | "plot";

const TAB_ORDER: readonly TabId[] = [
  "overview",
  "reader",
  "characters",
  "themes",
  "plot",
];

const TAB_LABEL: Record<TabId, string> = {
  overview: "Overview",
  reader: "Reader",
  characters: "Characters",
  themes: "Themes",
  plot: "Plot",
};

function UploadFirstBookCta({
  reason,
  bookId,
}: {
  reason: "missing-id" | "not-found";
  bookId?: string;
}) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header className="space-y-1">
        <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
          <BookOpen className="mr-1 inline-block h-3 w-3" />
          Book Workspace
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {reason === "missing-id"
            ? "No book yet"
            : `Book ${bookId?.slice(0, 8) ?? ""} not found`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {reason === "missing-id"
            ? "Upload an EPUB, PDF, or text file to kick off chapter splitting and the three extractors."
            : "We couldn't find that id in the database. Upload a new book to get started — the workspace will land you on it once analysis finishes."}
        </p>
      </header>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Upload your first book</h2>
              <p className="text-xs text-muted-foreground">
                EPUB, PDF, plain text, or markdown · 256 MB max. We&apos;ll
                analyze chapters, characters, themes, and plot beats before
                you even open the file.
              </p>
            </div>
          </div>
          <UploadBookDialog
            trigger={
              <Button type="button" size="sm">
                <UploadCloud className="h-3.5 w-3.5" />
                Upload book
              </Button>
            }
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Or browse existing corpora in the{" "}
        <Link to="/library" className="text-primary hover:underline">
          Library
        </Link>
        .
      </p>
    </section>
  );
}

function TabFallback() {
  return (
    <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      Loading…
    </div>
  );
}

export default function BookWorkspace() {
  const { bookId } = useParams<{ bookId: string }>();
  if (!bookId || bookId === "_") {
    return <UploadFirstBookCta reason="missing-id" />;
  }
  return <BookWorkspaceInner bookId={bookId} />;
}

function BookWorkspaceInner({ bookId }: { bookId: string }) {
  const bookQuery = useBook(bookId, { retry: false });
  const charactersQuery = useCharacters(bookId, { retry: false });
  const themesQuery = useThemes(bookId, { retry: false });
  const beatsQuery = usePlotBeats(bookId, { retry: false });

  const [tab, setTab] = useState<TabId>("overview");
  const [readerOrdinal, setReaderOrdinal] = useState<number | null>(null);
  const [pinnedCharacterId, setPinnedCharacterId] = useState<string | null>(
    null,
  );

  const chapters = bookQuery.data?.chapters ?? [];
  const sortedChapters = useMemo(
    () => [...chapters].sort((a, b) => a.ordinal - b.ordinal),
    [chapters],
  );

  // Default ordinal: first chapter once the book lands.
  const effectiveOrdinal =
    readerOrdinal ?? sortedChapters[0]?.ordinal ?? 1;

  const goToChapter = useCallback((ordinal: number) => {
    setReaderOrdinal(ordinal);
    setTab("reader");
  }, []);

  const pinCharacter = useCallback((characterId: string) => {
    setPinnedCharacterId(characterId);
    setTab("characters");
  }, []);

  /* ── Loading / error gates ─────────────────────────────────────────── */
  if (bookQuery.isLoading) {
    return (
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-6">
        <header className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading book…
        </header>
      </section>
    );
  }
  if (bookQuery.isError || !bookQuery.data) {
    // Treat 404s as a missing-book-show-upload-CTA path; everything else
    // surfaces an error banner alongside the upload card so users still
    // have a path forward.
    const status = axios.isAxiosError(bookQuery.error)
      ? (bookQuery.error.response?.status ?? 0)
      : 0;
    if (status === 404) {
      return <UploadFirstBookCta reason="not-found" bookId={bookId} />;
    }
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 p-6">
        <h1 className="text-xl font-semibold tracking-tight">Book Workspace</h1>
        <p className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          Failed to load book{" "}
          <code className="font-mono">{bookId}</code>
          {bookQuery.error?.message ? `: ${bookQuery.error.message}` : ""}
        </p>
        <UploadBookDialog
          trigger={
            <Button size="sm" type="button" variant="outline">
              <UploadCloud className="h-3.5 w-3.5" />
              Upload a different book
            </Button>
          }
        />
      </section>
    );
  }

  const book = bookQuery.data;
  const characters = charactersQuery.data ?? [];
  const themes = themesQuery.data ?? [];
  const beats = beatsQuery.data ?? [];

  return (
    <section className="grid h-full grid-rows-[auto_minmax(0,1fr)]">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="border-b border-border bg-background/60 px-6 py-4 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
              <BookOpen className="mr-1 inline-block h-3 w-3" />
              Book {bookId.slice(0, 8)}
            </p>
            <h1 className="line-clamp-2 max-w-3xl text-lg font-semibold leading-snug tracking-tight">
              {book.title || "Untitled"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {book.author ? <span>{book.author}</span> : null}
              {book.author && book.language ? " · " : ""}
              {book.language ? (
                <span className="uppercase tracking-wide">
                  {book.language}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <UploadBookDialog
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  Upload another
                </Button>
              }
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
              className="gap-1.5"
            >
              <Link to={`/library/${encodeURIComponent(bookId)}`}>
                <ExternalLink className="h-3.5 w-3.5" />
                Open document
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TabId)}
        className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]"
      >
        <div className="border-b border-border bg-background/40 px-6 py-2">
          <TabsList>
            {TAB_ORDER.map((id) => (
              <TabsTrigger key={id} value={id}>
                {TAB_LABEL[id]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="min-h-0 overflow-auto px-6 py-5">
          <TabsContent value="overview" className="m-0 mt-0">
            <Suspense fallback={<TabFallback />}>
              <Overview book={book} onChapterClick={goToChapter} />
            </Suspense>
          </TabsContent>

          <TabsContent value="reader" className="m-0 mt-0 min-h-0">
            <Suspense fallback={<TabFallback />}>
              <Reader
                book={book}
                ordinal={effectiveOrdinal}
                onOrdinalChange={setReaderOrdinal}
                characters={characters}
                themes={themes}
                beats={beats}
                onPinCharacter={pinCharacter}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="characters" className="m-0 mt-0 min-h-0">
            <Suspense fallback={<TabFallback />}>
              <CharacterGraph
                characters={characters}
                pinnedCharacterId={pinnedCharacterId}
                onPinChange={setPinnedCharacterId}
                onChapterClick={goToChapter}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="themes" className="m-0 mt-0 min-h-0">
            <Suspense fallback={<TabFallback />}>
              <ThemeMap
                themes={themes}
                chapters={book.chapters}
                onChapterClick={goToChapter}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="plot" className="m-0 mt-0 min-h-0">
            <Suspense fallback={<TabFallback />}>
              <PlotBeats
                beats={beats}
                chapters={book.chapters}
                onBeatClick={goToChapter}
              />
            </Suspense>
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}
