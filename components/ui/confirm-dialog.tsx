"use client";

import { ReactNode } from "react";
import { Button, ButtonVariant } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: Extract<ButtonVariant, "primary" | "danger">;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirmar", cancelLabel = "Cancelar", confirmVariant = "primary", loading, onConfirm }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>{cancelLabel}</Button>
          <Button variant={confirmVariant} loading={loading} onClick={() => void onConfirm()}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="text-body text-muted">{description}</div>
    </Dialog>
  );
}
