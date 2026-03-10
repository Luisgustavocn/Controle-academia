import { InputHTMLAttributes } from "react";
import { clsx } from "clsx";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none ring-accent transition focus:ring-2",
        props.className
      )}
    />
  );
}
