"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type StudentStatus = "ATIVO" | "INATIVO" | "CANCELADO" | "TRANCADO";
export type StudentFormModality = { id: string; name: string; active: boolean };
type StudentForm = {
  nomeCompleto: string;
  telefone: string;
  modalidadeId: string;
  vencimentoDia: string;
  status: StudentStatus;
  dataInicio: string;
  dataSaidaCancelamento: string;
  observacoes: string;
  mensalidadeValor: string;
};

const EMPTY_FORM: StudentForm = {
  nomeCompleto: "",
  telefone: "",
  modalidadeId: "",
  vencimentoDia: "",
  status: "ATIVO",
  dataInicio: "",
  dataSaidaCancelamento: "",
  observacoes: "",
  mensalidadeValor: ""
};

const STATUS_OPTIONS: Array<{ value: StudentStatus; label: string }> = [
  { value: "ATIVO", label: "Ativo" },
  { value: "INATIVO", label: "Inativo" },
  { value: "CANCELADO", label: "Cancelado" },
  { value: "TRANCADO", label: "Trancado" }
];

function todayInput() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function StudentFormDialog({
  open,
  onOpenChange,
  studentId,
  modalities: suppliedModalities,
  onSaved
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId?: string | null;
  modalities?: StudentFormModality[];
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<StudentForm>(EMPTY_FORM);
  const [modalities, setModalities] = useState<StudentFormModality[]>(suppliedModalities ?? []);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (suppliedModalities) setModalities(suppliedModalities);
  }, [suppliedModalities]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError("");
    if (!studentId) setForm({ ...EMPTY_FORM, dataInicio: todayInput() });

    const load = async () => {
      setLoading(true);
      try {
        const requests: Array<Promise<Response>> = [];
        if (!suppliedModalities) requests.push(fetch("/api/modalidades"));
        if (studentId) requests.push(fetch(`/api/alunos/${studentId}`));
        const responses = await Promise.all(requests);
        if (!active) return;
        for (const response of responses) {
          const payload = await response.json() as { items?: Array<{ id: string; nome: string; ativa: boolean }>; item?: StudentForm; error?: string };
          if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar o formulário");
          if (payload.items) setModalities(payload.items.map((item) => ({ id: item.id, name: item.nome, active: item.ativa })));
          if (payload.item) setForm(payload.item);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o formulário");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [open, studentId, suppliedModalities]);

  async function submit() {
    if (!form.nomeCompleto.trim() || !form.telefone.trim() || !form.vencimentoDia || !form.dataInicio) {
      setError("Preencha nome, telefone, vencimento e data de início.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(studentId ? `/api/alunos/${studentId}` : "/api/alunos", {
        method: studentId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar o aluno");
      onOpenChange(false);
      await onSaved();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível salvar o aluno");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={studentId ? "Editar aluno" : "Novo aluno"}
      description="Os campos marcados são obrigatórios."
      className="max-w-3xl"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button loading={loading} onClick={() => void submit()}>Salvar aluno</Button></>}
    >
      {loading && studentId && !form.nomeCompleto ? <div className="space-y-3" aria-label="Carregando cadastro"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-24" /></div> : (
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Nome completo" htmlFor="student-name" required><Input id="student-name" value={form.nomeCompleto} onChange={(event) => setForm({ ...form, nomeCompleto: event.target.value })} /></FormField>
          <FormField label="Telefone" htmlFor="student-phone" required><Input id="student-phone" type="tel" value={form.telefone} onChange={(event) => setForm({ ...form, telefone: event.target.value })} /></FormField>
          <FormField label="Modalidade" htmlFor="student-modality"><Select id="student-modality" value={form.modalidadeId} onChange={(event) => setForm({ ...form, modalidadeId: event.target.value })}><option value="">Sem modalidade</option>{modalities.filter((entry) => entry.active || entry.id === form.modalidadeId).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.active ? "" : " (inativa)"}</option>)}</Select></FormField>
          <FormField label="Dia do vencimento" htmlFor="student-due" required><Input id="student-due" type="number" min="1" max="31" value={form.vencimentoDia} onChange={(event) => setForm({ ...form, vencimentoDia: event.target.value })} /></FormField>
          <FormField label="Status" htmlFor="student-status"><Select id="student-status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as StudentStatus })}>{STATUS_OPTIONS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</Select></FormField>
          <FormField label="Data de início" htmlFor="student-start" required><Input id="student-start" type="date" value={form.dataInicio} onChange={(event) => setForm({ ...form, dataInicio: event.target.value })} /></FormField>
          <FormField label="Data de saída" htmlFor="student-end"><Input id="student-end" type="date" value={form.dataSaidaCancelamento} onChange={(event) => setForm({ ...form, dataSaidaCancelamento: event.target.value })} /></FormField>
          <FormField label="Valor mensal exclusivo" htmlFor="student-value" description="Usado somente quando a modalidade personalizada permitir."><Input id="student-value" type="number" min="0" step="0.01" value={form.mensalidadeValor} onChange={(event) => setForm({ ...form, mensalidadeValor: event.target.value })} /></FormField>
          <FormField label="Observações" htmlFor="student-notes" className="md:col-span-2"><textarea id="student-notes" rows={4} value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} className="w-full rounded-ds-lg border border-line bg-card px-3 py-2 text-sm text-ink shadow-surface-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" /></FormField>
          {error ? <p role="alert" className="md:col-span-2 text-sm font-medium text-danger">{error}</p> : null}
        </div>
      )}
    </Dialog>
  );
}
