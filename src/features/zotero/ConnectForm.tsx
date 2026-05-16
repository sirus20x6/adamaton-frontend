import * as React from "react";
import axios from "axios";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  Unplug,
} from "lucide-react";

import { useZoteroConnect, type ZoteroLibraryType } from "@/api/zotero";
import type { ZoteroStatus } from "@/api/zotero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type ConnectFormProps = {
  status: ZoteroStatus | undefined;
};

const KEY_DOC_URL = "https://www.zotero.org/settings/keys";

export function ConnectForm({ status }: ConnectFormProps) {
  const { toast } = useToast();
  const connect = useZoteroConnect();

  const [apiKey, setApiKey] = React.useState("");
  const [reveal, setReveal] = React.useState(false);
  const [libraryType, setLibraryType] =
    React.useState<ZoteroLibraryType>("user");
  const [libraryId, setLibraryId] = React.useState("");
  const [localDisconnect, setLocalDisconnect] = React.useState(false);

  const connected = Boolean(status?.connected) && !localDisconnect;

  React.useEffect(() => {
    // If the upstream status flips to connected, clear any local
    // disconnect-in-flight flag so the form returns to the connected card.
    if (status?.connected) {
      setLocalDisconnect(false);
    }
  }, [status?.connected]);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedKey = apiKey.trim();
    const trimmedId = libraryId.trim();
    if (!trimmedKey || !trimmedId) return;

    connect.mutate(
      { api_key: trimmedKey, library_type: libraryType, library_id: trimmedId },
      {
        onSuccess: (resp) => {
          toast({
            title: "Connected to Zotero",
            description: `${resp.library_name} · ${resp.item_count} item${
              resp.item_count === 1 ? "" : "s"
            }`,
            variant: "success",
          });
          setApiKey("");
          setLocalDisconnect(false);
        },
        onError: (err) => {
          let detail = err.message;
          if (axios.isAxiosError(err)) {
            const status401 = err.response?.status === 401;
            const data = err.response?.data as
              | { detail?: string; message?: string }
              | undefined;
            detail =
              data?.detail ??
              data?.message ??
              (status401
                ? "API key rejected — check that the key has read access for this library."
                : err.message);
          }
          toast({
            title: "Connect failed",
            description: detail,
            variant: "error",
          });
        },
      },
    );
  };

  if (connected && status) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-3 min-w-0">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              Connected to{" "}
              <span className="text-emerald-300">
                {status.library_name ?? "your library"}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {status.item_count.toLocaleString()} item
              {status.item_count === 1 ? "" : "s"} indexed on the Zotero side.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setLocalDisconnect(true);
            toast({
              title: "Disconnected",
              description:
                "Connection cleared locally. Re-enter credentials to sync again.",
              variant: "info",
            });
          }}
        >
          <Unplug className="h-3.5 w-3.5" />
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card/40 p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="zotero-api-key"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          API key
        </label>
        <div className="relative">
          <Input
            id="zotero-api-key"
            type={reveal ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="P9aBc3…"
            autoComplete="off"
            spellCheck={false}
            className="pr-10 font-mono"
            required
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className={cn(
              "absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2",
              "items-center justify-center rounded text-muted-foreground",
              "hover:bg-accent hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            aria-label={reveal ? "Hide API key" : "Show API key"}
            title={reveal ? "Hide API key" : "Show API key"}
          >
            {reveal ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Generate one at{" "}
          <a
            href={KEY_DOC_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
          >
            zotero.org/settings/keys
            <ExternalLink className="h-3 w-3" />
          </a>
          . Read-only is enough.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Library type
        </span>
        <div
          role="radiogroup"
          aria-label="Library type"
          className="inline-flex rounded-md border border-border bg-background p-1 text-xs w-fit"
        >
          {(["user", "group"] as const).map((value) => (
            <label
              key={value}
              className={cn(
                "cursor-pointer rounded px-3 py-1 capitalize transition-colors",
                libraryType === value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name="zotero-library-type"
                value={value}
                checked={libraryType === value}
                onChange={() => setLibraryType(value)}
                className="sr-only"
              />
              {value}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="zotero-library-id"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Library id
        </label>
        <Input
          id="zotero-library-id"
          inputMode="numeric"
          pattern="[0-9]*"
          value={libraryId}
          onChange={(e) =>
            setLibraryId(e.target.value.replace(/[^0-9]/g, ""))
          }
          placeholder="123456"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          required
        />
        <p className="text-[11px] text-muted-foreground">
          {libraryType === "user"
            ? "Your numeric user id, visible on the same Zotero settings page."
            : "Numeric group id, e.g. 4567890 for a shared group library."}
        </p>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={
            connect.isPending || !apiKey.trim() || !libraryId.trim()
          }
        >
          {connect.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Verifying…
            </>
          ) : (
            "Connect"
          )}
        </Button>
      </div>
    </form>
  );
}
