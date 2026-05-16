import { ArrowRight, Plug } from "lucide-react";
import { Link } from "react-router-dom";

import type { PluginCapability, PluginManifest } from "@/api/plugins";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const CAPABILITY_LABEL: Record<PluginCapability, string> = {
  fetch_one: "fetch one",
  fetch_channel: "channel",
  fetch_playlist: "playlist",
  fetch_audio: "audio",
  fetch_video: "video",
  fetch_snapshots: "snapshots",
};

export type PluginCardProps = {
  plugin: PluginManifest;
};

export function PluginCard({ plugin }: PluginCardProps) {
  const target = `/plugins/${encodeURIComponent(plugin.id)}`;
  return (
    <Card className="flex h-full flex-col bg-card/60">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Plug className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate" title={plugin.name}>
              {plugin.name}
            </CardTitle>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {plugin.id}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <CardDescription className="flex-1 leading-relaxed">
          {plugin.description || "No description provided."}
        </CardDescription>
        {plugin.capabilities.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {plugin.capabilities.map((cap) => (
              <Badge key={cap} variant="outline" className="font-mono">
                {CAPABILITY_LABEL[cap] ?? cap}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No capabilities advertised.
          </p>
        )}
        <Button asChild size="sm" className="self-start">
          <Link to={target}>
            Configure run
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
