import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn cn helper: composes class names through clsx and resolves Tailwind conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Fast non-cryptographic 32-bit FNV-1a hash, returned as an unsigned hex string.
 * Synchronous so it can be used directly as a React memo key without Promise plumbing.
 */
export function hashContent(s: string): string {
  let hash = 0x811c9dc5; // 2166136261
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    // 32-bit FNV prime multiplication via shifts to stay in int32 territory
    hash =
      (hash +
        ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>>
      0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Tiny human-readable relative timestamp. Accepts a Date or any string the
 * Date constructor understands; returns an em-dash for invalid input. The
 * scale is intentionally coarse — we want "3m ago" / "yesterday" density,
 * not millisecond accuracy.
 */
export function formatRelative(value: Date | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);
  const future = diffSec < 0;
  const fmt = (n: number, unit: string) =>
    `${future ? "in " : ""}${n}${unit}${future ? "" : " ago"}`;
  if (abs < 5) return future ? "in a moment" : "just now";
  if (abs < 60) return fmt(abs, "s");
  const min = Math.round(abs / 60);
  if (min < 60) return fmt(min, "m");
  const hr = Math.round(abs / 3600);
  if (hr < 24) return fmt(hr, "h");
  const day = Math.round(abs / 86400);
  if (day < 7) return fmt(day, "d");
  const week = Math.round(abs / (86400 * 7));
  if (week < 5) return fmt(week, "w");
  const month = Math.round(abs / (86400 * 30));
  if (month < 12) return fmt(month, "mo");
  const year = Math.round(abs / (86400 * 365));
  return fmt(year, "y");
}
