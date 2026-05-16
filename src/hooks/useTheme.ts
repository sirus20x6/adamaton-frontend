import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "dr.theme";

function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light" || value === "system";
}

function readStored(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isTheme(raw)) return raw;
  } catch {
    // localStorage may be unavailable (private mode, sandbox)
  }
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(theme: Theme): ResolvedTheme {
  if (theme === "system") return systemPrefersDark() ? "dark" : "light";
  return theme;
}

function applyResolved(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

function persist(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore (private mode, sandbox, etc.)
  }
}

/**
 * Theme toggle hook with three modes: `light`, `dark`, and `system`.
 *
 * The initial document class is set in index.html before React mounts so
 * there is no light-mode flash on first paint. This hook reconciles the
 * stored preference, applies it, and listens for OS preference changes
 * while the user is in `system` mode.
 */
export function useTheme(): {
  /** The user's selected mode. */
  theme: Theme;
  /** What the page is currently showing — never `"system"`. */
  resolvedTheme: ResolvedTheme;
  setTheme: (t: Theme) => void;
  /** Cycle light → dark → system → light. */
  cycle: () => void;
} {
  const [theme, setThemeState] = useState<Theme>(readStored);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolve(readStored()),
  );

  // Reconcile after mount: applies the stored preference (which may differ
  // from the cached document class) and seeds the resolved theme state.
  useEffect(() => {
    const next = resolve(theme);
    applyResolved(next);
    setResolvedTheme(next);
  }, [theme]);

  // While in `system` mode, follow OS-level changes live.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      const next: ResolvedTheme = e.matches ? "dark" : "light";
      applyResolved(next);
      setResolvedTheme(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    persist(next);
    const resolved = resolve(next);
    applyResolved(resolved);
    setThemeState(next);
    setResolvedTheme(resolved);
  }, []);

  const cycle = useCallback(() => {
    setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
  }, [theme, setTheme]);

  return { theme, resolvedTheme, setTheme, cycle };
}
