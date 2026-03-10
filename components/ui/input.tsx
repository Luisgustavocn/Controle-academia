import { InputHTMLAttributes } from "react";
import { clsx } from "clsx";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "w-full rounded-xl border border-line/90 bg-white/95 px-3 py-2 text-sm text-ink outline-none ring-accent transition focus:border-accent/60 focus:ring-2",
        props.className
      )}
    />
  );
}
