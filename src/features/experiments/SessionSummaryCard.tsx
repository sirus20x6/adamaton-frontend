import { Activity, Clock, FlaskConical, Trophy } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatRelative, cn } from "@/lib/utils";

type Stat = {
  icon: typeof FlaskConical;
  label: string;
  value: string;
  hint?: string;
};

export function SessionSummaryCard({
  count,
  bestValBpb,
  latestValBpb,
  startedAt,
  lastActiveAt,
  scopeLabel,
  className,
}: {
  count: number;
  bestValBpb: number | null;
  latestValBpb: number | null;
  startedAt: string | null;
  lastActiveAt: string | null;
  scopeLabel: string;
  className?: string;
}) {
  const stats: Stat[] = [
    {
      icon: FlaskConical,
      label: "Experiments",
      value: count.toLocaleString(),
      hint: scopeLabel,
    },
    {
      icon: Trophy,
      label: "Best val_bpb",
      value: bestValBpb !== null ? bestValBpb.toFixed(3) : "—",
      hint: bestValBpb !== null ? "lower is better" : undefined,
    },
    {
      icon: Activity,
      label: "Latest val_bpb",
      value: latestValBpb !== null ? latestValBpb.toFixed(3) : "—",
      hint:
        latestValBpb !== null && bestValBpb !== null
          ? `Δ ${(latestValBpb - bestValBpb).toFixed(3)} vs best`
          : undefined,
    },
    {
      icon: Clock,
      label: "Last active",
      value: formatRelative(lastActiveAt),
      hint: startedAt ? `started ${formatRelative(startedAt)}` : undefined,
    },
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4", className)}>
      {stats.map(({ icon: Icon, label, value, hint }) => (
        <Card key={label}>
          <CardContent className="flex flex-col gap-1.5 p-4">
            <div className="flex items-center gap-2 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </div>
            <div className="font-mono text-2xl tabular-nums">{value}</div>
            {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
