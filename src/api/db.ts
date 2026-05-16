/**
 * PostgREST client + query builder for the read-only ``/db/*`` API.
 *
 * Spans the same axios baseURL as the FastAPI client (``/``), so the
 * deployment can put PostgREST behind ``/db/*`` via Caddy/Nginx and we
 * keep relative URLs. Mutations stay on the FastAPI side; only GETs
 * route through here.
 *
 * The builder is intentionally minimal — just the PostgREST operators
 * we actually use: ``eq``, ``in``, ``ilike``, ``gte``, ``lte``,
 * ``not.is`` (for ``IS NOT NULL``), plus ``select``, ``order``,
 * ``limit``, ``offset`` and the ``Prefer: count=exact`` header that
 * enables the ``Content-Range`` total. The :func:`db.list` adapter
 * unpacks that header into a ``{items, count, total, limit, offset}``
 * envelope so call sites don't change shape vs. the old FastAPI
 * ``GET /platform/<resource>/`` responses.
 *
 * PostgREST docs: https://postgrest.org/en/v12/references/api/
 */

import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";

const baseURL = import.meta.env.VITE_API_BASE ?? "/";

export const dbHttp: AxiosInstance = axios.create({
  baseURL,
  timeout: 60_000,
  headers: { Accept: "application/json" },
});

/* ── Query builder ─────────────────────────────────────────────────────── */

export type DbOrderDir = "asc" | "desc";

export type DbOperator =
  | { op: "eq"; value: string | number | boolean }
  | { op: "neq"; value: string | number | boolean }
  | { op: "gt"; value: string | number }
  | { op: "gte"; value: string | number }
  | { op: "lt"; value: string | number }
  | { op: "lte"; value: string | number }
  | { op: "in"; value: ReadonlyArray<string | number | boolean> }
  | { op: "ilike"; value: string }
  | { op: "is"; value: "null" | "true" | "false" }
  | { op: "not.is"; value: "null" | "true" | "false" }
  | { op: "raw"; value: string }; // escape hatch — caller writes the full ``op.value``

export type DbFilters = Record<string, DbOperator | undefined | null>;

export type DbOrder = ReadonlyArray<{ column: string; dir?: DbOrderDir; nulls?: "first" | "last" }>;

export type DbListArgs = {
  /** Comma-separated column list, optionally with PostgREST embeds. */
  select?: string;
  filters?: DbFilters;
  order?: DbOrder;
  limit?: number;
  offset?: number;
  /** Request the ``Content-Range: 0-99/1234`` exact total. */
  withCount?: boolean;
};

function encodeOperator(op: DbOperator): string {
  switch (op.op) {
    case "raw":
      return op.value;
    case "in": {
      const items = op.value
        .map((v) => (typeof v === "string" ? `"${v.replace(/"/g, '\\"')}"` : String(v)))
        .join(",");
      return `in.(${items})`;
    }
    case "is":
    case "not.is":
      return `${op.op}.${op.value}`;
    case "ilike":
      return `ilike.${op.value}`;
    default:
      return `${op.op}.${op.value}`;
  }
}

function buildSearch(args: DbListArgs): URLSearchParams {
  const sp = new URLSearchParams();
  if (args.select && args.select.length > 0) {
    sp.set("select", args.select);
  }
  if (args.filters) {
    for (const [col, op] of Object.entries(args.filters)) {
      if (!op) continue;
      sp.append(col, encodeOperator(op));
    }
  }
  if (args.order && args.order.length > 0) {
    const parts = args.order.map((o) => {
      const dir = o.dir ?? "asc";
      const nulls = o.nulls ? `.nulls${o.nulls}` : "";
      return `${o.column}.${dir}${nulls}`;
    });
    sp.set("order", parts.join(","));
  }
  if (typeof args.limit === "number") sp.set("limit", String(args.limit));
  if (typeof args.offset === "number") sp.set("offset", String(args.offset));
  return sp;
}

/* ── Response envelope ─────────────────────────────────────────────────── */

export type DbListEnvelope<T> = {
  items: T[];
  count: number;
  total: number;
  limit: number;
  offset: number;
};

function parseContentRange(header: string | null | undefined): {
  start: number;
  end: number;
  total: number;
} | null {
  if (!header) return null;
  // PostgREST shape: "0-99/1234" or "*/0"
  const m = header.match(/^(?:(\d+)-(\d+))?\/(\d+|\*)$/);
  if (!m) return null;
  const start = m[1] ? Number(m[1]) : 0;
  const end = m[2] ? Number(m[2]) : 0;
  const total = m[3] === "*" ? 0 : Number(m[3]);
  return { start, end, total };
}

/* ── Public surface ────────────────────────────────────────────────────── */

export const db = {
  /** Raw list — returns the PostgREST array verbatim, no envelope. */
  async raw<T>(view: string, args: DbListArgs = {}, config?: AxiosRequestConfig): Promise<T[]> {
    const sp = buildSearch(args);
    const path = `/db/${view}${sp.toString() ? `?${sp.toString()}` : ""}`;
    const r = await dbHttp.get<T[]>(path, config);
    return r.data;
  },

  /** Envelope list — adds ``Prefer: count=exact`` and parses Content-Range. */
  async list<T>(view: string, args: DbListArgs = {}, config?: AxiosRequestConfig): Promise<DbListEnvelope<T>> {
    const sp = buildSearch(args);
    const path = `/db/${view}${sp.toString() ? `?${sp.toString()}` : ""}`;
    const r = await dbHttp.get<T[]>(path, {
      ...config,
      headers: {
        ...(config?.headers ?? {}),
        Prefer: "count=exact",
      },
    });
    const range = parseContentRange(
      (r.headers["content-range"] as string | undefined) ?? null,
    );
    return {
      items: r.data,
      count: r.data.length,
      total: range?.total ?? r.data.length,
      limit: args.limit ?? r.data.length,
      offset: args.offset ?? 0,
    };
  },

  /** Single-row fetch — picks the first row, throws if zero. */
  async one<T>(view: string, args: DbListArgs = {}, config?: AxiosRequestConfig): Promise<T> {
    const rows = await this.raw<T>(view, { ...args, limit: 1 }, config);
    if (rows.length === 0) {
      throw new Error(`db.one(${view}): no rows match`);
    }
    return rows[0];
  },

  /** RPC call — POST /db/rpc/{fn} with JSON body. */
  async rpc<T>(fn: string, args: Record<string, unknown> = {}, config?: AxiosRequestConfig): Promise<T> {
    const r = await dbHttp.post<T>(`/db/rpc/${fn}`, args, config);
    return r.data;
  },
};

export type Db = typeof db;
