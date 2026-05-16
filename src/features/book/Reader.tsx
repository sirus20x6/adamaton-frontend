import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Prose } from "@/components/markdown/Prose";
import { cn } from "@/lib/utils";
import {
  useChapter,
  type Book,
  type Character,
  type PlotBeat,
  type Theme,
} from "@/api/books";

export type ReaderProps = {
  book: Book;
  ordinal: number;
  onOrdinalChange: (ordinal: number) => void;
  characters: Character[];
  themes: Theme[];
  beats: PlotBeat[];
  /** Pin a character (jumps to Characters tab and selects them). */
  onPinCharacter: (characterId: string) => void;
  className?: string;
};

const BEAT_TONE: Record<string, string> = {
  inciting: "bg-amber-500/10 text-amber-700 border-amber-500/40",
  rising: "bg-sky-500/10 text-sky-700 border-sky-500/40",
  climax: "bg-destructive/10 text-destructive border-destructive/40",
  falling: "bg-violet-500/10 text-violet-700 border-violet-500/40",
  resolution: "bg-emerald-500/10 text-emerald-700 border-emerald-500/40",
};

function beatToneFor(kind: string): string {
  return (
    BEAT_TONE[kind] ?? "bg-primary/10 text-primary border-primary/40"
  );
}

type SidePanelProps = Pick<
  ReaderProps,
  "characters" | "themes" | "beats" | "onPinCharacter"
> & {
  ordinalKey: string;
  ordinal: number;
};

