"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { clsx } from "clsx";

export type ToastTone = "success" | "error" | "warning" | "info";
export type ToastInput = { title: string; description?: string; tone?: ToastTone; duration?: number };
type ToastItem = ToastInput & { id: number };

type ToastContextValue = {
  toast: (input: ToastInput) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const styles: Record<ToastTone, string> = {
  success: "border-success/30 bg-successSoft text-success",
  error: "border-danger/30 bg-dangerSoft text-danger",
  warning: "border-warning/30 bg-warningSoft text-warning",
  info: "border-info/30 bg-infoSoft text-info"
};

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: TriangleAlert,
  info: Info
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());
  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);
  const toast = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    setItems((current) => [...current, { ...input, id }]);
    const timer = window.setTimeout(() => dismiss(id), input.duration ?? 5000);
    timers.current.set(id, timer);
    return id;
  }, [dismiss]);
  const value = useMemo(() => ({ toast, dismiss }), [dismiss, toast]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-4 z-[80] flex flex-col items-end gap-2 sm:left-auto sm:w-96" aria-live="polite" aria-atomic="false">
        {items.map((item) => {
          const tone = item.tone ?? "info";
          const Icon = icons[tone];
          return (
            <div key={item.id} role={tone === "error" ? "alert" : "status"} className={clsx("pointer-events-auto flex w-full items-start gap-3 rounded-ds-lg border p-3 shadow-surface-md", styles[tone])}>
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.title}</p>
                {item.description ? <p className="mt-0.5 text-xs opacity-90">{item.description}</p> : null}
              </div>
              <button type="button" onClick={() => dismiss(item.id)} aria-label="Fechar notificação" className="rounded-ds-sm p-1 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
