import { PropsWithChildren } from "react";
import { clsx } from "clsx";

export function Card({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <section className={clsx("rounded-xl border border-line bg-card p-4 shadow-sm", className)}>{children}</section>;
}
