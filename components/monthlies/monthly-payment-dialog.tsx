"use client";

import { useEffect, useState } from "react";
import { PaymentMethodField } from "@/components/monthlies/payment-method-field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

export type PayableMonthly = {
  id: string;
  competence: string;
  dueAt: string;
  originalValue: number;
  finalValue: number | null;
  adjustmentReason: string | null;
  totalPaid: number;
  balance: number;
  status: string;
  studentName?: string;
};

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function today() { return new Date().toLocaleDateString("en-CA"); }

export function MonthlyPaymentDialog({ monthly, open, onOpenChange, onSaved }: {
  monthly: PayableMonthly | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [finalValue, setFinalValue] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("");
  const [paidAt, setPaidAt] = useState(today());
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open || !monthly) return;
    setAmount(monthly.balance.toFixed(2));
    setFinalValue((monthly.finalValue ?? monthly.originalValue).toFixed(2));
    setReason(monthly.adjustmentReason ?? "");
    setMethod("");
    setPaidAt(today());
    setIdempotencyKey(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setErrors({});
    setMessage("");
  }, [monthly, open]);

  async function submit() {
    if (!monthly) return;
    const next: Record<string, string> = {};
    const received = Number(amount.replace(",", "."));
    const adjusted = Number(finalValue.replace(",", "."));
    const original = monthly.originalValue;
    if (!Number.isFinite(received) || received <= 0) next.amount = "Informe um valor recebido maior que zero.";
    if (!Number.isFinite(adjusted) || adjusted <= 0) next.finalValue = "Informe um valor final maior que zero.";
    if (Number.isFinite(adjusted) && adjusted < monthly.totalPaid) next.finalValue = "O valor final não pode ser menor que o total já pago.";
    if (Number.isFinite(adjusted) && Math.abs(adjusted - original) > 0.001 && !reason.trim()) next.reason = "Informe o motivo do ajuste.";
    const projectedBalance = Number.isFinite(adjusted) ? adjusted - monthly.totalPaid : monthly.balance;
    if (Number.isFinite(received) && received > projectedBalance + 0.001) next.amount = "O recebimento não pode exceder o saldo restante.";
    if (!method) next.method = "Forma de pagamento é obrigatória.";
    if (!paidAt) next.paidAt = "Data do pagamento é obrigatória.";
    if (Object.keys(next).length) { setErrors(next); setMessage("Revise os campos destacados."); return; }

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/mensalidades/${monthly.id}/pagamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valor: amount,
          valorFinal: finalValue,
          motivoAjuste: reason,
          formaPagamento: method,
          dataPagamento: paidAt,
          idempotencyKey
        })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível registrar o pagamento");
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível registrar o pagamento");
    } finally {
      setSaving(false);
    }
  }

  if (!monthly) return null;
  return <Dialog open={open} onOpenChange={(value) => { if (!saving) onOpenChange(value); }} title="Dar baixa na mensalidade" description={`${monthly.studentName ? `${monthly.studentName} • ` : ""}${monthly.competence}`} className="max-w-xl" footer={<><Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button><Button loading={saving} onClick={() => void submit()}>Confirmar pagamento</Button></>}>
    <div className="space-y-4">
      <div className="grid gap-2 rounded-ds-lg border border-line bg-surface/60 p-3 text-sm sm:grid-cols-2">
        <p><span className="text-muted">Valor original:</span> <strong>{currency(monthly.originalValue)}</strong></p>
        <p><span className="text-muted">Total pago:</span> <strong>{currency(monthly.totalPaid)}</strong></p>
        <p><span className="text-muted">Saldo atual:</span> <strong>{currency(monthly.balance)}</strong></p>
        <p><span className="text-muted">Status:</span> <strong>{monthly.status}</strong></p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Valor final" htmlFor="monthly-final-value" required error={errors.finalValue}><Input id="monthly-final-value" type="number" min="0.01" step="0.01" value={finalValue} error={errors.finalValue} onChange={(event) => { setFinalValue(event.target.value); setErrors((current) => ({ ...current, finalValue: "" })); }} /></FormField>
        <FormField label="Valor recebido" htmlFor="monthly-received-value" required error={errors.amount}><Input id="monthly-received-value" type="number" min="0.01" step="0.01" value={amount} error={errors.amount} onChange={(event) => { setAmount(event.target.value); setErrors((current) => ({ ...current, amount: "" })); }} /></FormField>
        <FormField label="Data do pagamento" htmlFor="monthly-paid-at" required error={errors.paidAt}><Input id="monthly-paid-at" type="date" value={paidAt} error={errors.paidAt} onChange={(event) => { setPaidAt(event.target.value); setErrors((current) => ({ ...current, paidAt: "" })); }} /></FormField>
        <PaymentMethodField id="monthly-payment-method" value={method} error={errors.method} onChange={(value) => { setMethod(value); setErrors((current) => ({ ...current, method: "" })); }} />
      </div>
      <FormField label="Motivo do ajuste" htmlFor="monthly-adjustment-reason" description="Obrigatório quando o valor final for diferente do original." error={errors.reason}><textarea id="monthly-adjustment-reason" rows={3} value={reason} aria-invalid={Boolean(errors.reason)} onChange={(event) => { setReason(event.target.value); setErrors((current) => ({ ...current, reason: "" })); }} className="w-full rounded-ds-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" /></FormField>
      {message ? <p role="alert" className="text-sm font-medium text-danger">{message}</p> : null}
    </div>
  </Dialog>;
}
