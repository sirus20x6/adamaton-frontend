import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Save,
  RotateCcw,
} from "lucide-react";

import {
  usePlugin,
  usePluginConfig,
  usePlugins,
  useSetPluginConfig,
  type PluginManifest,
} from "@/api/plugins";
import {
  getSettings,
  updateSettings,
  type ProviderUrls,
  type RuntimeSettings,
  type TrustWeights,
} from "@/api/settings";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Toaster, useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const PROVIDER_FIELDS: ReadonlyArray<{
  key: string;
  label: string;
  placeholder: string;
}> = [
  { key: "vllm_url", label: "vLLM URL", placeholder: "http://vllm:8000" },
  {
    key: "llama_cpp_url",
    label: "llama.cpp URL",
    placeholder: "http://llama-cpp:8081",
  },
  {
    key: "openai_base",
    label: "OpenAI base URL",
    placeholder: "https://api.openai.com/v1",
  },
  {
    key: "anthropic_base",
    label: "Anthropic base URL",
    placeholder: "https://api.anthropic.com",
  },
];

// Static catalog of model strings the UI offers. The actual mapping lives in
// the JSON config file the backend writes.
const MODEL_CATALOG: ReadonlyArray<string> = [
  "openai/local-fast",
  "openai/local-quality",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "anthropic/claude-haiku-4-5",
  "anthropic/claude-sonnet-4-5",
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-opus-4-7",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
];

const TIER_KEYS: ReadonlyArray<{
  key: "fast" | "mid" | "intelligent";
  label: string;
  help: string;
}> = [
  {
    key: "fast",
    label: "Fast",
    help: "Snappy / low-cost — bulk classification, query rewriting.",
  },
  {
    key: "mid",
    label: "Mid",
    help: "Reasoning balance — drafting and Stage 2 / Stage 3 work.",
  },
  {
    key: "intelligent",
    label: "Intelligent",
    help: "Heavy lift — final synthesis, cross-document reasoning.",
  },
];

const TRUST_WEIGHT_FIELDS: ReadonlyArray<{
  key: keyof TrustWeights;
  label: string;
  help: string;
}> = [
  {
    key: "source_weight",
    label: "Source weight",
    help: "How much to trust by source kind (journal vs. forum etc).",
  },
  {
    key: "recency_decay",
    label: "Recency decay",
    help: "Newer documents win — half-life depends on source kind.",
  },
  {
    key: "arxiv_source_tier",
    label: "arXiv source tier",
    help: "LaTeX > ar5iv > vanity > html > pdf > json.",
  },
  {
    key: "citation_count_log",
    label: "Citation count (log)",
    help: "Log-scaled citation count from the source adapter.",
  },
  {
    key: "journal_quality",
    label: "Journal quality",
    help: "Static reputation map of journals / venues.",
  },
];

function normalizeWeights(
  raw: Record<keyof TrustWeights, number>,
): Record<keyof TrustWeights, number> {
  let total = 0;
  for (const f of TRUST_WEIGHT_FIELDS) {
    total += raw[f.key] ?? 0;
  }
  const out = {} as Record<keyof TrustWeights, number>;
  if (total <= 0) {
    const equal = 1 / TRUST_WEIGHT_FIELDS.length;
    for (const f of TRUST_WEIGHT_FIELDS) {
      out[f.key] = equal;
    }
    return out;
  }
  for (const f of TRUST_WEIGHT_FIELDS) {
    out[f.key] = (raw[f.key] ?? 0) / total;
  }
  return out;
}

function ProviderUrlsCard({
  value,
  onChange,
}: {
  value: ProviderUrls;
  onChange: (next: ProviderUrls) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider URLs</CardTitle>
        <CardDescription>
          Endpoint URLs for inference and chat completion backends. API keys
          live in environment variables and are never editable here.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {PROVIDER_FIELDS.map((field) => (
          <label key={field.key} className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {field.label}
            </span>
            <Input
              value={value[field.key] ?? ""}
              placeholder={field.placeholder}
              onChange={(event) =>
                onChange({ ...value, [field.key]: event.target.value })
              }
            />
          </label>
        ))}
      </CardContent>
    </Card>
  );
}

