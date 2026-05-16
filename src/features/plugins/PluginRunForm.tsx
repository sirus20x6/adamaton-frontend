import * as React from "react";
import { Loader2, Play } from "lucide-react";

import {
  useStartPluginRun,
  type PluginManifest,
  type PluginRunInput,
} from "@/api/plugins";
import { useCorpora } from "@/api/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const NO_CORPUS_VALUE = "__none__";

/**
 * Best-effort JSON-Schema-ish field descriptor we read off the manifest's
 * ``args_schema.properties``. We only support the leaf types that show up
 * in real plugin manifests today — strings, booleans, numbers, and string
 * enums. Anything else falls through to a free-text Input.
 */
type FieldDescriptor = {
  name: string;
  title: string;
  description?: string;
  type: "string" | "boolean" | "number" | "integer" | "enum";
  enumValues?: string[];
  default?: unknown;
};

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function pickString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function describeField(name: string, raw: unknown): FieldDescriptor {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const title = pickString(obj, "title") ?? name;
  const description = pickString(obj, "description");
  const enumRaw = obj["enum"];
  if (isStringArray(enumRaw) && enumRaw.length > 0) {
    return {
      name,
      title,
      description,
      type: "enum",
      enumValues: enumRaw,
      default: obj["default"],
    };
  }
  const t = pickString(obj, "type");
  if (t === "boolean") {
    return {
      name,
      title,
      description,
      type: "boolean",
      default: obj["default"],
    };
  }
  if (t === "integer") {
    return {
      name,
      title,
      description,
      type: "integer",
      default: obj["default"],
    };
  }
  if (t === "number") {
    return {
      name,
      title,
      description,
      type: "number",
      default: obj["default"],
    };
  }
  return {
    name,
    title,
    description,
    type: "string",
    default: obj["default"],
  };
}

function readProperties(schema: Record<string, unknown>): FieldDescriptor[] {
  const props = schema["properties"];
  if (!props || typeof props !== "object") return [];
  const entries = Object.entries(props as Record<string, unknown>);
  return entries.map(([name, raw]) => describeField(name, raw));
}

function readRequired(schema: Record<string, unknown>): Set<string> {
  const required = schema["required"];
  if (isStringArray(required)) return new Set(required);
  return new Set();
}

function defaultValue(field: FieldDescriptor): string | boolean {
  if (field.type === "boolean") {
    return field.default === true;
  }
  if (typeof field.default === "string") return field.default;
  if (typeof field.default === "number") return String(field.default);
  if (typeof field.default === "boolean") return field.default;
  return "";
}

export type PluginRunFormProps = {
  plugin: PluginManifest;
  onRunStarted?: (runId: string) => void;
};

