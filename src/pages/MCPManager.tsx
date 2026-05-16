import * as React from "react";
import {
  AlertCircle,
  Brain,
  Code2,
  Loader2,
  Pencil,
  Plug,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types

type Transport = "stdio" | "http" | "sse";

type McpServer = {
  name: string;
  type: Transport;
  command?: string | null;
  args?: string[] | null;
  env?: Record<string, string> | null;
  url?: string | null;
  startup_timeout_ms?: number | null;
  // Backend tags every server with whether it currently lives in the live
  // agent config (true) or has been parked in the disabled side-store (false).
  enabled: boolean;
};

type AgentKey = "claude" | "codex" | "gemini";

type AgentInfo = {
  path: string;
  exists: boolean;
  servers: McpServer[];
};

type ServersSnapshot = Record<AgentKey, AgentInfo>;

type ConnectionStored = {
  url: string;
  token: string;
};

type FormState = {
  agent: AgentKey;
  original: string;       // empty for "add"
  name: string;
  type: Transport;
  command: string;
  argsRaw: string;
  envRaw: string;
  url: string;
  timeoutMs: string;
};

// ---------------------------------------------------------------------------
// Constants

const STORAGE_KEY = "dr.mcpManager.connection";
const DEFAULT_AGENT_URL = "http://127.0.0.1:9876";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const AGENT_META: ReadonlyArray<{
  key: AgentKey;
  label: string;
  icon: typeof Brain;
  hint: string;
}> = [
  {
    key: "claude",
    label: "Claude Code",
    icon: Brain,
    hint: "Top-level mcpServers in ~/.claude.json",
  },
  {
    key: "codex",
    label: "Codex",
    icon: Code2,
    hint: "[mcp_servers.*] in ~/.codex/config.toml",
  },
  {
    key: "gemini",
    label: "Gemini",
    icon: Sparkles,
    hint: "mcpServers in ~/.gemini/settings.json",
  },
];

// ---------------------------------------------------------------------------
// Storage

function readStored(): ConnectionStored {
  if (typeof window === "undefined") return { url: DEFAULT_AGENT_URL, token: "" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { url: DEFAULT_AGENT_URL, token: "" };
    const obj = JSON.parse(raw) as Partial<ConnectionStored>;
    return {
      url: typeof obj.url === "string" && obj.url ? obj.url : DEFAULT_AGENT_URL,
      token: typeof obj.token === "string" ? obj.token : "",
    };
  } catch {
    return { url: DEFAULT_AGENT_URL, token: "" };
  }
}

function writeStored(conn: ConnectionStored): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Fetch helpers

async function agentFetch<T>(
  conn: ConnectionStored,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = conn.url.replace(/\/+$/, "");
  const headers = new Headers(init?.headers ?? undefined);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (conn.token) headers.set("X-Auth-Token", conn.token);
  const resp = await fetch(base + path, { ...init, headers });
  const text = await resp.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { error: text };
    }
  }
  if (!resp.ok) {
    const msg =
      (parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : undefined) ?? `HTTP ${resp.status} ${resp.statusText}`;
    throw new Error(msg);
  }
  return parsed as T;
}

// ---------------------------------------------------------------------------
// Form helpers

function emptyForm(agent: AgentKey): FormState {
  return {
    agent,
    original: "",
    name: "",
    type: "stdio",
    command: "",
    argsRaw: "",
    envRaw: "",
    url: "",
    timeoutMs: "",
  };
}

