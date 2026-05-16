import * as React from "react";
import {
  Apple,
  Check,
  Copy,
  Database,
  FileArchive,
  FolderOpen,
  Laptop,
  Loader2,
  MonitorSmartphone,
  Terminal,
  Upload,
  X,
} from "lucide-react";

import { useCorpora } from "@/api/library";
import { useZoteroUploadSqlite } from "@/api/zotero";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  detectPlatform,
  hasNativeFilePicker,
  pickFileNative,
  zoteroPathHint,
  type Platform,
} from "@/lib/platform";
import { cn } from "@/lib/utils";

const ACCEPTED_SQLITE = ".sqlite,.db";
const ACCEPTED_TARBALL = ".tgz,.tar.gz,.tar,.zip";

const NO_CORPUS_VALUE = "__none__";

type SqliteUploadProps = {
  onJobStarted: (jobId: string) => void;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function looksLikeSqlite(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".sqlite") || name.endsWith(".db");
}

function looksLikeTarball(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".tgz") ||
    name.endsWith(".tar.gz") ||
    name.endsWith(".tar") ||
    name.endsWith(".zip")
  );
}

type DropZoneProps = {
  label: string;
  hint: string;
  accept: string;
  icon: React.ReactNode;
  file: File | null;
  onFile: (file: File | null) => void;
  validate: (file: File) => string | null;
};

function DropZone({
  label,
  hint,
  accept,
  icon,
  file,
  onFile,
  validate,
}: DropZoneProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const { toast } = useToast();

  const handleFile = (incoming: File | null) => {
    if (!incoming) {
      onFile(null);
      return;
    }
    const reason = validate(incoming);
    if (reason) {
      toast({
        title: `Skipped ${incoming.name}`,
        description: reason,
        variant: "error",
      });
      return;
    }
    onFile(incoming);
  };

  return (
    <div
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        const incoming = event.dataTransfer.files?.[0] ?? null;
        handleFile(incoming);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      className={cn(
        "flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
        dragActive
          ? "border-primary bg-primary/5"
          : file
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-border bg-card/30 hover:border-primary/50",
      )}
    >
      {file ? (
        <>
          <div className="flex items-center gap-2 text-sm text-foreground">
            {icon}
            <span className="max-w-[18rem] truncate font-medium" title={file.name}>
              {file.name}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {formatBytes(file.size)}
          </span>
          <button
            type="button"
            onClick={() => handleFile(null)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Remove
          </button>
        </>
      ) : (
        <>
          <div className="text-muted-foreground">{icon}</div>
          <p className="text-sm">
            <span className="font-medium">{label}</span>{" "}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-primary underline-offset-2 hover:underline"
            >
              browse
            </button>
          </p>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const incoming = event.target.files?.[0] ?? null;
          handleFile(incoming);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function platformIcon(p: Platform) {
  switch (p) {
    case "macos":
      return <Apple className="h-3.5 w-3.5" aria-hidden="true" />;
    case "windows":
      return <MonitorSmartphone className="h-3.5 w-3.5" aria-hidden="true" />;
    case "linux":
      return <Terminal className="h-3.5 w-3.5" aria-hidden="true" />;
    default:
      return <Laptop className="h-3.5 w-3.5" aria-hidden="true" />;
  }
}

type DefaultPathCalloutProps = {
  onPickNative: () => Promise<void> | void;
  pickerSupported: boolean;
};

function DefaultPathCallout({
  onPickNative,
  pickerSupported,
}: DefaultPathCalloutProps) {
  const platform = React.useMemo(detectPlatform, []);
  const hint = React.useMemo(() => zoteroPathHint(platform), [platform]);
  const [copied, setCopied] = React.useState(false);
  const { toast } = useToast();

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(hint.copyPath);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Clipboard unavailable — paste it manually.",
        variant: "error",
      });
    }
  };

  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          {platformIcon(platform)}
          <span>Default location · {hint.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copy path to clipboard"
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px]",
              "text-muted-foreground transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-500 dark:text-emerald-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy path
              </>
            )}
          </button>
          {pickerSupported && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void onPickNative();
              }}
              className="h-7 px-2 text-[11px]"
            >
              <FolderOpen className="h-3 w-3" />
              Pick file…
            </Button>
          )}
        </div>
      </div>
      <code className="mt-2 block break-all rounded bg-muted/40 px-2 py-1 font-mono text-[11px] text-foreground">
        {hint.primaryPath}
      </code>
      {hint.altPath && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Older installs / Snap / Flatpak may keep it at{" "}
          <code className="rounded bg-muted/40 px-1 py-0.5 font-mono">
            {hint.altPath}
          </code>
          .
        </p>
      )}
      {hint.note && (
        <p className="mt-2 text-[11px] text-muted-foreground">{hint.note}</p>
      )}
    </div>
  );
}

