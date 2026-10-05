import { HTMLAttributes, LabelHTMLAttributes, ReactNode, useId } from "react";
import { clsx } from "clsx";

type FormFieldProps = HTMLAttributes<HTMLDivElement> & {
  label?: ReactNode;
  htmlFor?: string;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
};

export function FormField({ label, htmlFor, description, error, required, className, children, ...props }: FormFieldProps) {
  return (
    <div className={clsx("space-y-1.5", className)} {...props}>
      {label ? <Label htmlFor={htmlFor} required={required}>{label}</Label> : null}
      {children}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}

export function Label({ className, required, children, ...props }: LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={clsx("block text-label text-ink", className)} {...props}>
      {children}
      {required ? <span className="ml-1 text-danger" aria-hidden="true">*</span> : null}
      {required ? <span className="sr-only"> (obrigatório)</span> : null}
    </label>
  );
}

export function FieldDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={clsx("text-helper text-muted", className)} {...props} />;
}

export function FieldError({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p role="alert" className={clsx("text-helper font-medium text-danger", className)} {...props} />;
}

export function useFieldIds(id?: string) {
  const generated = useId();
  const controlId = id ?? generated;
  return {
    controlId,
    descriptionId: `${controlId}-description`,
    errorId: `${controlId}-error`
  };
}
