/**
 * Typed wrappers around the v1.0/v1.1 on-chain observability daemons:
 *
 *   audit-monitor      (default :9275)  →  /network-api/audit/*
 *   federation-monitor (default :9276)  →  /network-api/federation/*
 *   ledger-monitor     (default :9277)  →  /network-api/ledger/*
 *   finalize-bot       (default :9278)  →  /network-api/finalizer/*
 *
 * In dev the vite proxy in vite.config.ts rewrites the /network-api
 * prefix away so each daemon sees its own native path. In prod, Caddy
 * needs the same path map (TODO: add to platform Caddyfile).
 *
 * This file currently only exposes the audit-monitor surface — the
 * federation, ledger, and finalizer wrappers will land in follow-up
 * PRs as the Network section grows.
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";

// --- shared --------------------------------------------------------------

/**
 * MonitorHealth is the common shape returned by /health on every
 * monitor daemon (audit / ledger / federation / finalizer). The base
 * fields come from p2p/eth/eventindexer's RegisterMetricsAndHealth;
 * each monitor adds its own count fields (outcomes_count, jobs_count,
 * etc.) — those land as extra keys on the same object.
 */
export type MonitorHealth = {
  status: "ok" | "degraded";
  rpc_reachable: boolean;
  rpc_checked_at?: string;
  last_event_at?: string;
  // Per-monitor extras — string keys to avoid one type per daemon.
  [key: string]: unknown;
};

// --- audit-monitor -------------------------------------------------------

/**
 * AuditOutcome mirrors p2p/eth/auditmonitor.Outcome's JSON shape.
 * Fields are populated incrementally as events arrive: Posted first,
 * then optionally Challenged, then optionally FinalizedChallenged.
 */
export type AuditOutcome = {
  job_id: string; // 32-byte hex, no 0x prefix
  worker: string; // 0x-prefixed lowercase hex
  pass: boolean;
  similarity_bps: number;
  posted_at: string; // RFC3339 UTC
  posted_block: number;
  posted_tx?: string;
  challenged: boolean;
  challenger?: string;
  challenged_at?: string;
  challenged_tx?: string;
  finalized_challenged: boolean;
  finalized_challenged_at?: string;
};

export const auditApi = {
  health: () => api.get<MonitorHealth>("/network-api/audit/health"),
  outcomes: () => api.get<AuditOutcome[]>("/network-api/audit/outcomes"),
};

export const AUDIT_HEALTH_QUERY_KEY = ["network", "audit", "health"] as const;
export const AUDIT_OUTCOMES_QUERY_KEY = [
  "network",
  "audit",
  "outcomes",
] as const;

/**
 * Polls audit-monitor's /health at a fixed cadence so the page can
 * surface "degraded" / "monitor offline" without manual refresh.
 * Default 30s matches the daemon's own --health-poll-interval default.
 */
export function useAuditHealth(refetchInterval = 30_000) {
  return useQuery<MonitorHealth, Error>({
    queryKey: AUDIT_HEALTH_QUERY_KEY,
    queryFn: auditApi.health,
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: refetchInterval,
    retry: 1,
  });
}

/**
 * Polls audit-monitor's /outcomes. The daemon's outcome map is
 * in-memory + bounded by chain activity; even a busy network produces
 * sub-1k entries between restarts. 10s refresh is generous enough
 * to feel live without spamming the daemon.
 */
export function useAuditOutcomes(refetchInterval = 10_000) {
  return useQuery<AuditOutcome[], Error>({
    queryKey: AUDIT_OUTCOMES_QUERY_KEY,
    queryFn: auditApi.outcomes,
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: refetchInterval,
    retry: 1,
  });
}

// --- formatters used by Network pages -----------------------------------

/**
 * Short-hex an Ethereum address (or any 0x-prefixed hex) for tables:
 * 0x17d8CBB8…02108. Falls back to the original string on parse
 * failure.
 */
export function shortHex(value: string | undefined, head = 6, tail = 4): string {
  if (!value) return "";
  if (value.length <= head + tail + 2) return value;
  if (value.startsWith("0x")) {
    return `${value.slice(0, head + 2)}…${value.slice(-tail)}`;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/**
 * Render a similarityBps value (0..10000) as a percentage with one
 * decimal place. similarity_bps=9750 → "97.5%".
 */
export function formatBpsPercent(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

/**
 * Render an RFC3339 timestamp as a "x ago" relative string. Returns
 * an empty string if the input is empty/invalid so empty optional
 * fields render as blank cells.
 */
export function relativeAge(iso: string | undefined): string {
  if (!iso) return "";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  const deltaSec = Math.max(0, (Date.now() - parsed) / 1000);
  if (deltaSec < 60) return `${Math.floor(deltaSec)}s ago`;
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
  return `${Math.floor(deltaSec / 86400)}d ago`;
}