function CharactersPanel({
  characters,
  ordinalKey,
  onPinCharacter,
}: {
  characters: Character[];
  ordinalKey: string;
  onPinCharacter: (id: string) => void;
}) {
  const mentionedCharacters = useMemo(() => {
    return characters
      .filter((c) => (c.appearances?.[ordinalKey] ?? 0) > 0)
      .sort(
        (a, b) =>
          (b.appearances?.[ordinalKey] ?? 0) -
          (a.appearances?.[ordinalKey] ?? 0),
      );
  }, [characters, ordinalKey]);

  return (
    <Card>
      <CardHeader className="p-3 pb-1.5">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Characters in this chapter
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 p-3 pt-0">
        {mentionedCharacters.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No characters detected in this chapter.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {mentionedCharacters.map((character) => (
              <li key={character.id}>
                <button
                  type="button"
                  onClick={() => onPinCharacter(character.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-xs transition-colors",
                    "hover:border-primary/40 hover:bg-accent",
                  )}
                >
                  <span className="truncate font-medium text-foreground">
                    {character.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] tabular-nums text-muted-foreground">
                    {character.appearances?.[ordinalKey] ?? 0}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ThemesPanel({
  themes,
  ordinalKey,
}: {
  themes: Theme[];
  ordinalKey: string;
}) {
  const salientThemes = useMemo(() => {
    return themes
      .map((t) => ({
        theme: t,
        salience: t.salience_by_chapter?.[ordinalKey] ?? 0,
      }))
      .filter((row) => row.salience > 0)
      .sort((a, b) => b.salience - a.salience);
  }, [themes, ordinalKey]);

  return (
    <Card>
      <CardHeader className="p-3 pb-1.5">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Salient themes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 p-3 pt-0">
        {salientThemes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No themes salient here.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {salientThemes.map(({ theme, salience }) => (
              <li
                key={theme.id}
                className="rounded-md border border-border bg-background px-2.5 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-foreground">
                    {theme.name}
                  </span>
                  <span className="shrink-0 text-[0.65rem] tabular-nums text-muted-foreground">
                    {(salience * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${Math.round(salience * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function BeatsPanel({
  beats,
  ordinal,
}: {
  beats: PlotBeat[];
  ordinal: number;
}) {
  const chapterBeats = useMemo(
    () => beats.filter((b) => b.chapter_ordinal === ordinal),
    [beats, ordinal],
  );

  return (
    <Card>
      <CardHeader className="p-3 pb-1.5">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Plot beats
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 p-3 pt-0">
        {chapterBeats.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No plot beat anchored here.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {chapterBeats.map((beat) => (
              <li
                key={beat.id}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs",
                  beatToneFor(beat.kind),
                )}
              >
                <span className="block text-[0.6rem] font-medium uppercase tracking-wide opacity-80">
                  {beat.kind}
                </span>
                <span className="block font-medium">{beat.label}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SidePanelStack({
  characters,
  themes,
  beats,
  ordinalKey,
  ordinal,
  onPinCharacter,
}: SidePanelProps) {
  return (
    <aside aria-label="Chapter context" className="flex flex-col gap-3">
      <CharactersPanel
        characters={characters}
        ordinalKey={ordinalKey}
        onPinCharacter={onPinCharacter}
      />
      <ThemesPanel themes={themes} ordinalKey={ordinalKey} />
      <BeatsPanel beats={beats} ordinal={ordinal} />
    </aside>
  );
}

function SidePanelTabs({
  characters,
  themes,
  beats,
  ordinalKey,
  ordinal,
  onPinCharacter,
}: SidePanelProps) {
  return (
    <Tabs
      defaultValue="characters"
      className="flex flex-col gap-2"
      aria-label="Chapter context"
    >
      <TabsList className="self-start">
        <TabsTrigger value="characters">Characters</TabsTrigger>
        <TabsTrigger value="themes">Themes</TabsTrigger>
        <TabsTrigger value="beats">Beats</TabsTrigger>
      </TabsList>
      <TabsContent value="characters" className="mt-0">
        <CharactersPanel
          characters={characters}
          ordinalKey={ordinalKey}
          onPinCharacter={onPinCharacter}
        />
      </TabsContent>
      <TabsContent value="themes" className="mt-0">
        <ThemesPanel themes={themes} ordinalKey={ordinalKey} />
      </TabsContent>
      <TabsContent value="beats" className="mt-0">
        <BeatsPanel beats={beats} ordinal={ordinal} />
      </TabsContent>
    </Tabs>
  );
}

export function Reader({
  book,
  ordinal,
  onOrdinalChange,
  characters,
  themes,
  beats,
  onPinCharacter,
  className,
}: ReaderProps) {
  const sortedChapters = useMemo(
    () => [...book.chapters].sort((a, b) => a.ordinal - b.ordinal),
    [book.chapters],
  );

  const idx = sortedChapters.findIndex((c) => c.ordinal === ordinal);
  const prevOrdinal =
    idx > 0 ? (sortedChapters[idx - 1]?.ordinal ?? null) : null;
  const nextOrdinal =
    idx >= 0 && idx < sortedChapters.length - 1
      ? (sortedChapters[idx + 1]?.ordinal ?? null)
      : null;
  const meta = idx >= 0 ? sortedChapters[idx] : undefined;

  const chapterQuery = useChapter(book.id, ordinal);

  const ordinalKey = String(ordinal);

  const sidePanelProps: SidePanelProps = {
    characters,
    themes,
    beats,
    ordinalKey,
    ordinal,
    onPinCharacter,
  };

  // Below the `lg` breakpoint we surface the side panel as a Tabs strip
  // ABOVE the chapter so the chapter prose stays the primary view; at
  // `lg+` we keep the original two-column layout.
  return (
    <div
      className={cn(
        "grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]",
        className,
      )}
    >
      {/* Mobile-only side panel — collapsed Tabs. Hidden at lg+ where the
          aside renders alongside. */}
      <div className="lg:hidden">
        <SidePanelTabs {...sidePanelProps} />
      </div>

      {/* ── Reader pane ─────────────────────────────────────────────── */}
      <article className="flex min-h-0 min-w-0 flex-col gap-3">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CardHeader className="space-y-1 border-b border-border p-4">
            <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
              Chapter {ordinal}
              {sortedChapters.length > 0 ? ` of ${sortedChapters.length}` : ""}
            </p>
            <CardTitle className="text-base leading-snug">
              {chapterQuery.data?.title || meta?.title || "Loading chapter…"}
            </CardTitle>
            {meta?.summary ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {meta.summary}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto p-5">
            {chapterQuery.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading chapter content…
              </div>
            ) : chapterQuery.isError ? (
              <p className="text-xs text-destructive">
                Failed to load chapter:{" "}
                {chapterQuery.error?.message ?? "unknown error"}
              </p>
            ) : chapterQuery.data ? (
              <Prose
                source={chapterQuery.data.content}
                chunkId={chapterQuery.data.id}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                No content for this chapter.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={prevOrdinal === null}
            onClick={() => prevOrdinal !== null && onOrdinalChange(prevOrdinal)}
            className="gap-1.5"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </Button>
          <span className="truncate text-xs text-muted-foreground">
            {meta?.title || `Chapter ${ordinal}`}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={nextOrdinal === null}
            onClick={() => nextOrdinal !== null && onOrdinalChange(nextOrdinal)}
            className="gap-1.5"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </article>

      {/* Desktop side panel — stacked cards. Hidden below lg. */}
      <div className="hidden lg:block">
        <SidePanelStack {...sidePanelProps} />
      </div>
    </div>
  );
}

export default Reader;
