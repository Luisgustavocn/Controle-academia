import { cloneElement, ReactElement, ReactNode, useId } from "react";
import { clsx } from "clsx";

export function Tooltip({ content, children, side = "top", className }: { content: ReactNode; children: ReactElement<{ "aria-describedby"?: string }>; side?: "top" | "bottom"; className?: string }) {
  const id = useId();
  const describedBy = [children.props["aria-describedby"], id].filter(Boolean).join(" ");
  return (
    <span className={clsx("group relative inline-flex", className)}>
      {cloneElement(children, { "aria-describedby": describedBy })}
      <span
        id={id}
        role="tooltip"
        className={clsx(
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2 rounded-ds-md bg-ink px-2.5 py-1.5 text-xs text-white opacity-0 shadow-surface-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
          side === "top" ? "bottom-[calc(100%+0.375rem)]" : "top-[calc(100%+0.375rem)]"
        )}
      >
        {content}
      </span>
    </span>
  );
}
