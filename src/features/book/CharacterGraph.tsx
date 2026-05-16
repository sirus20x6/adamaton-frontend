import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, {
  type Core,
  type ElementDefinition,
  type EventObject,
} from "cytoscape";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Character } from "@/api/books";

export type CharacterGraphProps = {
  characters: Character[];
  /** Which character to focus on (selected node). Optional. */
  pinnedCharacterId?: string | null;
  onPinChange?: (characterId: string | null) => void;
  /** Click a chapter pin to navigate the Reader. */
  onChapterClick?: (ordinal: number) => void;
  className?: string;
};

type Edge = {
  source: string;
  target: string;
  weight: number;
};

function buildEdges(characters: Character[]): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < characters.length; i += 1) {
    const a = characters[i];
    if (!a) continue;
    const aChapters = new Set(Object.keys(a.appearances ?? {}));
    for (let j = i + 1; j < characters.length; j += 1) {
      const b = characters[j];
      if (!b) continue;
      let weight = 0;
      for (const ch of aChapters) {
        if ((b.appearances?.[ch] ?? 0) > 0 && (a.appearances?.[ch] ?? 0) > 0) {
          weight += 1;
        }
      }
      if (weight > 0) {
        edges.push({ source: a.id, target: b.id, weight });
      }
    }
  }
  return edges;
}

function nodeSizeFor(mentions: number, max: number): number {
  if (max <= 0) return 24;
  // Sqrt scaling keeps top-heavy networks readable.
  const ratio = Math.sqrt(mentions / max);
  return 18 + ratio * 36;
}

