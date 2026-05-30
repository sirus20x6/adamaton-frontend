import * as React from "react";
import { AlertTriangle, Copy, RefreshCcw, Mail, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ErrorBoundaryProps = {
  children: React.ReactNode;
  /**
   * Optional override for the contact email. Falls back to the
   * ``VITE_ISSUE_EMAIL`` env var, then to ``undefined`` (in which case the
   * "Open issue" link is hidden).
   */
  contactEmail?: string;
  /**
   * Optional fallback override; when omitted we render the default centered
   * card. Useful for tests that want a smaller fallback.
   */
  fallback?: React.ReactNode;
  /**
   * Reset key — when this changes, the boundary clears its error state and
   * re-renders ``children``. Lets parents force a recovery (Sentry-style).
   */
  resetKey?: unknown;
  /**
   * Optional logger override; defaults to ``console.error``.
   */
  onError?: (error: unknown, info: React.ErrorInfo) => void;
};

type ErrorBoundaryState = {
  error: Error | null;
  info: React.ErrorInfo | null;
};

const initialState: ErrorBoundaryState = { error: null, info: null };

/** Resolve the configurable issue email at runtime. */
function defaultContactEmail(): string | undefined {
  const fromEnv = (
    import.meta.env.VITE_ISSUE_EMAIL ?? import.meta.env.VITE_USER_EMAIL
  ) as string | undefined;
  return typeof fromEnv === "string" && fromEnv.trim().length > 0
    ? fromEnv.trim()
    : undefined;
}

/** Format the captured error for the "Copy details" clipboard payload. */
function buildClipboardPayload(state: ErrorBoundaryState): string {
  const stamp = new Date().toISOString();
  const url =
    typeof window !== "undefined" ? window.location.href : "(no window)";
  const message = state.error?.message ?? "(no message)";
  const stack = state.error?.stack ?? "(no stack)";
  const componentStack = state.info?.componentStack ?? "(no component stack)";
  return [
    `timestamp: ${stamp}`,
    `location: ${url}`,
    `message: ${message}`,
    "",
    "stack:",
    stack,
    "",
    "componentStack:",
    componentStack,
  ].join("\n");
}

class ErrorBoundaryImpl extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = initialState;

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    const safe =
      error instanceof Error ? error : new Error(String(error ?? "unknown"));
    return { error: safe };
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    const safe =
      error instanceof Error ? error : new Error(String(error ?? "unknown"));
    // ``getDerivedStateFromError`` has already set ``error``; we only need to
    // attach the component stack so the fallback can render it.
    this.setState({ info });
    if (this.props.onError) {
      try {
        this.props.onError(safe, info);
      } catch {
        // never let the logger break the fallback render
      }
    } else {
      // eslint-disable-next-line no-console
      console.error("[ErrorBoundary]", safe, info);
    }
  }

  override componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      prevProps.resetKey !== this.props.resetKey &&
      this.state.error !== null
    ) {
      this.setState(initialState);
    }
  }

  reset = (): void => {
    this.setState(initialState);
  };

  override render(): React.ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }
    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }
    return (
      <ErrorFallback
        state={this.state}
        contactEmail={this.props.contactEmail ?? defaultContactEmail()}
        onReset={this.reset}
      />
    );
  }
}

function ErrorFallback({
  state,
  contactEmail,
  onReset,
}: {
  state: ErrorBoundaryState;
  contactEmail: string | undefined;
  onReset: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(buildClipboardPayload(state));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore — the user can still expand the <details> block manually
    }
  };

  const onReload = () => {
    if (typeof window === "undefined") return;
    window.location.reload();
  };

  const mailto = React.useMemo(() => {
    if (!contactEmail) return null;
    const url =
      typeof window !== "undefined" ? window.location.href : "(unknown URL)";
    const subject = `Bug report: ${state.error?.message ?? "page crash"}`.slice(
      0,
      120,
    );
    const body = [
      "I hit an error in the deep research platform:",
      "",
      `URL: ${url}`,
      `Time: ${new Date().toISOString()}`,
      "",
      "Stack trace:",
      state.error?.stack ?? "(no stack captured)",
    ].join("\n");
    return `mailto:${encodeURIComponent(
      contactEmail,
    )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [contactEmail, state.error]);

  return (
    <div className="flex min-h-full w-full flex-1 items-center justify-center bg-background p-6 text-foreground">
      <Card className="w-full max-w-xl border-destructive/40">
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                "bg-destructive/10 text-destructive",
              )}
              aria-hidden="true"
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <h1 className="text-lg font-semibold tracking-tight">
                Something went sideways.
              </h1>
              <p className="text-sm text-muted-foreground">
                A page-level error was caught by the boundary. The rest of the
                shell is still up — you can navigate away or try again.
              </p>
            </div>
          </div>

          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <p className="font-mono leading-snug">
              {state.error?.message ?? "(unknown error)"}
            </p>
          </div>

          <details className="group rounded-md border border-border bg-muted/40 p-2 text-xs">
            <summary className="cursor-pointer select-none text-muted-foreground">
              Stack trace
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.7rem] leading-snug text-foreground">
              {state.error?.stack ?? "(no stack)"}
            </pre>
          </details>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onReload}
              className="gap-1.5"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Reload page
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onReset}
              className="gap-1.5"
            >
              Try again
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCopy}
              className="gap-1.5"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy details"}
            </Button>
            {mailto ? (
              <a
                href={mailto}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs",
                  "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Mail className="h-3.5 w-3.5" />
                Open issue
              </a>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Compact inline fallback for *scoped* boundaries wrapped around a single
 * panel/subtree rather than a whole page. Unlike the default full-page card,
 * this stays inside the panel's box so a crash in one detail pane doesn't take
 * over the layout — the rest of the page keeps rendering.
 */
export function ScopedErrorFallback({
  label = "This panel hit an error.",
}: {
  label?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex h-full min-h-24 w-full flex-col items-start justify-center gap-1",
        "rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive",
      )}
    >
      <span className="inline-flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
      <span className="text-xs text-muted-foreground">
        The rest of the page is still usable — try reloading if it persists.
      </span>
    </div>
  );
}

/** Tiny imperative reset hook — wires to the boundary's `resetKey`. */
export function useResetErrorBoundary(): {
  resetKey: number;
  reset: () => void;
} {
  const [resetKey, setResetKey] = React.useState(0);
  const reset = React.useCallback(() => {
    setResetKey((n) => n + 1);
  }, []);
  return { resetKey, reset };
}

export const ErrorBoundary = ErrorBoundaryImpl;
