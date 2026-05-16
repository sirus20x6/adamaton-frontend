import { useState } from "react";
import { Download, FileJson, FileSpreadsheet, Loader2 } from "lucide-react";

import type { Experiment } from "@/api/experiments";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";

type RowProvider = () => Promise<readonly Experiment[]> | readonly Experiment[];

type Props = {
  /** Either the literal rows (already filtered + sorted) or a function that
   *  returns them — useful when the parent wants to lazily compute the slice. */
  rows: readonly Experiment[] | RowProvider;
  /** Disabled state — for example, while the parent is loading. */
  disabled?: boolean;
  /** Optional filename prefix; defaults to "experiments". */
  filenamePrefix?: string;
};

const CSV_HEADERS = [
  "id",
  "name",
  "status",
  "val_bpb",
  "peak_memory_mb",
  "parent_id",
  "agent_session_id",
  "commit_hash",
  "started_at",
  "finished_at",
  "tags",
  "hypothesis",
] as const;

/** RFC-4180 escape: wrap in quotes when a field contains comma, quote, or
 *  newline; double up internal quotes. We always wrap the multi-line
 *  hypothesis to keep CSV readers from confusing newlines for record breaks. */
function csvField(v: unknown, alwaysQuote = false): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  const mustQuote = alwaysQuote || /[",\n\r]/.test(s);
  if (!mustQuote) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows: readonly Experiment[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvField(r.id),
        csvField(r.name),
        csvField(r.status),
        csvField(r.val_bpb ?? ""),
        csvField(r.peak_memory_mb ?? ""),
        csvField(r.parent_id ?? ""),
        csvField(r.agent_session_id ?? ""),
        csvField(r.commit_hash ?? ""),
        csvField(r.started_at),
        csvField(r.finished_at ?? ""),
        csvField(r.tags.join(";")),
        csvField(r.hypothesis ?? "", true),
      ].join(","),
    );
  }
  return lines.join("\n");
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke async so Safari has time to start the download before we yank the
  // backing buffer out from under it.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportButton({
  rows,
  disabled,
  filenamePrefix = "experiments",
}: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const getRows = async (): Promise<readonly Experiment[]> =>
    typeof rows === "function" ? rows() : rows;

  const exportAs = async (format: "csv" | "json") => {
    setBusy(true);
    try {
      const data = await getRows();
      if (data.length === 0) {
        toast({
          title: "Nothing to export",
          description: "No experiments match the current filters.",
          variant: "info",
        });
        return;
      }
      const filename = `${filenamePrefix}-${timestamp()}.${format}`;
      if (format === "csv") {
        const blob = new Blob([rowsToCsv(data)], {
          type: "text/csv;charset=utf-8",
        });
        triggerDownload(blob, filename);
      } else {
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json;charset=utf-8",
        });
        triggerDownload(blob, filename);
      }
      toast({
        title: `Exported ${data.length} ${data.length === 1 ? "row" : "rows"}`,
        description: filename,
        variant: "success",
      });
    } catch (e) {
      toast({
        title: "Export failed",
        description: String((e as Error)?.message ?? "unknown error"),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled || busy}
          aria-label="Export experiments"
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>Visible rows</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void exportAs("csv");
          }}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void exportAs("json");
          }}
        >
          <FileJson className="h-3.5 w-3.5" />
          Export as JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
