"use client";

import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

export function PaymentMethodField({
  id,
  value,
  error,
  required = true,
  onChange
}: {
  id: string;
  value: string;
  error?: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <FormField label="Forma de pagamento" htmlFor={id} required={required}>
      <Input
        id={id}
        value={value}
        required={required}
        error={error}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Pix, dinheiro, cartão..."
      />
    </FormField>
  );
}
