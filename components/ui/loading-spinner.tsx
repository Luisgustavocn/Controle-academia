import { clsx } from "clsx";
import { HTMLAttributes } from "react";

type SpinnerSize = "sm" | "md" | "lg";

const sizes: Record<SpinnerSize, string> = {
  sm: "h-4 w-4 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-8 w-8 border-[3px]"
};

export function LoadingSpinner({ className, size = "md", "aria-label": ariaLabel, ...props }: HTMLAttributes<HTMLSpanElement> & { size?: SpinnerSize }) {
  return (
    <span
      role="status"
      aria-label={ariaLabel ?? "Carregando"}
      className={clsx("inline-block animate-spin rounded-full border-current border-r-transparent motion-reduce:animate-none", sizes[size], className)}
      {...props}
    />
  );
}
