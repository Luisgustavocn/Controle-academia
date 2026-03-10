import { PropsWithChildren } from "react";
import { clsx } from "clsx";

export function Card({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <section
      className={clsx(
        "rounded-2xl border border-white/70 bg-[rgba(255,255,255,0.86)] p-4 shadow-[0_10px_30px_rgba(48,20,26,0.08)] backdrop-blur-sm",
        className
      )}
    >
      {children}
    </section>
  );
}
