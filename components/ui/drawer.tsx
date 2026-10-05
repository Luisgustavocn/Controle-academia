"use client";

import { ReactNode, RefObject, useCallback, useId, useRef } from "react";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/components/ui/focus-trap";

type DrawerSide = "left" | "right" | "bottom";

export type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: DrawerSide;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
};

const positions: Record<DrawerSide, string> = {
  left: "inset-y-0 left-0 h-full w-[min(90vw,24rem)] border-r",
  right: "inset-y-0 right-0 h-full w-[min(90vw,24rem)] border-l",
  bottom: "inset-x-0 bottom-0 max-h-[85vh] w-full rounded-t-ds-xl border-t"
};

export function Drawer({ open, onOpenChange, title, description, children, footer, side = "right", initialFocusRef, className }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useFocusTrap(open, panelRef, close, initialFocusRef);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default bg-black/55" onClick={close} aria-label="Fechar painel" tabIndex={-1} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={clsx("absolute flex flex-col border-line bg-card shadow-surface-md", positions[side], className)}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 id={titleId} className="text-section-title text-ink">{title}</h2>
            {description ? <p id={descriptionId} className="mt-1 text-body text-muted">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" onClick={close} aria-label="Fechar painel">
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4">{footer}</div> : null}
      </div>
    </div>
  );
}
