import { ChevronsUpDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const ALL_SESSIONS = "__all__";

export type SessionOption = {
  id: string;
  count: number;
  bestValBpb: number | null;
};

type Props = {
  value: string;
  options: readonly SessionOption[];
  onChange: (v: string) => void;
  className?: string;
};

function shortId(id: string): string {
  if (id === ALL_SESSIONS) return "All sessions";
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export function SessionPicker({ value, options, onChange, className }: Props) {
  const current =
    value === ALL_SESSIONS
      ? "All sessions"
      : (options.find((o) => o.id === value)?.id ?? value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn("h-8 gap-2 border border-border px-2 text-xs", className)}
        >
          <span className="text-muted-foreground">Session:</span>
          <span className="font-mono">{shortId(current)}</span>
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>Filter by session</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          <DropdownMenuRadioItem value={ALL_SESSIONS}>
            All sessions
          </DropdownMenuRadioItem>
          {options.length === 0 && (
            <DropdownMenuItem disabled>No sessions tagged</DropdownMenuItem>
          )}
          {options.map((opt) => (
            <DropdownMenuRadioItem key={opt.id} value={opt.id}>
              <span className="flex w-full items-center justify-between gap-3">
                <span className="font-mono text-xs">{shortId(opt.id)}</span>
                <span className="text-[0.65rem] text-muted-foreground tabular-nums">
                  {opt.count} runs
                  {opt.bestValBpb !== null && ` · best ${opt.bestValBpb.toFixed(3)}`}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
