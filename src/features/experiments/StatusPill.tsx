import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { ExperimentStatus } from "@/api/experiments";
import { cn } from "@/lib/utils";

const VARIANT: Record<ExperimentStatus, BadgeProps["variant"]> = {
  pending: "outline",
  running: "warning",
  succeeded: "success",
  failed: "danger",
  interrupted: "warning",
};

const LABEL: Record<ExperimentStatus, string> = {
  pending: "Pending",
  running: "Running",
  succeeded: "Done",
  failed: "Failed",
  interrupted: "Stopped",
};

export function StatusPill({
  status,
  className,
}: {
  status: ExperimentStatus;
  className?: string;
}) {
  const isRunning = status === "running";
  return (
    <Badge variant={VARIANT[status]} className={cn(className)}>
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          status === "succeeded" && "bg-emerald-400",
          status === "running" && "bg-amber-400 animate-pulse-soft",
          status === "failed" && "bg-red-400",
          status === "interrupted" && "bg-orange-400",
          status === "pending" && "bg-muted-foreground",
        )}
      />
      {LABEL[status]}
      {isRunning && <span className="sr-only"> (in progress)</span>}
    </Badge>
  );
}
