import { useState } from "react";
import { Loader2 } from "lucide-react";

import {
  type ExperimentCreateInput,
  type ExperimentStatus,
  useCreateExperiment,
} from "@/api/experiments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const STATUS_OPTIONS: ExperimentStatus[] = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "interrupted",
];

type Props = {
  parentId?: string | null;
  parentName?: string;
  trigger: React.ReactNode;
  defaultAgentSession?: string | null;
  onCreated?: (id: string) => void;
};

export function NewExperimentDialog({
  parentId = null,
  parentName,
  trigger,
  defaultAgentSession = null,
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [valBpb, setValBpb] = useState("");
  const [status, setStatus] = useState<ExperimentStatus>("succeeded");
  const [tagsRaw, setTagsRaw] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useCreateExperiment({
    onSuccess: (created) => {
      setOpen(false);
      setName("");
      setHypothesis("");
      setValBpb("");
      setStatus("succeeded");
      setTagsRaw("");
      setError(null);
      onCreated?.(created.id);
    },
    onError: (e) => setError(String((e as Error).message ?? "create failed")),
  });

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim() || !hypothesis.trim()) {
      setError("name and hypothesis are required");
      return;
    }
    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const payload: ExperimentCreateInput = {
      name: name.trim(),
      hypothesis: hypothesis.trim(),
      status,
      val_bpb: valBpb.trim() === "" ? null : Number(valBpb),
      tags: tags.length > 0 ? tags : undefined,
      parent_id: parentId,
      agent_session_id: defaultAgentSession,
    };
    if (payload.val_bpb !== null && Number.isNaN(payload.val_bpb)) {
      setError("val_bpb must be a number or blank");
      return;
    }
    create.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New experiment</DialogTitle>
          <DialogDescription>
            {parentId
              ? `Logged as a child of ${parentName ?? parentId.slice(0, 8)}.`
              : "Standalone run; not attached to a prior experiment."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Name
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. muon-warmup-200"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Hypothesis
            <Textarea
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              rows={4}
              placeholder="What are you testing? (Markdown OK.)"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium">
              val_bpb
              <Input
                value={valBpb}
                onChange={(e) => setValBpb(e.target.value)}
                inputMode="decimal"
                placeholder="1.879"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ExperimentStatus)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Tags
            <Input
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="comma, separated"
            />
          </label>
          {error && (
            <p className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-500">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Log experiment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
