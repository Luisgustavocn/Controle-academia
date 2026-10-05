import { cloneElement, ReactElement, ReactNode, useId } from "react";
import { clsx } from "clsx";

export function Tooltip({ content, children, side = "top", className }: { content: ReactNode; children: ReactElement<{ "aria-describedby"?: string }>; side?: "top" | "bottom" | "left" | "right"; className?: string }) {
  const id = useId();
  const describedBy = [children.props["aria-describedby"], id].filter(Boolean).join(" ");
  return (
    <span className={clsx("group relative inline-flex", className)}>
      {cloneElement(children, { "aria-describedby": describedBy })}
      <span
        id={id}
        role="tooltip"
        className={clsx(
          "pointer-events-none absolute z-50 w-max max-w-64 rounded-ds-md bg-ink px-2.5 py-1.5 text-xs text-white opacity-0 shadow-surface-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
          side === "top" && "bottom-[calc(100%+0.375rem)] left-1/2 -translate-x-1/2",
          side === "bottom" && "top-[calc(100%+0.375rem)] left-1/2 -translate-x-1/2",
          side === "left" && "right-[calc(100%+0.375rem)] top-1/2 -translate-y-1/2",
          side === "right" && "left-[calc(100%+0.375rem)] top-1/2 -translate-y-1/2"
        )}
      >
        {content}
      </span>
    </span>
  );
}
