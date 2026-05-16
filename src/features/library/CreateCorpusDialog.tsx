import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import {
  createCorpus,
  type Corpus,
  type CorpusScope,
} from "@/api/library";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const SCOPE_OPTIONS: Array<{ value: CorpusScope; label: string; help: string }> = [
  {
    value: "research",
    label: "Research",
    help: "Live + indexed search, multi-document synthesis.",
  },
  {
    value: "book",
    label: "Book",
    help: "Long-form authored content, EPUB/PDF.",
  },
  {
    value: "mixed",
    label: "Mixed",
    help: "Catch-all bucket for stray documents.",
  },
  {
    value: "experiments",
    label: "Experiments",
    help: "Isolated sandbox for trial runs and prompt tuning.",
  },
];

export function CreateCorpusDialog() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [scope, setScope] = React.useState<CorpusScope>("research");

  const create = useMutation<Corpus, Error, { name: string; scope: CorpusScope }>(
    {
      mutationFn: (input) => createCorpus(input),
      onSuccess: (created) => {
        toast({
          title: "Corpus created",
          description: created.name,
          variant: "success",
        });
        queryClient.invalidateQueries({ queryKey: ["library", "corpora"] });
        queryClient.invalidateQueries({ queryKey: ["corpora"] });
        setOpen(false);
        setName("");
        setScope("research");
      },
      onError: (err) => {
        toast({
          title: "Could not create corpus",
          description: err.message,
          variant: "error",
        });
      },
    },
  );

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate({ name: trimmed, scope });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          <span>New corpus</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>New corpus</DialogTitle>
            <DialogDescription>
              A bucket for documents. You can drop files into the library or
              ingest URLs/arXiv ids that target this corpus.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Name
              </span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Quantum gravity reading list"
                autoFocus
                required
              />
            </label>

            <fieldset className="block">
              <legend className="mb-1 text-xs font-medium text-muted-foreground">
                Scope
              </legend>
              <div className="grid gap-2">
                {SCOPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2 text-sm hover:bg-accent/40"
                  >
                    <input
                      type="radio"
                      name="scope"
                      value={opt.value}
                      checked={scope === opt.value}
                      onChange={() => setScope(opt.value)}
                      className="mt-1 h-3.5 w-3.5"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{opt.label}</span>
                      <p className="text-xs text-muted-foreground">{opt.help}</p>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={create.isPending || !name.trim()}
            >
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