function ModelTiersCard({
  value,
  onChange,
}: {
  value: { fast?: string; mid?: string; intelligent?: string };
  onChange: (next: {
    fast?: string;
    mid?: string;
    intelligent?: string;
  }) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Model tiers</CardTitle>
        <CardDescription>
          The orchestrator picks a model by tier — change which concrete model
          backs each tier.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {TIER_KEYS.map((tier) => (
          <div key={tier.key} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {tier.label}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {tier.help}
              </span>
            </div>
            <select
              value={value[tier.key] ?? ""}
              onChange={(event) =>
                onChange({ ...value, [tier.key]: event.target.value })
              }
              className={cn(
                "h-9 rounded-md border border-input bg-background px-2 text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <option value="">(unset)</option>
              {MODEL_CATALOG.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TrustWeightsCard({
  value,
  onChange,
}: {
  value: Record<keyof TrustWeights, number>;
  onChange: (next: Record<keyof TrustWeights, number>) => void;
}) {
  let total = 0;
  for (const f of TRUST_WEIGHT_FIELDS) {
    total += value[f.key] ?? 0;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trust weights</CardTitle>
        <CardDescription>
          Five components contribute to the Stage 1 score. Live-normalized to
          sum to 1.0 — the displayed share is what the orchestrator actually
          uses.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {TRUST_WEIGHT_FIELDS.map((field) => {
          const raw = value[field.key] ?? 0;
          const share = total > 0 ? raw / total : 0;
          return (
            <div key={field.key} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium">{field.label}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {(share * 100).toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={raw}
                onChange={(event) =>
                  onChange({
                    ...value,
                    [field.key]: Number(event.target.value),
                  })
                }
                className="h-1.5 w-full accent-primary"
              />
              <p className="text-[11px] text-muted-foreground">{field.help}</p>
            </div>
          );
        })}
        <div className="border-t border-border pt-2 text-[11px] text-muted-foreground">
          Raw sum: {total.toFixed(2)} (normalized at save time)
        </div>
      </CardContent>
    </Card>
  );
}

// JSON-Schema-ish property descriptor we read off the manifest's
// config_schema. We only honor a tiny subset for now (string/number);
// nested objects/arrays are deferred to a follow-up.
type SchemaField = {
  key: string;
  type: "string" | "number";
  title?: string;
  description?: string;
};

function readSchemaFields(
  schema: Record<string, unknown> | null | undefined,
): SchemaField[] {
  if (!schema || typeof schema !== "object") return [];
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  if (!props || typeof props !== "object") return [];
  const out: SchemaField[] = [];
  for (const [key, raw] of Object.entries(props)) {
    if (!raw || typeof raw !== "object") continue;
    const prop = raw as Record<string, unknown>;
    const declared = typeof prop.type === "string" ? prop.type : "string";
    const type: SchemaField["type"] = declared === "number" ? "number" : "string";
    out.push({
      key,
      type,
      title: typeof prop.title === "string" ? prop.title : undefined,
      description:
        typeof prop.description === "string" ? prop.description : undefined,
    });
  }
  return out;
}

function PluginSecretRow({ plugin }: { plugin: PluginManifest }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = React.useState(false);
  // Defer the per-plugin manifest fetch until the row opens — keeps the
  // settings page from firing N requests on first paint.
  const manifestQuery = usePlugin(plugin.id, { enabled: expanded });
  const configQuery = usePluginConfig(plugin.id, { enabled: expanded });
  const setConfig = useSetPluginConfig();

  const fields = React.useMemo(
    () => readSchemaFields(manifestQuery.data?.config_schema ?? null),
    [manifestQuery.data?.config_schema],
  );

  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [revealed, setRevealed] = React.useState<Record<string, boolean>>({});

  // Hydrate the draft from the server config the first time it lands.
  React.useEffect(() => {
    if (!configQuery.data || !fields.length) return;
    setDraft((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const next: Record<string, string> = {};
      for (const f of fields) {
        const v = (configQuery.data.config as Record<string, unknown>)[f.key];
        next[f.key] = v === undefined || v === null ? "" : String(v);
      }
      return next;
    });
  }, [configQuery.data, fields]);

  // Treat *any* non-empty key on the server side as "configured". Cheap
  // tristate without per-field masking from the host.
  const configured =
    !!configQuery.data &&
    Object.values(configQuery.data.config as Record<string, unknown>).some(
      (v) => v !== null && v !== undefined && v !== "",
    );

  const onSave = () => {
    // Coerce types per the schema; everything arrives as string from the
    // <input>s. Empty strings drop the key so users can clear a secret.
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = draft[f.key] ?? "";
      if (raw === "") continue;
      payload[f.key] = f.type === "number" ? Number(raw) : raw;
    }
    setConfig.mutate(
      { plugin_id: plugin.id, config: payload },
      {
        onSuccess: () => {
          toast({
            title: "Config saved",
            description: plugin.name,
            variant: "success",
          });
        },
        onError: (err) => {
          toast({
            title: "Save failed",
            description: err instanceof Error ? err.message : String(err),
            variant: "error",
          });
        },
      },
    );
  };

  return (
    <li className="flex flex-col">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 px-4 py-3 text-left text-sm hover:bg-accent/50"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="font-medium">{plugin.name}</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {plugin.id}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {configQuery.isFetching && !configQuery.data ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : configured ? (
            <span className="text-emerald-300">● configured</span>
          ) : (
            <span>○ not configured</span>
          )}
        </span>
      </button>
      {expanded ? (
        <div className="grid gap-3 border-t border-border bg-card/30 px-4 py-3">
          {manifestQuery.isLoading || configQuery.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading schema…
            </div>
          ) : null}
          {fields.length === 0 && !manifestQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">
              No editable fields declared in this plugin's schema.
            </p>
          ) : null}
          {fields.map((field) => {
            const isSecret = field.type === "string";
            const show = revealed[field.key] ?? false;
            return (
              <label key={field.key} className="grid gap-1">
                <span className="text-xs font-medium">
                  {field.title ?? field.key}
                </span>
                <div className="flex items-center gap-2">
                  <Input
                    type={
                      field.type === "number"
                        ? "number"
                        : isSecret && !show
                          ? "password"
                          : "text"
                    }
                    value={draft[field.key] ?? ""}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {isSecret ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setRevealed((prev) => ({
                          ...prev,
                          [field.key]: !show,
                        }))
                      }
                      aria-label={show ? "Hide value" : "Reveal value"}
                    >
                      {show ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  ) : null}
                </div>
                {field.description ? (
                  <p className="text-[11px] text-muted-foreground">
                    {field.description}
                  </p>
                ) : null}
              </label>
            );
          })}
          {fields.length > 0 ? (
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={onSave}
                disabled={setConfig.isPending}
              >
                {setConfig.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function PluginSecretsCard() {
  const pluginsQuery = usePlugins();
  // The list endpoint doesn't ship config_schema, so we can't pre-filter
  // the rows here. Instead we render every plugin and let each row
  // detect-and-hide itself via the single-plugin fetch — but that's
  // expensive. Compromise: render every plugin as a collapsed row; the
  // row only fetches its schema when the user expands it.
  const plugins = pluginsQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plugin secrets</CardTitle>
        <CardDescription>
          Per-plugin credentials and tokens. Expand a row to edit its
          configured fields; values are stored encrypted in the platform
          secret manager.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pluginsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading plugins…
          </div>
        ) : null}
        {!pluginsQuery.isLoading && plugins.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No plugins registered.
          </p>
        ) : null}
        {plugins.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {plugins.map((plugin) => (
              <PluginSecretRow key={plugin.id} plugin={plugin} />
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const [draft, setDraft] = React.useState<RuntimeSettings | null>(null);

  // Hydrate the draft once when the server response lands. Subsequent server
  // updates (after a successful save) reset the draft via the mutation.
  React.useEffect(() => {
    if (settingsQuery.data && !draft) {
      setDraft(settingsQuery.data);
    }
  }, [settingsQuery.data, draft]);

  const update = useMutation({
    mutationFn: (next: RuntimeSettings) =>
      updateSettings({
        provider_urls: next.provider_urls,
        model_tiers: next.model_tiers,
        trust_weights: normalizeWeights(
          next.trust_weights as Record<keyof TrustWeights, number>,
        ),
      }),
    onSuccess: (data) => {
      setDraft(data);
      queryClient.setQueryData(["settings"], data);
      toast({
        title: "Settings saved",
        variant: "success",
        description: data.config_path,
      });
    },
    onError: (err) => {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    },
  });

  if (settingsQuery.isLoading || !draft) {
    return (
      <section className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading settings…
      </section>
    );
  }

  if (settingsQuery.isError) {
    return (
      <section className="p-6">
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300">
          Failed to load settings:{" "}
          {settingsQuery.error instanceof Error
            ? settingsQuery.error.message
            : String(settingsQuery.error)}
        </div>
      </section>
    );
  }

  // Coerce optional/undefined into 0 so the slider components have a stable shape.
  const trustWeights: Record<keyof TrustWeights, number> = {
    source_weight: draft.trust_weights.source_weight ?? 0,
    recency_decay: draft.trust_weights.recency_decay ?? 0,
    arxiv_source_tier: draft.trust_weights.arxiv_source_tier ?? 0,
    citation_count_log: draft.trust_weights.citation_count_log ?? 0,
    journal_quality: draft.trust_weights.journal_quality ?? 0,
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Runtime configuration written to{" "}
            <code className="text-[11px]">
              {draft.config_path ?? "/app/configs/runtime.json"}
            </code>
            .
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => settingsQuery.data && setDraft(settingsQuery.data)}
            disabled={update.isPending}
          >
            <RotateCcw className="h-4 w-4" />
            <span>Discard</span>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => update.mutate(draft)}
            disabled={update.isPending}
          >
            {update.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>Save</span>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ProviderUrlsCard
          value={draft.provider_urls ?? {}}
          onChange={(next) => setDraft({ ...draft, provider_urls: next })}
        />
        <ModelTiersCard
          value={draft.model_tiers ?? {}}
          onChange={(next) => setDraft({ ...draft, model_tiers: next })}
        />
        <TrustWeightsCard
          value={trustWeights}
          onChange={(next) =>
            setDraft({
              ...draft,
              trust_weights: next as TrustWeights,
            })
          }
        />
      </div>

      <PluginSecretsCard />

      {draft.masked_secrets && Object.keys(draft.masked_secrets).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Detected secret env vars</CardTitle>
            <CardDescription>
              These are read-only and shown masked — set them in your environment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {Object.entries(draft.masked_secrets).map(([key, masked]) => (
                <React.Fragment key={key}>
                  <dt className="truncate text-xs font-medium">{key}</dt>
                  <dd className="font-mono text-xs text-muted-foreground">
                    {masked}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <Toaster />
    </section>
  );
}

export default SettingsPage;
