import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmDialogProps = {
  /** Controlled open state. */
  open: boolean;
  /** Called with the next open state (false on cancel / overlay close). */
  onOpenChange: (open: boolean) => void;
  /** Heading shown at the top of the dialog. */
  title: React.ReactNode;
  /** Body copy explaining what the action does. */
  description?: React.ReactNode;
  /** Confirm button label. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /**
   * Visual treatment for the confirm button. Destructive actions (delete,
   * dismiss) should pass ``"destructive"`` so the button reads as dangerous.
   */
  confirmVariant?: "default" | "destructive";
  /**
   * Invoked when the user confirms. The dialog does NOT auto-close — the
   * caller closes it (typically in the mutation's ``onSettled``/``onSuccess``)
   * so a pending spinner can stay visible while the request is in flight.
   */
  onConfirm: () => void;
  /** When true the confirm button shows ``busyLabel`` and both buttons lock. */
  busy?: boolean;
  /** Label shown on the confirm button while ``busy`` is true. */
  busyLabel?: string;
  /** Optional extra content rendered between the description and the footer. */
  children?: React.ReactNode;
};

/**
 * A controlled confirmation dialog built on the shared Radix ``Dialog``
 * primitive. Replaces native ``window.confirm()`` so destructive actions get
 * a focus-trapped, themed, keyboard-accessible modal that matches the rest of
 * the app (see ``CorpusDetail.tsx`` for the original delete-dialog pattern
 * this generalizes).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "default",
  onConfirm,
  busy = false,
  busyLabel,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Block dismissal while the confirmed action is running so the user
        // can't lose the in-progress dialog by mis-clicking the overlay.
        if (busy && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            size="sm"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
