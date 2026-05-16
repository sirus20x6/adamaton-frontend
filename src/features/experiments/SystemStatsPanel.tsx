/**
 * System status tiles for the training dashboard.
 *
 * Repurposes ``/platform/health/ready`` (already polled by the existing
 * SystemHealthWidget) at a faster cadence so the dashboard surfaces
 * sidecar/postgres/redis state inline. The "GPU" tile is a deliberate
 * stub — the platform doesn't currently expose nvidia-smi telemetry;
 * future work could add a route on the sidecar that proxies pynvml the
 * way the moe-mla dashboard does.
 */

import { useSystemHealth } from "@/api/system";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatRelative } from "@/lib/utils";

type TileProps = {
  label: string;
  status: "ok" | "down" | "unknown";
  detail?: string;
};

function StatusDot({ status }: { status: TileProps["status"] }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        status === "ok" && "bg-emerald-500 shadow-[0_0_6px_rgb(16_185_129/0.6)]",
        status === "down" && "bg-red-500 shadow-[0_0_6px_rgb(239_68_68/0.6)]",
        status === "unknown" && "bg-muted-foreground/60",
      )}
    />
  );
}

function Tile({ label, status, detail }: TileProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-md border border-border bg-card/40 px-3 py-1.5",
      )}
    >
      <StatusDot status={status} />
      <div className="min-w-0">
        <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "font-mono text-xs tabular-nums",
            status === "ok" && "text-emerald-300",
            status === "down" && "text-red-300",
            status === "unknown" && "text-muted-foreground",
          )}
        >
          {status === "ok" ? "ok" : status === "down" ? "down" : "—"}
          {detail && (
            <span className="ml-1.5 text-[0.65rem] text-muted-foreground">
              {detail}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function SystemStatsPanel({ className }: { className?: string }) {
  const { data, dataUpdatedAt, isFetching } = useSystemHealth(15_000);
  const deps = data?.deps;

  const lastChecked = dataUpdatedAt
    ? formatRelative(new Date(dataUpdatedAt))
    : "never";

  const sStatus = (key: keyof NonNullable<typeof deps>): TileProps["status"] => {
    if (!deps) return "unknown";
    return deps[key] ? "ok" : "down";
  };

  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-wide text-muted-foreground">
          <span>System</span>
          <span aria-live="polite">
            {isFetching ? "checking…" : `checked ${lastChecked}`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Postgres" status={sStatus("postgres")} />
          <Tile label="Redis" status={sStatus("redis")} />
          <Tile label="Sidecar" status={sStatus("sidecar")} />
          <Tile
            label="GPU"
            status="unknown"
            detail="awaiting sidecar pynvml feed"
          />
        </div>
        <div className="text-[0.65rem] text-muted-foreground">
          GPU / process telemetry not yet collected — the sidecar can expose
          nvidia-smi later to populate this tile.
        </div>
      </CardContent>
    </Card>
  );
}
