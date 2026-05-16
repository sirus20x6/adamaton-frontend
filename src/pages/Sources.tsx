import { Globe } from "lucide-react";

import { Toaster } from "@/components/ui/toast";
import { SourceBrowser } from "@/features/research/SourceBrowser";

export default function Sources() {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="inline-flex items-center gap-1.5 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
            <Globe className="h-3.5 w-3.5" />
            Reference catalog
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Curated registry that feeds the Stage 1 trust scorer. Filter by
            kind, peer-review status, or name; sort by weight, h5 index, or
            alphabetically. Use this to pre-select trusted journals before
            kicking off a research run.
          </p>
        </div>
      </header>

      <SourceBrowser variant="page" limit={500} />
      <Toaster />
    </section>
  );
}
