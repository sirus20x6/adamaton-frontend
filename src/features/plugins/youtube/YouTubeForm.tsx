import * as React from "react";
import {
  Headphones,
  Image as ImageIcon,
  Loader2,
  Play,
  Plus,
  Search,
  Video,
  X,
  Youtube,
} from "lucide-react";

import { useCorpora } from "@/api/library";
import { useStartPluginRun, type PluginRunInput } from "@/api/plugins";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const NO_CORPUS_VALUE = "__none__";

type Mode = "auto" | "video" | "channel" | "playlist";

const MODE_OPTIONS: ReadonlyArray<{ value: Mode; label: string }> = [
  { value: "auto", label: "Auto-detect" },
  { value: "video", label: "Single video" },
  { value: "channel", label: "Channel" },
  { value: "playlist", label: "Playlist" },
];

/**
 * Client-side mirror of the YouTube source classifier the backend uses.
 * Keep these regexes in lock-step with ``platform.plugins.youtube.classify``
 * — if the server adds a new shape, mirror it here so the "Detect" button
 * doesn't lie.
 */
const VIDEO_RE = /(?:youtube\.com\/watch\?[^#]*v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/i;
const PLAYLIST_RE = /[?&]list=([A-Za-z0-9_-]+)/i;
const CHANNEL_RE = /youtube\.com\/(?:@[A-Za-z0-9_.-]+|c\/[^/?#]+|channel\/[A-Za-z0-9_-]+|user\/[^/?#]+)/i;
const HANDLE_RE = /^@[A-Za-z0-9_.-]+$/;

function detectMode(url: string): Mode {
  const trimmed = url.trim();
  if (!trimmed) return "auto";
  if (HANDLE_RE.test(trimmed)) return "channel";
  if (PLAYLIST_RE.test(trimmed)) return "playlist";
  if (VIDEO_RE.test(trimmed)) return "video";
  if (CHANNEL_RE.test(trimmed)) return "channel";
  return "auto";
}

const DEFAULT_LANGUAGES = ["en", "en-US", "en-GB"];

type LanguageChipsProps = {
  values: string[];
  onChange: (next: string[]) => void;
};

function LanguageChips({ values, onChange }: LanguageChipsProps) {
  const [draft, setDraft] = React.useState("");

  const addLanguage = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (values.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...values, value]);
    setDraft("");
  };

  const removeLanguage = (value: string) => {
    onChange(values.filter((v) => v !== value));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addLanguage(draft);
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      const last = values[values.length - 1];
      if (last !== undefined) removeLanguage(last);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
        {values.map((lang) => (
          <span
            key={lang}
            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
          >
            <span className="font-mono">{lang}</span>
            <button
              type="button"
              aria-label={`Remove ${lang}`}
              onClick={() => removeLanguage(lang)}
              className="rounded-full text-primary/70 hover:text-primary"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (draft.trim()) addLanguage(draft);
          }}
          placeholder={values.length === 0 ? "en, en-US…" : "Add language"}
          className="min-w-[6rem] flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus-visible:outline-none"
        />
        {draft.trim() ? (
          <button
            type="button"
            onClick={() => addLanguage(draft)}
            className="inline-flex h-5 items-center gap-0.5 rounded-full border border-border px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Transcript languages tried in order. Press Enter or comma to add.
      </p>
    </div>
  );
}

type DisabledToggleRowProps = {
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
};

function DisabledToggleRow({ label, hint, icon: Icon }: DisabledToggleRowProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex cursor-not-allowed items-start gap-3 rounded-md border border-dashed border-border bg-background/40 p-3 opacity-70",
            )}
            aria-disabled="true"
          >
            <input
              type="checkbox"
              checked={false}
              disabled
              readOnly
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                {label}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {hint}
              </p>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          coming once GPU sidecar lands
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export type YouTubeFormProps = {
  onRunStarted?: (runId: string) => void;
};

export function YouTubeForm({ onRunStarted }: YouTubeFormProps) {
  const corporaQuery = useCorpora();
  const corpora = corporaQuery.data ?? [];
  const { toast } = useToast();
  const start = useStartPluginRun("youtube");

  const [url, setUrl] = React.useState("");
  const [mode, setMode] = React.useState<Mode>("auto");
  const [maxVideos, setMaxVideos] = React.useState<number>(100);
  const [languages, setLanguages] =
    React.useState<string[]>(DEFAULT_LANGUAGES);

  // Auto-select a corpus literally named "YouTube" (case-insensitive) the
  // first time we see one in the list. Mirrors SyncControls.tsx for Zotero.
  const defaultYouTube = React.useMemo(
    () =>
      corpora.find((c) => c.name.trim().toLowerCase() === "youtube") ?? null,
    [corpora],
  );
  const [corpusId, setCorpusId] = React.useState<string>(NO_CORPUS_VALUE);
  const userTouchedCorpusRef = React.useRef(false);
  React.useEffect(() => {
    if (defaultYouTube && !userTouchedCorpusRef.current) {
      setCorpusId(defaultYouTube.id);
    }
  }, [defaultYouTube]);

  const onDetect = () => {
    const next = detectMode(url);
    setMode(next);
    toast({
      title: `Mode: ${MODE_OPTIONS.find((m) => m.value === next)?.label ?? next}`,
      description:
        next === "auto"
          ? "Couldn't classify the URL — leaving as auto-detect."
          : `Detected from "${url.trim().slice(0, 60)}"`,
      variant: next === "auto" ? "default" : "info",
    });
  };

  const usesScan = mode === "channel" || mode === "playlist";

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      toast({
        title: "URL required",
        description:
          "Paste a YouTube channel handle, video URL, or playlist URL.",
        variant: "error",
      });
      return;
    }
    const options: Record<string, unknown> = {};
    if (languages.length > 0) options["transcript_languages"] = [...languages];
    if (usesScan) options["max_videos"] = maxVideos;
    const payload: PluginRunInput = {
      source: trimmed,
      mode: mode === "auto" ? "auto" : mode,
    };
    if (corpusId !== NO_CORPUS_VALUE) payload.corpus_id = corpusId;
    if (Object.keys(options).length > 0) payload.options = options;
    start.mutate(payload, {
      onSuccess: (resp) => {
        toast({
          title: "YouTube run started",
          description: `Queued on ${resp.queue}`,
          variant: "info",
        });
        onRunStarted?.(resp.run_id);
      },
      onError: (err) =>
        toast({
          title: "Failed to start run",
          description: err.message,
          variant: "error",
        }),
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card/40 p-4"
    >
      <div className="flex flex-col gap-2">
        <label
          htmlFor="yt-url"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Source
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Youtube className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="yt-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/@code4AI"
              className="pl-8 font-mono text-sm"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDetect}
            disabled={!url.trim()}
          >
            <Search className="h-3.5 w-3.5" />
            Detect
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Accepts channel handles (<code>@code4AI</code>), full channel URLs,
          single video URLs (including <code>youtu.be</code> shortlinks and
          shorts), and playlist URLs (<code>?list=…</code>).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="yt-mode"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Mode
          </label>
          <select
            id="yt-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className={cn(
              "h-9 rounded-md border border-border bg-background px-2 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            {MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="yt-corpus"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Target corpus
          </label>
          <select
            id="yt-corpus"
            value={corpusId}
            onChange={(e) => {
              userTouchedCorpusRef.current = true;
              setCorpusId(e.target.value);
            }}
            disabled={corporaQuery.isLoading}
            className={cn(
              "h-9 rounded-md border border-border bg-background px-2 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <option value={NO_CORPUS_VALUE}>
              {defaultYouTube
                ? "No corpus link (use server default)"
                : "No corpus link — create a corpus called \"YouTube\" to auto-target"}
            </option>
            {corpora.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.scope ? ` · ${String(c.scope)}` : ""}
              </option>
            ))}
          </select>
          {!defaultYouTube && corpora.length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Tip: name a corpus <code>YouTube</code> and it'll be picked
              automatically.
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="yt-max-videos"
            className={cn(
              "text-xs font-medium uppercase tracking-wide",
              usesScan ? "text-muted-foreground" : "text-muted-foreground/60",
            )}
          >
            Max videos to scan
          </label>
          <Input
            id="yt-max-videos"
            type="number"
            min={1}
            max={1000}
            value={maxVideos}
            onChange={(e) => {
              const next = Number.parseInt(e.target.value, 10);
              if (!Number.isNaN(next)) {
                setMaxVideos(Math.max(1, Math.min(1000, next)));
              }
            }}
            disabled={!usesScan}
          />
          <p className="text-[11px] text-muted-foreground">
            {usesScan
              ? "Cap on the per-run scan. 1–1000."
              : "Only used when scanning a channel or playlist."}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Transcript languages
          </span>
          <LanguageChips values={languages} onChange={setLanguages} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2 rounded-md border border-border bg-background/40 p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Heavy capabilities
        </legend>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <DisabledToggleRow
            label="Include audio"
            hint="Pull WAV for ASR re-runs."
            icon={Headphones}
          />
          <DisabledToggleRow
            label="Include video"
            hint="Mirror MP4s alongside transcripts."
            icon={Video}
          />
          <DisabledToggleRow
            label="Include snapshots"
            hint="Periodic frame grabs for visual context."
            icon={ImageIcon}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Disabled here on purpose — these capabilities turn on once the GPU
          sidecar lands so we don't promise what we can't ship.
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Transcripts are deduplicated by video id before queueing.
        </p>
        <Button type="submit" size="md" disabled={start.isPending}>
          {start.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting…
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Start YouTube run
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