function formFromServer(agent: AgentKey, server: McpServer): FormState {
  return {
    agent,
    original: server.name,
    name: server.name,
    type: server.type ?? "stdio",
    command: server.command ?? "",
    argsRaw: (server.args ?? []).join("\n"),
    envRaw: Object.entries(server.env ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
    url: server.url ?? "",
    timeoutMs:
      server.startup_timeout_ms != null ? String(server.startup_timeout_ms) : "",
  };
}

function parseArgs(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function parseEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function buildSpec(form: FormState): { spec: Record<string, unknown>; error?: string } {
  if (!NAME_RE.test(form.name)) {
    return {
      spec: {},
      error: "Name must be 1–64 chars of [A-Za-z0-9._-] and start alphanumeric.",
    };
  }
  const spec: Record<string, unknown> = { type: form.type };
  if (form.type === "stdio") {
    if (!form.command.trim()) {
      return { spec: {}, error: "Command is required for stdio transport." };
    }
    spec.command = form.command.trim();
    spec.args = parseArgs(form.argsRaw);
    spec.env = parseEnv(form.envRaw);
  } else {
    if (!form.url.trim()) {
      return { spec: {}, error: `URL is required for ${form.type} transport.` };
    }
    spec.url = form.url.trim();
  }
  if (form.agent === "codex" && form.timeoutMs.trim()) {
    const t = Number.parseInt(form.timeoutMs, 10);
    if (Number.isFinite(t) && t >= 0) spec.startup_timeout_ms = t;
  }
  return { spec };
}

// ---------------------------------------------------------------------------
// Component

export default function MCPManager() {
  const [conn, setConn] = React.useState<ConnectionStored>(() => readStored());
  const [urlDraft, setUrlDraft] = React.useState(conn.url);
  const [tokenDraft, setTokenDraft] = React.useState(conn.token);

  const [snapshot, setSnapshot] = React.useState<ServersSnapshot | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [connError, setConnError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState<FormState | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [formSaving, setFormSaving] = React.useState(false);

  const connected = snapshot !== null && connError === null;

  const refresh = React.useCallback(
    async (current: ConnectionStored) => {
      if (!current.url || !current.token) {
        setConnError("URL and token are both required.");
        return;
      }
      setLoading(true);
      setConnError(null);
      try {
        await agentFetch<{ ok: boolean }>(current, "/healthz");
        const data = await agentFetch<ServersSnapshot>(current, "/servers");
        setSnapshot(data);
      } catch (err) {
        setSnapshot(null);
        setConnError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Auto-connect on mount if we have stored creds.
  React.useEffect(() => {
    if (conn.url && conn.token) {
      refresh(conn);
    }
    // Run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    const next: ConnectionStored = {
      url: urlDraft.trim(),
      token: tokenDraft.trim(),
    };
    setConn(next);
    writeStored(next);
    await refresh(next);
  };

  const handleAdd = (agent: AgentKey) => {
    setForm(emptyForm(agent));
    setFormError(null);
  };

  const handleEdit = (agent: AgentKey, server: McpServer) => {
    setForm(formFromServer(agent, server));
    setFormError(null);
  };

  const handleDelete = async (agent: AgentKey, name: string) => {
    if (!window.confirm(`Delete ${agent} MCP "${name}"?`)) return;
    try {
      await agentFetch(
        conn,
        `/servers/${encodeURIComponent(agent)}/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      await refresh(conn);
    } catch (err) {
      setConnError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggle = async (agent: AgentKey, server: McpServer) => {
    const action = server.enabled ? "disable" : "enable";
    try {
      await agentFetch(
        conn,
        `/servers/${encodeURIComponent(agent)}/${encodeURIComponent(
          server.name,
        )}/${action}`,
        { method: "POST" },
      );
      await refresh(conn);
    } catch (err) {
      setConnError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSave = async () => {
    if (!form) return;
    const { spec, error } = buildSpec(form);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    setFormSaving(true);
    try {
      await agentFetch(
        conn,
        `/servers/${encodeURIComponent(form.agent)}/${encodeURIComponent(
          form.name,
        )}`,
        { method: "PUT", body: JSON.stringify(spec) },
      );
      setForm(null);
      await refresh(conn);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setFormSaving(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Plug className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">MCP Manager</h1>
            <p className="text-sm text-muted-foreground">
              Manage MCP servers configured in Claude Code, Codex, and Gemini on
              your workstation. Talks to a local helper daemon ({" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                ldr-mcp-manager.service
              </code>{" "}
              ) over localhost — the platform backend is not involved.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refresh(conn)}
          disabled={!connected || loading}
        >
          <RefreshCw
            className={cn("mr-2 h-4 w-4", loading && "animate-spin")}
          />
          Refresh
        </Button>
      </header>

      {/* Connection panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            Workstation agent
            <StatusPill
              connected={connected}
              loading={loading}
              hasError={connError !== null}
            />
          </CardTitle>
          <CardDescription>
            Start the daemon once on your workstation, then paste its URL and
            token here. They&apos;re cached in your browser&apos;s localStorage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Agent URL
              </label>
              <Input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder={DEFAULT_AGENT_URL}
                spellCheck={false}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Token
              </label>
              <Input
                type="password"
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                placeholder="paste token here"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <Button onClick={handleConnect} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Connect
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            On your workstation:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              cat ~/.config/ldr-mcp-manager/token
            </code>
            . If the daemon isn&apos;t installed yet, run{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              systemctl --user enable --now ldr-mcp-manager
            </code>
            .
          </p>
          {connError ? (
            <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{connError}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Three-column grid */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto md:grid-cols-2 xl:grid-cols-3">
        {AGENT_META.map(({ key, label, icon: Icon, hint }) => {
          const info = snapshot?.[key];
          return (
            <Card key={key} className="flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {label}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">
                    {info
                      ? `${info.servers.filter((s) => s.enabled).length}/${
                          info.servers.length
                        } enabled`
                      : "—"}
                  </span>
                </CardTitle>
                <CardDescription className="break-all font-mono text-[11px]">
                  {info ? info.path : hint}
                  {info && !info.exists ? " (not found)" : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-2">
                {info ? (
                  info.servers.length > 0 ? (
                    <ul className="flex flex-col gap-2">
                      {info.servers.map((s) => (
                        <ServerRow
                          key={s.name}
                          server={s}
                          onEdit={() => handleEdit(key, s)}
                          onDelete={() => handleDelete(key, s.name)}
                          onToggle={() => handleToggle(key, s)}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-md border border-dashed border-border bg-card/40 p-4 text-center text-xs text-muted-foreground">
                      No MCPs configured
                    </p>
                  )
                ) : (
                  <p className="rounded-md border border-dashed border-border bg-card/40 p-4 text-center text-xs text-muted-foreground">
                    Connect to the agent to see configured MCPs.
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAdd(key)}
                  disabled={!connected}
                  className="mt-auto"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add {label} MCP
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add/Edit dialog */}
      <Dialog
        open={form !== null}
        onOpenChange={(open) => {
          if (!open) {
            setForm(null);
            setFormError(null);
          }
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {form?.original
                ? `Edit ${form.agent} MCP "${form.original}"`
                : `Add ${form?.agent ?? ""} MCP`}
            </DialogTitle>
            <DialogDescription>
              {form?.agent === "codex"
                ? "Writes to ~/.codex/config.toml. Existing keys and comments are preserved."
                : form?.agent === "claude"
                  ? "Writes to the top-level mcpServers in ~/.claude.json."
                  : "Writes to ~/.gemini/settings.json."}
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <ServerForm
              form={form}
              setForm={setForm}
              error={formError}
              saving={formSaving}
              onCancel={() => {
                setForm(null);
                setFormError(null);
              }}
              onSave={handleSave}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents

function StatusPill({
  connected,
  loading,
  hasError,
}: {
  connected: boolean;
  loading: boolean;
  hasError: boolean;
}) {
  let label = "Disconnected";
  let tone = "bg-muted-foreground/40 text-muted-foreground";
  if (loading) {
    label = "Connecting";
    tone =
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40";
  } else if (connected) {
    label = "Connected";
    tone = "bg-primary/15 text-primary border-primary/40";
  } else if (hasError) {
    label = "Error";
    tone = "bg-red-500/15 text-red-300 border-red-500/40";
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        tone,
      )}
    >
      {label}
    </span>
  );
}

function ServerRow({
  server,
  onEdit,
  onDelete,
  onToggle,
}: {
  server: McpServer;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const cmd =
    server.type === "stdio"
      ? [server.command ?? "", ...(server.args ?? [])].join(" ")
      : server.url ?? "";
  const envCount = Object.keys(server.env ?? {}).length;
  const meta: string[] = [server.type ?? "stdio"];
  if (envCount > 0) meta.push(`${envCount} env`);
  if (server.startup_timeout_ms != null)
    meta.push(`timeout ${server.startup_timeout_ms}ms`);

  return (
    <li
      className={cn(
        "rounded-md border bg-card/60 px-3 py-2 transition-opacity",
        server.enabled
          ? "border-border"
          : "border-dashed border-border opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span
            className={cn(
              "mt-1 inline-block h-2 w-2 shrink-0 rounded-full",
              server.enabled
                ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.55)]"
                : "bg-muted-foreground/50",
            )}
            aria-label={server.enabled ? "Enabled" : "Disabled"}
            title={server.enabled ? "Enabled" : "Disabled"}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{server.name}</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {cmd || <span className="italic">no command</span>}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {meta.join(" · ")}
              {!server.enabled ? " · parked" : ""}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={server.enabled ? "Disable" : "Enable"}
            title={server.enabled ? "Disable" : "Enable"}
            onClick={onToggle}
            className={cn(
              "h-7 w-7",
              server.enabled
                ? "text-emerald-400 hover:text-emerald-300"
                : "text-muted-foreground hover:text-emerald-400",
            )}
          >
            {server.enabled ? (
              <Power className="h-3.5 w-3.5" />
            ) : (
              <PowerOff className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Edit"
            title="Edit"
            onClick={onEdit}
            className="h-7 w-7"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete"
            title="Delete"
            onClick={onDelete}
            className="h-7 w-7 text-muted-foreground hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </li>
  );
}

function ServerForm({
  form,
  setForm,
  error,
  saving,
  onCancel,
  onSave,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState | null>>;
  error: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  // setForm is FormState|null, but inside this component we know form is
  // non-null. Wrap the updater so callers can use the plain (prev=>next) form.
  const updateForm = (mut: (prev: FormState) => FormState) =>
    setForm((prev) => (prev ? mut(prev) : prev));
  const isStdio = form.type === "stdio";
  const editing = form.original.length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="space-y-3"
    >
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Name</label>
        <Input
          value={form.name}
          onChange={(e) =>
            updateForm((prev) => ({ ...prev, name: e.target.value }))
          }
          required
          disabled={editing}
          pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,63}"
          spellCheck={false}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted-foreground">
          Transport
        </label>
        <select
          value={form.type}
          onChange={(e) =>
            updateForm((prev) => ({
              ...prev,
              type: e.target.value as Transport,
            }))
          }
          className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm"
        >
          <option value="stdio">stdio (local command)</option>
          <option value="http">http</option>
          <option value="sse">sse</option>
        </select>
      </div>

      {isStdio ? (
        <>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Command
            </label>
            <Input
              value={form.command}
              onChange={(e) =>
                updateForm((prev) => ({ ...prev, command: e.target.value }))
              }
              placeholder="/usr/bin/node"
              spellCheck={false}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Args (one per line)
            </label>
            <Textarea
              value={form.argsRaw}
              onChange={(e) =>
                updateForm((prev) => ({ ...prev, argsRaw: e.target.value }))
              }
              rows={4}
              placeholder={"/path/to/server.js\n--some-flag"}
              spellCheck={false}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Environment (KEY=VALUE per line)
            </label>
            <Textarea
              value={form.envRaw}
              onChange={(e) =>
                updateForm((prev) => ({ ...prev, envRaw: e.target.value }))
              }
              rows={3}
              placeholder={"API_KEY=...\nHOST=localhost"}
              spellCheck={false}
              className="font-mono text-sm"
            />
          </div>
        </>
      ) : (
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">URL</label>
          <Input
            value={form.url}
            onChange={(e) =>
              updateForm((prev) => ({ ...prev, url: e.target.value }))
            }
            placeholder="https://example.com/mcp"
            spellCheck={false}
          />
        </div>
      )}

      {form.agent === "codex" ? (
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Startup timeout (ms)
            <span className="ml-1 font-normal text-muted-foreground/70">
              — Codex only, optional
            </span>
          </label>
          <Input
            type="number"
            min={0}
            value={form.timeoutMs}
            onChange={(e) =>
              updateForm((prev) => ({ ...prev, timeoutMs: e.target.value }))
            }
            placeholder="20000"
          />
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
