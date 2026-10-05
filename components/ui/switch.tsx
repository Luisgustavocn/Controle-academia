import { forwardRef, InputHTMLAttributes, ReactNode, useId } from "react";
import { clsx } from "clsx";

export type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role"> & {
  label?: ReactNode;
  description?: ReactNode;
};

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { id, label, description, className, disabled, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;

  return (
    <div className={clsx("flex items-start justify-between gap-3", className)}>
      {label || description ? (
        <span className="min-w-0">
          {label ? <label htmlFor={inputId} className={clsx("block text-sm font-medium text-ink", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>{label}</label> : null}
          {description ? <span id={descriptionId} className="block text-helper text-muted">{description}</span> : null}
        </span>
      ) : null}
      <label className={clsx("relative mt-0.5 inline-flex h-6 w-11 shrink-0", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          role="switch"
          disabled={disabled}
          aria-describedby={descriptionId}
          className="peer sr-only"
          {...props}
        />
        <span className="absolute inset-0 rounded-full border border-line bg-muted/25 transition peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2" />
        <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-card shadow-surface-sm transition-transform peer-checked:translate-x-5" />
      </label>
    </div>
  );
});
