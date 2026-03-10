import { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { clsx } from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accentDark",
  secondary: "bg-accentSoft text-ink hover:bg-[#f7d2d8]",
  ghost: "bg-transparent text-muted hover:bg-accentSoft",
  danger: "bg-danger text-white hover:bg-[#241c1f]"
};

export function Button({ children, className, variant = "primary", ...props }: PropsWithChildren<Props>) {
  return (
    <button
      className={clsx(
        "rounded-md px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
