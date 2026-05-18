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
 * does the same with `uri strip_prefix /network-api/<daemon>` on each
 * @<daemon>_monitor matcher (deploy/pi5/Caddyfile).
 *
 * Each daemon shares the eventindexer.Base /health surface so the
 * MonitorHealth type is reused; per-monitor count fields land as extra
 * keys on the same object.
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

// --- federation-monitor --------------------------------------------------

/**
 * CreditLine mirrors p2p/eth/federationmonitor.CreditLine — running
 * totals of credit extended and repaid between a creditor/debtor pair.
 * extended_wei / repaid_wei are uint256 stringified; use formatWei to
 * render. Outstanding = extended - repaid (caller-computed).
 */
export type CreditLine = {
  creditor: string;
  debtor: string;
  extended_wei: string;
  repaid_wei: string;
  last_event_at: string;
  last_event_block: number;
  last_event_tx?: string;
};

/**
 * CreditPolicy mirrors p2p/eth/federationmonitor.CreditPolicy — the
 * latest per-creditor policy (per-node max + total exposure caps).
 */
export type CreditPolicy = {
  creditor: string;
  per_node_max_wei: string;
  total_exposure_wei: string;
  set_at: string;
  set_block: number;
  set_tx?: string;
};

/**
 * ReputationSnapshot mirrors p2p/eth/federationmonitor.ReputationSnapshot.
 * earned_score is uint256 stringified for parity with the wei fields,
 * but in practice it's small enough to render as-is.
 */
export type ReputationSnapshot = {
  node: string;
  earned_score: string;
  default_count: number;
  donations_total_wei: string;
  burned: boolean;
  burned_at?: string;
  burned_tx?: string;
  last_event_at: string;
  last_event_block: number;
};

/**
 * Pool mirrors p2p/eth/federationmonitor.Pool — registry entry for a
 * federation pool. members is the live membership set (joined - left);
 * member_count is precomputed by the daemon.
 */
export type Pool = {
  pool_id: string;
  operator: string;
  tax_bps: number;
  members: string[];
  member_count: number;
  registered_at: string;
  registered_tx?: string;
};

export const federationApi = {
  health: () => api.get<MonitorHealth>("/network-api/federation/health"),
  creditLines: () => api.get<CreditLine[]>("/network-api/federation/credit_lines"),
  creditPolicies: () =>
    api.get<CreditPolicy[]>("/network-api/federation/credit_policies"),
  reputations: () =>
    api.get<ReputationSnapshot[]>("/network-api/federation/reputations"),
  pools: () => api.get<Pool[]>("/network-api/federation/pools"),
};

export const FEDERATION_HEALTH_QUERY_KEY = [
  "network",
  "federation",
  "health",
] as const;
export const FEDERATION_CREDIT_LINES_QUERY_KEY = [
  "network",
  "federation",
  "credit_lines",
] as const;
export const FEDERATION_CREDIT_POLICIES_QUERY_KEY = [
  "network",
  "federation",
  "credit_policies",
] as const;
export const FEDERATION_REPUTATIONS_QUERY_KEY = [
  "network",
  "federation",
  "reputations",
] as const;
export const FEDERATION_POOLS_QUERY_KEY = [
  "network",
  "federation",
  "pools",
] as const;

export function useFederationHealth(refetchInterval = 30_000) {
  return useQuery<MonitorHealth, Error>({
    queryKey: FEDERATION_HEALTH_QUERY_KEY,
    queryFn: federationApi.health,
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: refetchInterval,
    retry: 1,
  });
}

export function useCreditLines(refetchInterval = 10_000) {
  return useQuery<CreditLine[], Error>({
    queryKey: FEDERATION_CREDIT_LINES_QUERY_KEY,
    queryFn: federationApi.creditLines,
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: refetchInterval,
    retry: 1,
  });
}

export function useCreditPolicies(refetchInterval = 30_000) {
  return useQuery<CreditPolicy[], Error>({
    queryKey: FEDERATION_CREDIT_POLICIES_QUERY_KEY,
    queryFn: federationApi.creditPolicies,
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: refetchInterval,
    retry: 1,
  });
}

export function useReputations(refetchInterval = 10_000) {
  return useQuery<ReputationSnapshot[], Error>({
    queryKey: FEDERATION_REPUTATIONS_QUERY_KEY,
    queryFn: federationApi.reputations,
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: refetchInterval,
    retry: 1,
  });
}

export function usePools(refetchInterval = 30_000) {
  return useQuery<Pool[], Error>({
    queryKey: FEDERATION_POOLS_QUERY_KEY,
    queryFn: federationApi.pools,
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: refetchInterval,
    retry: 1,
  });
}

// --- ledger-monitor ------------------------------------------------------

/**
 * StakeSnapshot mirrors p2p/eth/ledgermonitor.StakeSnapshot — running
 * totals of stake deposited and withdrawn per node. Locked stake is
 * tracked separately on each JobLifecycle (stake_wei on the locked
 * phase).
 */
export type StakeSnapshot = {
  node: string;
  deposited_wei: string;
  withdrawn_wei: string;
  last_event_at: string;
  last_event_block: number;
  last_event_tx?: string;
};

/**
 * JobLifecycle mirrors p2p/eth/ledgermonitor.JobLifecycle. Lock /
 * settle / slash flags are mutually compatible with the contract's
 * semantics: a job is always locked first, then either settled OR
 * slashed (never both).
 */
