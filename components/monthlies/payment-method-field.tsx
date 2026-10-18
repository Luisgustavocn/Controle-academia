"use client";

import { useEffect, useMemo, useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";

type PaymentMethodOption = { id: string; nome: string; ativo: boolean };

export function withHistoricalPaymentMethod(options: PaymentMethodOption[], currentValue: string) {
  const current = currentValue.trim();
  if (!current || options.some((option) => option.nome === current)) return options;
  return [{ id: `historical:${current}`, nome: current, ativo: false }, ...options];
}

export function PaymentMethodField({
  id,
  value,
  error,
  required = true,
  application = "RECEBIMENTO",
  onChange
}: {
  id: string;
  value: string;
  error?: string;
  required?: boolean;
  application?: "RECEBIMENTO" | "DESPESA";
  onChange: (value: string) => void;
}) {
  const [options, setOptions] = useState<PaymentMethodOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setLoadError("");
    void fetch(`/api/formas-pagamento?ativo=true&aplicacao=${application}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { items?: PaymentMethodOption[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar as formas de pagamento");
        if (active) setOptions(Array.isArray(payload.items) ? payload.items : []);
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === "AbortError") return;
        if (active) setLoadError(cause instanceof Error ? cause.message : "Não foi possível carregar as formas de pagamento");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      controller.abort();
    };
  }, [application]);

  const visibleOptions = useMemo(() => withHistoricalPaymentMethod(options, value), [options, value]);

  return (
    <FormField
      label="Forma de pagamento"
      htmlFor={id}
      required={required}
      error={error || loadError}
      errorId={`${id}-error`}
      description={loading ? "Carregando formas de pagamento..." : undefined}
    >
      <Select
        id={id}
        value={value}
        required={required}
        error={Boolean(error || loadError)}
        aria-describedby={error || loadError ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecione</option>
        {visibleOptions.map((option) => (
          <option key={option.id} value={option.nome}>
            {option.nome}{option.ativo ? "" : " (histórica/inativa)"}
          </option>
        ))}
      </Select>
    </FormField>
  );
}
