import { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { X } from "lucide-react";
import { clsx } from "clsx";

export function FilterBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("flex flex-col gap-3 rounded-ds-xl border border-line bg-card p-3 shadow-surface-sm sm:flex-row sm:flex-wrap sm:items-end", className)} {...props} />;
}

export function FilterBarPrimary({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("min-w-0 flex-1", className)} {...props} />;
}

export function FilterBarActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("flex flex-wrap items-center gap-2", className)} {...props} />;
}

export function FilterChip({ className, children, onRemove, removeLabel = "Remover filtro", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { onRemove?: () => void; removeLabel?: string }) {
  if (onRemove) {
    return (
      <span className={clsx("inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accentSoft px-2.5 py-1 text-xs font-semibold text-accentDark", className)}>
        {children}
        <button type="button" onClick={onRemove} aria-label={removeLabel} className="rounded-full p-0.5 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      </span>
    );
  }
  return <button type="button" className={clsx("rounded-full border border-line bg-card px-2.5 py-1 text-xs font-semibold text-muted hover:bg-accentSoft hover:text-accentDark", className)} {...props}>{children}</button>;
}
