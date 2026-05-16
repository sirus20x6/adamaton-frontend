import * as React from "react";
import {
  Wrench,
  Loader2,
  Search as SearchIcon,
  X,
  Sparkles,
  GitBranch,
  Network,
  Layers,
  Boxes,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Save,
  Pencil,
} from "lucide-react";

import {
  useSkills,
  useRAECommunities,
  useRAECommunitySkills,
  useRAESubunits,
  useDeleteSkill,
  usePatchSkill,
  useCheckSkillSource,
  useRAECompileMutation,
  type Skill,
  type SkillCommunity,
  type CommunitySkillRow,
  type SubunitRow,
  type RAECompileResponse,
} from "@/api/skills";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster, useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/* ── small helpers ─────────────────────────────────────────────────────── */

// 200ms is the keystroke vs render budget tradeoff used elsewhere in the
// SPA (Memory.tsx). Long enough that filtering doesn't flicker, short
// enough that the user doesn't feel the lag.
function useDebounced<T>(value: T, delay = 200): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

function kindBadgeVariant(
  kind: string,
): "default" | "secondary" | "success" | "warning" | "danger" | "outline" {
  switch (kind) {
    case "procedural":
      return "default";
    case "element":
      return "secondary";
    case "constraint":
      return "warning";
    default:
      return "outline";
  }
}

function originBadgeVariant(
  origin: string,
): "default" | "secondary" | "success" | "warning" | "danger" | "outline" {
  switch (origin) {
    case "manual":
      return "default";
    case "github":
      return "secondary";
    case "claude-files":
      return "success";
    case "mined":
      return "outline";
    default:
      return "outline";
  }
}

/* ── main page ─────────────────────────────────────────────────────────── */

export default function Skills() {
  const [tab, setTab] = React.useState<
    "skills" | "communities" | "subunits" | "debug"
  >("skills");

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card/40">
          <Wrench className="h-5 w-5 text-primary" />
        </div>
        <div className="flex flex-col">
          <h1 className="text-lg font-semibold text-foreground">Skills</h1>
          <p className="text-xs text-muted-foreground">
            Reusable procedural artifacts. SkillRAE multi-level graph: skill ←
            subunit, skill ∈ community, with cosine + cross-encoder rerank.
          </p>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="skills">
            <Boxes className="mr-1.5 h-3.5 w-3.5" /> Skills
          </TabsTrigger>
          <TabsTrigger value="communities">
            <Network className="mr-1.5 h-3.5 w-3.5" /> Communities
          </TabsTrigger>
          <TabsTrigger value="subunits">
            <Layers className="mr-1.5 h-3.5 w-3.5" /> Subunits
          </TabsTrigger>
          <TabsTrigger value="debug">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> RAE Debug
          </TabsTrigger>
        </TabsList>

        <TabsContent value="skills" className="flex-1 min-h-0">
          <SkillsTab />
        </TabsContent>
        <TabsContent value="communities" className="flex-1 min-h-0">
          <CommunitiesTab />
        </TabsContent>
        <TabsContent value="subunits" className="flex-1 min-h-0">
          <SubunitsTab />
        </TabsContent>
        <TabsContent value="debug" className="flex-1 min-h-0">
          <DebugTab />
        </TabsContent>
      </Tabs>

      <Toaster />
    </section>
  );
}

/* ── Skills tab: list/grid + filters + detail panel ───────────────────── */

