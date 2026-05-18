import { ChevronDown, ChevronRight } from "lucide-react";
import * as React from "react";

import {
  type InstanceStatus,
  type RoleStatus,
  statusColorClass,
  statusLabel,
} from "@/api/health";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RolesTableProps {
  roles: RoleStatus[];
  instances?: InstanceStatus[];
  highlight?: string;
}

/**
 * Roles table — one row per role, expandable to show the instances
 * under that role. Quorum shown as healthy/min_healthy with a dot
 * coloured by the role's rolled-up status.
 */
export function RolesTable({ roles, instances = [], highlight }: RolesTableProps) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const byRole = React.useMemo(() => {
    const map: Record<string, InstanceStatus[]> = {};
    for (const inst of instances) {
      (map[inst.role] ||= []).push(inst);
    }
    return map;
  }, [instances]);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-900 text-xs uppercase text-slate-500">
          <tr>
            <th className="w-8" />
            <th className="px-3 py-2 text-left font-medium">role</th>
            <th className="px-3 py-2 text-left font-medium">kind</th>
            <th className="px-3 py-2 text-left font-medium">healthy / desired</th>
            <th className="px-3 py-2 text-left font-medium">status</th>
            <th className="px-3 py-2 text-left font-medium">instances</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => {
            const colors = statusColorClass(role.status);
            const isOpen = expanded[role.name] ?? highlight === role.name;
            const rowInstances = byRole[role.name] || [];
            return (
              <React.Fragment key={role.name}>
                <tr
                  id={`role-${role.name}`}
                  className={cn(
                    "border-t border-slate-200 dark:border-slate-800",
                    highlight === role.name && "bg-slate-50 dark:bg-slate-900/60",
                    "hover:bg-slate-50 dark:hover:bg-slate-900/40 cursor-pointer",
                  )}
                  onClick={() =>
                    setExpanded((s) => ({ ...s, [role.name]: !isOpen }))
                  }
                >
                  <td className="pl-3 py-2">
                    {isOpen ? (
                      <ChevronDown className="size-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="size-4 text-slate-400" />
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {role.name}
                    {role.optional && (
                      <span className="ml-2 text-[10px] text-slate-400 font-sans">
                        optional
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      {role.kind}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {role.healthy}/{role.min_healthy}
                    {role.running !== role.healthy && (
                      <span className="ml-1 text-slate-400">
                        (of {role.running} running)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs",
                        colors.text,
                      )}
                    >
                      <span className={cn("size-2 rounded-full", colors.dot)} />
                      {statusLabel(role.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {role.instances.length === 0
                      ? "—"
                      : role.instances.slice(0, 2).join(", ")}
                    {role.instances.length > 2 && (
                      <span className="ml-1 text-slate-400">
                        +{role.instances.length - 2}
                      </span>
                    )}
                  </td>
                </tr>
                {isOpen && rowInstances.length > 0 && (
                  <tr className="bg-slate-50/60 dark:bg-slate-900/30">
                    <td />
                    <td colSpan={5} className="px-3 py-2">
                      <InstanceTable instances={rowInstances} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InstanceTable({ instances }: { instances: InstanceStatus[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-slate-500">
        <tr>
          <th className="text-left font-medium pr-3 py-1">host</th>
          <th className="text-left font-medium pr-3 py-1">container</th>
          <th className="text-left font-medium pr-3 py-1">image</th>
          <th className="text-left font-medium pr-3 py-1">status</th>
          <th className="text-left font-medium pr-3 py-1">latency</th>
          <th className="text-left font-medium pr-3 py-1">detail</th>
        </tr>
      </thead>
      <tbody>
        {instances.map((inst, i) => {
          const colors = statusColorClass(inst.status);
          return (
            <tr
              key={`${inst.host}/${inst.container || inst.role}/${i}`}
              className="border-t border-slate-200/60 dark:border-slate-800/60"
            >
              <td className="pr-3 py-1 font-mono">{inst.host}</td>
              <td className="pr-3 py-1 font-mono">
                {inst.container || "—"}
              </td>
              <td className="pr-3 py-1 font-mono truncate max-w-md">
                {inst.image ? abbreviateImage(inst.image) : "—"}
              </td>
              <td className="pr-3 py-1">
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    colors.text,
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", colors.dot)} />
                  {statusLabel(inst.status)}
                </span>
              </td>
              <td className="pr-3 py-1 font-mono text-slate-500">
                {inst.latency_ms > 0 ? `${inst.latency_ms.toFixed(1)}ms` : "—"}
              </td>
              <td className="pr-3 py-1 text-slate-500 truncate max-w-md">
                {inst.detail || "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function abbreviateImage(image: string): string {
  // Strip the registry prefix for readability: 10.0.4.37:5000/foo:bar -> foo:bar
  const colonSlash = image.lastIndexOf("/");
  if (colonSlash > 0) {
    return image.slice(colonSlash + 1);
  }
  return image;
}