export function CharacterGraph({
  characters,
  pinnedCharacterId,
  onPinChange,
  onChapterClick,
  className,
}: CharacterGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [internalPin, setInternalPin] = useState<string | null>(
    pinnedCharacterId ?? null,
  );

  // Keep internal selection in sync with controlled prop.
  useEffect(() => {
    if (pinnedCharacterId !== undefined) {
      setInternalPin(pinnedCharacterId);
    }
  }, [pinnedCharacterId]);

  const { elements, maxMentions, maxWeight } = useMemo(() => {
    const mMax = characters.reduce(
      (acc, c) => Math.max(acc, c.mention_count ?? 0),
      0,
    );
    const edges = buildEdges(characters);
    const wMax = edges.reduce((acc, e) => Math.max(acc, e.weight), 0);
    const els: ElementDefinition[] = [];
    for (const c of characters) {
      els.push({
        data: {
          id: c.id,
          label: c.name,
          mentions: c.mention_count ?? 0,
          size: nodeSizeFor(c.mention_count ?? 0, mMax),
        },
      });
    }
    for (const e of edges) {
      els.push({
        data: {
          id: `${e.source}__${e.target}`,
          source: e.source,
          target: e.target,
          weight: e.weight,
          opacity: wMax > 0 ? 0.15 + 0.85 * (e.weight / wMax) : 0.4,
        },
      });
    }
    return { elements: els, maxMentions: mMax, maxWeight: wMax };
  }, [characters]);

  // Initialise / refresh the cytoscape instance when elements change.
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      wheelSensitivity: 0.2,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "hsl(var(--primary))",
            label: "data(label)",
            color: "hsl(var(--foreground))",
            "font-size": 10,
            "text-valign": "bottom",
            "text-margin-y": 4,
            "text-outline-color": "hsl(var(--background))",
            "text-outline-width": 2,
            width: "data(size)",
            height: "data(size)",
            "border-width": 1,
            "border-color": "hsl(var(--border))",
          },
        },
        {
          selector: "node:selected",
          style: {
            "background-color": "hsl(var(--primary))",
            "border-width": 3,
            "border-color": "hsl(var(--ring))",
          },
        },
        {
          selector: "edge",
          style: {
            "curve-style": "bezier",
            width: 1.5,
            "line-color": "hsl(var(--muted-foreground))",
            opacity: "data(opacity)",
          },
        },
        {
          selector: "edge:selected",
          style: {
            "line-color": "hsl(var(--primary))",
            opacity: 0.9,
            width: 2.5,
          },
        },
      ],
      layout: {
        name: "cose",
        animate: false,
        padding: 20,
      },
    });

    cy.on("tap", "node", (event: EventObject) => {
      const id = String(event.target.id());
      setInternalPin(id);
      onPinChange?.(id);
    });

    cy.on("tap", (event: EventObject) => {
      if (event.target === cy) {
        setInternalPin(null);
        onPinChange?.(null);
      }
    });

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
    // We intentionally re-run when elements identity changes; onPinChange is
    // captured each run and rebinding is cheap.
  }, [elements, onPinChange]);

  // Sync external selection into the cy instance.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().unselect();
    if (internalPin) {
      const node = cy.getElementById(internalPin);
      if (node && node.length > 0) {
        node.select();
        cy.center(node);
      }
    }
  }, [internalPin]);

  const pinnedCharacter = useMemo(
    () => characters.find((c) => c.id === internalPin) ?? null,
    [characters, internalPin],
  );

  const pinnedChapterEntries = useMemo(() => {
    if (!pinnedCharacter) return [];
    return Object.entries(pinnedCharacter.appearances ?? {})
      .map(([ord, count]) => ({ ordinal: Number(ord), count }))
      .filter((row) => Number.isFinite(row.ordinal))
      .sort((a, b) => a.ordinal - b.ordinal);
  }, [pinnedCharacter]);

  return (
    <div
      className={cn(
        "grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]",
        className,
      )}
    >
      <Card className="flex min-h-[28rem] flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-2">
          <div>
            <CardTitle className="text-sm font-medium tracking-tight">
              Character co-occurrence
            </CardTitle>
            <p className="text-[0.65rem] text-muted-foreground">
              Edges connect characters who share at least one chapter; weight is
              the count of shared chapters.
            </p>
          </div>
          <span className="text-[0.65rem] tabular-nums text-muted-foreground">
            {characters.length} nodes · max weight {maxWeight}
          </span>
        </CardHeader>
        <CardContent className="relative min-h-0 flex-1 p-0">
          <div
            ref={containerRef}
            className="h-full w-full"
            style={{ minHeight: "26rem" }}
            aria-label="Character co-occurrence graph"
          />
          {characters.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">
                No characters extracted for this book yet.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="flex flex-col">
        <CardHeader className="space-y-1 p-3 pb-1.5">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {pinnedCharacter ? "Pinned character" : "Select a character"}
          </CardTitle>
          {pinnedCharacter ? (
            <p className="text-base font-semibold tracking-tight text-foreground">
              {pinnedCharacter.name}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Click a node in the graph to inspect.
            </p>
          )}
        </CardHeader>
        {pinnedCharacter ? (
          <CardContent className="space-y-3 p-3 pt-0">
            {pinnedCharacter.aliases?.length > 0 ? (
              <p className="text-[0.7rem] text-muted-foreground">
                a.k.a. {pinnedCharacter.aliases.join(", ")}
              </p>
            ) : null}
            <p className="text-xs leading-relaxed text-muted-foreground">
              {pinnedCharacter.bio || "No biography available."}
            </p>
            <dl className="grid grid-cols-2 gap-2 rounded-md border border-border bg-background p-2 text-xs">
              <div>
                <dt className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                  Mentions
                </dt>
                <dd className="tabular-nums">{pinnedCharacter.mention_count}</dd>
              </div>
              <div>
                <dt className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                  Of max
                </dt>
                <dd className="tabular-nums">
                  {maxMentions > 0
                    ? `${Math.round(
                        (pinnedCharacter.mention_count / maxMentions) * 100,
                      )}%`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                  First chapter
                </dt>
                <dd className="tabular-nums">{pinnedCharacter.first_chapter}</dd>
              </div>
              <div>
                <dt className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                  Last chapter
                </dt>
                <dd className="tabular-nums">{pinnedCharacter.last_chapter}</dd>
              </div>
            </dl>
            <div>
              <p className="mb-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                Pinned chapters
              </p>
              {pinnedChapterEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No chapter appearances recorded.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {pinnedChapterEntries.map((row) => (
                    <Button
                      key={row.ordinal}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 px-1.5 text-[0.65rem]"
                      onClick={() => onChapterClick?.(row.ordinal)}
                      title={`${row.count} mentions`}
                    >
                      Ch. {row.ordinal}
                      <span className="rounded bg-muted px-1 text-[0.55rem] tabular-nums text-muted-foreground">
                        {row.count}
                      </span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}

export default CharacterGraph;
