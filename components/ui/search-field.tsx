"use client";

import { forwardRef } from "react";
import { Search, X } from "lucide-react";
import { clsx } from "clsx";
import { Input, InputProps } from "@/components/ui/input";

export type SearchFieldProps = Omit<InputProps, "type" | "leadingIcon"> & {
  onClear?: () => void;
  clearLabel?: string;
};

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField({ value, defaultValue, onClear, clearLabel = "Limpar busca", className, containerClassName, ...props }, ref) {
  const hasValue = typeof value === "string" ? value.length > 0 : typeof defaultValue === "string" && defaultValue.length > 0;
  return (
    <div className={clsx("relative w-full", containerClassName)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <Input ref={ref} type="search" value={value} defaultValue={defaultValue} className={clsx("pl-9", onClear && hasValue && "pr-10", className)} {...props} />
      {onClear && hasValue ? (
        <button type="button" onClick={onClear} aria-label={clearLabel} className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-ds-md text-muted hover:bg-accentSoft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
});
