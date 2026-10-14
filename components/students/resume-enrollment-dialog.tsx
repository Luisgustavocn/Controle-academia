"use client";

import { useEffect, useState } from "react";
import type { StudentProfileOverview } from "@/lib/services/student-profile";
import { academyToday } from "@/lib/attendance-date";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Modality = { id: string; nome: string; ativa: boolean };

export function ResumeEnrollmentDialog({
  open,
  onOpenChange,
  student,
  onResumed
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: StudentProfileOverview["student"];
  onResumed: () => void | Promise<void>;
}) {
  const last = student.enrollment;
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [dataRetorno, setDataRetorno] = useState(academyToday());
  const [modalidadeId, setModalidadeId] = useState(last?.modality?.id ?? "");
  const [valorMensal, setValorMensal] = useState(last?.monthlyValue ? String(last.monthlyValue) : "");
  const [usarValorPadrao, setUsarValorPadrao] = useState(last?.useDefaultValue ?? true);
  const [diaVencimento, setDiaVencimento] = useState(String(last?.dueDay ?? student.dueDay));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setError("");
    setFieldErrors({});
    void fetch("/api/modalidades", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { items?: Modality[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar modalidades");
        setModalities(payload.items ?? []);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar modalidades"));
  }, [open]);

  async function submit() {
    const nextErrors: Record<string, string> = {};
    if (!dataRetorno) nextErrors.dataRetorno = "Data de retorno é obrigatória.";
    const dueDay = Number(diaVencimento);
    if (!diaVencimento) nextErrors.diaVencimento = "Dia do vencimento é obrigatório.";
    else if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) nextErrors.diaVencimento = "Informe um dia entre 1 e 31.";
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError("Revise os campos destacados.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/alunos/${student.id}/reativar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataRetorno,
          modalidadeId,
          valorMensal,
          usarValorPadrao,
          diaVencimento
        })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; field?: string };
      if (!response.ok) {
        const message = payload.error ?? "Não foi possível retomar a matrícula";
        const normalized = message.toLocaleLowerCase("pt-BR");
        const field = payload.field ?? (normalized.includes("retorno") || normalized.includes("data") ? "dataRetorno" : normalized.includes("vencimento") ? "diaVencimento" : "");
        if (field) setFieldErrors((current) => ({ ...current, [field]: message }));
        throw new Error(message);
      }
      onOpenChange(false);
      await onResumed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível retomar a matrícula");
    } finally {
      setLoading(false);
    }
  }

  return <Dialog
    open={open}
    onOpenChange={onOpenChange}
    title="Retomar matrícula"
    description="Confirme explicitamente as condições do novo período. O histórico anterior não será alterado."
    footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button loading={loading} onClick={() => void submit()}>Confirmar retomada</Button></>}
  >
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Data de retorno" htmlFor="resume-date" required><Input id="resume-date" type="date" value={dataRetorno} error={fieldErrors.dataRetorno} onChange={(event) => { setDataRetorno(event.target.value); if (event.target.value) { setFieldErrors((current) => ({ ...current, dataRetorno: "" })); setError(""); } }} /></FormField>
      <FormField label="Modalidade" htmlFor="resume-modality"><Select id="resume-modality" value={modalidadeId} onChange={(event) => setModalidadeId(event.target.value)}><option value="">Sem modalidade</option>{modalities.filter((item) => item.ativa || item.id === modalidadeId).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select></FormField>
      <FormField label="Valor mensal individual" htmlFor="resume-value"><Input id="resume-value" type="number" min="0.01" step="0.01" value={valorMensal} onChange={(event) => setValorMensal(event.target.value)} /></FormField>
      <FormField label="Dia do vencimento" htmlFor="resume-due" required><Input id="resume-due" type="number" min="1" max="31" value={diaVencimento} error={fieldErrors.diaVencimento} onChange={(event) => { setDiaVencimento(event.target.value); const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 31) { setFieldErrors((current) => ({ ...current, diaVencimento: "" })); setError(""); } }} /></FormField>
      <Switch id="resume-default" className="sm:col-span-2" label="Usar valor padrão da modalidade" description="O valor individual, quando informado, continua prevalecendo." checked={usarValorPadrao} onChange={(event) => setUsarValorPadrao(event.target.checked)} />
      {error ? <p role="alert" className="sm:col-span-2 text-sm font-medium text-danger">{error}</p> : null}
    </div>
  </Dialog>;
}
