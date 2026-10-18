"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { StudentPhotoEditor } from "@/components/students/student-photo-editor";

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
  valorMensal: string;
  usarValorPadrao: boolean;
  dataNascimento: string;
  fotoPath: string;
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
  valorMensal: "",
  usarValorPadrao: true,
  dataNascimento: "",
  fotoPath: ""
};

const STATUS_OPTIONS: Array<{ value: StudentStatus; label: string }> = [
  { value: "ATIVO", label: "Ativo" },
  { value: "INATIVO", label: "Inativo" },
  { value: "CANCELADO", label: "Cancelado" },
  { value: "TRANCADO", label: "Trancado" }
];

export function shouldShowStudentExitDate(status: StudentStatus) {
  return status !== "ATIVO";
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");

  useEffect(() => {
    if (suppliedModalities) setModalities(suppliedModalities);
  }, [suppliedModalities]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError("");
    setFieldErrors({});
    setPendingPhoto(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview("");
    if (!studentId) setForm(EMPTY_FORM);

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
  // photoPreview is intentionally reset only when a new dialog session starts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, studentId, suppliedModalities]);

  async function submit() {
    const nextErrors: Record<string, string> = {};
    if (!form.nomeCompleto.trim()) nextErrors.nomeCompleto = "Nome completo é obrigatório.";
    if (!form.telefone.trim()) nextErrors.telefone = "Telefone é obrigatório.";
    if (!form.vencimentoDia) nextErrors.vencimentoDia = "Dia do vencimento é obrigatório.";
    const dueDay = Number(form.vencimentoDia);
    if (form.vencimentoDia && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) nextErrors.vencimentoDia = "Informe um dia entre 1 e 31.";
    if (shouldShowStudentExitDate(form.status) && !form.dataSaidaCancelamento) {
      nextErrors.dataSaidaCancelamento = "Data de saída é obrigatória para o status selecionado.";
    }
    if (form.dataNascimento && form.dataNascimento > new Date().toLocaleDateString("en-CA")) {
      nextErrors.dataNascimento = "Data de nascimento não pode ser futura.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError("Revise os campos destacados.");
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
      const payload = await response.json().catch(() => ({})) as { error?: string; field?: string; item?: { id?: string } };
      if (!response.ok) {
        const message = payload.error ?? "Não foi possível salvar o aluno";
        const normalized = message.toLocaleLowerCase("pt-BR");
        const field = payload.field ?? (normalized.includes("telefone") ? "telefone" : normalized.includes("nome") ? "nomeCompleto" : normalized.includes("vencimento") ? "vencimentoDia" : normalized.includes("saída") ? "dataSaidaCancelamento" : "");
        if (field) setFieldErrors((current) => ({ ...current, [field]: message }));
        throw new Error(message);
      }
      const savedId = studentId ?? payload.item?.id;
      if (pendingPhoto && savedId) {
        const upload = new FormData();
        upload.set("file", pendingPhoto);
        const uploadResponse = await fetch(`/api/alunos/${savedId}/foto`, { method: "POST", body: upload });
        const uploadPayload = await uploadResponse.json().catch(() => ({})) as { error?: string };
        if (!uploadResponse.ok) throw new Error(uploadPayload.error ?? "Aluno salvo, mas não foi possível salvar a foto");
      }
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
          <StudentPhotoEditor name={form.nomeCompleto} currentSrc={photoPreview || form.fotoPath} onConfirm={(file, previewUrl) => { if (photoPreview) URL.revokeObjectURL(photoPreview); setPendingPhoto(file); setPhotoPreview(previewUrl); setError(""); }} />
          <FormField label="Nome completo" htmlFor="student-name" required><Input id="student-name" value={form.nomeCompleto} error={fieldErrors.nomeCompleto} onChange={(event) => { setForm({ ...form, nomeCompleto: event.target.value }); if (event.target.value.trim()) { setFieldErrors((current) => ({ ...current, nomeCompleto: "" })); setError(""); } }} /></FormField>
          <FormField label="Telefone" htmlFor="student-phone" required><Input id="student-phone" type="tel" value={form.telefone} error={fieldErrors.telefone} onChange={(event) => { setForm({ ...form, telefone: event.target.value }); if (event.target.value.trim()) { setFieldErrors((current) => ({ ...current, telefone: "" })); setError(""); } }} /></FormField>
          <FormField label="Data de nascimento" htmlFor="student-birth-date"><Input id="student-birth-date" type="date" max={new Date().toLocaleDateString("en-CA")} value={form.dataNascimento} error={fieldErrors.dataNascimento} onChange={(event) => { setForm({ ...form, dataNascimento: event.target.value }); setFieldErrors((current) => ({ ...current, dataNascimento: "" })); }} /></FormField>
          <FormField label="Modalidade" htmlFor="student-modality"><Select id="student-modality" value={form.modalidadeId} onChange={(event) => setForm({ ...form, modalidadeId: event.target.value })}><option value="">Sem modalidade</option>{modalities.filter((entry) => entry.active || entry.id === form.modalidadeId).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.active ? "" : " (inativa)"}</option>)}</Select></FormField>
          <FormField label="Dia do vencimento" htmlFor="student-due" required><Input id="student-due" type="number" min="1" max="31" value={form.vencimentoDia} error={fieldErrors.vencimentoDia} onChange={(event) => { setForm({ ...form, vencimentoDia: event.target.value }); const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 31) { setFieldErrors((current) => ({ ...current, vencimentoDia: "" })); setError(""); } }} /></FormField>
          <FormField label="Status" htmlFor="student-status"><Select id="student-status" value={form.status} onChange={(event) => { const status = event.target.value as StudentStatus; setForm({ ...form, status, dataSaidaCancelamento: status === "ATIVO" ? "" : form.dataSaidaCancelamento }); if (status === "ATIVO") setFieldErrors((current) => ({ ...current, dataSaidaCancelamento: "" })); }}>{STATUS_OPTIONS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</Select></FormField>
          <FormField label="Data de início" htmlFor="student-start" description="Deixe em branco quando a data histórica for desconhecida."><Input id="student-start" type="date" value={form.dataInicio} onChange={(event) => setForm({ ...form, dataInicio: event.target.value })} /></FormField>
          {shouldShowStudentExitDate(form.status) ? <FormField label="Data de saída" htmlFor="student-end" required><Input id="student-end" type="date" required value={form.dataSaidaCancelamento} error={fieldErrors.dataSaidaCancelamento} onChange={(event) => { setForm({ ...form, dataSaidaCancelamento: event.target.value }); if (event.target.value) { setFieldErrors((current) => ({ ...current, dataSaidaCancelamento: "" })); setError(""); } }} /></FormField> : null}
          <FormField label="Valor mensal individual" htmlFor="student-value" description="Quando informado, prevalece sobre o valor padrão da modalidade."><Input id="student-value" type="number" min="0.01" step="0.01" value={form.valorMensal} onChange={(event) => setForm({ ...form, valorMensal: event.target.value })} /></FormField>
          <Switch id="student-default-value" label="Usar valor padrão da modalidade" description="Só é usado quando não há valor individual." checked={form.usarValorPadrao} onChange={(event) => setForm({ ...form, usarValorPadrao: event.target.checked })} />
          <FormField label="Observações" htmlFor="student-notes" className="md:col-span-2"><textarea id="student-notes" rows={4} value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} className="w-full rounded-ds-lg border border-line bg-card px-3 py-2 text-sm text-ink shadow-surface-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" /></FormField>
          {error ? <p role="alert" className="md:col-span-2 text-sm font-medium text-danger">{error}</p> : null}
        </div>
      )}
    </Dialog>
  );
}
