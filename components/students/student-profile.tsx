"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CalendarCheck2, CreditCard, Edit3, MoreHorizontal } from "lucide-react";
import type { StudentProfileOverview } from "@/lib/services/student-profile";
import { ACADEMY_TIME_ZONE } from "@/lib/timezone";
import { civilDateLabel, relativeCivilDateLabel } from "@/lib/attendance-date";
import { StudentFormDialog } from "@/components/students/student-form-dialog";
import { ResumeEnrollmentDialog } from "@/components/students/resume-enrollment-dialog";
import { EndEnrollmentDialog } from "@/components/students/end-enrollment-dialog";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type FinancialData = {
  monthly: Array<{ id: string; competence: string; value: number; dueAt: string; paidAt: string | null; paymentMethod: string | null; status: string }>;
  payments: Array<{ id: string; value: number; paidAt: string; paymentMethod: string; status: string; competence: string | null }>;
  limits: { monthly: number; payments: number };
};
type AttendanceData = {
  items: Array<{ id: string; date: string; time: string | null; classType: string }>;
  periodDays: number;
  hasMore: boolean;
};
type HistoryData = {
  registration: { occurredAt: string; type: "REGISTRATION" };
  currentExit: { occurredAt: string; type: "CURRENT_EXIT"; status: string } | null;
  planChanges: Array<{ id: string; occurredAt: string; previousModality: string | null; newModality: string; note: string | null }>;
  enrollments: Array<{ id: string; startDate: string | null; exitDate: string | null; modality: string | null; monthlyValue: number | null; useDefaultValue: boolean; dueDay: number }>;
  hasMore: boolean;
};
type Section = "overview" | "financial" | "attendance" | "history";

const STATUS_LABEL: Record<string, string> = { ATIVO: "Ativo", INATIVO: "Inativo", CANCELADO: "Cancelado", TRANCADO: "Trancado" };

