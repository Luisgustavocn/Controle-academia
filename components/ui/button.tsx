import { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { clsx } from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-accent to-accentDark text-white shadow-[0_8px_20px_rgba(159,16,24,0.28)] hover:brightness-105",
  secondary: "border border-line bg-white text-ink hover:bg-accentSoft",
  ghost: "bg-transparent text-muted hover:bg-accentSoft hover:text-accentDark",
  danger: "bg-neutralDark text-white hover:bg-[#1a1518]"
};

export function Button({ children, className, variant = "primary", ...props }: PropsWithChildren<Props>) {
  return (
    <button
      className={clsx(
        "rounded-xl px-3.5 py-2 text-sm font-semibold transition duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