function SkillsTab() {
  const [search, setSearch] = React.useState("");
  const [community, setCommunity] = React.useState<string>("");
  const [origin, setOrigin] = React.useState<string>("");
  const debouncedSearch = useDebounced(search, 200);

  const skillsQuery = useSkills({
    q: debouncedSearch || undefined,
    community: community || undefined,
    origin: origin || undefined,
  });
  const skills = skillsQuery.data ?? [];

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = React.useMemo(
    () => skills.find((s) => s.id === selectedId) ?? null,
    [skills, selectedId],
  );

  // Build distinct community + origin lists for the filter dropdowns.
  const communities = React.useMemo(() => {
    const set = new Set<string>();
    for (const s of skills) if (s.community) set.add(s.community);
    return Array.from(set).sort();
  }, [skills]);
  const origins = React.useMemo(() => {
    const set = new Set<string>();
    for (const s of skills) set.add(s.origin);
    return Array.from(set).sort();
  }, [skills]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-64">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or description…"
            className="pl-8"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <select
          className="rounded-md border border-border bg-card/40 px-2 py-1.5 text-sm text-foreground"
          value={community}
          onChange={(e) => setCommunity(e.target.value)}
        >
          <option value="">All communities</option>
          {communities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-border bg-card/40 px-2 py-1.5 text-sm text-foreground"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
        >
          <option value="">All origins</option>
          {origins.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <div className="ml-auto text-xs text-muted-foreground">
          {skillsQuery.isLoading
            ? "Loading…"
            : `${skills.length} skill${skills.length === 1 ? "" : "s"}`}
        </div>
      </div>

      {skillsQuery.isError ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-200">
          {skillsQuery.error instanceof Error
            ? skillsQuery.error.message
            : "Failed to load skills"}
        </div>
      ) : null}

      <div className="grid flex-1 min-h-0 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[1fr_22rem]">
        <div className="overflow-auto rounded-md border border-border">
          <ul className="divide-y divide-border">
            {skills.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "cursor-pointer p-3 hover:bg-accent/40",
                  selectedId === s.id && "bg-accent/50",
                )}
                onClick={() => setSelectedId(s.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {s.name}
                  </span>
                  {s.community ? (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {s.community}
                    </Badge>
                  ) : null}
                  {s.drift_detected ? (
                    <Badge variant="warning" className="text-[10px]">
                      drift
                    </Badge>
                  ) : null}
                  {!s.rae_indexed_at ? (
                    <Badge variant="outline" className="text-[10px]">
                      not indexed
                    </Badge>
                  ) : null}
                  <Badge
                    variant={originBadgeVariant(s.origin)}
                    className="ml-auto text-[10px]"
                  >
                    {s.origin}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {s.description}
                </p>
                {s.tags.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.tags.slice(0, 6).map((t) => (
                      <span
                        key={t}
                        className="rounded-sm bg-card/60 px-1 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
            {!skillsQuery.isLoading && skills.length === 0 ? (
              <li className="p-6 text-center text-sm text-muted-foreground">
                No skills match these filters.
              </li>
            ) : null}
          </ul>
        </div>

        <SkillDetail skill={selected} onClose={() => setSelectedId(null)} />
      </div>
    </div>
  );
}

/* ── Skill detail panel + Edit modal ──────────────────────────────────── */

function SkillDetail({ skill, onClose }: { skill: Skill | null; onClose: () => void }) {
  const { toast } = useToast();
  const deleteSkill = useDeleteSkill();
  const checkSource = useCheckSkillSource();
  const [editing, setEditing] = React.useState(false);

  if (!skill) {
    return (
      <div className="hidden lg:flex items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        Select a skill to see its details.
      </div>
    );
  }

  const handleDelete = async () => {
    if (!confirm(`Delete skill "${skill.name}"?`)) return;
    try {
      await deleteSkill.mutateAsync(skill.id);
      toast({ title: "Skill deleted", variant: "success" });
      onClose();
    } catch (e) {
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "error",
      });
    }
  };

  const handleCheckSource = async () => {
    try {
      const res = await checkSource.mutateAsync(skill.id);
      toast({
        title: res.drift_detected ? "Drift detected" : "Source matches",
        description: res.message,
        variant: res.drift_detected ? "error" : "success",
      });
    } catch (e) {
      toast({
        title: "Check failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "error",
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card/40">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {skill.name}
          </span>
          {skill.usage_count != null && skill.usage_count > 0 ? (
            <Badge variant="success" className="text-[10px]">
              used {skill.usage_count}×
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            className="h-7 px-2"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {skill.source_url ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCheckSource}
              disabled={checkSource.isPending}
              className="h-7 px-2"
              title="Check source drift"
            >
              {checkSource.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDelete}
            disabled={deleteSkill.isPending}
            className="h-7 px-2 text-red-400 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="h-7 px-2"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 space-y-3 overflow-auto p-3 text-sm">
        <p className="text-foreground">{skill.description}</p>

        <div className="flex flex-wrap gap-2 text-xs">
          {skill.community ? (
            <Badge variant="outline">community: {skill.community}</Badge>
          ) : null}
          <Badge variant={originBadgeVariant(skill.origin)}>
            origin: {skill.origin}
          </Badge>
          {skill.rae_indexed_at ? (
            <Badge variant="success">
              indexed {new Date(skill.rae_indexed_at).toLocaleDateString()}
            </Badge>
          ) : (
            <Badge variant="outline">not indexed</Badge>
          )}
          {skill.drift_detected ? (
            <Badge variant="warning">
              <AlertTriangle className="mr-1 h-3 w-3" /> drift detected
            </Badge>
          ) : null}
        </div>

        {skill.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {skill.tags.map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        ) : null}

        {skill.when_to_use ? (
          <DetailSection title="When to use" body={skill.when_to_use} />
        ) : null}
        {skill.example ? (
          <DetailSection title="Example" body={skill.example} />
        ) : null}

        <DetailSection title="Body" body={skill.body} mono />

        <div className="text-xs text-muted-foreground">
          {skill.source_url ? (
            <div>
              source:{" "}
              <a
                href={skill.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {skill.source_url}
              </a>
            </div>
          ) : null}
          <div>created {new Date(skill.created_at).toLocaleString()}</div>
          <div>updated {new Date(skill.updated_at).toLocaleString()}</div>
        </div>
      </div>

      {editing ? (
        <EditSkillDialog
          skill={skill}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}

function DetailSection({
  title,
  body,
  mono = false,
}: {
  title: string;
  body: string;
  mono?: boolean;
}) {
  return (
    <section className="rounded-md border border-border bg-background/40 p-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div
        className={cn(
          "whitespace-pre-wrap text-xs text-foreground",
          mono && "font-mono text-[11px]",
        )}
      >
        {body}
      </div>
    </section>
  );
}

function EditSkillDialog({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const { toast } = useToast();
  const patch = usePatchSkill();
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [community, setCommunity] = React.useState(skill.community ?? "");
  const [whenToUse, setWhenToUse] = React.useState(skill.when_to_use ?? "");
  const [example, setExample] = React.useState(skill.example ?? "");
  const [body, setBody] = React.useState(skill.body);
  const [tags, setTags] = React.useState(skill.tags.join(", "));

  const save = async () => {
    try {
      await patch.mutateAsync({
        id: skill.id,
        input: {
          name,
          description,
          body,
          when_to_use: whenToUse || undefined,
          example: example || undefined,
          community: community || undefined,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      });
      toast({ title: "Saved", variant: "success" });
      onClose();
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "error",
      });
    }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit “{skill.name}”</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <LabeledInput label="Name" value={name} onChange={setName} />
          <LabeledInput
            label="Description"
            value={description}
            onChange={setDescription}
          />
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              label="Community"
              value={community}
              onChange={setCommunity}
            />
            <LabeledInput
              label="Tags (comma-separated)"
              value={tags}
              onChange={setTags}
            />
          </div>
          <LabeledTextarea
            label="When to use"
            value={whenToUse}
            onChange={setWhenToUse}
            rows={2}
          />
          <LabeledTextarea
            label="Example"
            value={example}
            onChange={setExample}
            rows={3}
          />
          <LabeledTextarea label="Body" value={body} onChange={setBody} rows={10} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={patch.isPending}>
            {patch.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="font-mono text-[11px]"
      />
    </label>
  );
}

/* ── Communities tab ───────────────────────────────────────────────────── */

function CommunitiesTab() {
  const query = useRAECommunities();
  const list = query.data ?? [];
  const [openId, setOpenId] = React.useState<string | null>(null);
  const openCommunity = list.find((c) => c.id === openId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <GitBranch className="h-3.5 w-3.5" />
        {query.isLoading
          ? "Loading communities…"
          : `${list.length} communities (KMeans on bge-m3 skill embeddings) — click a card for members`}
      </div>
      {query.isError ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-200">
          {query.error instanceof Error ? query.error.message : "Failed"}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 overflow-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((c) => (
          <CommunityCard
            key={c.id}
            community={c}
            onClick={() => setOpenId(c.id)}
          />
        ))}
      </div>
      {openCommunity ? (
        <CommunityMembersDialog
          community={openCommunity}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
}

function CommunityCard({
  community,
  onClick,
}: {
  community: SkillCommunity;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-border bg-card/40 p-3 text-left transition-colors hover:border-primary/50 hover:bg-card/60 focus-visible:border-primary focus-visible:outline-none"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="truncate font-mono text-xs text-foreground">
          {community.label}
        </span>
        <Badge variant="success" className="text-[10px]">
          {community.member_count}
        </Badge>
      </div>
      <p className="text-[10px] text-muted-foreground">
        computed {new Date(community.computed_at).toLocaleString()}
      </p>
    </button>
  );
}

function CommunityMembersDialog({
  community,
  onClose,
}: {
  community: SkillCommunity;
  onClose: () => void;
}) {
  const query = useRAECommunitySkills(community.id);
  const members = query.data ?? [];
  const [filter, setFilter] = React.useState("");
  const debounced = useDebounced(filter, 150);
  const filtered = React.useMemo(() => {
    if (!debounced) return members;
    const q = debounced.toLowerCase();
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q),
    );
  }, [members, debounced]);

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            <span className="font-mono">{community.label}</span>
            <Badge variant="success" className="text-[10px]">
              {community.member_count} member{community.member_count === 1 ? "" : "s"}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter members…"
            className="pl-8"
          />
        </div>
        <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
          {query.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading members…
            </div>
          ) : query.isError ? (
            <div className="p-3 text-sm text-red-200">
              {query.error instanceof Error ? query.error.message : "Failed"}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {debounced ? "No members match this filter." : "No members."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((m) => (
                <CommunityMemberRow key={m.id} member={m} />
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <div className="mr-auto text-xs text-muted-foreground">
            {filtered.length === members.length
              ? `${members.length} total`
              : `${filtered.length} of ${members.length} shown`}
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommunityMemberRow({ member }: { member: CommunitySkillRow }) {
  return (
    <li className="p-2.5">
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground">
          {member.name}
        </span>
        {member.drift_detected ? (
          <Badge variant="warning" className="text-[10px]">
            drift
          </Badge>
        ) : null}
        {!member.rae_indexed_at ? (
          <Badge variant="outline" className="text-[10px]">
            not indexed
          </Badge>
        ) : null}
        <Badge
          variant={originBadgeVariant(member.origin)}
          className="ml-auto text-[10px]"
        >
          {member.origin}
        </Badge>
      </div>
      {member.description ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {member.description}
        </p>
      ) : null}
    </li>
  );
}

/* ── Subunits tab ──────────────────────────────────────────────────────── */

function SubunitsTab() {
  const skillsQuery = useSkills({});
  const skills = skillsQuery.data ?? [];
  const [selectedId, setSelectedId] = React.useState<string>("");
  const subunitsQuery = useRAESubunits(selectedId);
  const subs = subunitsQuery.data ?? [];

  // Default to the first skill once data loads so the tab isn't empty.
  React.useEffect(() => {
    if (!selectedId && skills.length > 0) {
      const first = skills[0];
      if (first) setSelectedId(first.id);
    }
  }, [skills, selectedId]);

  const grouped = React.useMemo(() => {
    const out: Record<string, SubunitRow[]> = {
      procedural: [],
      element: [],
      constraint: [],
    };
    for (const s of subs) {
      (out[s.kind] ??= []).push(s);
    }
    return out;
  }, [subs]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <select
          className="rounded-md border border-border bg-card/40 px-2 py-1.5 text-sm text-foreground min-w-64"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {skills.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {subunitsQuery.isLoading
            ? "Loading…"
            : `${subs.length} subunits in this skill`}
        </span>
      </div>

      {subunitsQuery.isError ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-200">
          {subunitsQuery.error instanceof Error
            ? subunitsQuery.error.message
            : "Failed"}
        </div>
      ) : null}

      <div className="grid flex-1 min-h-0 grid-cols-1 gap-3 overflow-auto md:grid-cols-3">
        {(["procedural", "element", "constraint"] as const).map((k) => (
          <div
            key={k}
            className="flex min-h-0 flex-col rounded-md border border-border bg-card/40"
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Badge variant={kindBadgeVariant(k)} className="text-[10px]">
                {k}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {grouped[k]?.length ?? 0}
              </span>
            </div>
            <ul className="flex-1 divide-y divide-border overflow-auto">
              {(grouped[k] ?? []).map((s) => (
                <li key={s.id} className="p-2 text-xs">
                  <p className="text-foreground">{s.content}</p>
                  <p className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>idf {s.idf.toFixed(2)}</span>
                    <span>·</span>
                    <span>shared across {s.edge_count} skill{s.edge_count === 1 ? "" : "s"}</span>
                    {s.line_no ? (
                      <>
                        <span>·</span>
                        <span>line {s.line_no}</span>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
              {(grouped[k] ?? []).length === 0 ? (
                <li className="p-3 text-center text-[10px] text-muted-foreground">
                  No {k} subunits in this skill.
                </li>
              ) : null}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── RAE Debug tab ─────────────────────────────────────────────────────── */

function DebugTab() {
  const [query, setQuery] = React.useState("rename a function in a python file");
  const [topK, setTopK] = React.useState(5);
  const [budget, setBudget] = React.useState(1500);
  const compile = useRAECompileMutation();
  const [last, setLast] = React.useState<RAECompileResponse | null>(null);

  const run = async () => {
    try {
      const res = await compile.mutateAsync({
        query,
        top_k: topK,
        budget_tokens: budget,
      });
      setLast(res);
    } catch (e) {
      setLast(null);
      console.error(e);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-card/40 p-3">
        <label className="flex flex-1 min-w-64 flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Query</span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">top_k</span>
          <Input
            type="number"
            min={1}
            max={20}
            value={topK}
            onChange={(e) => setTopK(parseInt(e.target.value, 10) || 5)}
            className="w-20"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">budget_tokens</span>
          <Input
            type="number"
            min={200}
            max={5000}
            step={100}
            value={budget}
            onChange={(e) => setBudget(parseInt(e.target.value, 10) || 1500)}
            className="w-24"
          />
        </label>
        <Button onClick={run} disabled={compile.isPending}>
          {compile.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Compile
        </Button>
      </div>

      {compile.isError ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-200">
          {compile.error instanceof Error
            ? compile.error.message
            : "Compile failed"}
        </div>
      ) : null}

      {last ? <DebugResult result={last} /> : (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
          Enter a query and press Compile.
        </div>
      )}
    </div>
  );
}

function DebugResult({ result }: { result: RAECompileResponse }) {
  const d = result.diagnostics;
  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden">
      <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
        <Stat label="bottom-up hits" value={String(d.bottom_up_hits)} />
        <Stat label="ℓ₁ hits" value={String(d.l1_hits)} />
        <Stat label="rescue attached" value={String(result.rescue_attached.length)} />
        <Stat
          label="total ms"
          value={String(
            Object.values(d.stage_ms || {}).reduce((a, b) => a + b, 0),
          )}
        />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-muted-foreground">top-down communities:</span>
        {d.top_down_labels.length === 0 ? (
          <span className="text-muted-foreground">(none)</span>
        ) : (
          d.top_down_labels.map((l) => (
            <Badge key={l} variant="success" className="text-[10px]">
              {l}
            </Badge>
          ))
        )}
      </div>

      <div className="grid flex-1 min-h-0 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-3">
        <Panel title="K(q) — selected skills">
          <ul className="divide-y divide-border">
            {result.selected_skills.map((s) => (
              <li key={s.skill_id} className="p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="truncate font-medium text-foreground">
                    {s.name}
                  </span>
                  {s.boosted ? (
                    <Badge variant="success" className="text-[10px]">
                      boost
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
                  <span>score {s.score.toFixed(3)}</span>
                  <span>ℓ₁ {s.l1.toFixed(2)}</span>
                  <span>ℓ₀ {s.l0.toFixed(2)}</span>
                  <span>name {s.name_score.toFixed(2)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Rescue R(q) → attached">
          <ul className="divide-y divide-border">
            {result.rescue_attached.slice(0, 20).map((c, i) => (
              <li key={i} className="p-2 text-xs">
                <p className="line-clamp-2 text-foreground">{c.subunit}</p>
                <p className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Badge variant={kindBadgeVariant(c.kind)} className="text-[10px]">
                    {c.kind}
                  </Badge>
                  <span>Aff {c.aff_score.toFixed(3)}</span>
                </p>
              </li>
            ))}
            {result.rescue_attached.length === 0 ? (
              <li className="p-3 text-center text-[10px] text-muted-foreground">
                No rescue cues survived attachment.
              </li>
            ) : null}
          </ul>
        </Panel>

        <Panel title="Compiled context">
          <pre className="whitespace-pre-wrap break-words p-2 font-mono text-[10px] text-foreground">
            {result.context}
          </pre>
        </Panel>
      </div>

      <details className="rounded-md border border-border bg-card/40 p-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">stage_ms</summary>
        <pre className="mt-2 font-mono text-[10px]">
          {JSON.stringify(d.stage_ms, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col rounded-md border border-border bg-card/40">
      <div className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-medium text-foreground">{value}</div>
    </div>
  );
}
