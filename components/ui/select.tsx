import { forwardRef, SelectHTMLAttributes } from "react";
import { clsx } from "clsx";
import type { InputSize } from "@/components/ui/input";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  selectSize?: InputSize;
  error?: boolean;
};

const sizes: Record<InputSize, string> = {
  sm: "h-control-sm px-3 pr-8 text-xs",
  md: "h-control-md px-3 pr-9 text-sm",
  lg: "h-control-lg px-4 pr-10 text-base"
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, selectSize = "md", error, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      {...props}
      aria-invalid={error ? true : props["aria-invalid"]}
      className={clsx(
        "min-w-0 w-full rounded-ds-lg border border-line bg-card text-ink shadow-surface-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-bg disabled:text-muted",
        sizes[selectSize],
        error && "border-danger focus:border-danger focus:ring-danger/20",
        className
      )}
    />
  );
});
