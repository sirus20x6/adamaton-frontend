// API surface for per-project persistent terminals. Lands on
// platform/dashboard/apiserver through Caddy's /evo-api/* proxy.
//
// Backend handlers live in
// adamaton-platform/dashboard/apiserver/terminals_endpoints.go.
//
// Terminal sessions are tmux-backed on the host: they survive a page reload
// and an apiserver restart. The frontend only opens a websocket bridge to an
// existing tmux session; the session lifecycle is owned by the server.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const EVO_BASE = "/evo-api/api/v1";

// Mirrors the status column on evo.terminal_sessions.
export const TERMINAL_STATUSES = ["live", "dead"] as const;
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

export interface TerminalSession {
  id: string;
  project_id: string;
  title: string;
  command: string;
  cwd: string;
  status: TerminalStatus;
  cols: number;
  rows: number;
  created_at: string;
}

export interface TerminalCreateRequest {
  title?: string;
  command?: string;
  cols?: number;
  rows?: number;
}

export interface TerminalResizeRequest {
  cols: number;
  rows: number;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg =
      (parsed as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return parsed as T;
}

export const terminalsApi = {
  list: (projectId: string): Promise<TerminalSession[]> =>
    fetch(
      `${EVO_BASE}/projects/${encodeURIComponent(projectId)}/terminals`,
    ).then(jsonOrThrow<TerminalSession[]>),
  create: (
    projectId: string,
    body: TerminalCreateRequest,
  ): Promise<TerminalSession> =>
    fetch(`${EVO_BASE}/projects/${encodeURIComponent(projectId)}/terminals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(jsonOrThrow<TerminalSession>),
  remove: (sid: string): Promise<void> =>
    fetch(`${EVO_BASE}/terminals/${encodeURIComponent(sid)}`, {
      method: "DELETE",
    }).then(async (res) => {
      if (!res.ok && res.status !== 204) {
        await jsonOrThrow<void>(res);
      }
    }),
  resize: (sid: string, body: TerminalResizeRequest): Promise<void> =>
    fetch(`${EVO_BASE}/terminals/${encodeURIComponent(sid)}/resize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      if (!res.ok) {
        await jsonOrThrow<void>(res);
      }
    }),
};

export const terminalKeys = {
  all: ["terminals"] as const,
  list: (projectId: string) => ["terminals", "list", projectId] as const,
};

export function useTerminals(projectId: string | null) {
  return useQuery({
    queryKey: projectId
      ? terminalKeys.list(projectId)
      : ["terminals", "list", "_disabled"],
    queryFn: () => terminalsApi.list(projectId as string),
    enabled: !!projectId,
    refetchInterval: 15_000,
  });
}

export function useCreateTerminal(projectId: string) {
  const qc = useQueryClient();
  return useMutation<TerminalSession, Error, TerminalCreateRequest>({
    mutationFn: (body) => terminalsApi.create(projectId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: terminalKeys.list(projectId) });
    },
  });
}

// Deleting a terminal kills its tmux session. The mutation only needs the
// session id; callers pass the parent projectId so the right list query is
// invalidated.
export function useDeleteTerminal() {
  const qc = useQueryClient();
  return useMutation<void, Error, { sid: string; projectId: string }>({
    mutationFn: ({ sid }) => terminalsApi.remove(sid),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: terminalKeys.list(projectId) });
    },
  });
}

// Reads the same bearer token client.ts attaches as an Authorization header.
// Browsers cannot set headers on a WebSocket handshake, so the server accepts
// the token via the ?token= query param instead.
function authToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("dr.auth.token");
  } catch {
    return null;
  }
}

/**
 * Build the websocket URL for a terminal session's PTY bridge. Mirrors the
 * scheme/host resolution in src/api/ws.ts: an explicit VITE_WS_BASE wins,
 * otherwise upgrade the current page protocol to ws/wss. The auth token is
 * appended as a query param because WS handshakes can't carry headers.
 */
export function terminalWsUrl(sid: string): string {
  const path = `/evo-api/api/v1/terminals/${encodeURIComponent(sid)}/ws`;
  const token = authToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : "";

  const envBase = import.meta.env.VITE_WS_BASE;
  if (envBase) {
    const trimmed = String(envBase).replace(/\/$/, "");
    if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
      return `${trimmed}${path}${query}`;
    }
    if (typeof window !== "undefined") {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${window.location.host}${trimmed}${path}${query}`;
    }
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}${path}${query}`;
  }
  return `${path}${query}`;
}
