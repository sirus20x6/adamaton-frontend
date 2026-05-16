import { AlertTriangle, ArrowUpRight, Bot, Globe, Workflow, Cog } from "lucide-react";

import type { ExecutorKind, NodeSource, WorkflowNode } from "@/api/connectors";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/* Source → badge variant + label. n8n gets "secondary" so it pops a
 * touch over the muted builtin entries, which dominate the catalog. */
const SOURCE_META: Record<
  NodeSource,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  builtin: { label: "Builtin", variant: "outline" },
  community: { label: "Community", variant: "default" },
  n8n: { label: "n8n", variant: "secondary" },
};

const EXECUTOR_META: Record<ExecutorKind, { label: string; Icon: typeof Bot }> = {
  agent_prompt: { label: "Agent", Icon: Bot },
  http_request: { label: "HTTP", Icon: Globe },
  n8n_bridge: { label: "n8n bridge", Icon: Workflow },
  go_function: { label: "Go func", Icon: Cog },
};

export interface ConnectorCardProps {
  node: WorkflowNode;
  onSelect?: (node: WorkflowNode) => void;
}

export function ConnectorCard({ node, onSelect }: ConnectorCardProps) {
  const sourceMeta = SOURCE_META[node.source] ?? SOURCE_META.builtin;
  const exec = EXECUTOR_META[node.executor.type] ?? {
    label: node.executor.type,
    Icon: Cog,
  };
  const ExecutorIcon = exec.Icon;
  const broken = (node.parseErrors?.length ?? 0) > 0;
  const requiredCount = node.properties.filter((p) => p.required).length;
  const totalProps = node.properties.length;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(node)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(node);
        }
      }}
      className={cn(
        "group flex h-full cursor-pointer flex-col bg-card/60 transition-colors hover:bg-card/80 focus-visible:bg-card/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
        broken && "border-amber-500/40",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xl"
            aria-hidden
          >
            {node.icon || "🧩"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <CardTitle className="truncate" title={node.displayName}>
                {node.displayName || node.name}
              </CardTitle>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {node.name}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <CardDescription className="flex-1 leading-relaxed">
          {node.description || "No description provided."}
        </CardDescription>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={sourceMeta.variant}>{sourceMeta.label}</Badge>
          {node.category ? (
            <Badge variant="outline">{node.category}</Badge>
          ) : null}
          <Badge variant="outline" className="gap-1">
            <ExecutorIcon className="h-3 w-3" aria-hidden />
            {exec.label}
          </Badge>
          {node.mutating ? (
            <Badge variant="warning" title="Side-effects: runs with retry=1">
              mutating
            </Badge>
          ) : null}
          {broken ? (
            <Badge variant="danger" className="gap-1" title={node.parseErrors?.join("\n")}>
              <AlertTriangle className="h-3 w-3" aria-hidden />
              broken
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {totalProps} input{totalProps === 1 ? "" : "s"}
            {requiredCount > 0 ? ` · ${requiredCount} required` : ""}
          </span>
          {node.output_type ? (
            <span className="font-mono">→ {node.output_type}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
