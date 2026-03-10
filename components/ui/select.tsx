import { SelectHTMLAttributes } from "react";
import { clsx } from "clsx";

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        "w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none ring-accent transition focus:ring-2",
        props.className
      )}
    />
  );
}
