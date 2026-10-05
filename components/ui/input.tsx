import { forwardRef, InputHTMLAttributes, ReactNode, useId } from "react";
import { clsx } from "clsx";

export type InputSize = "sm" | "md" | "lg";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  inputSize?: InputSize;
  leadingIcon?: ReactNode;
  description?: string;
  error?: string;
  containerClassName?: string;
};

const sizes: Record<InputSize, string> = {
  sm: "h-control-sm px-3 text-xs",
  md: "h-control-md px-3 text-sm",
  lg: "h-control-lg px-4 text-base"
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, inputSize = "md", leadingIcon, description, error, containerClassName, id, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [props["aria-describedby"], descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  const control = (
    <input
      ref={ref}
      id={inputId}
      {...props}
      aria-invalid={error ? true : props["aria-invalid"]}
      aria-describedby={describedBy}
      className={clsx(
        "w-full rounded-ds-lg border border-line bg-card text-ink shadow-surface-sm outline-none transition-colors placeholder:text-muted/75 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-bg disabled:text-muted",
        sizes[inputSize],
        leadingIcon && "pl-10",
        error && "border-danger focus:border-danger focus:ring-danger/20",
        className
      )}
    />
  );

  if (!leadingIcon && !description && !error) return control;

  return (
    <div className={clsx("w-full", containerClassName)}>
      <div className="relative">
        {leadingIcon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 text-muted" aria-hidden="true">
            {leadingIcon}
          </span>
        ) : null}
        {control}
      </div>
      {description ? <p id={descriptionId} className="mt-1 text-helper text-muted">{description}</p> : null}
      {error ? <p id={errorId} role="alert" className="mt-1 text-helper font-medium text-danger">{error}</p> : null}
    </div>
  );
});
