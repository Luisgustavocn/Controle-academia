import { forwardRef, InputHTMLAttributes, ReactNode, useId } from "react";
import { clsx } from "clsx";
import { Check } from "lucide-react";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: ReactNode;
  description?: ReactNode;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { id, label, description, className, disabled, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;

  return (
    <div className={clsx("flex items-start gap-2.5", className)}>
      <span className="relative mt-0.5 flex h-5 w-5 shrink-0">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          disabled={disabled}
          aria-describedby={descriptionId}
          className="peer h-5 w-5 cursor-pointer appearance-none rounded-ds-sm border border-line bg-card shadow-surface-sm outline-none transition checked:border-accent checked:bg-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          {...props}
        />
        <Check className="pointer-events-none absolute inset-0 m-auto hidden h-3.5 w-3.5 text-white peer-checked:block" aria-hidden="true" />
      </span>
      {label || description ? (
        <span className="min-w-0">
          {label ? <label htmlFor={inputId} className={clsx("block text-sm font-medium text-ink", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>{label}</label> : null}
          {description ? <span id={descriptionId} className="block text-helper text-muted">{description}</span> : null}
        </span>
      ) : null}
    </div>
  );
});
