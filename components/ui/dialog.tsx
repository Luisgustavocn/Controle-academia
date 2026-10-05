"use client";

import { ReactNode, RefObject, useCallback, useId, useRef } from "react";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/components/ui/focus-trap";

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  closeLabel?: string;
};

export function Dialog({ open, onOpenChange, title, description, children, footer, initialFocusRef, className, closeLabel = "Fechar diálogo" }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useFocusTrap(open, panelRef, close, initialFocusRef);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]" onClick={close} aria-label={closeLabel} tabIndex={-1} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={clsx("relative flex max-h-[min(90vh,48rem)] w-full max-w-lg flex-col overflow-hidden rounded-ds-xl border border-line bg-card shadow-surface-md", className)}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-section-title text-ink">{title}</h2>
            {description ? <p id={descriptionId} className="mt-1 text-body text-muted">{description}</p> : null}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={close} aria-label={closeLabel}>
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
