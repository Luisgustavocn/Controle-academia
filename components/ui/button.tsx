import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";
import { clsx } from "clsx";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border border-accent bg-accent text-white shadow-surface-sm hover:bg-accentDark hover:border-accentDark",
  secondary: "border border-line bg-card text-ink shadow-surface-sm hover:bg-accentSoft",
  outline: "border border-line bg-transparent text-ink hover:border-accent/50 hover:bg-accentSoft",
  ghost: "border border-transparent bg-transparent text-muted hover:bg-accentSoft hover:text-accentDark",
  danger: "border border-danger bg-danger text-white shadow-surface-sm hover:brightness-90"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-control-sm px-3 text-xs",
  md: "h-control-md px-4 text-sm",
  lg: "h-control-lg px-5 text-base",
  icon: "h-control-md w-control-md p-0"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    variant = "primary",
    size = "md",
    loading = false,
    leadingIcon,
    trailingIcon,
    disabled,
    type = "button",
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-ds-lg font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 active:brightness-95 disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {loading ? <LoadingSpinner size="sm" aria-hidden="true" /> : leadingIcon}
      {children}
      {!loading ? trailingIcon : null}
    </button>
  );
});
