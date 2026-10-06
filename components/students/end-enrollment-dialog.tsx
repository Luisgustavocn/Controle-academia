"use client";

import { useState } from "react";
import { academyToday } from "@/lib/attendance-date";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function EndEnrollmentDialog({ open, onOpenChange, studentId, onEnded }: { open: boolean; onOpenChange: (open: boolean) => void; studentId: string; onEnded: () => void | Promise<void> }) {
  const [exitDate, setExitDate] = useState(academyToday());
  const [status, setStatus] = useState<"CANCELADO" | "TRANCADO">("CANCELADO");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/alunos/${studentId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataSaida: exitDate, status, motivo: reason })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível encerrar a matrícula");
      onOpenChange(false);
      await onEnded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível encerrar a matrícula");
    } finally {
      setLoading(false);
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange} title="Encerrar matrícula" description="A data de saída é o último dia ativo. O histórico financeiro e operacional será preservado." footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Voltar</Button><Button variant="danger" loading={loading} onClick={() => void submit()}>Encerrar matrícula</Button></>}>
    <div className="grid gap-4">
      <FormField label="Último dia ativo" htmlFor="end-enrollment-date" required><Input id="end-enrollment-date" type="date" value={exitDate} onChange={(event) => setExitDate(event.target.value)} /></FormField>
      <FormField label="Situação cadastral" htmlFor="end-enrollment-status"><Select id="end-enrollment-status" value={status} onChange={(event) => setStatus(event.target.value as "CANCELADO" | "TRANCADO")}><option value="CANCELADO">Cancelado</option><option value="TRANCADO">Trancado</option></Select></FormField>
      <FormField label="Motivo (opcional)" htmlFor="end-enrollment-reason"><Input id="end-enrollment-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></FormField>
      {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
    </div>
  </Dialog>;
}
