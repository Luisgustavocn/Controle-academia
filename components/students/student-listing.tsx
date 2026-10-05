"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus, Settings2, Users2 } from "lucide-react";
import { useHasCapability } from "@/components/capability-provider";
import { CrudModule } from "@/components/forms/crud-module";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableBody, DataTableCell, DataTableContainer, DataTableHead, DataTableHeader, DataTableRow } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FilterBar, FilterBarActions, FilterBarPrimary } from "@/components/ui/filter-bar";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { SearchField } from "@/components/ui/search-field";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Modality = { id: string; name: string; active: boolean };
type Student = {
  id: string;
  name: string;
  phone: string;
  status: "ATIVO" | "INATIVO" | "CANCELADO" | "TRANCADO";
  dueDay: number;
  modality: { id: string; name: string } | null;
  lastAttendanceAt: string | null;
  financialStatus?: "EM_DIA" | "INADIMPLENTE";
};
type ListingResponse = {
  items: Student[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
  facets: { modalidades: Modality[] };
  visibility: { financial: boolean };
  error?: string;
};
type StudentForm = {
  nomeCompleto: string;
  telefone: string;
  modalidadeId: string;
  vencimentoDia: string;
  status: Student["status"];
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

const STATUS_LABEL: Record<Student["status"], string> = {
  ATIVO: "Ativo",
  INATIVO: "Inativo",
  CANCELADO: "Cancelado",
  TRANCADO: "Trancado"
};

export function formatStudentAttendance(value: string | null, now = new Date()) {
  if (!value) return "Sem presença";
  const timeZone = "America/Sao_Paulo";
  const dayKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const date = new Date(value);
  const todayKey = dayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const valueKey = dayKey(date);
  if (valueKey === todayKey) return "Hoje";
  if (valueKey === dayKey(yesterday)) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function todayInput() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function StudentSkeleton() {
  return <div className="space-y-2" aria-label="Carregando alunos">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-16 w-full rounded-ds-xl" />)}</div>;
}

export function StudentListing() {
  const router = useRouter();
  const canCreate = useHasCapability("students.create");
  const canUpdate = useHasCapability("students.update");
  const canChangeStatus = useHasCapability("students.status");
  const canViewFinancial = useHasCapability("finance.monthlies.read");
  const [items, setItems] = useState<Student[]>([]);
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, totalItems: 0, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [modality, setModality] = useState("");
  const [financial, setFinancial] = useState("");
  const [sort, setSort] = useState("name.asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StudentForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [manageModalities, setManageModalities] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPagination((current) => ({ ...current, page: 1 }));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      page: String(pagination.page),
      pageSize: String(pagination.pageSize),
      sort
    });
    if (debouncedSearch) query.set("q", debouncedSearch);
    if (status) query.set("status", status);
    if (modality) query.set("modalidadeId", modality);
    if (financial && canViewFinancial) query.set("financial", financial);

    setLoading(true);
    setError("");
    void fetch(`/api/alunos/listagem?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as ListingResponse;
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar os alunos");
        return payload;
      })
      .then((payload) => {
        setItems(payload.items);
        setPagination(payload.pagination);
        setModalities(payload.facets.modalidades);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : "Não foi possível carregar os alunos");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [pagination.page, pagination.pageSize, debouncedSearch, status, modality, financial, sort, canViewFinancial, reloadKey]);

  const hasFilters = Boolean(debouncedSearch || status || modality || financial);
  const hasActions = canUpdate || canChangeStatus || canViewFinancial;
  const activeModalities = useMemo(() => modalities.filter((entry) => entry.active), [modalities]);

  function refresh() {
    setReloadKey((value) => value + 1);
  }

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setStatus("");
    setModality("");
    setFinancial("");
    setPagination((current) => ({ ...current, page: 1 }));
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, dataInicio: todayInput() });
    setFormError("");
    setFormOpen(true);
  }

  async function openEdit(id: string) {
    setFormLoading(true);
    setFormError("");
    setEditingId(id);
    setFormOpen(true);
    try {
      const response = await fetch(`/api/alunos/${id}`);
      const payload = await response.json() as { item?: StudentForm; error?: string };
      if (!response.ok || !payload.item) throw new Error(payload.error ?? "Não foi possível carregar o cadastro");
      setForm(payload.item);
    } catch (editError) {
      setFormError(editError instanceof Error ? editError.message : "Não foi possível carregar o cadastro");
    } finally {
      setFormLoading(false);
    }
  }

  async function submitForm() {
    if (!form.nomeCompleto.trim() || !form.telefone.trim() || !form.vencimentoDia || !form.dataInicio) {
      setFormError("Preencha nome, telefone, vencimento e data de início.");
      return;
    }
    setFormLoading(true);
    setFormError("");
    try {
      const response = await fetch(editingId ? `/api/alunos/${editingId}` : "/api/alunos", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar o aluno");
      setFormOpen(false);
      refresh();
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : "Não foi possível salvar o aluno");
    } finally {
      setFormLoading(false);
    }
  }

  async function cancelStudent(student: Student) {
    if (!window.confirm(`Cancelar o cadastro de ${student.name}?`)) return;
    const response = await fetch(`/api/alunos/${student.id}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      window.alert(payload.error ?? "Não foi possível cancelar o cadastro");
      return;
    }
    refresh();
  }

  async function reactivateStudent(student: Student) {
    if (!window.confirm(`Criar um novo cadastro ativo para ${student.name}?`)) return;
    const response = await fetch(`/api/alunos/${student.id}/reativar`, { method: "POST" });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      window.alert(payload.error ?? "Não foi possível reativar o aluno");
      return;
    }
    refresh();
  }

  function Actions({ student }: { student: Student }) {
    return (
      <DropdownMenu trigger={<MoreHorizontal className="h-4 w-4" aria-hidden="true" />} label={`Ações de ${student.name}`}>
        {canUpdate ? <DropdownMenuItem onSelect={() => void openEdit(student.id)}>Editar cadastro</DropdownMenuItem> : null}
        {canViewFinancial ? <DropdownMenuItem onSelect={() => router.push("/mensalidades")}>Abrir mensalidades</DropdownMenuItem> : null}
        {canChangeStatus && ["CANCELADO", "TRANCADO"].includes(student.status)
          ? <DropdownMenuItem onSelect={() => void reactivateStudent(student)}>Reativar como novo</DropdownMenuItem>
          : null}
        {canChangeStatus && student.status !== "CANCELADO" ? <DropdownMenuSeparator /> : null}
        {canChangeStatus && student.status !== "CANCELADO"
          ? <DropdownMenuItem destructive onSelect={() => void cancelStudent(student)}>Cancelar cadastro</DropdownMenuItem>
          : null}
      </DropdownMenu>
    );
  }

  const desktop = (
    <DataTableContainer>
      <DataTable>
        <DataTableHeader><DataTableRow>
          <DataTableHead>Aluno</DataTableHead><DataTableHead>Modalidade</DataTableHead>
          {canViewFinancial ? <DataTableHead>Financeiro</DataTableHead> : null}
          <DataTableHead>Última presença</DataTableHead><DataTableHead>Status</DataTableHead>
          {hasActions ? <DataTableHead><span className="sr-only">Ações</span></DataTableHead> : null}
        </DataTableRow></DataTableHeader>
        <DataTableBody>{items.map((student) => <DataTableRow key={student.id}>
          <DataTableCell><div className="flex items-center gap-3"><Avatar name={student.name} size="sm" /><div><p className="font-semibold">{student.name}</p><a className="text-helper text-muted hover:text-accentDark" href={`tel:${student.phone}`}>{student.phone}</a></div></div></DataTableCell>
          <DataTableCell>{student.modality?.name ?? "Sem modalidade"}<span className="block text-helper text-muted">Vence dia {student.dueDay}</span></DataTableCell>
          {canViewFinancial ? <DataTableCell>{student.financialStatus === "INADIMPLENTE" ? <StatusBadge status="Atrasado" label="Inadimplente" /> : <StatusBadge status="Pago" label="Em dia" />}</DataTableCell> : null}
          <DataTableCell>{formatStudentAttendance(student.lastAttendanceAt)}</DataTableCell>
          <DataTableCell><StatusBadge status={STATUS_LABEL[student.status]} /></DataTableCell>
          {hasActions ? <DataTableCell className="w-16"><Actions student={student} /></DataTableCell> : null}
        </DataTableRow>)}</DataTableBody>
      </DataTable>
    </DataTableContainer>
  );

  const mobile = <div className="space-y-2">{items.map((student) => <Card key={student.id} className="p-4">
    <div className="flex items-start gap-3"><Avatar name={student.name} /><div className="min-w-0 flex-1"><p className="truncate font-semibold text-ink">{student.name}</p><a className="text-helper text-muted" href={`tel:${student.phone}`}>{student.phone}</a></div>{hasActions ? <Actions student={student} /> : null}</div>
    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm"><div><p className="text-helper text-muted">Modalidade</p><p>{student.modality?.name ?? "Sem modalidade"}</p></div><div><p className="text-helper text-muted">Última presença</p><p>{formatStudentAttendance(student.lastAttendanceAt)}</p></div></div>
    <div className="mt-3 flex flex-wrap gap-2"><StatusBadge status={STATUS_LABEL[student.status]} />{canViewFinancial ? student.financialStatus === "INADIMPLENTE" ? <StatusBadge status="Atrasado" label="Inadimplente" /> : <StatusBadge status="Pago" label="Em dia" /> : null}</div>
  </Card>)}</div>;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Alunos"
        description="Central operacional de cadastros, situação financeira e frequência."
        breadcrumbs={[{ label: "Início", href: "/dashboard" }, { label: "Alunos" }]}
        primaryAction={canCreate ? <Button onClick={openCreate} leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>Novo aluno</Button> : null}
        secondaryActions={canUpdate ? <Button variant="outline" onClick={() => setManageModalities((value) => !value)} leadingIcon={<Settings2 className="h-4 w-4" aria-hidden="true" />}>Modalidades</Button> : null}
      />

      <FilterBar>
        <FilterBarPrimary><SearchField value={search} onChange={(event) => setSearch(event.target.value)} onClear={() => setSearch("")} placeholder="Buscar por nome ou telefone" aria-label="Buscar alunos" /></FilterBarPrimary>
        <FilterBarActions>
          <Select aria-label="Filtrar por status" value={status} onChange={(event) => { setStatus(event.target.value); setPagination((current) => ({ ...current, page: 1 })); }} className="sm:w-40"><option value="">Todos os status</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
          <Select aria-label="Filtrar por modalidade" value={modality} onChange={(event) => { setModality(event.target.value); setPagination((current) => ({ ...current, page: 1 })); }} className="sm:w-48"><option value="">Todas modalidades</option>{modalities.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</Select>
          {canViewFinancial ? <Select aria-label="Filtrar por situação financeira" value={financial} onChange={(event) => { setFinancial(event.target.value); setPagination((current) => ({ ...current, page: 1 })); }} className="sm:w-44"><option value="">Todo financeiro</option><option value="EM_DIA">Em dia</option><option value="INADIMPLENTE">Inadimplente</option></Select> : null}
          <Select aria-label="Ordenar alunos" value={sort} onChange={(event) => { setSort(event.target.value); setPagination((current) => ({ ...current, page: 1 })); }} className="sm:w-44"><option value="name.asc">Nome A–Z</option><option value="name.desc">Nome Z–A</option><option value="status.asc">Status</option><option value="dueDay.asc">Vencimento crescente</option><option value="dueDay.desc">Vencimento decrescente</option></Select>
          {hasFilters ? <Button variant="ghost" onClick={clearFilters}>Limpar</Button> : null}
        </FilterBarActions>
      </FilterBar>

      <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted"><strong className="text-ink">{pagination.totalItems}</strong> {pagination.totalItems === 1 ? "aluno encontrado" : "alunos encontrados"}</p><Select aria-label="Itens por página" value={String(pagination.pageSize)} onChange={(event) => setPagination((current) => ({ ...current, page: 1, pageSize: Number(event.target.value) }))} className="w-32"><option value="10">10 por página</option><option value="20">20 por página</option><option value="50">50 por página</option></Select></div>

      {loading ? <StudentSkeleton /> : error ? <ErrorState message={error} onRetry={refresh} /> : items.length === 0 ? <EmptyState icon={Users2} kind={hasFilters ? "search" : "empty"} title={hasFilters ? "Nenhum aluno encontrado" : "Nenhum aluno cadastrado"} description={hasFilters ? "Revise ou limpe os filtros para ampliar a busca." : "Cadastre o primeiro aluno para iniciar a operação."} action={hasFilters ? <Button variant="outline" onClick={clearFilters}>Limpar filtros</Button> : canCreate ? <Button onClick={openCreate}>Novo aluno</Button> : null} /> : <ResponsiveList desktop={desktop} mobile={mobile} />}

      {!loading && !error && items.length > 0 ? <Pagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} onPageChange={(page) => setPagination((current) => ({ ...current, page }))} /> : null}

      {manageModalities ? <CrudModule endpoint="/api/modalidades" title="Modalidades disponíveis" createLabel="Nova modalidade" searchPlaceholder="Buscar modalidade" listFields={[{ key: "nome", label: "Modalidade" }, { key: "valorPadrao", label: "Valor mensal" }, { key: "ativa", label: "Ativa" }]} fields={[{ key: "nome", label: "Nome da modalidade", required: true }, { key: "valorPadrao", label: "Valor mensal padrão", type: "number", required: true }, { key: "ativa", label: "Ativa", type: "select", options: [{ label: "Sim", value: "true" }, { label: "Não", value: "false" }] }]} defaultValues={{ ativa: "true" }} createCapability="students.update" updateCapability="students.update" deleteCapability="students.update" onDataChanged={refresh} /> : null}

      <Dialog open={formOpen} onOpenChange={setFormOpen} title={editingId ? "Editar aluno" : "Novo aluno"} description="Os campos marcados são obrigatórios." className="max-w-3xl" footer={<><Button variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button><Button loading={formLoading} onClick={() => void submitForm()}>Salvar aluno</Button></>}>
        {formLoading && editingId && !form.nomeCompleto ? <StudentSkeleton /> : <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Nome completo" htmlFor="student-name" required><Input id="student-name" value={form.nomeCompleto} onChange={(event) => setForm({ ...form, nomeCompleto: event.target.value })} /></FormField>
          <FormField label="Telefone" htmlFor="student-phone" required><Input id="student-phone" type="tel" value={form.telefone} onChange={(event) => setForm({ ...form, telefone: event.target.value })} /></FormField>
          <FormField label="Modalidade" htmlFor="student-modality"><Select id="student-modality" value={form.modalidadeId} onChange={(event) => setForm({ ...form, modalidadeId: event.target.value })}><option value="">Sem modalidade</option>{activeModalities.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}{form.modalidadeId && !activeModalities.some((entry) => entry.id === form.modalidadeId) ? <option value={form.modalidadeId}>Modalidade atual (inativa)</option> : null}</Select></FormField>
          <FormField label="Dia do vencimento" htmlFor="student-due" required><Input id="student-due" type="number" min="1" max="31" value={form.vencimentoDia} onChange={(event) => setForm({ ...form, vencimentoDia: event.target.value })} /></FormField>
          <FormField label="Status" htmlFor="student-status"><Select id="student-status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Student["status"] })}>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField>
          <FormField label="Data de início" htmlFor="student-start" required><Input id="student-start" type="date" value={form.dataInicio} onChange={(event) => setForm({ ...form, dataInicio: event.target.value })} /></FormField>
          <FormField label="Data de saída" htmlFor="student-end"><Input id="student-end" type="date" value={form.dataSaidaCancelamento} onChange={(event) => setForm({ ...form, dataSaidaCancelamento: event.target.value })} /></FormField>
          <FormField label="Valor mensal exclusivo" htmlFor="student-value" description="Usado somente quando a modalidade personalizada permitir."><Input id="student-value" type="number" min="0" step="0.01" value={form.mensalidadeValor} onChange={(event) => setForm({ ...form, mensalidadeValor: event.target.value })} /></FormField>
          <FormField label="Observações" htmlFor="student-notes" className="md:col-span-2"><textarea id="student-notes" rows={4} value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} className="w-full rounded-ds-lg border border-line bg-card px-3 py-2 text-sm text-ink shadow-surface-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" /></FormField>
          {formError ? <p role="alert" className="md:col-span-2 text-sm font-medium text-danger">{formError}</p> : null}
        </div>}
      </Dialog>
    </div>
  );
}