function date(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: ACADEMY_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: ACADEMY_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function attendanceLabel(value: string | null | undefined, now = new Date()) {
  if (!value) return "Nunca";
  return relativeCivilDateLabel(value, now);
}

function SectionLoading() {
  return <div className="space-y-3" aria-label="Carregando seção"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-2 text-lg font-black text-ink">{value}</p>{detail ? <p className="mt-1 text-helper text-muted">{detail}</p> : null}</Card>;
}

export function StudentProfile({ initialOverview, returnTo }: { initialOverview: StudentProfileOverview; returnTo: string }) {
  const router = useRouter();
  const [overview, setOverview] = useState(initialOverview);
  const [activeTab, setActiveTab] = useState<Section>("overview");
  const [financial, setFinancial] = useState<FinancialData | null>(null);
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [loadingSection, setLoadingSection] = useState<Section | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Partial<Record<Section, string>>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const student = overview.student;
  const capabilities = overview.capabilities;
  const safeReturnTo = returnTo.startsWith("/alunos") ? returnTo : "/alunos";

  async function fetchOverview() {
    const response = await fetch(`/api/alunos/${student.id}/perfil?section=overview`, { cache: "no-store" });
    const payload = await response.json() as { data?: StudentProfileOverview; error?: string };
    if (!response.ok || !payload.data) throw new Error(payload.error ?? "Não foi possível atualizar o perfil");
    setOverview(payload.data);
  }

  async function loadSection(section: Section, force = false) {
    if (section === "overview") return;
    if (!force && ((section === "financial" && financial) || (section === "attendance" && attendance) || (section === "history" && history))) return;
    setLoadingSection(section);
    setSectionErrors((current) => ({ ...current, [section]: undefined }));
    try {
      const response = await fetch(`/api/alunos/${student.id}/perfil?section=${section}`, { cache: "no-store" });
      const payload = await response.json() as { data?: FinancialData | AttendanceData | HistoryData; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Não foi possível carregar a seção");
      if (section === "financial") setFinancial(payload.data as FinancialData);
      if (section === "attendance") setAttendance(payload.data as AttendanceData);
      if (section === "history") setHistory(payload.data as HistoryData);
    } catch (error) {
      setSectionErrors((current) => ({ ...current, [section]: error instanceof Error ? error.message : "Não foi possível carregar a seção" }));
    } finally {
      setLoadingSection(null);
    }
  }

  function selectTab(value: string) {
    const section = value as Section;
    setActiveTab(section);
    void loadSection(section);
  }

  function Actions() {
    return (
      <DropdownMenu trigger={<><MoreHorizontal className="h-4 w-4" aria-hidden="true" /><span>Ações</span></>} label={`Ações de ${student.name}`}>
        {capabilities.edit ? <DropdownMenuItem onSelect={() => setEditOpen(true)}><Edit3 className="mr-2 h-4 w-4" aria-hidden="true" />Editar</DropdownMenuItem> : null}
        {capabilities.manageFinancial ? <DropdownMenuItem onSelect={() => router.push("/mensalidades")}><CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />Registrar pagamento</DropdownMenuItem> : null}
        {capabilities.writeAttendance ? <DropdownMenuItem onSelect={() => router.push("/frequencia")}><CalendarCheck2 className="mr-2 h-4 w-4" aria-hidden="true" />Abrir frequência</DropdownMenuItem> : null}
        {capabilities.changeStatus ? <DropdownMenuSeparator /> : null}
        {capabilities.reactivate ? <DropdownMenuItem onSelect={() => setResumeOpen(true)}>Retomar matrícula</DropdownMenuItem> : null}
        {capabilities.changeStatus && student.activeEnrollment ? <DropdownMenuItem destructive onSelect={() => setEndOpen(true)}>Encerrar matrícula</DropdownMenuItem> : null}
      </DropdownMenu>
    );
  }

  const financialSummary = overview.summary.financial;
  const attendanceSummary = overview.summary.attendance;
  const enrollment = student.enrollment;
  const displayModality = enrollment?.modality?.name ?? student.modality?.name ?? "Sem modalidade";
  const displayStatus = student.activeEnrollment ? "Ativo" : student.status === "ATIVO" ? "Inativo" : (STATUS_LABEL[student.status] ?? "Inativo");
  const financialLabel = financialSummary ? ({ EM_DIA: "Em dia", EM_ATRASO: "Em atraso", PARCIAL: "Parcial", SEM_PENDENCIAS: "Sem pendências", COM_PENDENCIA: "Com pendência" } as const)[financialSummary.status] : null;

  return (
    <div className="space-y-5">
      <Link href={safeReturnTo} className="inline-flex items-center gap-2 rounded-ds-md text-sm font-semibold text-muted hover:text-accentDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Alunos</Link>

      <Card className="p-5 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar name={student.name} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Perfil do aluno</p><h1 className="mt-1 text-page-title text-ink">{student.name}</h1></div>
              <Actions />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge status={displayStatus} /><span className="text-sm text-muted">{displayModality}</span>{financialLabel ? <StatusBadge status={financialSummary?.status === "EM_DIA" || financialSummary?.status === "SEM_PENDENCIAS" ? "Pago" : "Atrasado"} label={financialLabel} /> : null}</div>
            <a href={`tel:${student.phone}`} className="mt-2 inline-block text-sm font-medium text-ink hover:text-accentDark hover:underline">{student.phone}</a>
          </div>
        </div>
      </Card>

      <section aria-labelledby="student-summary-title">
        <h2 id="student-summary-title" className="sr-only">Resumo operacional</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Status" value={displayStatus} detail={enrollment?.startDate ? `Desde ${date(enrollment.startDate)}` : "Data histórica desconhecida"} />
          <SummaryCard label={student.activeEnrollment ? "Modalidade" : "Última modalidade"} value={displayModality} detail={`Vencimento dia ${enrollment?.dueDay ?? student.dueDay}`} />
          {attendanceSummary ? <SummaryCard label="Última presença" value={attendanceLabel(attendanceSummary.lastAttendanceAt)} detail={`${attendanceSummary.last30Days} nos últimos 30 dias`} /> : null}
          {financialSummary ? <SummaryCard label="Próximo vencimento" value={student.activeEnrollment ? date(financialSummary.nextDueAt) : "Nenhum"} detail={`${financialSummary.openCount} mensalidade(s) em aberto`} /> : null}
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={selectTab}>
        <TabsList aria-label="Seções do perfil do aluno">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          {capabilities.viewFinancial ? <TabsTrigger value="financial">Financeiro</TabsTrigger> : null}
          {capabilities.viewAttendance ? <TabsTrigger value="attendance">Frequência</TabsTrigger> : null}
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Contato</CardTitle><CardDescription>Dados disponíveis no cadastro.</CardDescription></CardHeader><dl className="grid gap-3 text-sm"><div><dt className="text-muted">Telefone</dt><dd className="mt-1 font-semibold"><a href={`tel:${student.phone}`} className="hover:text-accentDark hover:underline">{student.phone}</a></dd></div></dl></Card>
            <Card><CardHeader><CardTitle>Matrícula</CardTitle><CardDescription>{student.activeEnrollment ? "Vínculo atual." : "Último vínculo registrado."}</CardDescription></CardHeader><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted">Modalidade</dt><dd className="mt-1 font-semibold">{displayModality}</dd></div><div><dt className="text-muted">Vencimento</dt><dd className="mt-1 font-semibold">Dia {enrollment?.dueDay ?? student.dueDay}</dd></div><div><dt className="text-muted">Início</dt><dd className="mt-1 font-semibold">{enrollment?.startDate ? date(enrollment.startDate) : "Desconhecido"}</dd></div><div><dt className="text-muted">Saída registrada</dt><dd className="mt-1 font-semibold">{date(enrollment?.exitDate)}</dd></div></dl>{capabilities.reactivate ? <Button className="mt-4" onClick={() => setResumeOpen(true)}>Retomar matrícula</Button> : null}</Card>
            <Card className="lg:col-span-2"><CardHeader><CardTitle>Observações</CardTitle></CardHeader>{student.notes ? <p className="whitespace-pre-wrap text-sm text-ink">{student.notes}</p> : <p className="text-sm text-muted">Nenhuma observação cadastrada.</p>}</Card>
          </div>
        </TabsContent>

        {capabilities.viewFinancial ? <TabsContent value="financial">
          {loadingSection === "financial" ? <SectionLoading /> : sectionErrors.financial ? <ErrorState message={sectionErrors.financial} onRetry={() => void loadSection("financial", true)} /> : financial ? <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3"><SummaryCard label="Situação" value={financialLabel ?? "—"} /><SummaryCard label="Mensalidade atual" value={financialSummary?.currentMonthly ? currency(financialSummary.currentMonthly.value) : "Não gerada"} detail={financialSummary?.currentMonthly?.status} /><SummaryCard label="Último pagamento" value={date(financialSummary?.lastPaymentAt)} /></div>
            <Card><CardHeader><CardTitle>Mensalidades recentes</CardTitle><CardDescription>Até {financial.limits.monthly} competências, da mais recente para a mais antiga.</CardDescription></CardHeader>{financial.monthly.length === 0 ? <EmptyState title="Sem mensalidades" description="Nenhuma mensalidade foi encontrada para este aluno." /> : <ul className="divide-y divide-line">{financial.monthly.map((item) => <li key={item.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="font-semibold text-ink">{item.competence}</p><p className="text-helper text-muted">Vencimento {date(item.dueAt)}</p></div><p className="font-semibold">{currency(item.value)}</p><StatusBadge status={item.status} /></li>)}</ul>}</Card>
            <Card><CardHeader><CardTitle>Pagamentos persistidos</CardTitle><CardDescription>Registros explícitos do modelo Pagamento; mensalidades pagas também aparecem acima.</CardDescription></CardHeader>{financial.payments.length === 0 ? <EmptyState title="Sem pagamentos separados" description="Não existem registros no histórico específico de pagamentos." /> : <ul className="divide-y divide-line">{financial.payments.map((item) => <li key={item.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="font-semibold">{date(item.paidAt)} · {item.paymentMethod}</p><p className="text-helper text-muted">{item.competence ? `Competência ${item.competence}` : "Sem mensalidade vinculada"}</p></div><p className="font-semibold">{currency(item.value)}</p><StatusBadge status={item.status} /></li>)}</ul>}</Card>
          </div> : null}
        </TabsContent> : null}

        {capabilities.viewAttendance ? <TabsContent value="attendance">
          {loadingSection === "attendance" ? <SectionLoading /> : sectionErrors.attendance ? <ErrorState message={sectionErrors.attendance} onRetry={() => void loadSection("attendance", true)} /> : attendance ? <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3"><SummaryCard label="Última presença" value={attendanceLabel(attendanceSummary?.lastAttendanceAt)} /><SummaryCard label="No mês" value={String(attendanceSummary?.thisMonth ?? 0)} /><SummaryCard label="Últimos 30 dias" value={String(attendanceSummary?.last30Days ?? 0)} /></div>
            <Card><CardHeader><CardTitle>Presenças recentes</CardTitle><CardDescription>Registros confirmados dos últimos {attendance.periodDays} dias, mais recentes primeiro.</CardDescription></CardHeader>{attendance.items.length === 0 ? <EmptyState title="Sem presenças recentes" description="Nenhuma presença confirmada foi encontrada nesse período." /> : <ul className="divide-y divide-line">{attendance.items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"><div><p className="font-semibold">{civilDateLabel(item.date)}</p><p className="text-helper text-muted">{item.classType}</p></div>{item.time ? <span className="text-sm text-muted">Horário: {item.time}</span> : null}</li>)}</ul>}{attendance.hasMore ? <p className="mt-3 text-helper text-muted">Existem mais registros fora do limite desta visualização.</p> : null}</Card>
          </div> : null}
        </TabsContent> : null}

        <TabsContent value="history">
          {loadingSection === "history" ? <SectionLoading /> : sectionErrors.history ? <ErrorState message={sectionErrors.history} onRetry={() => void loadSection("history", true)} /> : history ? <div className="space-y-4">
            <Card><CardHeader><CardTitle>Matrículas</CardTitle><CardDescription>Períodos de vínculo preservados, do mais recente ao mais antigo.</CardDescription></CardHeader>{history.enrollments.length === 0 ? <EmptyState title="Sem períodos registrados" description="Não há vínculo histórico confiável para exibir." /> : <ul className="divide-y divide-line">{history.enrollments.map((period) => <li key={period.id} className="py-3 first:pt-0 last:pb-0"><p className="font-semibold">{period.startDate ? date(period.startDate) : "Início desconhecido"} → {period.exitDate ? date(period.exitDate) : "Atual"}</p><p className="text-helper text-muted">{period.modality ?? "Sem modalidade"} · {period.monthlyValue === null ? "Valor padrão/sem valor individual" : currency(period.monthlyValue)} · vence dia {period.dueDay}</p></li>)}</ul>}</Card>
            <Card><CardHeader><CardTitle>Eventos persistidos</CardTitle><CardDescription>Somente fatos registrados diretamente no banco.</CardDescription></CardHeader><ul className="space-y-3"><li className="rounded-ds-lg border border-line p-3"><p className="font-semibold">Cadastro criado</p><p className="text-helper text-muted">{dateTime(history.registration.occurredAt)}</p></li>{history.currentExit ? <li className="rounded-ds-lg border border-line p-3"><p className="font-semibold">Saída atual registrada</p><p className="text-helper text-muted">{date(history.currentExit.occurredAt)} · {STATUS_LABEL[history.currentExit.status] ?? history.currentExit.status}</p></li> : null}</ul></Card>
            <Card><CardHeader><CardTitle>Alterações de modalidade</CardTitle><CardDescription>Histórico registrado pelo fluxo atual de edição.</CardDescription></CardHeader>{history.planChanges.length === 0 ? <EmptyState title="Sem alterações de modalidade" description="Nenhuma mudança de plano foi registrada." /> : <ul className="divide-y divide-line">{history.planChanges.map((item) => <li key={item.id} className="py-3 first:pt-0 last:pb-0"><p className="font-semibold">{item.previousModality ?? "Sem modalidade"} → {item.newModality}</p><p className="text-helper text-muted">{dateTime(item.occurredAt)}</p>{item.note ? <p className="mt-1 text-sm text-muted">{item.note}</p> : null}</li>)}</ul>}{history.hasMore ? <p className="mt-3 text-helper text-muted">Há alterações anteriores fora do limite desta visualização.</p> : null}</Card>
          </div> : null}
        </TabsContent>
      </Tabs>

      <StudentFormDialog open={editOpen} onOpenChange={setEditOpen} studentId={student.id} onSaved={fetchOverview} />
      <ResumeEnrollmentDialog open={resumeOpen} onOpenChange={setResumeOpen} student={student} onResumed={async () => { await fetchOverview(); setHistory(null); }} />
      <EndEnrollmentDialog open={endOpen} onOpenChange={setEndOpen} studentId={student.id} onEnded={async () => { await fetchOverview(); setHistory(null); }} />
    </div>
  );
}
