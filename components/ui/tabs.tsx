"use client";

import { createContext, HTMLAttributes, KeyboardEvent, ReactNode, useContext, useId, useMemo, useState } from "react";
import { clsx } from "clsx";

type TabsContextValue = {
  value: string;
  setValue: (value: string) => void;
  baseId: string;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Tabs components must be used inside Tabs");
  return context;
}

export function Tabs({ value, defaultValue = "", onValueChange, children, className }: { value?: string; defaultValue?: string; onValueChange?: (value: string) => void; children: ReactNode; className?: string }) {
  const [internal, setInternal] = useState(defaultValue);
  const selected = value ?? internal;
  const baseId = useId();
  const context = useMemo<TabsContextValue>(() => ({
    value: selected,
    baseId,
    setValue: (next) => {
      if (value === undefined) setInternal(next);
      onValueChange?.(next);
    }
  }), [baseId, onValueChange, selected, value]);
  return <TabsContext.Provider value={context}><div className={className}>{children}</div></TabsContext.Provider>;
}

export function TabsList({ className, onKeyDown, ...props }: HTMLAttributes<HTMLDivElement>) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || !["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='tab']:not([disabled])"));
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
    if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    event.preventDefault();
    tabs[next]?.focus();
    tabs[next]?.click();
  }
  return <div role="tablist" onKeyDown={handleKeyDown} className={clsx("flex max-w-full gap-1 overflow-x-auto border-b border-line", className)} {...props} />;
}

export function TabsTrigger({ value, className, children, ...props }: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value"> & { value: string }) {
  const context = useTabsContext();
  const active = context.value === value;
  const triggerId = `${context.baseId}-tab-${value}`;
  const panelId = `${context.baseId}-panel-${value}`;
  return (
    <button
      type="button"
      role="tab"
      id={triggerId}
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active ? 0 : -1}
      onClick={() => context.setValue(value)}
      className={clsx("min-h-control-md shrink-0 border-b-2 px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent", active ? "border-accent text-accentDark" : "border-transparent text-muted hover:text-ink", className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className, ...props }: HTMLAttributes<HTMLDivElement> & { value: string }) {
  const context = useTabsContext();
  if (context.value !== value) return null;
  return <div role="tabpanel" id={`${context.baseId}-panel-${value}`} aria-labelledby={`${context.baseId}-tab-${value}`} tabIndex={0} className={clsx("pt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent", className)} {...props} />;
}
