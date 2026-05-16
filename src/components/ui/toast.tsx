/**
 * Tiny zustand-backed toast helper. Avoids pulling in a full toast library
 * (sonner, react-hot-toast, etc.) — for the small number of fire-and-forget
 * confirmations Phase G needs, a minimal portal stack is plenty.
 *
 * Usage:
 *   const { toast } = useToast();
 *   toast({ title: "Saved", description: "Settings persisted." });
 *
 * Render <Toaster /> once at the app root (or per-page).
 */

import * as React from "react";
import { create } from "zustand";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "error" | "info";

export type Toast = {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastInput = Omit<Toast, "id">;

type ToastState = {
  toasts: Toast[];
  push: (t: ToastInput) => string;
  dismiss: (id: string) => void;
};

function makeId(): string {
  // Avoid pulling crypto.randomUUID typing differences across TS lib versions
  // by composing a small token. Toasts are ephemeral; non-crypto-strong is fine.
  return `t-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = makeId();
    set((state) => ({ toasts: [...state.toasts, { ...t, id }] }));
    return id;
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export function useToast() {
  const push = useToastStore((s) => s.push);
  const dismiss = useToastStore((s) => s.dismiss);
  return React.useMemo(
    () => ({
      toast: (input: ToastInput) => push(input),
      dismiss,
    }),
    [push, dismiss],
  );
}

function variantClasses(variant: ToastVariant | undefined): string {
  switch (variant) {
    case "success":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-50";
    case "error":
      return "border-red-500/40 bg-red-500/10 text-red-50";
    case "info":
      return "border-sky-500/40 bg-sky-500/10 text-sky-50";
    default:
      return "border-border bg-card text-card-foreground";
  }
}

function VariantIcon({ variant }: { variant: ToastVariant | undefined }) {
  switch (variant) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "error":
      return <AlertTriangle className="h-4 w-4 text-red-400" />;
    case "info":
      return <Info className="h-4 w-4 text-sky-400" />;
    default:
      return <Info className="h-4 w-4 text-muted-foreground" />;
  }
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const duration = toast.durationMs ?? 4000;

  React.useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), duration);
    return () => window.clearTimeout(timer);
  }, [duration, dismiss, toast.id]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto flex w-72 items-start gap-2 rounded-md border p-3 shadow-lg",
        variantClasses(toast.variant),
      )}
    >
      <VariantIcon variant={toast.variant} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-xs opacity-80 line-clamp-3">
            {toast.description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
