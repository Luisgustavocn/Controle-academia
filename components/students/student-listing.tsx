"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus, Settings2, Users2 } from "lucide-react";
import { useHasCapability } from "@/components/capability-provider";
import { CrudModule } from "@/components/forms/crud-module";
import { StudentFormDialog } from "@/components/students/student-form-dialog";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableBody, DataTableCell, DataTableContainer, DataTableHead, DataTableHeader, DataTableRow } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FilterBar, FilterBarActions, FilterBarPrimary } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { SearchField } from "@/components/ui/search-field";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeCivilDateLabel } from "@/lib/attendance-date";

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
const STATUS_LABEL: Record<Student["status"], string> = {
  ATIVO: "Ativo",
  INATIVO: "Inativo",
  CANCELADO: "Cancelado",
  TRANCADO: "Trancado"
};

export function formatStudentAttendance(value: string | null, now = new Date()) {
  if (!value) return "Sem presença";
  return relativeCivilDateLabel(value, now);
}

function StudentSkeleton() {
  return <div className="space-y-2" aria-label="Carregando alunos">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-16 w-full rounded-ds-xl" />)}</div>;
}

export type StudentListingInitialFilters = { q?: string; status?: string; modalidadeId?: string; financial?: string; sort?: string; page?: number; pageSize?: number };

export function StudentListing({ initialFilters = {} }: { initialFilters?: StudentListingInitialFilters }) {
  const router = useRouter();
  const canCreate = useHasCapability("students.create");
  const canUpdate = useHasCapability("students.update");
  const canChangeStatus = useHasCapability("students.status");
  const canViewFinancial = useHasCapability("finance.monthlies.read");
  const [items, setItems] = useState<Student[]>([]);
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [pagination, setPagination] = useState({ page: initialFilters.page ?? 1, pageSize: initialFilters.pageSize ?? 20, totalItems: 0, totalPages: 1 });
  const [search, setSearch] = useState(initialFilters.q ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(initialFilters.q ?? "");
  const [status, setStatus] = useState(initialFilters.status ?? "");
  const [modality, setModality] = useState(initialFilters.modalidadeId ?? "");
  const [financial, setFinancial] = useState(initialFilters.financial ?? "");
  const [sort, setSort] = useState(initialFilters.sort ?? "name.asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manageModalities, setManageModalities] = useState(false);
  const firstSearchEffect = useRef(true);

  useEffect(() => {
    if (firstSearchEffect.current) {
      firstSearchEffect.current = false;
      return;
    }
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
  const hasActions = true;

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
    setFormOpen(true);
  }

  function openEdit(id: string) {
    setEditingId(id);
    setFormOpen(true);
  }

  function profileHref(studentId: string) {
    const listQuery = new URLSearchParams();
    if (debouncedSearch) listQuery.set("q", debouncedSearch);
    if (status) listQuery.set("status", status);
    if (modality) listQuery.set("modalidadeId", modality);
    if (financial) listQuery.set("financial", financial);
    if (sort !== "name.asc") listQuery.set("sort", sort);
    if (pagination.page > 1) listQuery.set("page", String(pagination.page));
    if (pagination.pageSize !== 20) listQuery.set("pageSize", String(pagination.pageSize));
    const returnTo = `/alunos${listQuery.size ? `?${listQuery}` : ""}`;
    return `/alunos/${studentId}?returnTo=${encodeURIComponent(returnTo)}`;
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
        <DropdownMenuItem onSelect={() => router.push(profileHref(student.id))}>Ver aluno</DropdownMenuItem>
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
          {hasActions ? <DataTableHead className="w-24 px-3 text-right"><span className="sr-only">Ações</span></DataTableHead> : null}
        </DataTableRow></DataTableHeader>
        <DataTableBody>{items.map((student) => <DataTableRow key={student.id}>
          <DataTableCell><div className="flex items-center gap-3"><Avatar name={student.name} size="sm" /><div><Link href={profileHref(student.id)} className="font-semibold hover:text-accentDark hover:underline">{student.name}</Link><a className="block text-helper text-muted hover:text-accentDark" href={`tel:${student.phone}`}>{student.phone}</a></div></div></DataTableCell>
          <DataTableCell>{student.modality?.name ?? "Sem modalidade"}<span className="block text-helper text-muted">Vence dia {student.dueDay}</span></DataTableCell>
          {canViewFinancial ? <DataTableCell>{student.financialStatus === "INADIMPLENTE" ? <StatusBadge status="Atrasado" label="Inadimplente" /> : <StatusBadge status="Pago" label="Em dia" />}</DataTableCell> : null}
          <DataTableCell>{formatStudentAttendance(student.lastAttendanceAt)}</DataTableCell>
          <DataTableCell><StatusBadge status={STATUS_LABEL[student.status]} /></DataTableCell>
          {hasActions ? <DataTableCell className="w-24 px-3 text-right"><Actions student={student} /></DataTableCell> : null}
        </DataTableRow>)}</DataTableBody>
      </DataTable>
    </DataTableContainer>
  );

  const mobile = <div className="space-y-2">{items.map((student) => <Card key={student.id} className="p-4">
    <div className="flex items-start gap-3"><Avatar name={student.name} /><div className="min-w-0 flex-1"><Link href={profileHref(student.id)} className="block truncate font-semibold text-ink hover:text-accentDark hover:underline">{student.name}</Link><a className="text-helper text-muted" href={`tel:${student.phone}`}>{student.phone}</a></div>{hasActions ? <Actions student={student} /> : null}</div>
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

      {manageModalities ? <CrudModule endpoint="/api/modalidades" title="Modalidades disponíveis" createLabel="Nova modalidade" searchPlaceholder="Buscar modalidade" listFields={[{ key: "nome", label: "Modalidade" }, { key: "valorPadrao", label: "Valor mensal" }, { key: "ativa", label: "Ativa" }]} fields={[{ key: "nome", label: "Nome da modalidade", required: true }, { key: "valorPadrao", label: "Valor mensal padrão", type: "number" }, { key: "ativa", label: "Ativa", type: "select", options: [{ label: "Sim", value: "true" }, { label: "Não", value: "false" }] }]} defaultValues={{ ativa: "true" }} createCapability="students.update" updateCapability="students.update" deleteCapability="students.update" onDataChanged={refresh} /> : null}

      <StudentFormDialog open={formOpen} onOpenChange={setFormOpen} studentId={editingId} modalities={modalities} onSaved={refresh} />
    </div>
  );
}