export function SqliteUpload({ onJobStarted }: SqliteUploadProps) {
  const { toast } = useToast();
  const corporaQuery = useCorpora();
  const upload = useZoteroUploadSqlite();

  const [sqliteFile, setSqliteFile] = React.useState<File | null>(null);
  const [tarball, setTarball] = React.useState<File | null>(null);
  const [corpusId, setCorpusId] = React.useState<string>(NO_CORPUS_VALUE);
  const [onlyWithPdf, setOnlyWithPdf] = React.useState(false);

  const pickerSupported = React.useMemo(hasNativeFilePicker, []);

  const corpora = corporaQuery.data ?? [];

  const onPickNative = React.useCallback(async () => {
    try {
      const picked = await pickFileNative({
        "application/vnd.sqlite3": [".sqlite", ".db"],
      });
      if (!picked) return;
      const lower = picked.name.toLowerCase();
      if (!lower.endsWith(".sqlite") && !lower.endsWith(".db")) {
        toast({
          title: `Skipped ${picked.name}`,
          description: "Expected a .sqlite or .db file (Zotero's database).",
          variant: "error",
        });
        return;
      }
      setSqliteFile(picked);
    } catch (err) {
      toast({
        title: "File picker failed",
        description: (err as Error).message ?? "unknown error",
        variant: "error",
      });
    }
  }, [toast]);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sqliteFile) return;

    const form = new FormData();
    form.append("sqlite_file", sqliteFile, sqliteFile.name);
    if (tarball) {
      form.append("storage_tarball", tarball, tarball.name);
    }
    if (corpusId !== NO_CORPUS_VALUE) {
      form.append("corpus_id", corpusId);
    }
    if (onlyWithPdf) {
      form.append("only_with_pdf", "true");
    }

    upload.mutate(form, {
      onSuccess: (resp) => {
        toast({
          title: "Upload accepted",
          description: `Queued on ${resp.queue}`,
          variant: "info",
        });
        onJobStarted(resp.job_id);
        setSqliteFile(null);
        setTarball(null);
      },
      onError: (err) => {
        toast({
          title: "Upload failed",
          description: err.message,
          variant: "error",
        });
      },
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card/40 p-4"
    >
      <DefaultPathCallout
        onPickNative={onPickNative}
        pickerSupported={pickerSupported}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <DropZone
          label="Drop zotero.sqlite or"
          hint="A copy of your local Zotero database. Required."
          accept={ACCEPTED_SQLITE}
          icon={<Database className="h-6 w-6" />}
          file={sqliteFile}
          onFile={setSqliteFile}
          validate={(f) =>
            looksLikeSqlite(f)
              ? null
              : "Expected a .sqlite or .db file (Zotero's database)."
          }
        />
        <DropZone
          label="Drop storage tarball or"
          hint="Optional .tgz/.zip of Zotero's storage/ folder for attached PDFs."
          accept={ACCEPTED_TARBALL}
          icon={<FileArchive className="h-6 w-6" />}
          file={tarball}
          onFile={setTarball}
          validate={(f) =>
            looksLikeTarball(f)
              ? null
              : "Expected a .tgz, .tar.gz, .tar, or .zip archive."
          }
        />
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-background/40 p-3">
        <label
          htmlFor="zotero-sqlite-corpus"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Target corpus
        </label>
        <select
          id="zotero-sqlite-corpus"
          value={corpusId}
          onChange={(e) => setCorpusId(e.target.value)}
          disabled={corporaQuery.isLoading}
          className={cn(
            "h-9 rounded-md border border-border bg-background px-2 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <option value={NO_CORPUS_VALUE}>
            No corpus link (use server default)
          </option>
          {corpora.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.scope ? ` · ${String(c.scope)}` : ""}
            </option>
          ))}
        </select>
        <label className="mt-1 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={onlyWithPdf}
            onChange={(e) => setOnlyWithPdf(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border accent-primary"
          />
          Only include items with attached PDFs
        </label>
      </div>

      <details className="rounded-md border border-border bg-background/40 p-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer text-foreground">
          Other platforms / non-default install paths
        </summary>
        <ul className="mt-2 space-y-1 pl-4">
          <li>
            <span className="font-mono text-[11px]">macOS</span> —{" "}
            <code>~/Zotero/zotero.sqlite</code> · older:{" "}
            <code>~/Library/Application Support/Zotero/Profiles/&lt;profile&gt;/zotero.sqlite</code>
          </li>
          <li>
            <span className="font-mono text-[11px]">Linux</span> —{" "}
            <code>~/Zotero/zotero.sqlite</code> · Snap/Flatpak:{" "}
            <code>~/snap/zotero/common/Zotero/zotero.sqlite</code> or{" "}
            <code>~/.var/app/org.zotero.Zotero/Zotero/zotero.sqlite</code>
          </li>
          <li>
            <span className="font-mono text-[11px]">Windows</span> —{" "}
            <code>%USERPROFILE%\Zotero\zotero.sqlite</code> · older profile-based:{" "}
            <code>%APPDATA%\Zotero\Zotero\Profiles\&lt;profile&gt;\zotero.sqlite</code>
          </li>
        </ul>
        <p className="mt-2">
          If you've configured a custom data directory, find the path under{" "}
          <em>Zotero → Preferences → Advanced → Files and Folders</em>.
        </p>
        <p className="mt-2">
          <strong className="text-amber-700 dark:text-amber-300">
            Close Zotero before copying
          </strong>{" "}
          — SQLite uses WAL journals, and an open writer can leave the snapshot
          inconsistent. The companion <code>storage/</code> folder holds
          attachments; tar it up if you also want PDFs imported.
        </p>
      </details>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {sqliteFile
            ? `Ready to upload ${formatBytes(
                sqliteFile.size + (tarball?.size ?? 0),
              )} total.`
            : "Pick a zotero.sqlite to get started."}
        </p>
        <Button
          type="submit"
          size="md"
          disabled={!sqliteFile || upload.isPending}
        >
          {upload.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Start sync
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