export function PluginRunForm({ plugin, onRunStarted }: PluginRunFormProps) {
  const corporaQuery = useCorpora();
  const corpora = corporaQuery.data ?? [];
  const { toast } = useToast();
  const start = useStartPluginRun(plugin.id);

  const fields = React.useMemo(
    () => readProperties(plugin.args_schema ?? {}),
    [plugin.args_schema],
  );
  const required = React.useMemo(
    () => readRequired(plugin.args_schema ?? {}),
    [plugin.args_schema],
  );

  // ``source`` is universal — every plugin call travels with one. If the
  // schema declares it explicitly we still surface a top-line input for it
  // so the user can paste a URL/handle without scrolling through the rest
  // of the schema.
  const sourceField = fields.find((f) => f.name === "source");
  const otherFields = fields.filter(
    (f) => f.name !== "source" && f.name !== "mode" && f.name !== "corpus_id",
  );
  const modeField = fields.find(
    (f) => f.name === "mode" && f.type === "enum",
  );

  const [source, setSource] = React.useState<string>(
    typeof sourceField?.default === "string" ? sourceField.default : "",
  );
  const [mode, setMode] = React.useState<string>(
    typeof modeField?.default === "string" ? modeField.default : "",
  );
  const [corpusId, setCorpusId] = React.useState<string>(NO_CORPUS_VALUE);
  const [values, setValues] = React.useState<Record<string, string | boolean>>(
    () => {
      const init: Record<string, string | boolean> = {};
      for (const field of otherFields) {
        init[field.name] = defaultValue(field);
      }
      return init;
    },
  );

  const setFieldValue = (name: string, value: string | boolean) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!source.trim()) {
      toast({
        title: "Source required",
        description: "Provide a source value before launching the run.",
        variant: "error",
      });
      return;
    }
    const options: Record<string, unknown> = {};
    for (const field of otherFields) {
      const v = values[field.name];
      if (v === undefined || v === "") continue;
      if (field.type === "boolean") {
        options[field.name] = Boolean(v);
      } else if (field.type === "integer") {
        const n = Number.parseInt(String(v), 10);
        if (!Number.isNaN(n)) options[field.name] = n;
      } else if (field.type === "number") {
        const n = Number.parseFloat(String(v));
        if (!Number.isNaN(n)) options[field.name] = n;
      } else {
        options[field.name] = v;
      }
    }
    const payload: PluginRunInput = {
      source: source.trim(),
    };
    if (mode) payload.mode = mode;
    if (corpusId !== NO_CORPUS_VALUE) payload.corpus_id = corpusId;
    if (Object.keys(options).length > 0) payload.options = options;
    start.mutate(payload, {
      onSuccess: (resp) => {
        toast({
          title: "Run started",
          description: `Queued on ${resp.queue}`,
          variant: "info",
        });
        onRunStarted?.(resp.run_id);
      },
      onError: (err) =>
        toast({
          title: "Failed to start run",
          description: err.message,
          variant: "error",
        }),
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card/40 p-4"
    >
      <div className="flex flex-col gap-2">
        <label
          htmlFor="plugin-source"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Source {required.has("source") ? <span className="text-red-300">*</span> : null}
        </label>
        <Input
          id="plugin-source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={sourceField?.description ?? "URL, handle, or identifier"}
        />
        {sourceField?.description ? (
          <p className="text-[11px] text-muted-foreground">
            {sourceField.description}
          </p>
        ) : null}
      </div>

      {modeField ? (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="plugin-mode"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Mode
          </label>
          <select
            id="plugin-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className={cn(
              "h-9 rounded-md border border-border bg-background px-2 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <option value="">Auto</option>
            {(modeField.enumValues ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <label
          htmlFor="plugin-corpus"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Target corpus
        </label>
        <select
          id="plugin-corpus"
          value={corpusId}
          onChange={(e) => setCorpusId(e.target.value)}
          disabled={corporaQuery.isLoading}
          className={cn(
            "h-9 rounded-md border border-border bg-background px-2 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <option value={NO_CORPUS_VALUE}>
            No corpus link (use server default)
          </option>
          {corpora.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.scope ? ` · ${String(c.scope)}` : ""}
            </option>
          ))}
        </select>
      </div>

      {otherFields.length > 0 ? (
        <fieldset className="flex flex-col gap-3 rounded-md border border-border bg-background/40 p-3">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Options
          </legend>
          {otherFields.map((field) => (
            <FieldRow
              key={field.name}
              field={field}
              value={values[field.name] ?? defaultValue(field)}
              required={required.has(field.name)}
              onChange={(v) => setFieldValue(field.name, v)}
            />
          ))}
        </fieldset>
      ) : null}

      <div className="flex items-center justify-end">
        <Button type="submit" size="md" disabled={start.isPending}>
          {start.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting…
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Start run
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

type FieldRowProps = {
  field: FieldDescriptor;
  value: string | boolean;
  required: boolean;
  onChange: (next: string | boolean) => void;
};

function FieldRow({ field, value, required, onChange }: FieldRowProps) {
  const id = React.useId();
  const labelText = field.title || field.name;
  const requiredMark = required ? (
    <span className="text-red-300" aria-label="required">
      *
    </span>
  ) : null;

  if (field.type === "boolean") {
    return (
      <label
        htmlFor={id}
        className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background/60 p-3 transition-colors hover:border-primary/40"
      >
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">
            {labelText} {requiredMark}
          </span>
          {field.description ? (
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              {field.description}
            </span>
          ) : null}
        </span>
      </label>
    );
  }

  if (field.type === "enum") {
    return (
      <div className="flex flex-col gap-1">
        <label
          htmlFor={id}
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          {labelText} {requiredMark}
        </label>
        <select
          id={id}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-9 rounded-md border border-border bg-background px-2 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <option value="">—</option>
          {(field.enumValues ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {field.description ? (
          <p className="text-[11px] text-muted-foreground">
            {field.description}
          </p>
        ) : null}
      </div>
    );
  }

  const isNumber = field.type === "integer" || field.type === "number";
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {labelText} {requiredMark}
      </label>
      <Input
        id={id}
        type={isNumber ? "number" : "text"}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.description ?? labelText}
      />
      {field.description ? (
        <p className="text-[11px] text-muted-foreground">{field.description}</p>
      ) : null}
    </div>
  );
}