export type JobLifecycle = {
  job_id: string; // 32-byte hex, no 0x prefix

  // Lock phase
  locked: boolean;
  worker?: string;
  publisher?: string;
  stake_wei?: string;
  gross_wei?: string;
  locked_at?: string;
  locked_block?: number;
  locked_tx?: string;

  // Settle phase
  settled: boolean;
  paid_wei?: string;
  network_tax_wei?: string;
  pool_tax_wei?: string;
  settled_at?: string;
  settled_block?: number;
  settled_tx?: string;

  // Slash phase
  slashed: boolean;
  slashed_stake_wei?: string;
  slash_fraction_bps?: number;
  slashed_at?: string;
  slashed_block?: number;
  slashed_tx?: string;
};

export const ledgerApi = {
  health: () => api.get<MonitorHealth>("/network-api/ledger/health"),
  stakes: () => api.get<StakeSnapshot[]>("/network-api/ledger/stakes"),
  jobs: () => api.get<JobLifecycle[]>("/network-api/ledger/jobs"),
};

export const LEDGER_HEALTH_QUERY_KEY = ["network", "ledger", "health"] as const;
export const LEDGER_STAKES_QUERY_KEY = [
  "network",
  "ledger",
  "stakes",
] as const;
export const LEDGER_JOBS_QUERY_KEY = ["network", "ledger", "jobs"] as const;

export function useLedgerHealth(refetchInterval = 30_000) {
  return useQuery<MonitorHealth, Error>({
    queryKey: LEDGER_HEALTH_QUERY_KEY,
    queryFn: ledgerApi.health,
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: refetchInterval,
    retry: 1,
  });
}

export function useStakes(refetchInterval = 10_000) {
  return useQuery<StakeSnapshot[], Error>({
    queryKey: LEDGER_STAKES_QUERY_KEY,
    queryFn: ledgerApi.stakes,
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: refetchInterval,
    retry: 1,
  });
}

export function useJobs(refetchInterval = 10_000) {
  return useQuery<JobLifecycle[], Error>({
    queryKey: LEDGER_JOBS_QUERY_KEY,
    queryFn: ledgerApi.jobs,
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: refetchInterval,
    retry: 1,
  });
}

// --- finalize-bot --------------------------------------------------------

/**
 * Finalize-bot's HTTP surface is a thin /health + /metrics (the bot is
 * a writer, not an indexer — there's no per-event store to expose).
 * Until the daemon is deployed, this hook will simply error out and the
 * Health page renders it as "Daemon unreachable" with the same red
 * pill the other daemons use when offline.
 */
export const finalizerApi = {
  health: () => api.get<MonitorHealth>("/network-api/finalizer/health"),
};

export const FINALIZER_HEALTH_QUERY_KEY = [
  "network",
  "finalizer",
  "health",
] as const;

export function useFinalizerHealth(refetchInterval = 30_000) {
  return useQuery<MonitorHealth, Error>({
    queryKey: FINALIZER_HEALTH_QUERY_KEY,
    queryFn: finalizerApi.health,
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
 * fields render as blank cells. The daemons emit zero-valued times as
 * "0001-01-01T00:00:00Z"; treat those as missing too.
 */
export function relativeAge(iso: string | undefined): string {
  if (!iso) return "";
  if (iso.startsWith("0001-01-01")) return "";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  const deltaSec = Math.max(0, (Date.now() - parsed) / 1000);
  if (deltaSec < 60) return `${Math.floor(deltaSec)}s ago`;
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
  return `${Math.floor(deltaSec / 86400)}d ago`;
}

/**
 * Render a wei value (uint256 stringified) as an ETH decimal with
 * `frac` digits after the point. Uses BigInt to avoid the float
 * precision loss that would mangle anything bigger than ~1e15 wei.
 * formatWei("1000000000000000000") → "1.000 ETH".
 * Empty/undefined → "" so blank cells stay blank.
 */
export function formatWei(
  wei: string | undefined,
  frac = 3,
  suffix = " ETH",
): string {
  if (wei == null || wei === "") return "";
  let value: bigint;
  try {
    value = BigInt(wei);
  } catch {
    return wei;
  }
  if (value === 0n) return `0${suffix}`;
  const negative = value < 0n;
  if (negative) value = -value;
  const ONE_ETH = 10n ** 18n;
  const whole = value / ONE_ETH;
  if (frac <= 0) {
    return `${negative ? "-" : ""}${whole.toString()}${suffix}`;
  }
  const scale = 10n ** BigInt(frac);
  const fracPart = (value * scale) / ONE_ETH - whole * scale;
  const fracStr = fracPart.toString().padStart(frac, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fracStr}${suffix}`;
}

/**
 * Subtract two wei strings as BigInts, returning the stringified
 * difference (or "0" if a is null/empty). Negative results are
 * preserved with a leading "-".
 */
export function subWei(a: string | undefined, b: string | undefined): string {
  let av: bigint;
  let bv: bigint;
  try {
    av = a == null || a === "" ? 0n : BigInt(a);
    bv = b == null || b === "" ? 0n : BigInt(b);
  } catch {
    return "0";
  }
  return (av - bv).toString();
}

/**
 * Render a basis-points integer (0..10000) as a percent string with
 * one decimal place. Used for tax_bps on pools and slash_fraction_bps
 * on jobs. formatBps(2500) → "25.0%".
 */
export function formatBps(bps: number | undefined): string {
  if (bps == null) return "";
  return `${(bps / 100).toFixed(1)}%`;
}
