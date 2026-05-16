import * as React from "react";
import { BookMarked, Database, Globe } from "lucide-react";

import { useZoteroStatus } from "@/api/zotero";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/toast";
import { ConnectForm } from "@/features/zotero/ConnectForm";
import { ImportsTable } from "@/features/zotero/ImportsTable";
import { SqliteUpload } from "@/features/zotero/SqliteUpload";
import { SyncControls } from "@/features/zotero/SyncControls";
import { SyncProgress } from "@/features/zotero/SyncProgress";
import { formatRelative } from "@/lib/utils";

type SourceTab = "web" | "sqlite";

export default function Zotero() {
  const statusQuery = useZoteroStatus();
  const status = statusQuery.data;

  const [tab, setTab] = React.useState<SourceTab>("web");
  const [activeJobId, setActiveJobId] = React.useState<string | null>(null);

  const connected = Boolean(status?.connected);
  const lastTotals = status?.last_totals ?? null;
  const lastErrored = (lastTotals?.errored ?? 0) > 0;

  const pillVariant: "success" | "warning" | "outline" = connected
    ? lastErrored
      ? "warning"
      : "success"
    : "outline";

  const pillLabel = connected
    ? lastErrored
      ? "Connected · last sync had errors"
      : "Connected"
    : "Disconnected";

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <BookMarked className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Zotero</h1>
            <p className="text-sm text-muted-foreground">
              Import references and PDFs from your Zotero library — Web API
              for live syncs, or upload a local snapshot.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge variant={pillVariant} className="text-[0.7rem]">
            {pillLabel}
          </Badge>
          {connected ? (
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {status?.library_name ? (
                <span className="text-foreground">{status.library_name}</span>
              ) : (
                "Library"
              )}
              {" · "}
              {status?.item_count.toLocaleString() ?? 0} item
              {status?.item_count === 1 ? "" : "s"}
              {status?.last_sync_at ? (
                <> · last sync {formatRelative(status.last_sync_at)}</>
              ) : (
                <> · never synced</>
              )}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              No Zotero credentials saved yet.
            </p>
          )}
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as SourceTab)}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <TabsList className="self-start">
          <TabsTrigger value="web" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            Web API
          </TabsTrigger>
          <TabsTrigger value="sqlite" className="gap-1.5">
            <Database className="h-3.5 w-3.5" />
            Local SQLite
          </TabsTrigger>
        </TabsList>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
          <TabsContent value="web" className="m-0 flex flex-col gap-4">
            <ConnectForm status={status} />
            <SyncControls
              activeJobId={activeJobId}
              onJobStarted={setActiveJobId}
              disabled={!connected}
            />
            <SyncProgress
              jobId={activeJobId}
              onDismiss={() => setActiveJobId(null)}
            />
          </TabsContent>

          <TabsContent value="sqlite" className="m-0 flex flex-col gap-4">
            <SqliteUpload onJobStarted={setActiveJobId} />
            <SyncProgress
              jobId={activeJobId}
              onDismiss={() => setActiveJobId(null)}
            />
          </TabsContent>

          <section className="flex flex-col gap-2 border-t border-border pt-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-tight">
                Import history
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Most recent first. Filter by ingest status.
              </p>
            </div>
            <ImportsTable />
          </section>
        </div>
      </Tabs>

      <Toaster />
    </section>
  );
}
